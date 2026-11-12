// CORS headers and the CSRF origin guard. Node runs every test file in its own process, so this configuration
// does not leak into the other tests.
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGINS = 'https://panel.example';
delete process.env.ADMIN_COOKIE_CROSS_SITE;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

const { cors, originGuard } = await import('../../src/middleware/cors.js');

const app = express();
app.use(cors);
app.use(originGuard);
app.all('/x', (_req, res) => {
	res.json({ ok: true });
});

async function call(method: string, headers: Record<string, string> = {}) {
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		const res = await fetch(`${base}/x`, { method, headers });
		return { status: res.status, headers: res.headers, base };
	} finally {
		server.close();
	}
}

test('an allowed frontend gets CORS headers with credentials; another site gets none', async () => {
	const allowed = await call('GET', { origin: 'https://panel.example' });
	assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://panel.example');
	assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
	assert.match(allowed.headers.get('vary') ?? '', /Origin/);
	const other = await call('GET', { origin: 'https://evil.example' });
	assert.equal(other.headers.get('access-control-allow-origin'), null);
	assert.match(other.headers.get('vary') ?? '', /Origin/, 'Vary is sent either way, so no cache mixes the two answers');
});

test('preflight: answered for an allowed frontend only', async () => {
	const ok = await call('OPTIONS', { origin: 'https://panel.example', 'access-control-request-method': 'DELETE' });
	assert.equal(ok.status, 204);
	assert.match(ok.headers.get('access-control-allow-methods') ?? '', /DELETE/);
	const evil = await call('OPTIONS', { origin: 'https://evil.example', 'access-control-request-method': 'DELETE' });
	assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

test('origin guard: a write from another site is refused; reads, own origin, allowed frontend and non-browser clients pass', async () => {
	assert.equal((await call('POST', { origin: 'https://evil.example' })).status, 403);
	assert.equal((await call('DELETE', { origin: 'https://evil.example' })).status, 403);
	assert.equal((await call('PATCH', { origin: 'null' })).status, 403, 'a sandboxed page sends Origin: null');
	assert.equal((await call('GET', { origin: 'https://evil.example' })).status, 200, 'reads are never blocked');
	assert.equal((await call('POST', { origin: 'https://panel.example' })).status, 200);
	assert.equal((await call('POST')).status, 200, 'no Origin: curl, a server, a test');
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	const own = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	try {
		assert.equal((await fetch(`${own}/x`, { method: 'POST', headers: { origin: own } })).status, 200, 'the API\'s own address');
	} finally {
		server.close();
	}
});
