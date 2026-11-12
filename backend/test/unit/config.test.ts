import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOrigins, readTrustProxy } from '../../src/config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Loads src/config.ts in a fresh process with exactly this environment; returns its exit code and output. */
function loadConfig(env: Record<string, string>) {
	const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', "await import('./src/config.ts'); console.log('LOADED')"], {
		cwd: ROOT,
		// no .env from the project folder: dotenv only fills variables that are not set, so every one is set here
		env: { PATH: process.env.PATH ?? '', DATABASE_URL: '', ADMIN_JWT_SECRET: '', CORS_ORIGINS: '', ADMIN_COOKIE_CROSS_SITE: '', TRUST_PROXY: '', ...env },
		encoding: 'utf8',
	});
	return { ok: result.status === 0 && result.stdout.includes('LOADED'), output: `${result.stdout}${result.stderr}` };
}

const GOOD_SECRET = 'a'.repeat(16) + 'b'.repeat(16) + 'c'.repeat(8);
const PROD = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://x@localhost/deniz', ADMIN_JWT_SECRET: GOOD_SECRET };

test('production refuses to start without a real secret or a database', () => {
	assert.equal(loadConfig(PROD).ok, true, 'a complete production config loads');
	const noSecret = loadConfig({ ...PROD, ADMIN_JWT_SECRET: '' });
	assert.equal(noSecret.ok, false);
	assert.match(noSecret.output, /ADMIN_JWT_SECRET/);
	assert.equal(loadConfig({ ...PROD, ADMIN_JWT_SECRET: 'short' }).ok, false);
	const example = loadConfig({ ...PROD, ADMIN_JWT_SECRET: 'change-me-admin-secret-at-least-32-characters' });
	assert.equal(example.ok, false, 'the public example value is refused even though it is long enough');
	assert.match(example.output, /نمونه/);
	assert.equal(loadConfig({ ...PROD, DATABASE_URL: '' }).ok, false);
	assert.equal(loadConfig({ NODE_ENV: 'development' }).ok, true, 'development runs with defaults (and a warning)');
});

test('a cross-site admin cookie needs CORS_ORIGINS; bad CORS_ORIGINS or TRUST_PROXY stop the start', () => {
	assert.equal(loadConfig({ ...PROD, ADMIN_COOKIE_CROSS_SITE: 'true' }).ok, false);
	assert.equal(loadConfig({ ...PROD, ADMIN_COOKIE_CROSS_SITE: 'true', CORS_ORIGINS: 'https://panel.example' }).ok, true);
	assert.equal(loadConfig({ ...PROD, CORS_ORIGINS: 'deniz.ir' }).ok, false);
	assert.equal(loadConfig({ ...PROD, TRUST_PROXY: 'yes' }).ok, false);
});

test('readOrigins: protocol + domain only, normalized', () => {
	assert.deepEqual(readOrigins(undefined), []);
	assert.deepEqual(readOrigins('  '), []);
	assert.deepEqual(readOrigins('https://deniz.ir, https://Admin.Deniz.ir/ ,http://localhost:5173'), ['https://deniz.ir', 'https://admin.deniz.ir', 'http://localhost:5173']);
	for (const bad of ['deniz.ir', 'https://deniz.ir/menu', 'https://deniz.ir?x=1', 'ftp://deniz.ir', 'javascript:alert(1)', 'https://user:pass@deniz.ir']) {
		assert.throws(() => readOrigins(bad), /CORS_ORIGINS/, bad);
	}
});

test('readTrustProxy: one hop behind nginx by default in production, none in development', () => {
	assert.equal(readTrustProxy(undefined, true), 1);
	assert.equal(readTrustProxy('', false), 0);
	assert.equal(readTrustProxy('2', true), 2);
	for (const bad of ['-1', '6', '1.5', 'true']) assert.throws(() => readTrustProxy(bad, true), /TRUST_PROXY/, bad);
});
