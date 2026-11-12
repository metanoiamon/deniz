// The real limits (createRateLimits) on a tiny app with a fake login, so they can be tested without a database.
// In the integration tests they are switched off, since every request there comes from one IP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createRateLimits } from '../../src/middleware/rate-limits.js';

async function startApp() {
	const limits = createRateLimits({ enabled: true });
	const app = express();
	// like production behind nginx: the client IP comes from X-Forwarded-For, so a test can act as many IPs
	app.set('trust proxy', 1);
	app.use(express.json());
	app.use('/api', limits.publicRead, limits.general);
	app.get('/api/menu', (_req, res) => res.json({}));
	app.get('/api/admin/x', (_req, res) => res.json({}));
	app.post('/api/survey', limits.surveySubmit, (_req, res) => res.status(201).json({}));
	// fake login: the password "right" works, everything else fails
	app.post('/api/admin/login', limits.loginPerIp, limits.loginPerUsername, (req, res) => {
		res.status(req.body?.password === 'right' ? 200 : 401).json({});
	});
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	const login = (username: string, password: string, ip = '10.0.0.1') =>
		fetch(`${base()}/api/admin/login`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
			body: JSON.stringify({ username, password }),
		}).then((r) => r.status);
	const get = (path: string) => fetch(`${base()}${path}`).then((r) => r.status);
	return { server, login, get, post: (path: string) => fetch(`${base()}${path}`, { method: 'POST' }).then((r) => r.status) };
}

test('login: 10 failed attempts per IP in 15 minutes; successful logins do not count', async () => {
	const { server, login } = await startApp();
	try {
		for (let i = 0; i < 15; i++) assert.equal(await login('staff', 'right'), 200, 'staff logging in correctly are never counted');
		for (let i = 0; i < 10; i++) assert.equal(await login(`user${i}`, 'wrong'), 401);
		assert.equal(await login('someone', 'wrong'), 429);
		assert.equal(await login('staff', 'right'), 429, 'after 10 failures this IP waits, even with the right password');
	} finally {
		server.close();
	}
});

test('login: one account is protected from an attack spread over many IPs (20 failures)', async () => {
	const { server, login } = await startApp();
	try {
		// 20 failures for one account, each from a different IP: no single IP reaches its own limit of 10
		for (let i = 0; i < 20; i++) assert.equal(await login('target', 'wrong', `10.1.0.${i}`), 401);
		assert.equal(await login('target', 'wrong', '10.1.1.1'), 429, 'the 21st failure for the same account, from a fresh IP');
		assert.equal(await login(' TARGET ', 'wrong', '10.1.1.2'), 429, 'the same account however it is typed');
		assert.equal(await login('other', 'wrong', '10.1.1.3'), 401, 'other accounts are not affected');
	} finally {
		server.close();
	}
});

test('reading the menu has its own, much higher limit than everything else', async () => {
	const { server, get } = await startApp();
	try {
		for (let i = 0; i < 130; i++) assert.equal(await get('/api/menu'), 200, `menu read ${i + 1}`);
		for (let i = 0; i < 120; i++) assert.equal(await get('/api/admin/x'), 200, `admin request ${i + 1}`);
		assert.equal(await get('/api/admin/x'), 429, 'the 121st admin request in a minute');
		assert.equal(await get('/api/ADMIN/x'), 429, 'the same admin API in capitals is not a menu read (Express matches routes case-insensitively)');
		assert.equal(await get('/api/menu'), 200, 'the menu is still open for the customers on the same Wi-Fi');
	} finally {
		server.close();
	}
});

test('survey: 30 submissions per hour from one IP', async () => {
	const { server, post } = await startApp();
	try {
		for (let i = 0; i < 30; i++) assert.equal(await post('/api/survey'), 201);
		assert.equal(await post('/api/survey'), 429);
	} finally {
		server.close();
	}
});

test('switched off, nothing is limited', async () => {
	const limits = createRateLimits({ enabled: false });
	const app = express();
	app.post('/x', limits.surveySubmit, (_req, res) => res.status(201).end());
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	try {
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/x`;
		for (let i = 0; i < 40; i++) assert.equal((await fetch(url, { method: 'POST' })).status, 201);
	} finally {
		server.close();
	}
});
