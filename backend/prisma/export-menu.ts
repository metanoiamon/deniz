// Exports the whole menu of this database into a folder, so it can be turned into seed data:
//
//   npm run db:export-menu            → menu-export/menu.json + menu-export/images/
//
// Exported: menu types, categories and products (price, description, image, order, hidden, sold out). Nothing else:
// no banners, admins, survey or settings. The JSON is written as UTF-8 by the script itself (a PowerShell `>`
// redirect would write UTF-16). The folder is in .gitignore.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PROJECT_ROOT } from '../src/lib/paths.js';
import { PLACEHOLDER_IMAGE, productImages } from '../src/lib/uploads.js';
import type { MenuExport } from './seed-menu.js';

const prisma = new PrismaClient();
const OUT_DIR = path.join(PROJECT_ROOT, 'menu-export');
const IMAGES_DIR = path.join(OUT_DIR, 'images');

async function main() {
	const [menuTypes, categories, products] = await Promise.all([
		prisma.menuType.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
		prisma.category.findMany({ orderBy: [{ menuTypeId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] }),
		prisma.product.findMany({ orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }] }),
	]);

	fs.rmSync(OUT_DIR, { recursive: true, force: true });
	fs.mkdirSync(IMAGES_DIR, { recursive: true });

	// the product images that exist on disk are copied next to the JSON
	const missingImages: string[] = [];
	let copied = 0;
	for (const product of products) {
		if (!product.image || product.image === PLACEHOLDER_IMAGE) continue;
		const source = path.join(productImages.dir, path.basename(product.image));
		if (fs.existsSync(source)) {
			fs.copyFileSync(source, path.join(IMAGES_DIR, path.basename(product.image)));
			copied++;
		} else missingImages.push(product.image);
	}

	// ids are kept only as references inside this file (the seed gives everything new ids)
	const data: MenuExport & { exportedAt: string } = {
		exportedAt: new Date().toISOString(),
		menuTypes: menuTypes.map((t) => ({ ref: t.id, name: t.name, sortOrder: t.sortOrder, isActive: t.isActive })),
		categories: categories.map((c) => ({ ref: c.id, name: c.name, menuTypeRef: c.menuTypeId, sortOrder: c.sortOrder })),
		products: products.map((p) => ({
			ref: p.id,
			name: p.name,
			price: p.price,
			description: p.description,
			image: p.image,
			categoryRef: p.categoryId,
			sortOrder: p.sortOrder,
			isActive: p.isActive,
			isAvailable: p.isAvailable,
		})),
	};
	fs.writeFileSync(path.join(OUT_DIR, 'menu.json'), JSON.stringify(data, null, '\t') + '\n', 'utf8');

	console.log(`menu-export/menu.json: ${menuTypes.length} menu types, ${categories.length} categories, ${products.length} products`);
	console.log(`menu-export/images: ${copied} images`);
	if (missingImages.length) console.log(`not found in uploads/products (left out): ${missingImages.join(', ')}`);
	console.log('Zip the menu-export folder and send it.');
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
