import express from 'express';
import type { AdminRole, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireRole } from '../middleware/auth.js';
import { getSettings, setSettings } from '../services/settings.service.js';
import { setAdminCookie, signAdminToken } from '../lib/auth.js';
import { ROLE_GROUPS, USERNAME_PATTERN, canManageRole, isAdminRole, normalizeUsername } from '../lib/roles.js';
import { hashPassword, passwordProblem, verifyPassword } from '../lib/passwords.js';
import { withLock } from '../lib/locks.js';
import { adminMenuRouter } from './admin/menu.routes.js';
import { adminBannersRouter } from './admin/banners.routes.js';
import { adminSurveyRouter } from './admin/survey.routes.js';
import { HttpError, prismaCode } from '../lib/http-error.js';
import { currentAdmin } from '../lib/request.js';
import { faDigits } from '../lib/text.js';

export const adminRouter = express.Router();

adminRouter.use(requireAdmin);

adminRouter.get('/me', (req, res) => {
	const admin = currentAdmin(req);
	res.json({ admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role } });
});

// منو، دسته‌بندی، محصولات و آپلود عکس محصول
adminRouter.use(adminMenuRouter);
// بنرهای سوییپر بالای منو
adminRouter.use(adminBannersRouter);
// نظرسنجی: سوال‌ها، پاسخ‌ها، آمار و خروجی
adminRouter.use(adminSurveyRouter);

adminRouter.get('/dashboard', requireRole(...ROLE_GROUPS.manager), async (_req, res, next) => {
	try {
		const [productsCount, hiddenCount, unavailableCount, categoriesCount, activeBanners, unreadResponses] = await Promise.all([
			prisma.product.count(),
			prisma.product.count({ where: { isActive: false } }),
			prisma.product.count({ where: { isActive: true, isAvailable: false } }),
			prisma.category.count(),
			prisma.banner.count({ where: { isActive: true } }),
			prisma.surveyResponse.count({ where: { isRead: false } }),
		]);
		res.json({ productsCount, hiddenCount, unavailableCount, categoriesCount, activeBanners, unreadResponses });
	} catch (error) {
		next(error);
	}
});

// ─── Settings ─────────────────────────────────────────────────────────────────

const TEXT_SETTINGS: readonly string[] = ['currencyLabel', 'cafeName'];
const SETTING_MAX = 60;

adminRouter.get('/settings', async (_req, res, next) => {
	try {
		res.json({ settings: await getSettings() });
	} catch (error) {
		next(error);
	}
});

adminRouter.patch('/settings', requireRole(...ROLE_GROUPS.manager), async (req, res, next) => {
	try {
		const body: unknown = req.body;
		if (typeof body !== 'object' || body === null || Array.isArray(body)) return res.status(400).json({ message: 'درخواست نامعتبر است.' });
		const values: Record<string, string> = {};
		for (const [key, value] of Object.entries(body)) {
			// فقط تنظیمات شناخته‌شده؛ کلید دلخواه در جدول تنظیمات ذخیره نمی‌شود
			if (!TEXT_SETTINGS.includes(key)) return res.status(400).json({ message: `تنظیم «${key.slice(0, 40)}» شناخته‌شده نیست.` });
			if (typeof value !== 'string' || !value.trim() || value.trim().length > SETTING_MAX) {
				return res.status(400).json({ message: `مقدار «${key}» باید متنی بین ۱ تا ${faDigits(SETTING_MAX)} کاراکتر باشد.` });
			}
			values[key] = value.trim();
		}
		await setSettings(values);
		res.json({ settings: await getSettings() });
	} catch (error) {
		next(error);
	}
});

// ─── Admin accounts ───────────────────────────────────────────────────────────

const ADMIN_PUBLIC_FIELDS = { id: true, username: true, name: true, role: true, isActive: true, createdAt: true } satisfies Prisma.AdminUserSelect;
const NAME_MAX = 80;
const LAST_DEVELOPER = 'حداقل یک توسعه‌دهنده‌ی فعال باید باقی بماند.';

function readName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = value.trim();
	return name && name.length <= NAME_MAX ? name : null;
}

// همیشه باید دست‌کم یک توسعه‌دهنده‌ی فعال بماند، وگرنه دیگر کسی نمی‌تواند حساب توسعه‌دهنده بسازد.
// این شمارش فقط داخل قفل «admins» معنی دارد؛ بیرون از آن دو درخواست هم‌زمان هر دو «۲» می‌بینند و آخرین توسعه‌دهنده را حذف می‌کنند.
async function activeDeveloperCount(tx: Prisma.TransactionClient) {
	return tx.adminUser.count({ where: { role: 'DEVELOPER', isActive: true } });
}

/**
 * Inside the lock the acting admin is checked again: a request that was already running when its admin was
 * deactivated, demoted or logged out must not complete a change to other accounts.
 */
async function assertActorStillValid(tx: Prisma.TransactionClient, actor: { id: string; role: AdminRole; tokenVersion: number }) {
	const fresh = await tx.adminUser.findUnique({ where: { id: actor.id }, select: { isActive: true, role: true, tokenVersion: true } });
	if (!fresh || !fresh.isActive || fresh.role !== actor.role || fresh.tokenVersion !== actor.tokenVersion) {
		throw new HttpError(401, 'نشست تو همین الان تغییر کرد؛ دوباره وارد شو.');
	}
}

adminRouter.get('/admins', requireRole(...ROLE_GROUPS.manager), async (_req, res, next) => {
	try {
		const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' }, select: ADMIN_PUBLIC_FIELDS });
		res.json({ admins });
	} catch (error) {
		next(error);
	}
});

adminRouter.post('/admins', requireRole(...ROLE_GROUPS.manager), async (req, res, next) => {
	try {
		const body = (req.body ?? {}) as Record<string, unknown>;
		const username = normalizeUsername(body.username);
		const name = readName(body.name);
		if (!USERNAME_PATTERN.test(username)) {
			return res.status(400).json({ message: 'نام کاربری باید ۳ تا ۳۲ کاراکتر و فقط شامل حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.' });
		}
		if (!name) return res.status(400).json({ message: `نام الزامی است (حداکثر ${faDigits(NAME_MAX)} کاراکتر).` });
		if (!isAdminRole(body.role)) return res.status(400).json({ message: 'نقش نامعتبر است.' });
		if (!canManageRole(currentAdmin(req), body.role)) return res.status(403).json({ message: 'اجازه‌ی ساختن حساب با این نقش را نداری.' });
		const problem = passwordProblem(body.password);
		if (problem) return res.status(400).json({ message: problem });
		const passwordHash = await hashPassword(body.password as string);
		const admin = await prisma.adminUser.create({ data: { username, name, role: body.role, passwordHash }, select: ADMIN_PUBLIC_FIELDS });
		res.status(201).json({ admin });
	} catch (error) {
		if (prismaCode(error) === 'P2002') return res.status(409).json({ message: 'ادمینی با این نام کاربری از قبل وجود دارد.' });
		next(error);
	}
});

adminRouter.patch('/admins/:id', requireRole(...ROLE_GROUPS.manager), async (req, res, next) => {
	try {
		const actor = currentAdmin(req);
		const body = (req.body ?? {}) as Record<string, unknown>;
		const isSelf = req.params.id === actor.id;

		// everything that does not need the database is checked first
		const data: Prisma.AdminUserUpdateInput = {};
		if (body.name !== undefined) {
			const name = readName(body.name);
			if (!name) return res.status(400).json({ message: `نام نمی‌تواند خالی باشد (حداکثر ${faDigits(NAME_MAX)} کاراکتر).` });
			data.name = name;
		}
		if (body.username !== undefined) {
			const username = normalizeUsername(body.username);
			if (!USERNAME_PATTERN.test(username)) return res.status(400).json({ message: 'نام کاربری نامعتبر است.' });
			data.username = username;
		}
		if (body.isActive !== undefined) {
			if (typeof body.isActive !== 'boolean') return res.status(400).json({ message: 'وضعیت فعال بودن نامعتبر است.' });
			if (isSelf && !body.isActive) return res.status(400).json({ message: 'نمی‌توانی حساب خودت را غیرفعال کنی.' });
			data.isActive = body.isActive;
			// غیرفعال شدن یعنی نشست‌های باز هم باید فوراً بسته شوند
			if (!body.isActive) data.tokenVersion = { increment: 1 };
		}
		if (body.role !== undefined) {
			if (!isAdminRole(body.role)) return res.status(400).json({ message: 'نقش نامعتبر است.' });
			if (isSelf) return res.status(400).json({ message: 'نمی‌توانی نقش خودت را عوض کنی.' });
			if (!canManageRole(actor, body.role)) return res.status(403).json({ message: 'اجازه‌ی دادن این نقش را نداری.' });
			data.role = body.role;
			// تغییر نقش هم باید نشست‌های قبلی را باطل کند تا دسترسی قدیمی در توکن نماند
			data.tokenVersion = { increment: 1 };
		}
		if (body.password !== undefined) {
			const problem = passwordProblem(body.password);
			if (problem) return res.status(400).json({ message: problem });
			// changing your own password needs the current one: a session left open on a shared device must not be
			// enough to take the account over
			if (isSelf) {
				const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
				if (!current || !(await verifyPassword(current, actor.passwordHash))) {
					return res.status(400).json({ message: 'رمز عبور فعلی اشتباه است.' });
				}
			}
			data.passwordHash = await hashPassword(body.password as string);
			// نشست‌های باز با رمز قدیمی باید فوراً قطع شن
			data.tokenVersion = { increment: 1 };
		}

		const updated = await withLock('admins', async (tx) => {
			await assertActorStillValid(tx, actor);
			const target = await tx.adminUser.findUnique({ where: { id: req.params.id } });
			if (!target) throw new HttpError(404, 'ادمین پیدا نشد.');
			if (!canManageRole(actor, target.role)) throw new HttpError(403, 'اجازه‌ی ویرایش این حساب را نداری.');
			const nextRole = (data.role as AdminRole | undefined) ?? target.role;
			const nextActive = (data.isActive as boolean | undefined) ?? target.isActive;
			const losesDeveloper = target.role === 'DEVELOPER' && target.isActive && (nextRole !== 'DEVELOPER' || !nextActive);
			if (losesDeveloper && (await activeDeveloperCount(tx)) <= 1) throw new HttpError(400, LAST_DEVELOPER);
			return tx.adminUser.update({ where: { id: target.id }, data });
		});

		// اگر ادمین رمز خودش را عوض کرد، کوکی تازه بگیرد تا از پنل بیرون نیفتد
		if (isSelf && data.tokenVersion) setAdminCookie(res, signAdminToken(updated));
		const { id, username, name, role, isActive, createdAt } = updated;
		res.json({ admin: { id, username, name, role, isActive, createdAt } });
	} catch (error) {
		if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
		if (prismaCode(error) === 'P2002') return res.status(409).json({ message: 'ادمینی با این نام کاربری از قبل وجود دارد.' });
		next(error);
	}
});

adminRouter.delete('/admins/:id', requireRole(...ROLE_GROUPS.manager), async (req, res, next) => {
	try {
		const actor = currentAdmin(req);
		if (req.params.id === actor.id) return res.status(400).json({ message: 'نمی‌توانی حساب خودت را حذف کنی.' });
		await withLock('admins', async (tx) => {
			await assertActorStillValid(tx, actor);
			const target = await tx.adminUser.findUnique({ where: { id: req.params.id } });
			if (!target) throw new HttpError(404, 'ادمین پیدا نشد.');
			if (!canManageRole(actor, target.role)) throw new HttpError(403, 'اجازه‌ی حذف این حساب را نداری.');
			if (target.role === 'DEVELOPER' && target.isActive && (await activeDeveloperCount(tx)) <= 1) throw new HttpError(400, LAST_DEVELOPER);
			await tx.adminUser.delete({ where: { id: target.id } });
		});
		res.json({ message: 'ادمین حذف شد.' });
	} catch (error) {
		if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
		next(error);
	}
});
