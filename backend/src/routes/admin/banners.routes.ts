import express from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError, prismaCode } from '../../lib/http-error.js';
import { withLock } from '../../lib/locks.js';
import { requireRole } from '../../middleware/auth.js';
import { ROLE_GROUPS } from '../../lib/roles.js';
import { nextSortOrder, parseId, readFullOrder } from '../../lib/ordering.js';
import { bannerImages } from '../../lib/uploads.js';
import { faDigits } from '../../lib/text.js';

// The swiper at the top of the menu page. Banners are the restaurant's shop window: manager only.
// Mounted inside adminRouter, so requireAdmin has already run.
export const adminBannersRouter = express.Router();
adminBannersRouter.use('/banners', requireRole(...ROLE_GROUPS.manager));

/** More slides than this make the swiper too long to be seen to the end on a phone. */
export const MAX_ACTIVE_BANNERS = 10;
const TITLE_MAX = 80;

const BANNER_ORDER = [{ sortOrder: 'asc' }, { id: 'asc' }] satisfies Prisma.BannerOrderByWithRelationInput[];

type InputResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

interface BannerFields {
	title?: string | null;
	image: string;
	isActive?: boolean;
}

async function readBannerInput(body: unknown, current: { image: string } | null): Promise<InputResult<Partial<BannerFields>>> {
	const data: Partial<BannerFields> = {};
	const { title, image, isActive } = (body ?? {}) as Record<string, unknown>;
	if (title !== undefined) {
		if (title !== null && typeof title !== 'string') return { ok: false, error: 'عنوان نامعتبر است.' };
		const clean = typeof title === 'string' ? title.trim() : '';
		if (clean.length > TITLE_MAX) return { ok: false, error: `عنوان حداکثر ${faDigits(TITLE_MAX)} کاراکتر است.` };
		data.title = clean || null;
	}
	if (image !== undefined || !current) {
		if (image === undefined || image === null || image === '') return { ok: false, error: 'عکس بنر الزامی است.' };
		const problem = await bannerImages.checkChosen(image, current?.image ?? null);
		if (problem) return { ok: false, error: problem };
		data.image = image as string;
	}
	if (isActive !== undefined) {
		if (typeof isActive !== 'boolean') return { ok: false, error: 'وضعیت نمایش نامعتبر است.' };
		data.isActive = isActive;
	}
	return { ok: true, data };
}

const LIMIT_MESSAGE = `حداکثر ${faDigits(MAX_ACTIVE_BANNERS)} بنر فعال مجاز است؛ اول یکی را غیرفعال یا حذف کن.`;

// Only called inside the «banners» lock: two requests that both count 9 must not both add the 10th.
async function assertRoomForActive(tx: Prisma.TransactionClient): Promise<void> {
	if ((await tx.banner.count({ where: { isActive: true } })) >= MAX_ACTIVE_BANNERS) throw new HttpError(409, LIMIT_MESSAGE);
}

function sendKnown(res: express.Response, error: unknown): boolean {
	if (!(error instanceof HttpError)) return false;
	res.status(error.status).json({ message: error.message });
	return true;
}

adminBannersRouter.post('/banners/upload', bannerImages.uploadHandler());

adminBannersRouter.get('/banners', async (_req, res, next) => {
	try {
		res.json({ banners: await prisma.banner.findMany({ orderBy: BANNER_ORDER }), maxActive: MAX_ACTIVE_BANNERS });
	} catch (error) {
		next(error);
	}
});

adminBannersRouter.post('/banners', async (req, res, next) => {
	try {
		const input = await readBannerInput(req.body, null);
		if (!input.ok) return res.status(input.status ?? 400).json({ message: input.error });
		const { image, ...fields } = input.data as BannerFields;
		const banner = await bannerImages.saveWithImage(image, (finalImage) =>
			withLock('banners', async (tx) => {
				if (fields.isActive !== false) await assertRoomForActive(tx);
				// بنر تازه آخرین اسلاید می‌شود
				const last = await tx.banner.aggregate({ _max: { sortOrder: true } });
				return tx.banner.create({ data: { ...fields, image: finalImage as string, sortOrder: nextSortOrder(last._max.sortOrder) } });
			}),
		);
		res.status(201).json({ banner });
	} catch (error) {
		if (sendKnown(res, error)) return;
		next(error);
	}
});

// ترتیب اسلایدها: لیست کامل شناسه‌ی همه‌ی بنرها (فعال و غیرفعال)
adminBannersRouter.put('/banners/order', async (req, res, next) => {
	try {
		const existing = await prisma.banner.findMany({ select: { id: true } });
		const ids = readFullOrder(req.body?.ids, existing.map((b) => b.id));
		if (!ids) return res.status(400).json({ message: 'ترتیب باید شامل همه‌ی بنرها، هر کدام یک بار، باشد.' });
		await prisma.$transaction(ids.map((id, index) => prisma.banner.update({ where: { id }, data: { sortOrder: index } })));
		res.json({ banners: await prisma.banner.findMany({ orderBy: BANNER_ORDER }) });
	} catch (error) {
		next(error);
	}
});

adminBannersRouter.patch('/banners/:id', async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const existing = await prisma.banner.findUnique({ where: { id } });
		if (!existing) return res.status(404).json({ message: 'بنر پیدا نشد.' });
		const input = await readBannerInput(req.body, existing);
		if (!input.ok) return res.status(input.status ?? 400).json({ message: input.error });
		const { image, ...fields } = input.data;
		const newImage = image !== undefined && image !== existing.image ? image : undefined;
		const banner = await bannerImages.saveWithImage(newImage, (finalImage) =>
			withLock('banners', async (tx) => {
				// read again inside the lock: the state seen above may already be outdated
				const current = await tx.banner.findUnique({ where: { id } });
				if (!current) throw new HttpError(404, 'بنر پیدا نشد.');
				// two edits replacing the image at once: the second gets a 409 instead of orphaning a file
				if (finalImage && current.image !== existing.image) throw new HttpError(409, 'این بنر همین الان تغییر کرد؛ صفحه را تازه کن.');
				if (fields.isActive === true && !current.isActive) await assertRoomForActive(tx);
				return tx.banner.update({ where: { id }, data: { ...fields, ...(finalImage ? { image: finalImage } : {}) } });
			}),
		);
		// فایل قبلی فقط بعد از ذخیره‌ی موفق پاک می‌شود
		if (newImage) await bannerImages.remove(existing.image);
		res.json({ banner });
	} catch (error) {
		if (sendKnown(res, error)) return;
		if (prismaCode(error) === 'P2025') return res.status(404).json({ message: 'بنر پیدا نشد.' });
		next(error);
	}
});

adminBannersRouter.delete('/banners/:id', async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		// the image comes from the deleted row itself, not from an earlier read that another edit may have outdated
		const deleted = await prisma.banner.delete({ where: { id } });
		await bannerImages.remove(deleted.image);
		res.json({ message: 'بنر حذف شد.' });
	} catch (error) {
		if (prismaCode(error) === 'P2025') return res.status(404).json({ message: 'بنر پیدا نشد.' });
		next(error);
	}
});
