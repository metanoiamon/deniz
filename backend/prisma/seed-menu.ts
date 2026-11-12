// The menu part of the seed: reads prisma/seed-data/menu.json (the format `npm run db:export-menu` writes) and its
// images, and creates the menu types, categories and products on an empty database only (when there is no category
// and no product yet): a running restaurant's menu is never touched.
// To seed another restaurant's menu: run `npm run db:export-menu` on its database and put the exported folder's
// contents (menu.json + images/) in prisma/seed-data/.
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { PROJECT_ROOT } from '../src/lib/paths.js';
import { randomInt } from 'node:crypto';
import { PLACEHOLDER_IMAGE, fileMatchesExtension, productImages } from '../src/lib/uploads.js';

const SEED_DIR = path.join(PROJECT_ROOT, 'prisma', 'seed-data');

export interface MenuExport {
	menuTypes: { ref: number; name: string; sortOrder: number; isActive: boolean }[];
	categories: { ref: number; name: string; menuTypeRef: number; sortOrder: number }[];
	products: {
		ref: number;
		name: string;
		price: number;
		description: string;
		image: string;
		categoryRef: number;
		sortOrder: number;
		isActive: boolean;
		isAvailable: boolean;
	}[];
}

function readExport(): MenuExport | null {
	const file = path.join(SEED_DIR, 'menu.json');
	if (!fs.existsSync(file)) return null;
	return JSON.parse(fs.readFileSync(file, 'utf8')) as MenuExport;
}

/**
 * Copies a product image into uploads/products and returns the name to store; the placeholder when the file is
 * missing, not a real image, or has a name the server would not have made itself (such a file could never be
 * replaced or deleted from the panel). Two products pointing at the same file each get their own copy, so deleting
 * one product never deletes the other's photo.
 */
async function placeImage(image: string, used: Set<string>): Promise<string> {
	if (!image || image === PLACEHOLDER_IMAGE) return PLACEHOLDER_IMAGE;
	const name = path.basename(image);
	if (!productImages.isSafeName(name) || productImages.isTemp(name)) return PLACEHOLDER_IMAGE;
	const source = path.join(SEED_DIR, 'images', name);
	const existing = path.join(productImages.dir, name);
	const from = fs.existsSync(source) ? source : fs.existsSync(existing) ? existing : null;
	if (!from || !(await fileMatchesExtension(from))) return PLACEHOLDER_IMAGE;
	const target = used.has(name) ? `${Date.now()}-${randomInt(1, 2_147_483_647)}${path.extname(name)}` : name;
	used.add(target);
	fs.mkdirSync(productImages.dir, { recursive: true });
	if (path.join(productImages.dir, target) !== from) fs.copyFileSync(from, path.join(productImages.dir, target));
	return target;
}

export async function seedMenu(prisma: PrismaClient): Promise<void> {
	const data = readExport();
	if (!data) {
		console.log('prisma/seed-data/menu.json نیست؛ منو ساخته نشد (از پنل ادمین بساز).');
		return;
	}
	if ((await prisma.category.count()) > 0 || (await prisma.product.count()) > 0) {
		console.log('منو از قبل وجود دارد؛ منوی seed اضافه نشد.');
		return;
	}
	const used = new Set<string>();
	const images = new Map<number, string>();
	for (const product of data.products) images.set(product.ref, await placeImage(product.image, used));

	await prisma.$transaction(
		async (tx) => {
			const typeIds = new Map<number, number>();
			for (const type of data.menuTypes) {
				const row = await tx.menuType.upsert({
					where: { name: type.name },
					update: { sortOrder: type.sortOrder, isActive: type.isActive },
					create: { name: type.name, sortOrder: type.sortOrder, isActive: type.isActive },
				});
				typeIds.set(type.ref, row.id);
			}
			const categoryIds = new Map<number, number>();
			for (const category of data.categories) {
				const row = await tx.category.create({
					data: { name: category.name, menuTypeId: typeIds.get(category.menuTypeRef)!, sortOrder: category.sortOrder },
				});
				categoryIds.set(category.ref, row.id);
			}
			for (const product of data.products) {
				await tx.product.create({
					data: {
						name: product.name,
						price: product.price,
						description: product.description,
						image: images.get(product.ref) ?? PLACEHOLDER_IMAGE,
						categoryId: categoryIds.get(product.categoryRef)!,
						sortOrder: product.sortOrder,
						isActive: product.isActive,
						isAvailable: product.isAvailable,
					},
				});
			}
		},
		{ timeout: 120_000 },
	);
	const withImage = [...images.values()].filter((image) => image !== PLACEHOLDER_IMAGE).length;
	console.log(`منو: ${data.menuTypes.length} دسته‌ی اصلی، ${data.categories.length} دسته‌بندی، ${data.products.length} محصول (${withImage} با عکس).`);
}
