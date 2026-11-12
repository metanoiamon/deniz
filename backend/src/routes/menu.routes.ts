import express from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { parseId } from '../lib/ordering.js';

// Public menu and banners API. No login; list endpoints answer with plain arrays.
export const menuRouter = express.Router();

// Tabs of the menu page, in the order set in the admin panel. Hidden (inactive) types are left out.
menuRouter.get('/menu-types', async (_req, res, next) => {
	try {
		const menuTypes = await prisma.menuType.findMany({
			where: { isActive: true },
			select: { id: true, name: true },
			orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
		});
		res.json(menuTypes);
	} catch (error) {
		next(error);
	}
});

const VISIBLE_CATEGORY = { menuType: { isActive: true } } satisfies Prisma.CategoryWhereInput;

menuRouter.get('/categories', async (_req, res, next) => {
	try {
		const categories = await prisma.category.findMany({
			where: VISIBLE_CATEGORY,
			select: { id: true, name: true, menuTypeId: true },
			// تب‌ها به ترتیب خودشان، و داخل هر تب به ترتیبی که ادمین چیده
			orderBy: [{ menuType: { sortOrder: 'asc' } }, { menuTypeId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
		});
		res.json(categories);
	} catch (error) {
		next(error);
	}
});

menuRouter.get('/products', async (req, res, next) => {
	try {
		// محصول مخفی اصلاً در منو نیست؛ ناموجود دیده می‌شود (با برچسب «ناموجود»)
		const where: Prisma.ProductWhereInput = { isActive: true, category: VISIBLE_CATEGORY };
		if (req.query.categoryId !== undefined) {
			const categoryId = parseId(req.query.categoryId);
			if (!categoryId) return res.status(400).json({ message: 'دسته‌بندی نامعتبر است.' });
			where.categoryId = categoryId;
		}
		const products = await prisma.product.findMany({
			where,
			select: { id: true, name: true, price: true, description: true, image: true, categoryId: true, isAvailable: true },
			orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
		});
		res.json(products);
	} catch (error) {
		next(error);
	}
});

// اسلایدهای سوییپر بالای منو، به ترتیب
menuRouter.get('/banners', async (_req, res, next) => {
	try {
		const banners = await prisma.banner.findMany({
			where: { isActive: true },
			select: { id: true, title: true, image: true },
			orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
		});
		res.json(banners);
	} catch (error) {
		next(error);
	}
});
