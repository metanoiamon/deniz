// End-to-end API tests against a real PostgreSQL database.
//
//   TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/deniz_test" npm test
//
// The database is WIPED before the run, so it must be a separate database whose
// name contains "test". Without TEST_DATABASE_URL these tests are skipped.
process.env.TZ = 'Asia/Tehran';

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { PrismaClient } from '@prisma/client';
import { messageStyleProblem } from './message-style.js';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skip = !TEST_DB
	? 'TEST_DATABASE_URL is not set'
	: !/test/i.test(new URL(TEST_DB).pathname)
		? 'TEST_DATABASE_URL must point to a *test* database'
		: false;
// Locally a missing database only skips these tests. On CI that would be a green run that tested nothing.
if (skip && process.env.CI) throw new Error(`The integration tests cannot run on CI: ${skip}.`);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS = path.join(__dirname, '..', 'uploads', 'products');
const BANNERS = path.join(__dirname, '..', 'uploads', 'banners');
const FRONTEND = 'https://deniz.test';

let server: Server | undefined;
let base = '';
let prisma: PrismaClient;

interface ApiResponse {
	status: number;
	/** Parsed JSON body; shapes vary per endpoint, so tests read it loosely. */
	json: any;
	text: string;
	headers: Headers;
}

type Client = ReturnType<typeof client>;

// ─── tiny HTTP client with its own cookie jar ─────────────────────────────────
function client() {
	const jar = new Map<string, string>();
	async function call(method: string, url: string, body?: unknown, { form }: { form?: FormData } = {}): Promise<ApiResponse> {
		const headers: Record<string, string> = {};
		if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
		let payload: RequestInit['body'];
		if (form) payload = form;
		else if (body !== undefined) {
			headers['content-type'] = 'application/json';
			payload = typeof body === 'string' ? body : JSON.stringify(body);
		}
		const res = await fetch(base + url, { method, headers, body: payload, redirect: 'manual' });
		for (const cookie of res.headers.getSetCookie?.() || []) {
			const [pair] = cookie.split(';');
			const [name, ...rest] = pair.split('=');
			const value = rest.join('=');
			if (value) jar.set(name, value);
			else jar.delete(name);
		}
		const text = await res.text();
		let json = null;
		try {
			json = text ? JSON.parse(text) : null;
		} catch {
			/* not JSON */
		}
		// every message the API answers with, success or error, follows the house style (see message-style.ts)
		if (typeof json?.message === 'string') {
			const problem = messageStyleProblem(json.message);
			assert.equal(problem, null, `${method} ${url} → «${json.message}»: ${problem}`);
		}
		return { status: res.status, json, text, headers: res.headers };
	}
	return {
		get: (url: string) => call('GET', url),
		post: (url: string, body?: unknown, opts?: { form?: FormData }) => call('POST', url, body, opts),
		put: (url: string, body?: unknown) => call('PUT', url, body),
		patch: (url: string, body?: unknown) => call('PATCH', url, body),
		del: (url: string) => call('DELETE', url),
		jar,
	};
}

async function login(username: string, password: string): Promise<Client> {
	const c = client();
	const res = await c.post('/api/admin/login', { username, password });
	assert.equal(res.status, 200, `login ${username}: ${res.text}`);
	return c;
}

function jpegFile() {
	// smallest valid JPEG header is enough for the magic-number check
	const bytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
	return new Blob([bytes], { type: 'image/jpeg' });
}

function gifFile() {
	return new Blob([Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(100, 1)])], { type: 'image/gif' });
}

async function upload(c: Client, url: string, file: Blob = jpegFile()): Promise<ApiResponse> {
	const form = new FormData();
	form.append('image', file, 'x.jpg');
	return c.post(url, undefined, { form });
}

describe('Deniz API (integration)', { skip }, () => {
	let dev: Client;
	// manager and staff, created in «admin accounts and roles» and used by the later suites
	let main: Client;
	let staff: Client;
	let cafeTypeId: number;

	before(async () => {
		process.env.NODE_ENV = 'test';
		process.env.DATABASE_URL = TEST_DB;
		process.env.CORS_ORIGINS = FRONTEND;
		delete process.env.ADMIN_COOKIE_CROSS_SITE;
		const originalLog = console.log;
		console.log = (...args) => {
			if (process.env.TEST_VERBOSE) originalLog(...args);
		};
		console.error = () => {};
		console.warn = () => {};

		({ prisma } = await import('../src/lib/prisma.js'));
		const { app } = await import('../src/app.js');
		const bcrypt = (await import('bcryptjs')).default;

		const rows = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
		await prisma.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);

		await prisma.adminUser.create({
			data: { username: 'dev', name: 'Dev', role: 'DEVELOPER', passwordHash: await bcrypt.hash('DevPass123', 10) },
		});
		cafeTypeId = (await prisma.menuType.create({ data: { name: 'کافه', sortOrder: 0 } })).id;

		const listening = await new Promise<Server>((resolve) => {
			const s = app.listen(0, '127.0.0.1', () => resolve(s));
		});
		server = listening;
		base = `http://127.0.0.1:${(listening.address() as AddressInfo).port}`;
		dev = await login('dev', 'DevPass123');
	});

	after(async () => {
		await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
		await prisma?.$disconnect();
	});

	// ─── server ──────────────────────────────────────────────────────────────────
	describe('server', () => {
		test('everything that is not the API or an image is a JSON 404', async () => {
			for (const url of ['/', '/menu', '/reserve', '/admin', '/nope.png', '/api/nope', '/api/reservations', '/api/otp/send', '/api/config', '/api/recommender', '/api/recommender/status']) {
				const res = await client().get(url);
				assert.equal(res.status, 404, url);
				assert.equal(typeof res.json?.message, 'string', url);
			}
			assert.deepEqual((await client().get('/health')).json, { ok: true, service: 'deniz', db: true });
		});

		test('the admin API is not indexed; product images may be shown on another domain', async () => {
			const res = await client().get('/api/admin/me');
			assert.equal(res.status, 401);
			assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
			assert.equal(res.headers.get('cross-origin-resource-policy'), 'cross-origin');
		});

		test('CORS: only the frontend in CORS_ORIGINS may call the API from a browser, with its cookie', async () => {
			const allowed = await fetch(`${base}/api/menu-types`, { headers: { origin: FRONTEND } });
			assert.equal(allowed.headers.get('access-control-allow-origin'), FRONTEND);
			assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
			const other = await fetch(`${base}/api/menu-types`, { headers: { origin: 'https://evil.test' } });
			assert.equal(other.headers.get('access-control-allow-origin'), null);
			const preflight = await fetch(`${base}/api/admin/products/1`, {
				method: 'OPTIONS',
				headers: { origin: FRONTEND, 'access-control-request-method': 'PATCH', 'access-control-request-headers': 'content-type' },
			});
			assert.equal(preflight.status, 204);
			assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /PATCH/);
			assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /Content-Type/);
		});

		test('broken JSON body is a 400', async () => {
			const res = await client().post('/api/survey', '{bad json');
			assert.equal(res.status, 400);
			assert.equal(res.json.message, 'بدنه‌ی درخواست JSON معتبر نیست.');
		});

		test('other body errors answer in Persian too, not with the parser\'s English text', async () => {
			const res = await fetch(base + '/api/survey', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'content-encoding': 'compress' },
				body: '{}',
			});
			assert.equal(res.status, 415);
			assert.deepEqual(await res.json(), { message: 'درخواست نامعتبر است.' });
		});
	});

	describe('admin accounts and roles', () => {
		let mainId: string;

		test('login uses the username (case-insensitive) and rejects bad passwords', async () => {
			assert.equal((await client().post('/api/admin/login', { username: 'DEV', password: 'DevPass123' })).status, 200);
			assert.equal((await client().post('/api/admin/login', { username: 'dev', password: 'wrong-pass' })).status, 401);
			assert.equal((await client().post('/api/admin/login', { username: 'ghost', password: 'whatever1' })).status, 401);
			assert.equal((await client().post('/api/admin/login', { email: 'dev', password: 'x' })).status, 400);
		});

		test('developer creates café manager and staff accounts', async () => {
			const m = await dev.post('/api/admin/admins', { username: 'Manager', name: 'مدیر', role: 'MAIN', password: 'MainPass123' });
			assert.equal(m.status, 201, m.text);
			assert.equal(m.json.admin.username, 'manager');
			assert.equal(m.json.admin.passwordHash, undefined);
			mainId = m.json.admin.id;
			assert.equal(
				(await dev.post('/api/admin/admins', { username: 'staff', name: 'پرسنل', role: 'SECONDARY', password: 'StaffPass123' })).status,
				201,
			);
			assert.equal(
				(await dev.post('/api/admin/admins', { username: 'staff', name: 'x', role: 'SECONDARY', password: 'StaffPass123' })).status,
				409,
			);
			assert.equal(
				(await dev.post('/api/admin/admins', { username: 'a b', name: 'x', role: 'SECONDARY', password: 'StaffPass123' })).status,
				400,
			);
			main = await login('manager', 'MainPass123');
			staff = await login('staff', 'StaffPass123');
		});

		test('café manager cannot create or touch developer accounts', async () => {
			assert.equal(
				(await main.post('/api/admin/admins', { username: 'dev2', name: 'x', role: 'DEVELOPER', password: 'DevPass1234' })).status,
				403,
			);
			const devId = (await dev.get('/api/admin/me')).json.admin.id;
			assert.equal((await main.patch(`/api/admin/admins/${devId}`, { password: 'Hacked12345' })).status, 403);
			assert.equal((await main.del(`/api/admin/admins/${devId}`)).status, 403);
			assert.equal((await main.patch(`/api/admin/admins/${mainId}`, { role: 'DEVELOPER' })).status, 400); // own role
		});

		test('staff cannot reach manager-only areas', async () => {
			for (const url of ['/api/admin/admins', '/api/admin/dashboard', '/api/admin/settings']) {
				assert.equal((await staff.get(url)).status, url === '/api/admin/settings' ? 200 : 403, url);
			}
			assert.equal((await staff.patch('/api/admin/settings', { cafeName: 'x' })).status, 403);
		});

		test('deactivating an admin ends their open session immediately', async () => {
			const temp = await dev.post('/api/admin/admins', { username: 'temp', name: 'موقت', role: 'SECONDARY', password: 'TempPass123' });
			const tempClient = await login('temp', 'TempPass123');
			assert.equal((await tempClient.get('/api/admin/me')).status, 200);
			assert.equal((await dev.patch(`/api/admin/admins/${temp.json.admin.id}`, { isActive: false })).status, 200);
			assert.equal((await tempClient.get('/api/admin/me')).status, 401);
		});

		test('changing your own password needs the current one, keeps you logged in, and ends the other sessions', async () => {
			const other = await login('manager', 'MainPass123');
			assert.equal((await main.patch(`/api/admin/admins/${mainId}`, { password: 'MainPass456' })).status, 400, 'no current password');
			assert.equal((await main.patch(`/api/admin/admins/${mainId}`, { password: 'MainPass456', currentPassword: 'wrong-one' })).status, 400);
			assert.equal((await other.get('/api/admin/me')).status, 200, 'a refused change ends nothing');
			assert.equal((await main.patch(`/api/admin/admins/${mainId}`, { password: 'MainPass456', currentPassword: 'MainPass123' })).status, 200);
			assert.equal((await main.get('/api/admin/me')).status, 200);
			assert.equal((await other.get('/api/admin/me')).status, 401);
		});


		test('staff can manage the menu, but not its top-level types', async () => {
			const res = await staff.post('/api/admin/categories', { name: 'نوشیدنی سرد', menuTypeId: cafeTypeId });
			assert.equal(res.status, 201, res.text);
			assert.equal((await staff.del(`/api/admin/categories/${res.json.category.id}`)).status, 200);
			assert.equal((await staff.get('/api/admin/menu-types')).status, 200, 'staff can read types for the category form');
			assert.equal((await staff.post('/api/admin/menu-types', { name: 'قلیان' })).status, 403);
			assert.equal((await staff.patch(`/api/admin/menu-types/${cafeTypeId}`, { isActive: false })).status, 403);
			assert.equal((await staff.get('/api/admin/banners')).status, 403, 'banners are the manager\'s');
			for (const url of ['/api/admin/addons', '/api/admin/tag-groups', '/api/admin/tags/coverage', '/api/admin/reservations', '/api/admin/tables']) {
				assert.equal((await dev.get(url)).status, 404, `${url} is gone`);
			}
		});
	});

	// ─── menu ────────────────────────────────────────────────────────────────────
	describe('menu', () => {
		let category: any;
		let product: any;

		test('menu types: created, renamed, ordered and hidden by the manager', async () => {
			assert.equal((await dev.post('/api/admin/menu-types', { name: '  ' })).status, 400);
			assert.equal((await dev.post('/api/admin/menu-types', { name: 'کافه' })).status, 409, 'names are unique');
			const hookah = await dev.post('/api/admin/menu-types', { name: ' قلیان ' });
			assert.equal(hookah.status, 201, hookah.text);
			assert.equal(hookah.json.menuType.name, 'قلیان');
			assert.equal(hookah.json.menuType.sortOrder, 1, 'a new type goes last');
			const hookahId = hookah.json.menuType.id;

			assert.deepEqual((await client().get('/api/menu-types')).json, [
				{ id: cafeTypeId, name: 'کافه' },
				{ id: hookahId, name: 'قلیان' },
			]);
			assert.equal((await dev.put('/api/admin/menu-types/order', { ids: [hookahId] })).status, 400, 'every type must be listed');
			assert.equal((await dev.put('/api/admin/menu-types/order', { ids: [hookahId, hookahId] })).status, 400);
			assert.equal((await dev.put('/api/admin/menu-types/order', { ids: [hookahId, cafeTypeId] })).status, 200);
			assert.deepEqual(
				(await client().get('/api/menu-types')).json.map((t: { id: number }) => t.id),
				[hookahId, cafeTypeId],
			);

			// a hidden type takes its categories and products off the public menu
			const cat = await dev.post('/api/admin/categories', { name: 'میوه‌ای', menuTypeId: hookahId });
			const prod = await dev.post('/api/admin/products', { name: 'دو سیب', price: 300000, categoryId: cat.json.category.id });
			assert.equal(prod.status, 201, prod.text);
			assert.equal((await dev.patch(`/api/admin/menu-types/${hookahId}`, { isActive: false, name: 'قلیان‌ها' })).status, 200);
			assert.deepEqual((await client().get('/api/menu-types')).json, [{ id: cafeTypeId, name: 'کافه' }]);
			assert.equal((await client().get('/api/categories')).json.length, 0);
			assert.equal((await client().get(`/api/products?categoryId=${cat.json.category.id}`)).json.length, 0);
			assert.equal((await client().get('/api/products')).json.length, 0);

			const blocked = await dev.del(`/api/admin/menu-types/${hookahId}`);
			assert.equal(blocked.status, 409, 'a type with categories is not deleted');
			assert.equal(blocked.json.categoryCount, 1);
			assert.equal((await dev.del(`/api/admin/categories/${cat.json.category.id}?withProducts=1`)).status, 200);
			assert.equal((await dev.del(`/api/admin/menu-types/${hookahId}`)).status, 200);
			assert.equal((await dev.del(`/api/admin/menu-types/${hookahId}`)).status, 404);
		});

		test('categories: create, validate, list publicly', async () => {
			assert.equal((await dev.post('/api/admin/categories', { name: 'قهوه', menuTypeId: 'bar' })).status, 400);
			assert.equal((await dev.post('/api/admin/categories', { name: 'قهوه', menuTypeId: 9999 })).status, 404);
			assert.equal((await dev.post('/api/admin/categories', { name: 'قهوه' })).status, 400);
			assert.equal((await dev.post('/api/admin/categories', { name: '  ', menuTypeId: cafeTypeId })).status, 400);
			const res = await dev.post('/api/admin/categories', { name: ' قهوه ', menuTypeId: cafeTypeId });
			assert.equal(res.status, 201);
			category = res.json.category;
			assert.equal(category.name, 'قهوه');
			const list = await client().get('/api/categories');
			assert.deepEqual(list.json, [{ id: category.id, name: 'قهوه', menuTypeId: cafeTypeId }]);
			const admin = await dev.get('/api/admin/categories');
			assert.equal(admin.json.categories[0].menuType.name, 'کافه');
		});

		test('upload checks the real file content, not just the mimetype', async () => {
			const fake = new FormData();
			fake.append('image', new Blob(['<?php echo 1; ?>'], { type: 'image/jpeg' }), 'x.jpg');
			assert.equal((await dev.post('/api/admin/upload', undefined, { form: fake })).status, 400);
			const text = new FormData();
			text.append('image', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
			assert.equal((await dev.post('/api/admin/upload', undefined, { form: text })).status, 400);
			assert.equal((await client().post('/api/admin/upload', undefined, { form: new FormData() })).status, 401);
		});

		test('products: uploaded image is kept, bad input rejected', async () => {
			const form = new FormData();
			form.append('image', jpegFile(), 'latte.jpg');
			const upload = await dev.post('/api/admin/upload', undefined, { form });
			assert.equal(upload.status, 200, upload.text);
			assert.match(upload.json.filename, /^temp-/);

			for (const bad of [
				{ name: 'x', price: 1, categoryId: category.id, image: '../../.env' },
				{ name: 'x', price: -1, categoryId: category.id },
				{ name: 'x', price: 1.5, categoryId: category.id },
				// Number() would read these as 1, 5 and 0
				{ name: 'x', price: true, categoryId: category.id },
				{ name: 'x', price: [5], categoryId: category.id },
				{ name: 'x', price: ' ', categoryId: category.id },
				{ name: 'x', price: '1e3', categoryId: category.id },
				{ name: '', price: 1, categoryId: category.id },
				{ name: 'x', price: 1, categoryId: 9999 },
				{ name: 'x', price: 1, categoryId: category.id, image: 'temp-1700000000000-1.jpg' },
			]) {
				const res = await dev.post('/api/admin/products', bad);
				assert.ok([400, 404].includes(res.status), `${JSON.stringify(bad)} → ${res.status}`);
			}

			const res = await dev.post('/api/admin/products', {
				name: 'لاته',
				price: 95000,
				categoryId: category.id,
				image: upload.json.filename,
			});
			assert.equal(res.status, 201, res.text);
			product = res.json.product;
			// temp file is promoted so the stale-upload cleanup never deletes it
			assert.doesNotMatch(product.image, /^temp-/);
			assert.ok(fs.existsSync(path.join(UPLOADS, product.image)));
			assert.equal((await client().get(`/uploads/products/${product.image}`)).status, 200);

			const pub = await client().get(`/api/products?categoryId=${category.id}`);
			assert.equal(pub.json.length, 1);
			assert.equal((await client().get('/api/products?categoryId=abc')).status, 400);
		});

		test("a product cannot point at another product's image", async () => {
			const res = await dev.post('/api/admin/products', { name: 'کپی', price: 1000, categoryId: category.id, image: product.image });
			assert.equal(res.status, 400);
			assert.equal(
				(await dev.patch(`/api/admin/products/${product.id}`, { image: product.image, price: 96000 })).status,
				200,
				'own image is fine',
			);
		});

		test('replacing a product image deletes the old file', async () => {
			const form = new FormData();
			form.append('image', jpegFile(), 'new.jpg');
			const upload = await dev.post('/api/admin/upload', undefined, { form });
			const res = await dev.patch(`/api/admin/products/${product.id}`, { image: upload.json.filename, price: 99000 });
			assert.equal(res.status, 200, res.text);
			assert.equal(res.json.product.price, 99000);
			assert.ok(!fs.existsSync(path.join(UPLOADS, product.image)));
			product = res.json.product;
		});

		test('categories and products keep the order the admin sets; a moved one goes last', async () => {
			const mkCat = async (name: string, menuTypeId = cafeTypeId) => (await dev.post('/api/admin/categories', { name, menuTypeId })).json.category;
			const burgers = await mkCat('برگر');
			const drinks = await mkCat('نوشیدنی');
			assert.deepEqual([category.sortOrder, burgers.sortOrder, drinks.sortOrder], [0, 1, 2], 'a new category goes last');
			const publicIds = async () => (await client().get('/api/categories')).json.map((c: { id: number }) => c.id);
			assert.deepEqual(await publicIds(), [category.id, burgers.id, drinks.id]);

			for (const body of [
				{ menuTypeId: cafeTypeId, ids: [drinks.id, category.id] },
				{ menuTypeId: cafeTypeId, ids: [drinks.id, category.id, category.id] },
				{ menuTypeId: cafeTypeId, ids: [drinks.id, category.id, burgers.id, 9999] },
				{ menuTypeId: 'x', ids: [drinks.id, category.id, burgers.id] },
			]) {
				assert.equal((await staff.put('/api/admin/categories/order', body)).status, 400, JSON.stringify(body));
			}
			const ordered = await staff.put('/api/admin/categories/order', { menuTypeId: cafeTypeId, ids: [drinks.id, category.id, burgers.id] });
			assert.equal(ordered.status, 200, ordered.text);
			assert.deepEqual(await publicIds(), [drinks.id, category.id, burgers.id], 'staff may reorder');

			// tabs come first: a category of the first tab is listed before every category of the second
			const second = (await dev.post('/api/admin/menu-types', { name: 'سوخاری' })).json.menuType;
			const moved = await dev.patch(`/api/admin/categories/${drinks.id}`, { menuTypeId: second.id });
			assert.equal(moved.json.category.sortOrder, 0, 'moved into an empty tab: first and last');
			const chicken = await mkCat('مرغ سوخاری', second.id);
			assert.equal(chicken.sortOrder, 1);
			assert.deepEqual(await publicIds(), [category.id, burgers.id, drinks.id, chicken.id]);

			const mkProduct = async (name: string, categoryId = category.id) =>
				(await dev.post('/api/admin/products', { name, price: 100000, categoryId })).json.product;
			const espresso = await mkProduct('اسپرسو');
			const mocha = await mkProduct('موکا');
			assert.deepEqual([product.sortOrder, espresso.sortOrder, mocha.sortOrder], [0, 1, 2], 'a new product goes last');
			const productIds = async () => (await client().get(`/api/products?categoryId=${category.id}`)).json.map((p: { id: number }) => p.id);
			assert.equal((await staff.put('/api/admin/products/order', { categoryId: category.id, ids: [mocha.id, product.id] })).status, 400);
			assert.equal((await staff.put('/api/admin/products/order', { categoryId: category.id, ids: [mocha.id, product.id, espresso.id] })).status, 200);
			assert.deepEqual(await productIds(), [mocha.id, product.id, espresso.id]);
			const all = (await client().get('/api/products')).json.map((p: { id: number }) => p.id);
			assert.deepEqual(all.slice(0, 3), [mocha.id, product.id, espresso.id], 'the full list keeps the order too');

			const cheeseBurger = await mkProduct('چیزبرگر', burgers.id);
			const movedProduct = await dev.patch(`/api/admin/products/${mocha.id}`, { categoryId: burgers.id });
			assert.equal(movedProduct.json.product.sortOrder, cheeseBurger.sortOrder + 1, 'moved into another category: last there');

			for (const p of [espresso, mocha, cheeseBurger]) assert.equal((await dev.del(`/api/admin/products/${p.id}`)).status, 200);
			for (const c of [burgers, drinks, chicken]) assert.equal((await dev.del(`/api/admin/categories/${c.id}`)).status, 200);
			assert.equal((await dev.del(`/api/admin/menu-types/${second.id}`)).status, 200);
		});

		test('a hidden product is kept but off the public menu; a sold-out one stays listed', async () => {
			const publicProduct = async () => (await client().get(`/api/products?categoryId=${category.id}`)).json.find((p: { id: number }) => p.id === product.id);
			assert.deepEqual(Object.keys(await publicProduct()).sort(), ['categoryId', 'description', 'id', 'image', 'isAvailable', 'name', 'price'], 'no add-ons any more');
			assert.equal((await staff.patch(`/api/admin/products/${product.id}`, { isActive: 'no' })).status, 400);
			const hidden = await staff.patch(`/api/admin/products/${product.id}`, { isActive: false });
			assert.equal(hidden.status, 200, hidden.text);
			assert.equal(await publicProduct(), undefined);
			assert.equal((await client().get('/api/products')).json.some((p: { id: number }) => p.id === product.id), false);
			assert.equal((await dev.get('/api/admin/products')).json.products.find((p: { id: number }) => p.id === product.id).isActive, false, 'kept for later');
			assert.equal((await dev.get('/api/admin/dashboard')).json.hiddenCount, 1);

			await staff.patch(`/api/admin/products/${product.id}`, { isActive: true, isAvailable: false });
			assert.equal((await publicProduct()).isAvailable, false, 'sold out: still listed, marked');
			assert.equal((await dev.get('/api/admin/dashboard')).json.unavailableCount, 1);
			await staff.patch(`/api/admin/products/${product.id}`, { isAvailable: true });
		});

		test('a category with products is only deleted after explicit confirmation', async () => {
			const res = await dev.del(`/api/admin/categories/${category.id}`);
			assert.equal(res.status, 409);
			assert.equal(res.json.productCount, 1);
			assert.equal((await dev.get('/api/admin/products')).json.products.length, 1);
			assert.equal((await dev.del(`/api/admin/categories/${category.id}?withProducts=1`)).status, 200);
			assert.equal((await dev.get('/api/admin/products')).json.products.length, 0);
			assert.ok(!fs.existsSync(path.join(UPLOADS, product.image)));
		});
	});

	// ─── survey ──────────────────────────────────────────────────────────────────
	describe('survey', () => {
		let form: any[]; // the public questions, in order
		const q = (title: string) => form.find((x) => x.title.startsWith(title));
		const opt = (question: any, label: string) => question.options.find((o: any) => o.label === label).id;
		/** A submission: every required question answered, then `extra` (title prefix → value) on top. */
		const answers = (values: Record<string, unknown>) => Object.entries(values).map(([title, value]) => ({ questionId: q(title).id, value }));
		const required = () => ({
			'میزان رضایت از غذا': 3,
			'میزان رضایت از برخورد': 2,
			'میزان بهداشت': 40,
			'نظرتان نسبت به کیفیت': 2,
			'نسبت کیفیت به قیمت': opt(q('نسبت کیفیت به قیمت'), 'گران‌تر از کیفیتش'),
			'آیا علاقه‌مند': false,
		});
		const submit = (values: Record<string, unknown>, extra: Record<string, unknown> = {}) => client().post('/api/survey', { answers: answers(values), ...extra });
		let full: number; // the response with a name, phone and comment
		let bare: number; // required answers only

		test('the starter form is the restaurant\'s, with the agreed fixes; seeding twice adds nothing', async () => {
			const { seedSurvey } = await import('../prisma/seed-survey.js');
			await seedSurvey(prisma);
			await seedSurvey(prisma);
			form = (await client().get('/api/survey')).json;
			assert.deepEqual(
				form.map((x) => x.type),
				['STARS', 'STARS', 'SLIDER', 'EMOJI', 'CHOICE', 'YES_NO', 'SHORT_TEXT', 'PHONE', 'LONG_TEXT'],
			);
			assert.deepEqual(q('نسبت کیفیت به قیمت').options.map((o: any) => o.label), ['ارزان‌تر از کیفیتش', 'منصفانه', 'گران‌تر از کیفیتش']);
			assert.equal(q('میزان رضایت از غذا').options, undefined, 'options only on CHOICE');
			assert.deepEqual([q('نام').publicRole, q('پیشنهادات').publicRole, q('نام').isRequired, q('میزان رضایت از غذا').isRequired], ['NAME', 'COMMENT', false, true]);
		});

		test('submitting: required answers, every value checked against its type', async () => {
			const bad: [string, Record<string, unknown>][] = [
				['a required one missing', { ...required(), 'میزان رضایت از غذا': undefined }],
				['6 stars', { ...required(), 'میزان رضایت از غذا': 6 }],
				['2.5 stars', { ...required(), 'میزان رضایت از غذا': 2.5 }],
				['stars as text', { ...required(), 'میزان رضایت از غذا': '5' }],
				['emoji 0', { ...required(), 'نظرتان نسبت به کیفیت': 0 }],
				['slider 101', { ...required(), 'میزان بهداشت': 101 }],
				['yes/no as text', { ...required(), 'آیا علاقه‌مند': 'بله' }],
				['an option of nothing', { ...required(), 'نسبت کیفیت به قیمت': 999999 }],
				['a long name', { ...required(), 'نام': 'ن'.repeat(101) }],
				['a long comment', { ...required(), 'پیشنهادات': 'x'.repeat(1001) }],
				['a bad phone', { ...required(), 'شماره تماس': '12345' }],
			];
			for (const [why, values] of bad) {
				const res = await client().post('/api/survey', { answers: answers(Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))) });
				assert.equal(res.status, 400, why);
				assert.equal(typeof res.json.message, 'string');
			}
			const missing = await client().post('/api/survey', { answers: [] });
			assert.match(missing.json.message, /میزان رضایت از غذا/, 'the message names the question');
			assert.equal((await client().post('/api/survey', { answers: 'x' })).status, 400);
			assert.equal((await client().post('/api/survey', { answers: [...answers(required()), { questionId: 999999, value: 1 }] })).status, 400);
			assert.equal((await client().post('/api/survey', { answers: [...answers(required()), answers({ 'میزان رضایت از غذا': 4 })[0]] })).status, 400, 'twice');

			const before = await prisma.surveyResponse.count();
			const bot = await submit(required(), { website: 'http://spam.example' });
			assert.equal(bot.status, 201, 'a bot gets the normal answer…');
			assert.equal(await prisma.surveyResponse.count(), before, '…but nothing is saved');

			const a = await submit({
				...required(),
				'میزان رضایت از غذا': 5,
				'میزان رضایت از برخورد': 4,
				'میزان بهداشت': 80,
				'نظرتان نسبت به کیفیت': 5,
				'نسبت کیفیت به قیمت': opt(q('نسبت کیفیت به قیمت'), 'منصفانه'),
				'آیا علاقه‌مند': true,
				'نام': '  سارا  ',
				'شماره تماس': '۰۹۱۲ ۱۲۳ ۴۵۶۷',
				'پیشنهادات': 'برگرها عالی بودن',
			});
			assert.equal(a.status, 201, a.text);
			full = (await prisma.surveyResponse.findFirstOrThrow({ orderBy: { id: 'desc' } })).id;
			assert.equal(a.json.id, undefined, 'no id: a bot cannot tell a saved answer from a caught one');
			const b = await submit({ ...required(), 'نام': '', 'پیشنهادات': '   ' });
			assert.equal(b.status, 201, b.text);
			bare = (await prisma.surveyResponse.findFirstOrThrow({ orderBy: { id: 'desc' } })).id;
			assert.equal(await prisma.surveyAnswer.count({ where: { responseId: bare } }), 6, 'empty optional answers are not stored');
			const phone = await prisma.surveyAnswer.findFirst({ where: { responseId: full, questionId: q('شماره تماس').id } });
			assert.equal(phone?.textValue, '09121234567', 'Persian digits and spaces are normalized');
		});

		test('staff read the responses; a published comment is on the public «نظرات» list with the reply', async () => {
			const list = await staff.get('/api/admin/survey/responses');
			assert.equal(list.status, 200, list.text);
			assert.equal(list.json.total, 2);
			assert.equal(list.json.unread, 2);
			const fullResponse = list.json.responses.find((r: any) => r.id === full);
			assert.deepEqual(
				fullResponse.answers.map((a: any) => a.value),
				[5, 4, 80, 5, 'منصفانه', true, 'سارا', '0912***4567', 'برگرها عالی بودن'],
				'in form order, as readable values; staff see that a phone was left, not the number',
			);
			const asManager = (await main.get('/api/admin/survey/responses')).json.responses.find((r: any) => r.id === full);
			assert.equal(asManager.answers.find((a: any) => a.type === 'PHONE').value, '09121234567', 'the manager sees it, to call back');
			assert.equal((await staff.get('/api/admin/survey/responses?filter=commented')).json.total, 1);
			assert.equal((await staff.get('/api/admin/survey/responses?filter=nope')).status, 400);
			assert.equal((await staff.get('/api/admin/survey/responses?from=2026-13-01')).status, 400);

			assert.deepEqual((await client().get('/api/reviews')).json, [], 'nothing is public until published');
			assert.equal((await staff.patch(`/api/admin/survey/responses/${bare}`, { isPublished: true })).status, 409, 'no comment, nothing to show');
			assert.equal((await staff.patch(`/api/admin/survey/responses/${full}`, { reply: 'x'.repeat(501) })).status, 400);
			const published = await staff.patch(`/api/admin/survey/responses/${full}`, { isPublished: true, reply: ' ممنون سارا جان! ' });
			assert.equal(published.status, 200, published.text);
			assert.equal(published.json.response.isRead, true, 'publishing means it was read');

			const reviews = (await client().get('/api/reviews')).json;
			assert.equal(reviews.length, 1);
			assert.deepEqual({ ...reviews[0], createdAt: undefined }, { id: full, name: 'سارا', text: 'برگرها عالی بودن', reply: 'ممنون سارا جان!', createdAt: undefined });
			const paged = (await client().get('/api/reviews?page=1&limit=30')).json;
			assert.deepEqual([paged.total, paged.data.length], [1, 1]);
			assert.equal((await client().get('/api/reviews?limit=0')).status, 400);

			assert.equal((await staff.patch(`/api/admin/survey/responses/${bare}`, { isRead: true })).json.response.isRead, true);
			assert.equal((await staff.get('/api/admin/survey/responses?filter=unread')).json.total, 0);
			assert.equal((await dev.get('/api/admin/dashboard')).json.unreadResponses, 0);
			assert.equal((await staff.patch(`/api/admin/survey/responses/${full}`, { isPublished: false })).status, 200);
			assert.deepEqual((await client().get('/api/reviews')).json, []);
			await staff.patch(`/api/admin/survey/responses/${full}`, { isPublished: true });
		});

		test('statistics and the Excel (CSV) export: manager only, per date range', async () => {
			assert.equal((await staff.get('/api/admin/survey/stats')).status, 403);
			assert.equal((await staff.get('/api/admin/survey/export.csv')).status, 403);
			const stats = (await main.get('/api/admin/survey/stats')).json;
			assert.equal(stats.responses, 2);
			const of = (title: string) => stats.questions.find((x: any) => x.title.startsWith(title));
			assert.deepEqual([of('میزان رضایت از غذا').average, of('میزان رضایت از غذا').distribution], [4, [0, 0, 1, 0, 1]]);
			assert.deepEqual([of('میزان بهداشت').average, of('میزان بهداشت').distribution], [60, [0, 1, 0, 1, 0]]);
			assert.deepEqual([of('آیا علاقه‌مند').yes, of('آیا علاقه‌مند').no], [1, 1]);
			assert.deepEqual(of('نسبت کیفیت').options.map((o: any) => o.count), [0, 1, 1]);
			assert.deepEqual([of('نام').answered, of('پیشنهادات').answered], [1, 1]);
			const future = (await main.get('/api/admin/survey/stats?from=2099-01-01')).json;
			assert.equal(future.responses, 0);
			assert.equal((await main.get('/api/admin/survey/stats?from=2026-05-02&to=2026-05-01')).status, 400);

			// a formula typed by a customer must never run in Excel
			await submit({ ...required(), 'نام': '=HYPERLINK("http://evil.example")' });
			const csv = await main.get('/api/admin/survey/export.csv?from=2020-01-01');
			assert.equal(csv.status, 200);
			assert.match(csv.headers.get('content-type') ?? '', /text\/csv/);
			assert.match(csv.headers.get('content-disposition') ?? '', /survey_2020-01-01\.csv/);
			const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
			assert.equal(lines.length, 4, 'header + 3 responses');
			assert.match(lines[0], /میزان رضایت از غذا/);
			assert.match(lines[1], /منصفانه/);
			assert.match(lines[1], /,بله,/);
			assert.ok(lines.some((line) => line.includes(',0912 123 4567,')), 'phone kept as text so Excel keeps the leading zero');
			assert.match(lines[3], /"'=HYPERLINK\(""http:\/\/evil\.example""\)"/);
		});

		test('questions: the manager sets the text and the answer type; a question with answers keeps its type', async () => {
			const base = { title: 'سرعت تحویل سفارش', type: 'EMOJI' };
			assert.equal((await staff.post('/api/admin/survey/questions', base)).status, 403);
			assert.equal((await staff.get('/api/admin/survey/questions')).status, 200, 'staff read them');
			for (const body of [
				{ ...base, type: 'COLOR' },
				{ ...base, title: '  ' },
				{ ...base, type: 'CHOICE' },
				{ ...base, type: 'CHOICE', options: ['فقط یکی'] },
				{ ...base, type: 'CHOICE', options: ['الف', 'الف'] },
				{ ...base, options: ['الف', 'ب'] },
				{ ...base, publicRole: 'NAME' },
				{ ...base, isRequired: 'yes' },
			]) {
				assert.equal((await main.post('/api/admin/survey/questions', body)).status, 400, JSON.stringify(body));
			}
			assert.equal((await main.post('/api/admin/survey/questions', { title: 'نظر دوم', type: 'LONG_TEXT', publicRole: 'COMMENT' })).status, 409, 'one comment question');

			const created = await main.post('/api/admin/survey/questions', { ...base, isRequired: false });
			assert.equal(created.status, 201, created.text);
			const speed = created.json.question;
			form = (await client().get('/api/survey')).json;
			assert.equal(form.at(-1).id, speed.id, 'a new question goes last');

			// unanswered: its type may still change (to CHOICE only with options)
			assert.equal((await main.patch(`/api/admin/survey/questions/${speed.id}`, { type: 'CHOICE' })).status, 400);
			const choice = await main.patch(`/api/admin/survey/questions/${speed.id}`, { type: 'CHOICE', options: ['سریع', 'معمولی', 'کند'] });
			assert.equal(choice.status, 200, choice.text);
			assert.equal(choice.json.question.options.length, 3);
			const back = await main.patch(`/api/admin/survey/questions/${speed.id}`, { type: 'STARS' });
			assert.deepEqual(back.json.question.options, [], 'leaving CHOICE drops the options');

			// answered: the type is locked, the text is not
			const food = q('میزان رضایت از غذا');
			assert.equal((await main.patch(`/api/admin/survey/questions/${food.id}`, { type: 'EMOJI' })).status, 409);
			const renamed = await main.patch(`/api/admin/survey/questions/${food.id}`, { title: 'از غذا راضی بودید؟' });
			assert.equal(renamed.json.question.title, 'از غذا راضی بودید؟');
			assert.equal(renamed.json.question.answerCount, 3);

			// hidden from the form, answers kept; its id is refused in a new submission
			assert.equal((await main.patch(`/api/admin/survey/questions/${food.id}`, { isActive: false })).status, 200);
			form = (await client().get('/api/survey')).json;
			assert.equal(form.some((x) => x.id === food.id), false);
			assert.equal((await client().post('/api/survey', { answers: [{ questionId: food.id, value: 5 }] })).status, 400);
			assert.equal((await main.get('/api/admin/survey/stats')).json.questions.some((x: any) => x.questionId === food.id), true, 'old answers still count');
			await main.patch(`/api/admin/survey/questions/${food.id}`, { isActive: true, title: 'میزان رضایت از غذا' });

			// order
			const ids = (await main.get('/api/admin/survey/questions')).json.questions.map((x: any) => x.id);
			assert.equal((await main.put('/api/admin/survey/questions/order', { ids: ids.slice(1) })).status, 400);
			const reordered = await main.put('/api/admin/survey/questions/order', { ids: [speed.id, ...ids.filter((id: number) => id !== speed.id)] });
			assert.equal(reordered.json.questions[0].id, speed.id);
			assert.equal((await client().get('/api/survey')).json[0].id, speed.id);

			// options: add, rename, reorder, delete (at least two stay; a chosen one only with force)
			const price = q('نسبت کیفیت به قیمت');
			assert.equal((await main.post(`/api/admin/survey/questions/${price.id}/options`, { label: 'منصفانه' })).status, 409);
			const added = await main.post(`/api/admin/survey/questions/${price.id}/options`, { label: 'نظری ندارم' });
			assert.equal(added.status, 201, added.text);
			const optionIds = added.json.question.options.map((o: any) => o.id);
			const renamedOption = await main.patch(`/api/admin/survey/options/${optionIds[3]}`, { label: 'نمی‌دانم' });
			assert.equal(renamedOption.json.question.options[3].label, 'نمی‌دانم');
			const ordered = await main.put(`/api/admin/survey/questions/${price.id}/options/order`, { ids: [...optionIds].reverse() });
			assert.equal(ordered.json.question.options[0].label, 'نمی‌دانم');
			assert.equal((await main.del(`/api/admin/survey/options/${optionIds[3]}`)).status, 200, 'never chosen: deleted at once');
			const fair = opt(price, 'منصفانه');
			assert.equal((await main.del(`/api/admin/survey/options/${fair}`)).status, 409, 'chosen once');
			assert.equal((await staff.del(`/api/admin/survey/options/${fair}?force=1`)).status, 403);

			// deleting: an answered question asks first
			assert.equal((await main.del(`/api/admin/survey/questions/${food.id}`)).status, 409);
			assert.equal((await main.del(`/api/admin/survey/questions/${speed.id}`)).status, 200);
		});

		test('staff can delete a response; it leaves the public list with it', async () => {
			assert.equal((await staff.del(`/api/admin/survey/responses/${full}`)).status, 200);
			assert.deepEqual((await client().get('/api/reviews')).json, []);
			assert.equal((await staff.del(`/api/admin/survey/responses/${full}`)).status, 404);
		});
	});

	// ─── banners ─────────────────────────────────────────────────────────────────
	describe('banners', () => {
		const mk = async (title?: string, extra: Record<string, unknown> = {}) => {
			const up = await upload(dev, '/api/admin/banners/upload');
			assert.equal(up.status, 200, up.text);
			return dev.post('/api/admin/banners', { title, image: up.json.filename, ...extra });
		};
		const publicIds = async () => (await client().get('/api/banners')).json.map((b: { id: number }) => b.id);

		test('upload: manager only, jpg / png / webp, real image content', async () => {
			assert.equal((await upload(staff, '/api/admin/banners/upload')).status, 403);
			assert.equal((await upload(client(), '/api/admin/banners/upload')).status, 401);
			assert.equal((await upload(main, '/api/admin/banners/upload', gifFile())).status, 400, 'no gif banners');
			assert.equal((await upload(main, '/api/admin/banners/upload', new Blob(['<?php ?>'], { type: 'image/jpeg' }))).status, 400);
			const ok = await upload(main, '/api/admin/banners/upload');
			assert.equal(ok.status, 200, ok.text);
			assert.match(ok.json.filename, /^temp-.*\.jpg$/);
			assert.ok(fs.existsSync(path.join(BANNERS, ok.json.filename)));
		});

		test('create: an image is required and must be a fresh banner upload', async () => {
			assert.equal((await dev.post('/api/admin/banners', { title: 'x' })).status, 400);
			assert.equal((await dev.post('/api/admin/banners', { image: 'placeholder.png' })).status, 400, 'no placeholder banners');
			assert.equal((await dev.post('/api/admin/banners', { image: '../../.env' })).status, 400);
			const productUpload = await upload(dev, '/api/admin/upload');
			assert.equal((await dev.post('/api/admin/banners', { image: productUpload.json.filename })).status, 400, 'a product upload is not a banner upload');
			assert.equal((await mk('x'.repeat(81))).status, 400);

			const res = await mk('  تخفیف آخر هفته  ');
			assert.equal(res.status, 201, res.text);
			const banner = res.json.banner;
			assert.equal(banner.title, 'تخفیف آخر هفته');
			assert.equal(banner.isActive, true);
			assert.doesNotMatch(banner.image, /^temp-/, 'promoted so the cleanup never deletes it');
			assert.equal((await client().get(`/uploads/banners/${banner.image}`)).status, 200);
			assert.deepEqual((await client().get('/api/banners')).json, [{ id: banner.id, title: 'تخفیف آخر هفته', image: banner.image }]);
			const untitled = await mk();
			assert.equal(untitled.json.banner.title, null, 'the title is optional');
		});

		test('at most 10 active banners; inactive ones are kept but not shown', async () => {
			for (let i = (await publicIds()).length; i < 10; i++) assert.equal((await mk(`بنر ${i + 1}`)).status, 201);
			const over = await mk('یازدهم');
			assert.equal(over.status, 409);
			const spare = await mk('یدکی', { isActive: false });
			assert.equal(spare.status, 201, 'an inactive one can always be added');
			assert.equal((await publicIds()).includes(spare.json.banner.id), false);
			assert.equal((await dev.patch(`/api/admin/banners/${spare.json.banner.id}`, { isActive: true })).status, 409);
			const first = (await publicIds())[0];
			assert.equal((await dev.patch(`/api/admin/banners/${first}`, { isActive: false })).status, 200);
			assert.equal((await dev.patch(`/api/admin/banners/${spare.json.banner.id}`, { isActive: true })).status, 200, 'room again');
			assert.equal((await dev.get('/api/admin/dashboard')).json.activeBanners, 10);
			const list = (await main.get('/api/admin/banners')).json;
			assert.equal(list.maxActive, 10);
			assert.equal(list.banners.length, 11, '10 active + the spare');
		});

		test('slide order is the manager\'s: every banner, each once', async () => {
			const all = (await dev.get('/api/admin/banners')).json.banners.map((b: { id: number }) => b.id);
			assert.equal((await dev.put('/api/admin/banners/order', { ids: all.slice(1) })).status, 400);
			assert.equal((await staff.put('/api/admin/banners/order', { ids: [...all].reverse() })).status, 403);
			const res = await main.put('/api/admin/banners/order', { ids: [...all].reverse() });
			assert.equal(res.status, 200, res.text);
			const active = new Set((await publicIds()) as number[]);
			assert.deepEqual(await publicIds(), [...all].reverse().filter((id: number) => active.has(id)));
		});

		test('edit and delete: replacing the image or deleting the banner removes the old file', async () => {
			const banner = (await mk('برای ویرایش', { isActive: false })).json.banner;
			assert.equal((await dev.patch(`/api/admin/banners/${banner.id}`, { title: null })).json.banner.title, null);
			assert.equal((await dev.patch(`/api/admin/banners/${banner.id}`, { isActive: 'yes' })).status, 400);
			const up = await upload(dev, '/api/admin/banners/upload');
			const replaced = await dev.patch(`/api/admin/banners/${banner.id}`, { image: up.json.filename });
			assert.equal(replaced.status, 200, replaced.text);
			assert.ok(!fs.existsSync(path.join(BANNERS, banner.image)), 'old file deleted');
			assert.equal((await dev.del(`/api/admin/banners/${banner.id}`)).status, 200);
			assert.ok(!fs.existsSync(path.join(BANNERS, replaced.json.banner.image)));
			assert.equal((await dev.del(`/api/admin/banners/${banner.id}`)).status, 404);
			assert.equal((await dev.patch('/api/admin/banners/abc', { title: 'x' })).status, 400);

			// leave nothing behind
			for (const b of (await dev.get('/api/admin/banners')).json.banners) assert.equal((await dev.del(`/api/admin/banners/${b.id}`)).status, 200);
			assert.deepEqual(await client().get('/api/banners').then((r) => r.json), []);
		});
	});

	// ─── security ────────────────────────────────────────────────────────────────
	describe('security', () => {
		/** A raw request with a client's cookies and any headers (the helper client cannot set Origin). */
		const raw = (c: Client | null, method: string, url: string, headers: Record<string, string> = {}, body?: unknown) =>
			fetch(base + url, {
				method,
				headers: {
					...(c?.jar.size ? { cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
					...(body !== undefined ? { 'content-type': 'application/json' } : {}),
					...headers,
				},
				body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
			});

		test('a NUL character (which PostgreSQL cannot store) is removed instead of failing with a 500', async () => {
			const res = await dev.post('/api/admin/categories', { name: 'برگر\u0000ویژه', menuTypeId: cafeTypeId });
			assert.equal(res.status, 201, res.text);
			assert.equal(res.json.category.name, 'برگرویژه');
			assert.equal((await dev.patch('/api/admin/settings', { cafeName: 'دنیز\u0000' })).json.settings.cafeName, 'دنیز');
			assert.equal((await dev.del(`/api/admin/categories/${res.json.category.id}`)).status, 200);
		});

		test('ids too big for the database are a 400, never a 500', async () => {
			const huge = '99999999999';
			assert.equal((await client().get(`/api/products?categoryId=${huge}`)).status, 400);
			for (const url of [`/api/admin/products/${huge}`, `/api/admin/categories/${huge}`, `/api/admin/banners/2147483648`, `/api/admin/survey/questions/${huge}`]) {
				assert.equal((await dev.patch(url, { name: 'x', title: 'x' })).status, 400, url);
				assert.equal((await dev.del(url)).status, 400, url);
			}
			assert.equal((await dev.post('/api/admin/products', { name: 'x', price: 1, categoryId: Number(huge) })).status, 400);
			assert.equal((await dev.post('/api/admin/products', { name: 'x', price: 1, categoryId: 1.5 })).status, 400);
			assert.equal((await client().post('/api/survey', { answers: [{ questionId: Number(huge), value: 1 }] })).status, 400);
		});

		test('query parameters are plain strings: nested or repeated ones are refused or ignored, never a 500', async () => {
			assert.equal((await client().get('/api/products?categoryId[gt]=0')).status, 200, '«categoryId[gt]» is just an unknown parameter');
			assert.equal((await client().get('/api/products?categoryId=1&categoryId=2')).status, 400);
			assert.equal((await staff.get('/api/admin/survey/responses?from=2026-01-01&from=2026-02-01')).status, 400);
			assert.equal((await staff.get('/api/admin/survey/responses?page=1&page=2')).status, 400);
			assert.equal((await client().get('/api/reviews?limit=1e3')).status, 400);
		});

		test('a body over 1 MB is refused with a clear 413', async () => {
			const res = await client().post('/api/survey', JSON.stringify({ answers: [], x: 'x'.repeat(1_100_000) }));
			assert.equal(res.status, 413);
			assert.match(res.json.message, /حجم/);
		});

		test('logging out ends the token on the server: a copied cookie stops working at once', async () => {
			await dev.post('/api/admin/admins', { username: 'leaky', name: 'Leaky', role: 'SECONDARY', password: 'LeakyPass123' });
			const victim = await login('leaky', 'LeakyPass123');
			const stolen = client();
			for (const [k, v] of victim.jar) stolen.jar.set(k, v);
			assert.equal((await stolen.get('/api/admin/me')).status, 200);
			assert.equal((await victim.post('/api/admin/logout')).status, 200);
			assert.equal(victim.jar.has('adminToken'), false, 'the cookie is cleared');
			assert.equal((await stolen.get('/api/admin/me')).status, 401, 'and the copy is dead too');
			assert.equal((await client().post('/api/admin/logout')).status, 200, 'logging out without a session is harmless');
		});

		test('forged tokens are refused: no signature, another secret, or a token of another kind', async () => {
			const me = (await dev.get('/api/admin/me')).json.admin;
			const devRow = await prisma.adminUser.findUniqueOrThrow({ where: { id: me.id } });
			const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
			const payload = { sub: me.id, username: me.username, role: 'DEVELOPER', ver: devRow.tokenVersion, type: 'admin' };
			const jwt = (await import('jsonwebtoken')).default;
			const forged = [
				`${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`,
				jwt.sign(payload, 'another-secret-another-secret-another', { algorithm: 'HS256' }),
				jwt.sign({ ...payload, type: 'user' }, 'dev-admin-secret-change-me', { algorithm: 'HS256' }),
				jwt.sign(payload, 'dev-admin-secret-change-me', { algorithm: 'HS512' }),
				'not-a-token',
			];
			for (const token of forged) {
				const res = await fetch(`${base}/api/admin/me`, { headers: { cookie: `adminToken=${token}` } });
				assert.equal(res.status, 401, token.slice(0, 30));
			}
		});

		test('passwords: at least 8 characters, at most 72 bytes; names must be text', async () => {
			const make = (password: unknown, name: unknown = 'x') => dev.post('/api/admin/admins', { username: `pw${Math.random().toString(36).slice(2, 8)}`, name, role: 'SECONDARY', password });
			assert.equal((await make('ر'.repeat(37))).status, 400, '74 bytes: bcrypt would ignore the end');
			assert.equal((await make('1234567')).status, 400);
			assert.equal((await make(12345678)).status, 400, 'a number is not a password');
			assert.equal((await make('ر'.repeat(36))).status, 201, '72 bytes is fine');
			assert.equal((await make('GoodPass123', { a: 1 })).status, 400, 'an object is not a name');
			assert.equal((await make('GoodPass123', 'x'.repeat(81))).status, 400);
		});

		test('writes from a page of another site are refused (CSRF), even with the admin\'s cookie', async () => {
			const evil = await raw(dev, 'POST', '/api/admin/categories', { origin: 'https://evil.example' }, { name: 'x', menuTypeId: cafeTypeId });
			assert.equal(evil.status, 403);
			assert.equal((await raw(dev, 'DELETE', `/api/admin/menu-types/${cafeTypeId}`, { origin: 'https://evil.example' })).status, 403);
			assert.equal((await raw(null, 'POST', '/api/admin/login', { origin: 'https://evil.example' }, { username: 'dev', password: 'DevPass123' })).status, 403, 'login CSRF too');
			assert.equal((await raw(dev, 'GET', '/api/admin/me', { origin: 'https://evil.example' })).status, 200, 'reads are not blocked (the browser does not show them to the other site)');
			const own = await raw(dev, 'POST', '/api/admin/categories', { origin: base }, { name: 'از خود سایت', menuTypeId: cafeTypeId });
			assert.equal(own.status, 201, 'the API\'s own address');
			const frontend = await raw(dev, 'DELETE', `/api/admin/categories/${((await own.json()) as any).category.id}`, { origin: FRONTEND });
			assert.equal(frontend.status, 200, 'the frontend in CORS_ORIGINS');
		});

		test('admin answers are never cached; the admin API is not indexed', async () => {
			const res = await dev.get('/api/admin/survey/responses');
			assert.equal(res.headers.get('cache-control'), 'no-store');
			assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
		});

		test('settings: only the known keys, as text', async () => {
			for (const body of [['cafeName'], { cafeName: 5 }, { cafeName: null }, { __proto__: { x: 1 }, cafeName: 'x', isAdmin: true }]) {
				assert.equal((await dev.patch('/api/admin/settings', body)).status, 400, JSON.stringify(body));
			}
			assert.equal((await staff.patch('/api/admin/settings', { cafeName: 'x' })).status, 403);
		});
	});

	// ─── races: many requests at the same moment ────────────────────────────────
	describe('races', () => {
		const filesIn = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => !f.startsWith('temp-') && !f.startsWith('.')) : []);
		/** Every permanent file that appeared since `before` belongs to a row, and every row's file exists. */
		async function assertNoOrphans(dir: string, before: string[], rows: () => Promise<string[]>) {
			const used = new Set((await rows()).filter((name) => name !== 'placeholder.png'));
			const created = filesIn(dir).filter((f) => !before.includes(f));
			for (const file of created) assert.ok(used.has(file), `orphan file ${file}`);
			for (const name of used) assert.ok(fs.existsSync(path.join(dir, name)), `missing file ${name}`);
		}
		const productImagesInDb = async () => (await prisma.product.findMany({ select: { image: true } })).map((p) => p.image);
		const bannerImagesInDb = async () => (await prisma.banner.findMany({ select: { image: true } })).map((b) => b.image);
		const statuses = (results: ApiResponse[]) => results.map((r) => r.status).sort();

		test('two developers deactivating each other at once: one developer always remains', async () => {
			const devId = (await dev.get('/api/admin/me')).json.admin.id;
			// for this test the two new developers are the only active ones
			await prisma.adminUser.update({ where: { id: devId }, data: { isActive: false } });
			try {
				for (let round = 0; round < 5; round++) {
					const ids: string[] = [];
					for (const name of ['race-a', 'race-b']) {
						const passwordHash = (await prisma.adminUser.findUniqueOrThrow({ where: { id: devId } })).passwordHash;
						ids.push((await prisma.adminUser.create({ data: { username: `${name}-${round}`, name, role: 'DEVELOPER', passwordHash } })).id);
					}
					const [a, b] = await Promise.all([login(`race-a-${round}`, 'DevPass123'), login(`race-b-${round}`, 'DevPass123')]);
					const results = await Promise.all([a.patch(`/api/admin/admins/${ids[1]}`, { isActive: false }), b.patch(`/api/admin/admins/${ids[0]}`, { isActive: false })]);
					assert.equal(await prisma.adminUser.count({ where: { role: 'DEVELOPER', isActive: true } }), 1, `round ${round}: ${statuses(results)}`);
					assert.ok(!results.some((r) => r.status >= 500), `round ${round}: ${statuses(results)}`);
					await prisma.adminUser.deleteMany({ where: { id: { in: ids } } });
				}
			} finally {
				await prisma.adminUser.update({ where: { id: devId }, data: { isActive: true } });
			}
			assert.equal((await dev.get('/api/admin/me')).status, 200);
		});

		test('15 banners added at once: exactly 10 active, the rest refused, no orphan files', async () => {
			const before = filesIn(BANNERS);
			const uploads = await Promise.all(Array.from({ length: 15 }, () => upload(dev, '/api/admin/banners/upload')));
			const results = await Promise.all(uploads.map((u, i) => dev.post('/api/admin/banners', { title: `هم‌زمان ${i}`, image: u.json.filename })));
			assert.deepEqual(statuses(results), [...Array(10).fill(201), ...Array(5).fill(409)]);
			assert.equal(await prisma.banner.count({ where: { isActive: true } }), 10);
			await assertNoOrphans(BANNERS, before, bannerImagesInDb);
			// switching two inactive ones on at once when there is room for one
			const first = results.find((r) => r.status === 201)!.json.banner.id;
			assert.equal((await dev.patch(`/api/admin/banners/${first}`, { isActive: false })).status, 200);
			const spare = await Promise.all([0, 1].map(async () => (await dev.post('/api/admin/banners', { image: (await upload(dev, '/api/admin/banners/upload')).json.filename, isActive: false })).json.banner.id));
			const switched = await Promise.all(spare.map((id: number) => dev.patch(`/api/admin/banners/${id}`, { isActive: true })));
			assert.deepEqual(statuses(switched), [200, 409]);
			assert.equal(await prisma.banner.count({ where: { isActive: true } }), 10);
			for (const b of await prisma.banner.findMany()) await dev.del(`/api/admin/banners/${b.id}`);
			await assertNoOrphans(BANNERS, before, bannerImagesInDb);
		});

		test('two survey questions claiming the public comment role at once: only one gets it', async () => {
			const current = (await main.get('/api/admin/survey/questions')).json.questions.find((x: any) => x.publicRole === 'COMMENT' && x.isActive);
			if (current) await main.patch(`/api/admin/survey/questions/${current.id}`, { publicRole: 'NONE' });
			try {
				for (let round = 0; round < 3; round++) {
					const results = await Promise.all([1, 2].map((n) => main.post('/api/admin/survey/questions', { title: `نظر ${round}-${n}`, type: 'LONG_TEXT', publicRole: 'COMMENT' })));
					assert.deepEqual(statuses(results), [201, 409], `round ${round}`);
					assert.equal(await prisma.surveyQuestion.count({ where: { publicRole: 'COMMENT', isActive: true } }), 1);
					for (const r of results.filter((x) => x.status === 201)) await main.del(`/api/admin/survey/questions/${r.json.question.id}`);
				}
			} finally {
				if (current) await main.patch(`/api/admin/survey/questions/${current.id}`, { publicRole: 'COMMENT' });
			}
		});

		test('customers answering while the manager deletes the option they chose: never a 500, never a broken answer', async () => {
			const q = (await main.post('/api/admin/survey/questions', { title: 'نوشیدنی همراه', type: 'CHOICE', options: ['نوشابه', 'دوغ', 'آب'] })).json.question;
			const form = (await client().get('/api/survey')).json as any[];
			const required = form.filter((x) => x.isRequired);
			const value = (x: any) => ({ STARS: 4, EMOJI: 4, SLIDER: 70, YES_NO: true, CHOICE: x.options?.[0]?.id, SHORT_TEXT: 'x', LONG_TEXT: 'x', PHONE: '09120000000' })[x.type as string];
			const answers = [...required.map((x) => ({ questionId: x.id, value: value(x) })), { questionId: q.id, value: q.options[0].id }];
			const responsesBefore = await prisma.surveyResponse.count();
			const results = await Promise.all([
				...Array.from({ length: 15 }, () => client().post('/api/survey', { answers })),
				main.del(`/api/admin/survey/options/${q.options[0].id}?force=1`),
				...Array.from({ length: 15 }, () => client().post('/api/survey', { answers })),
			]);
			for (const r of results) assert.ok([200, 201, 400].includes(r.status), `${r.status} ${r.text}`);
			const saved = await prisma.surveyResponse.count();
			const created = results.filter((r) => r.status === 201).length;
			assert.equal(saved - responsesBefore, created, 'every 201 was saved, nothing else');
			assert.equal(await prisma.surveyAnswer.count({ where: { questionId: q.id, optionId: q.options[0].id } }), 0, 'no answer points at the deleted option');
			assert.equal((await main.del(`/api/admin/survey/questions/${q.id}?force=1`)).status, 200);
		});

		test('deleting a category while products are being added to it: never a 500, no orphan photos', async () => {
			const before = filesIn(UPLOADS);
			for (let round = 0; round < 3; round++) {
				const category = (await dev.post('/api/admin/categories', { name: `موقت ${round}`, menuTypeId: cafeTypeId })).json.category;
				const uploads = await Promise.all(Array.from({ length: 6 }, () => upload(dev, '/api/admin/upload')));
				const results = await Promise.all([
					...uploads.slice(0, 3).map((u, i) => dev.post('/api/admin/products', { name: `p${i}`, price: 1000, categoryId: category.id, image: u.json.filename })),
					dev.del(`/api/admin/categories/${category.id}?withProducts=1`),
					...uploads.slice(3).map((u, i) => dev.post('/api/admin/products', { name: `q${i}`, price: 1000, categoryId: category.id, image: u.json.filename })),
				]);
				for (const r of results) assert.ok(r.status < 500, `round ${round}: ${r.status} ${r.text}`);
				// whatever won, the category is gone or still has exactly its products; nothing half-done
				const left = await prisma.category.findUnique({ where: { id: category.id }, include: { _count: { select: { products: true } } } });
				if (left) {
					assert.equal((await dev.del(`/api/admin/categories/${category.id}?withProducts=1`)).status, 200);
				}
				await assertNoOrphans(UPLOADS, before, productImagesInDb);
			}
		});

		test('one upload used by two products at once: one gets it, the other a clear 400', async () => {
			const category = (await dev.post('/api/admin/categories', { name: 'دو بار', menuTypeId: cafeTypeId })).json.category;
			const before = filesIn(UPLOADS);
			const u = await upload(dev, '/api/admin/upload');
			const results = await Promise.all([1, 2].map((n) => dev.post('/api/admin/products', { name: `n${n}`, price: 1, categoryId: category.id, image: u.json.filename })));
			assert.deepEqual(statuses(results), [201, 400]);
			await assertNoOrphans(UPLOADS, before, productImagesInDb);
			assert.equal((await dev.del(`/api/admin/categories/${category.id}?withProducts=1`)).status, 200);
		});

		test('two edits replacing a product photo at once, and a delete racing an edit: no orphan photos', async () => {
			const category = (await dev.post('/api/admin/categories', { name: 'عکس', menuTypeId: cafeTypeId })).json.category;
			const before = filesIn(UPLOADS);
			for (let round = 0; round < 3; round++) {
				const first = await upload(dev, '/api/admin/upload');
				const product = (await dev.post('/api/admin/products', { name: `عکس‌دار ${round}`, price: 1, categoryId: category.id, image: first.json.filename })).json.product;
				const [a, b] = await Promise.all([upload(dev, '/api/admin/upload'), upload(dev, '/api/admin/upload')]);
				const edits = await Promise.all([a, b].map((u) => dev.patch(`/api/admin/products/${product.id}`, { image: u.json.filename })));
				assert.ok(edits.some((r) => r.status === 200), `round ${round}: ${statuses(edits)}`);
				for (const r of edits) assert.ok([200, 409].includes(r.status), `round ${round}: ${r.status} ${r.text}`);
				await assertNoOrphans(UPLOADS, before, productImagesInDb);

				const c = await upload(dev, '/api/admin/upload');
				const mixed = await Promise.all([dev.patch(`/api/admin/products/${product.id}`, { image: c.json.filename }), dev.del(`/api/admin/products/${product.id}`)]);
				for (const r of mixed) assert.ok(r.status < 500, `round ${round}: ${r.status} ${r.text}`);
				if (await prisma.product.findUnique({ where: { id: product.id } })) await dev.del(`/api/admin/products/${product.id}`);
				await assertNoOrphans(UPLOADS, before, productImagesInDb);
			}
			assert.equal((await dev.del(`/api/admin/categories/${category.id}`)).status, 200);
		});
	});

	describe('settings and dashboard', () => {
		test('settings: unknown keys and bad values are refused', async () => {
			for (const body of [{ anything: '1' }, { pricePerGuest: 1 }, { cafeName: '  ' }, { cafeName: 'x'.repeat(61) }, { recommenderEnabled: true }]) {
				assert.equal((await dev.patch('/api/admin/settings', body)).status, 400, JSON.stringify(body));
			}
			const ok = await dev.patch('/api/admin/settings', { cafeName: ' فست فود دنیز ', currencyLabel: 'تومان' });
			assert.equal(ok.status, 200, ok.text);
			assert.equal(ok.json.settings.cafeName, 'فست فود دنیز');
		});

		test('dashboard shows the menu numbers', async () => {
			const res = await dev.get('/api/admin/dashboard');
			assert.equal(res.status, 200);
			for (const key of ['productsCount', 'hiddenCount', 'unavailableCount', 'categoriesCount', 'activeBanners', 'unreadResponses']) {
				assert.equal(typeof res.json[key], 'number', key);
			}
		});
	});
});
