import express from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError, prismaCode } from '../../lib/http-error.js';
import { currentAdmin } from '../../lib/request.js';
import { requireRole } from '../../middleware/auth.js';
import { ROLE_GROUPS } from '../../lib/roles.js';
import { nextSortOrder, parseId, readFullOrder } from '../../lib/ordering.js';
import { productImages } from '../../lib/uploads.js';
import { faDigits } from '../../lib/text.js';

// Menu types, categories, products and product image upload for the admin panel.
// Mounted inside adminRouter, so requireAdmin has already run.
export const adminMenuRouter = express.Router();
adminMenuRouter.use(['/products', '/categories', '/menu-types', '/upload'], requireRole(...ROLE_GROUPS.staff));
// The menu's top-level structure (its tabs) is a manager decision; staff can read it for their forms.
const requireManager = requireRole(...ROLE_GROUPS.manager);

const NAME_MAX = 80;
const MENU_TYPE_NAME_MAX = 40;
const DESCRIPTION_MAX = 500;
const PRICE_MAX = 1_000_000_000;

type InputResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

/** A number, or a string of digits; `Number()` alone would also turn `true` into 1 and `[5]` into 5. */
function readPrice(value: unknown): number | null {
	if (typeof value !== 'number' && !(typeof value === 'string' && /^\d{1,10}$/.test(value))) return null;
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0 || n > PRICE_MAX) return null;
	return n;
}

function readFlag(value: unknown, label: string): InputResult<boolean | undefined> {
	if (value === undefined) return { ok: true, data: undefined };
	if (typeof value !== 'boolean') return { ok: false, error: `${label} نامعتبر است.` };
	return { ok: true, data: value };
}

// ─── Upload ───────────────────────────────────────────────────────────────────

adminMenuRouter.post('/upload', productImages.uploadHandler());

// ─── Menu types (the tabs on the menu page) ──────────────────────────────────

const MENU_TYPE_ORDER = [{ sortOrder: 'asc' }, { id: 'asc' }] satisfies Prisma.MenuTypeOrderByWithRelationInput[];

interface MenuTypeFields {
	name: string;
	isActive?: boolean;
}

function readMenuTypeInput(body: unknown, partial: false): InputResult<MenuTypeFields>;
function readMenuTypeInput(body: unknown, partial: true): InputResult<Partial<MenuTypeFields>>;
function readMenuTypeInput(body: unknown, partial: boolean): InputResult<Partial<MenuTypeFields>> {
	const data: Partial<MenuTypeFields> = {};
	const { name, isActive } = (body ?? {}) as Record<string, unknown>;
	if (name !== undefined || !partial) {
		if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'نام دسته‌ی اصلی الزامی است.' };
		if (name.trim().length > MENU_TYPE_NAME_MAX) return { ok: false, error: `نام دسته‌ی اصلی حداکثر ${faDigits(MENU_TYPE_NAME_MAX)} کاراکتر است.` };
		data.name = name.trim();
	}
	const active = readFlag(isActive, 'وضعیت نمایش');
	if (!active.ok) return active;
	if (active.data !== undefined) data.isActive = active.data;
	return { ok: true, data };
}

adminMenuRouter.get('/menu-types', async (_req, res, next) => {
	try {
		const menuTypes = await prisma.menuType.findMany({
			orderBy: MENU_TYPE_ORDER,
			include: { _count: { select: { categories: true } } },
		});
		res.json({ menuTypes });
	} catch (error) {
		next(error);
	}
});

adminMenuRouter.post('/menu-types', requireManager, async (req, res, next) => {
	try {
		const input = readMenuTypeInput(req.body, false);
		if (!input.ok) return res.status(400).json({ message: input.error });
		// دسته‌ی تازه آخر ردیف تب‌ها می‌نشیند
		const last = await prisma.menuType.aggregate({ _max: { sortOrder: true } });
		const menuType = await prisma.menuType.create({ data: { ...input.data, sortOrder: nextSortOrder(last._max.sortOrder) } });
		res.status(201).json({ menuType });
	} catch (error) {
		if (prismaCode(error) === 'P2002') return res.status(409).json({ message: 'دسته‌ی اصلی با این نام از قبل وجود دارد.' });
		next(error);
	}
});

// ترتیب تب‌ها: لیست کامل شناسه‌ها به ترتیب دلخواه
adminMenuRouter.put('/menu-types/order', requireManager, async (req, res, next) => {
	try {
		const existing = await prisma.menuType.findMany({ select: { id: true } });
		const ids = readFullOrder(req.body?.ids, existing.map((t) => t.id));
		if (!ids) return res.status(400).json({ message: 'ترتیب باید شامل همه‌ی دسته‌های اصلی، هر کدام یک بار، باشد.' });
		await prisma.$transaction(ids.map((id, index) => prisma.menuType.update({ where: { id }, data: { sortOrder: index } })));
		res.json({ menuTypes: await prisma.menuType.findMany({ orderBy: MENU_TYPE_ORDER }) });
	} catch (error) {
		next(error);
	}
});

adminMenuRouter.patch('/menu-types/:id', requireManager, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const input = readMenuTypeInput(req.body, true);
		if (!input.ok) return res.status(400).json({ message: input.error });
		const menuType = await prisma.menuType.update({ where: { id }, data: input.data });
		res.json({ menuType });
	} catch (error) {
		if (prismaCode(error) === 'P2025') return res.status(404).json({ message: 'دسته‌ی اصلی پیدا نشد.' });
		if (prismaCode(error) === 'P2002') return res.status(409).json({ message: 'دسته‌ی اصلی با این نام از قبل وجود دارد.' });
		next(error);
	}
});

// دسته‌ی اصلی فقط وقتی خالی است حذف می‌شود؛ دسته‌بندی‌هایش را اول جابه‌جا یا حذف کن
adminMenuRouter.delete('/menu-types/:id', requireManager, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const menuType = await prisma.menuType.findUnique({ where: { id }, include: { _count: { select: { categories: true } } } });
		if (!menuType) return res.status(404).json({ message: 'دسته‌ی اصلی پیدا نشد.' });
		const count = menuType._count.categories;
		if (count > 0) {
			return res.status(409).json({
				message: `این دسته‌ی اصلی ${faDigits(count)} دسته‌بندی دارد؛ اول آن‌ها را به دسته‌ی اصلی دیگری منتقل یا حذف کن.`,
				categoryCount: count,
			});
		}
		await prisma.menuType.delete({ where: { id } });
		res.json({ message: 'دسته‌ی اصلی حذف شد.' });
	} catch (error) {
		// دسته‌بندی هم‌زمان اضافه شد (کلید خارجی Restrict)
		if (prismaCode(error) === 'P2003') return res.status(409).json({ message: 'این دسته‌ی اصلی همین الان دسته‌بندی پیدا کرد؛ دوباره تلاش کن.' });
		next(error);
	}
});

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORY_ORDER = [{ menuTypeId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] satisfies Prisma.CategoryOrderByWithRelationInput[];

interface CategoryFields {
	name: string;
	menuTypeId: number;
}

async function readCategoryInput(body: unknown, partial: false): Promise<InputResult<CategoryFields>>;
async function readCategoryInput(body: unknown, partial: true): Promise<InputResult<Partial<CategoryFields>>>;
async function readCategoryInput(body: unknown, partial: boolean): Promise<InputResult<Partial<CategoryFields>>> {
	const data: Partial<CategoryFields> = {};
	const { name, menuTypeId } = (body ?? {}) as Record<string, unknown>;
	if (name !== undefined || !partial) {
		if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'نام دسته‌بندی الزامی است.' };
		if (name.trim().length > NAME_MAX) return { ok: false, error: `نام دسته‌بندی حداکثر ${faDigits(NAME_MAX)} کاراکتر است.` };
		data.name = name.trim();
	}
	if (menuTypeId !== undefined || !partial) {
		const id = parseId(menuTypeId);
		if (!id) return { ok: false, error: 'دسته‌ی اصلی نامعتبر است.' };
		if (!(await prisma.menuType.findUnique({ where: { id } }))) return { ok: false, error: 'دسته‌ی اصلی پیدا نشد.', status: 404 };
		data.menuTypeId = id;
	}
	return { ok: true, data };
}

const categoryInclude = {
	_count: { select: { products: true } },
	menuType: { select: { id: true, name: true } },
} satisfies Prisma.CategoryInclude;

/** sortOrder that puts a category last in its menu type. */
async function lastInMenuType(menuTypeId: number): Promise<number> {
	const last = await prisma.category.aggregate({ where: { menuTypeId }, _max: { sortOrder: true } });
	return nextSortOrder(last._max.sortOrder);
}

adminMenuRouter.get('/categories', async (_req, res, next) => {
	try {
		res.json({ categories: await prisma.category.findMany({ orderBy: CATEGORY_ORDER, include: categoryInclude }) });
	} catch (error) {
		next(error);
	}
});

adminMenuRouter.post('/categories', async (req, res, next) => {
	try {
		const input = await readCategoryInput(req.body, false);
		if (!input.ok) return res.status(input.status ?? 400).json({ message: input.error });
		const adminId = currentAdmin(req).id;
		const category = await prisma.category.create({
			data: { ...input.data, sortOrder: await lastInMenuType(input.data.menuTypeId), createdById: adminId, updatedById: adminId },
			include: categoryInclude,
		});
		res.status(201).json({ category });
	} catch (error) {
		next(error);
	}
});

// ترتیب دسته‌ها داخل یک دسته‌ی اصلی: لیست کامل شناسه‌های همان دسته‌ی اصلی
adminMenuRouter.put('/categories/order', async (req, res, next) => {
	try {
		const menuTypeId = parseId(req.body?.menuTypeId);
		if (!menuTypeId) return res.status(400).json({ message: 'دسته‌ی اصلی نامعتبر است.' });
		const existing = await prisma.category.findMany({ where: { menuTypeId }, select: { id: true } });
		const ids = readFullOrder(req.body?.ids, existing.map((c) => c.id));
		if (!ids) return res.status(400).json({ message: 'ترتیب باید شامل همه‌ی دسته‌بندی‌های این دسته‌ی اصلی، هر کدام یک بار، باشد.' });
		await prisma.$transaction(ids.map((id, index) => prisma.category.update({ where: { id }, data: { sortOrder: index } })));
		const categories = await prisma.category.findMany({ where: { menuTypeId }, orderBy: CATEGORY_ORDER, include: categoryInclude });
		res.json({ categories });
	} catch (error) {
		next(error);
	}
});

adminMenuRouter.patch('/categories/:id', async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const existing = await prisma.category.findUnique({ where: { id } });
		if (!existing) return res.status(404).json({ message: 'دسته‌بندی پیدا نشد.' });
		const input = await readCategoryInput(req.body, true);
		if (!input.ok) return res.status(input.status ?? 400).json({ message: input.error });
		// دسته‌ای که به دسته‌ی اصلی دیگری می‌رود، آخر لیست آنجا می‌نشیند
		const moved = input.data.menuTypeId !== undefined && input.data.menuTypeId !== existing.menuTypeId;
		const category = await prisma.category.update({
			where: { id },
			data: {
				...input.data,
				...(moved ? { sortOrder: await lastInMenuType(input.data.menuTypeId as number) } : {}),
				updatedById: currentAdmin(req).id,
			},
			include: categoryInclude,
		});
		res.json({ category });
	} catch (error) {
		if (prismaCode(error) === 'P2025') return res.status(404).json({ message: 'دسته‌بندی پیدا نشد.' });
		next(error);
	}
});

// اگر دسته محصول داشته باشد، فقط با ?withProducts=1 (بعد از تایید صریح در پنل) حذف می‌شود.
// همه‌چیز در یک تراکنش: محصولات با RETURNING حذف می‌شوند تا عکس دقیقاً همان‌هایی پاک شود که واقعاً حذف شدند، و
// اگر هم‌زمان محصولی به این دسته اضافه شود، حذف دسته با خطای کلید خارجی برمی‌گردد (۴۰۹) و هیچ چیز نیمه‌کاره نمی‌ماند.
adminMenuRouter.delete('/categories/:id', async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const withProducts = req.query.withProducts === '1';
		const result = await prisma.$transaction(async (tx) => {
			const category = await tx.category.findUnique({ where: { id }, select: { _count: { select: { products: true } } } });
			if (!category) return { status: 404 as const };
			if (category._count.products > 0 && !withProducts) return { status: 409 as const, count: category._count.products };
			const deleted = await tx.$queryRaw<{ image: string }[]>`DELETE FROM "Product" WHERE "categoryId" = ${id} RETURNING "image"`;
			await tx.category.delete({ where: { id } });
			return { status: 200 as const, images: deleted.map((row) => row.image) };
		});
		if (result.status === 404) return res.status(404).json({ message: 'دسته‌بندی پیدا نشد.' });
		if (result.status === 409) return res.status(409).json({ message: `این دسته‌بندی ${faDigits(result.count)} محصول دارد.`, productCount: result.count });
		await Promise.all(result.images.map((image) => productImages.remove(image)));
		res.json({ message: 'دسته‌بندی حذف شد.', deletedProducts: result.images.length });
	} catch (error) {
		if (prismaCode(error) === 'P2003') return res.status(409).json({ message: 'همین الان محصولی به این دسته‌بندی اضافه شد؛ دوباره تلاش کن.' });
		next(error);
	}
});

// ─── Products ─────────────────────────────────────────────────────────────────

const PRODUCT_ORDER = [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] satisfies Prisma.ProductOrderByWithRelationInput[];

interface ProductFields {
	name: string;
	price: number;
	description?: string;
	image?: string;
	categoryId: number;
	/** false = hidden from the public menu. */
	isActive?: boolean;
	/** false = listed but marked sold out. */
	isAvailable?: boolean;
}

/** Validates product input. `partial` = PATCH (fields optional). */
async function readProductInput(body: unknown, partial: false): Promise<InputResult<ProductFields>>;
async function readProductInput(body: unknown, partial: true, currentImage: string): Promise<InputResult<Partial<ProductFields>>>;
async function readProductInput(body: unknown, partial: boolean, currentImage: string | null = null): Promise<InputResult<Partial<ProductFields>>> {
	const data: Partial<ProductFields> = {};
	const { name, price, description, image, categoryId, isActive, isAvailable } = (body ?? {}) as Record<string, unknown>;

	if (name !== undefined || !partial) {
		if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'نام محصول الزامی است.' };
		if (name.trim().length > NAME_MAX) return { ok: false, error: `نام محصول حداکثر ${faDigits(NAME_MAX)} کاراکتر است.` };
		data.name = name.trim();
	}
	if (price !== undefined || !partial) {
		const n = readPrice(price);
		if (n === null) return { ok: false, error: 'قیمت باید عدد صحیح صفر یا بیشتر باشد (به تومان).' };
		data.price = n;
	}
	if (description !== undefined && description !== null) {
		if (typeof description !== 'string') return { ok: false, error: 'توضیحات نامعتبر است.' };
		if (description.trim().length > DESCRIPTION_MAX) return { ok: false, error: `توضیحات حداکثر ${faDigits(DESCRIPTION_MAX)} کاراکتر است.` };
		data.description = description.trim();
	}
	if (image !== undefined && image !== null && image !== '') {
		const problem = await productImages.checkChosen(image, currentImage);
		if (problem) return { ok: false, error: problem };
		data.image = image as string;
	}
	if (categoryId !== undefined || !partial) {
		const id = parseId(categoryId);
		if (!id) return { ok: false, error: 'دسته‌بندی نامعتبر است.' };
		if (!(await prisma.category.findUnique({ where: { id } }))) return { ok: false, error: 'دسته‌بندی پیدا نشد.', status: 404 };
		data.categoryId = id;
	}
	const active = readFlag(isActive, 'وضعیت نمایش');
	if (!active.ok) return active;
	if (active.data !== undefined) data.isActive = active.data;
	const available = readFlag(isAvailable, 'وضعیت موجود بودن');
	if (!available.ok) return available;
	if (available.data !== undefined) data.isAvailable = available.data;
	return { ok: true, data };
}

/** sortOrder that puts a product last in its category. */
async function lastInCategory(categoryId: number): Promise<number> {
	const last = await prisma.product.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
	return nextSortOrder(last._max.sortOrder);
}

adminMenuRouter.get('/products', async (_req, res, next) => {
	try {
		res.json({ products: await prisma.product.findMany({ orderBy: PRODUCT_ORDER }) });
	} catch (error) {
		next(error);
	}
});

adminMenuRouter.post('/products', async (req, res, next) => {
	try {
		const input = await readProductInput(req.body, false);
		if (!input.ok) return res.status(input.status ?? 400).json({ message: input.error });
		const { image, ...fields } = input.data;
		const adminId = currentAdmin(req).id;
		// if saving fails (e.g. the category was deleted a moment ago), the promoted image is removed again
		const product = await productImages.saveWithImage(image, async (finalImage) =>
			prisma.product.create({
				data: {
					...fields,
					...(finalImage ? { image: finalImage } : {}),
					sortOrder: await lastInCategory(fields.categoryId),
					createdById: adminId,
					updatedById: adminId,
				},
			}),
		);
		res.status(201).json({ product });
	} catch (error) {
		if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
		if (prismaCode(error) === 'P2003') return res.status(404).json({ message: 'دسته‌بندی پیدا نشد؛ شاید همین الان حذف شده باشد.' });
		next(error);
	}
});

// ترتیب محصولات داخل یک دسته: لیست کامل شناسه‌های همان دسته
adminMenuRouter.put('/products/order', async (req, res, next) => {
	try {
		const categoryId = parseId(req.body?.categoryId);
		if (!categoryId) return res.status(400).json({ message: 'دسته‌بندی نامعتبر است.' });
		const existing = await prisma.product.findMany({ where: { categoryId }, select: { id: true } });
		const ids = readFullOrder(req.body?.ids, existing.map((p) => p.id));
		if (!ids) return res.status(400).json({ message: 'ترتیب باید شامل همه‌ی محصولات این دسته‌بندی، هر کدام یک بار، باشد.' });
		await prisma.$transaction(ids.map((id, index) => prisma.product.update({ where: { id }, data: { sortOrder: index } })));
		res.json({ products: await prisma.product.findMany({ where: { categoryId }, orderBy: PRODUCT_ORDER }) });
	} catch (error) {
		next(error);
	}
});

adminMenuRouter.patch('/products/:id', async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const existing = await prisma.product.findUnique({ where: { id } });
		if (!existing) return res.status(404).json({ message: 'محصول پیدا نشد.' });

		const input = await readProductInput(req.body, true, existing.image);
		if (!input.ok) return res.status(input.status ?? 400).json({ message: input.error });
		const { image, ...fields } = input.data;
		const newImage = image !== undefined && image !== existing.image ? image : undefined;
		// محصولی که به دسته‌ی دیگری می‌رود، آخر لیست آنجا می‌نشیند
		const moved = fields.categoryId !== undefined && fields.categoryId !== existing.categoryId;

		const product = await productImages.saveWithImage(newImage, async (finalImage) => {
			// with a new image the row is only updated if its image is still the one read above: when two edits replace
			// the image at the same moment, the second one gets a 409 instead of leaving one of the two files orphaned
			const changed = await prisma.product.updateMany({
				where: { id, ...(finalImage ? { image: existing.image } : {}) },
				data: {
					...fields,
					...(finalImage ? { image: finalImage } : {}),
					...(moved ? { sortOrder: await lastInCategory(fields.categoryId as number) } : {}),
					updatedById: currentAdmin(req).id,
				},
			});
			if (changed.count === 0) throw new HttpError(409, 'این محصول همین الان تغییر کرد یا حذف شد؛ صفحه را تازه کن.');
			return prisma.product.findUniqueOrThrow({ where: { id } });
		});
		// فایل قبلی فقط بعد از ذخیره‌ی موفق پاک می‌شود
		if (newImage) await productImages.remove(existing.image);
		res.json({ product });
	} catch (error) {
		if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
		next(error);
	}
});

adminMenuRouter.delete('/products/:id', async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		// the image comes from the deleted row itself, not from an earlier read that another edit may have outdated
		const deleted = await prisma.product.delete({ where: { id } });
		await productImages.remove(deleted.image);
		res.json({ message: 'محصول حذف شد.' });
	} catch (error) {
		if (prismaCode(error) === 'P2025') return res.status(404).json({ message: 'محصول پیدا نشد.' });
		next(error);
	}
});
