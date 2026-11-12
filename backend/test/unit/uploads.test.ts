import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { HttpError } from '../../src/lib/http-error.js';
import { ImageStore, PLACEHOLDER_IMAGE, fileMatchesExtension } from '../../src/lib/uploads.js';

// A store in its own folder under uploads/, removed at the end.
const store = new ImageStore(`unit-test-${process.pid}`, { extensions: ['jpg', 'png', 'webp'], allowPlaceholder: false });
const products = new ImageStore(`unit-test-p-${process.pid}`, { extensions: ['jpg', 'png', 'webp', 'gif'], allowPlaceholder: true });
fs.mkdirSync(store.dir, { recursive: true });
after(() => {
	fs.rmSync(store.dir, { recursive: true, force: true });
	fs.rmSync(products.dir, { recursive: true, force: true });
});

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const write = (name: string, bytes: Buffer = JPEG) => {
	fs.writeFileSync(path.join(store.dir, name), bytes);
	return name;
};

test('only names the server itself makes are accepted (no paths, no other extensions, no tricks)', () => {
	assert.equal(store.isSafeName('1792240177051-517287939.jpg'), true);
	assert.equal(store.isSafeName('temp-1792240177051-517287939.webp'), true);
	for (const bad of ['../../.env', '/etc/passwd', 'a.jpg', '1792240177051-517287939.gif', '1792240177051-517287939.svg', '1792240177051-517287939.jpg.php', 'x/1792240177051-1.jpg', PLACEHOLDER_IMAGE, '', null, 5]) {
		assert.equal(store.isSafeName(bad), false, String(bad));
	}
	assert.equal(products.isSafeName(PLACEHOLDER_IMAGE), true, 'products may have no photo');
	assert.equal(store.isTemp('temp-1792240177051-1.jpg'), true);
	assert.equal(store.isTemp('1792240177051-1.jpg'), false);
	assert.equal(store.formats, 'jpg، png، webp');
});

test('fileMatchesExtension checks the real content, not the name', async () => {
	assert.equal(await fileMatchesExtension(path.join(store.dir, write('1700000000001-1.jpg'))), true);
	assert.equal(await fileMatchesExtension(path.join(store.dir, write('1700000000002-1.png', PNG))), true);
	assert.equal(await fileMatchesExtension(path.join(store.dir, write('1700000000003-1.png', JPEG))), false, 'a JPEG named .png');
	assert.equal(await fileMatchesExtension(path.join(store.dir, write('1700000000004-1.jpg', Buffer.from('<?php echo 1; ?>')))), false);
	assert.equal(await fileMatchesExtension(path.join(store.dir, write('1700000000005-1.svg', Buffer.from('<svg/>')))), false);
});

test('promote renames a temp upload once; the second use of the same upload is a 400, not a crash', async () => {
	const temp = write('temp-1700000000010-7.jpg');
	assert.equal(await store.promote(temp), '1700000000010-7.jpg');
	assert.ok(fs.existsSync(path.join(store.dir, '1700000000010-7.jpg')));
	await assert.rejects(store.promote(temp), (error: unknown) => error instanceof HttpError && error.status === 400);
	assert.equal(await store.promote('1700000000010-7.jpg'), '1700000000010-7.jpg', 'a permanent name stays as it is');
});

test('saveWithImage removes the promoted file again when saving fails', async () => {
	const temp = write('temp-1700000000020-1.jpg');
	await assert.rejects(store.saveWithImage(temp, async () => Promise.reject(new Error('database said no'))), /database said no/);
	assert.ok(!fs.existsSync(path.join(store.dir, temp)));
	assert.ok(!fs.existsSync(path.join(store.dir, '1700000000020-1.jpg')), 'no orphan file left behind');

	const ok = write('temp-1700000000021-1.jpg');
	assert.equal(await store.saveWithImage(ok, async (name) => name), '1700000000021-1.jpg');
	assert.equal(await store.saveWithImage(undefined, async (name) => name ?? 'none'), 'none');
});

test('checkChosen: a fresh upload or the record\'s own image only, and the file must exist', async () => {
	write('temp-1700000000030-1.jpg');
	write('1700000000031-1.jpg');
	assert.equal(await store.checkChosen('temp-1700000000030-1.jpg', null), null);
	assert.equal(await store.checkChosen('1700000000031-1.jpg', '1700000000031-1.jpg'), null, 'its own current image');
	assert.match((await store.checkChosen('1700000000031-1.jpg', null)) ?? '', /آپلود/, "another record's image");
	assert.match((await store.checkChosen('temp-1700000000039-9.jpg', null)) ?? '', /پیدا نشد/);
	assert.match((await store.checkChosen('../x.jpg', null)) ?? '', /نامعتبر/);
	assert.equal(await products.checkChosen(PLACEHOLDER_IMAGE, null), null);
});

test('remove never touches the placeholder or a name the server did not make', async () => {
	const outside = path.join(store.dir, 'keep.jpg');
	fs.writeFileSync(outside, JPEG);
	await store.remove('keep.jpg');
	await store.remove('../keep.jpg');
	await store.remove(PLACEHOLDER_IMAGE);
	await store.remove(null);
	assert.ok(fs.existsSync(outside));
	const name = write('1700000000040-1.jpg');
	await store.remove(name);
	assert.ok(!fs.existsSync(path.join(store.dir, name)));
	await store.remove(name); // already gone: no error
});

test('cleanupStaleTemp deletes only temp uploads older than a day', async () => {
	const old = write('temp-1700000000050-1.jpg');
	const fresh = write('temp-1700000000051-1.jpg');
	const kept = write('1700000000052-1.jpg');
	const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
	fs.utimesSync(path.join(store.dir, old), twoDaysAgo, twoDaysAgo);
	fs.utimesSync(path.join(store.dir, kept), twoDaysAgo, twoDaysAgo);
	await store.cleanupStaleTemp();
	assert.ok(!fs.existsSync(path.join(store.dir, old)));
	assert.ok(fs.existsSync(path.join(store.dir, fresh)));
	assert.ok(fs.existsSync(path.join(store.dir, kept)), 'a used (permanent) image is never cleaned up');
	await new ImageStore('unit-test-missing-folder', { extensions: ['jpg'], allowPlaceholder: false }).cleanupStaleTemp(); // no folder yet: no error
});

test('uploadHandler: one image field, real image content, random temp names, size limit', async () => {
	const app = express();
	app.post('/upload', store.uploadHandler());
	app.use((err: { status?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
		res.status(err.status ?? 500).json({ message: err.message });
	});
	const server = app.listen(0);
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const send = (blob: Blob | null, field = 'image', name = 'x.jpg') => {
		const form = new FormData();
		if (blob) form.append(field, blob, name);
		return fetch(`${base}/upload`, { method: 'POST', body: form });
	};
	try {
		const ok = await send(new Blob([JPEG], { type: 'image/jpeg' }));
		assert.equal(ok.status, 200);
		const { filename } = (await ok.json()) as { filename: string };
		assert.match(filename, /^temp-\d{13}-\d{1,10}\.jpg$/);
		assert.ok(store.isTemp(filename));
		const other = (await (await send(new Blob([JPEG], { type: 'image/jpeg' }))).json()) as { filename: string };
		assert.notEqual(other.filename, filename);

		assert.equal((await send(new Blob([Buffer.from('GIF89a')], { type: 'image/gif' }))).status, 400, 'gif is not a format of this store');
		assert.equal((await send(new Blob(['<?php ?>'], { type: 'image/jpeg' }))).status, 400, 'content is not an image');
		assert.equal((await send(new Blob([JPEG], { type: 'image/jpeg' }), 'photo')).status, 400, 'wrong field name');
		assert.equal((await send(null)).status, 400, 'no file');
		assert.equal((await send(new Blob([Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)])], { type: 'image/jpeg' }))).status, 413);
		const leftovers = fs.readdirSync(store.dir).filter((f) => f.startsWith('temp-') && !f.startsWith('temp-17000'));
		assert.equal(leftovers.length, 2, 'refused uploads leave no file behind');
	} finally {
		server.close();
	}
});
