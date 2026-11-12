import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { DUMMY_PASSWORD_HASH, PASSWORD_MAX_BYTES, hashPassword, passwordProblem, verifyPassword } from '../../src/lib/passwords.js';

test('bcrypt really ignores everything after 72 bytes (why the limit exists)', () => {
	const base = 'ر'.repeat(36); // 36 Persian letters = 72 bytes
	const hash = bcrypt.hashSync(`${base}SECRET-A`, 4);
	assert.equal(bcrypt.compareSync(`${base}SOMETHING-ELSE`, hash), true);
});

test('passwordProblem: at least 8 characters, at most 72 bytes', () => {
	assert.equal(passwordProblem('12345678'), null);
	assert.equal(passwordProblem('a'.repeat(PASSWORD_MAX_BYTES)), null);
	assert.equal(passwordProblem('ر'.repeat(36)), null, '36 Persian letters = 72 bytes');
	assert.match(passwordProblem('1234567') ?? '', /حداقل/);
	assert.match(passwordProblem('a'.repeat(PASSWORD_MAX_BYTES + 1)) ?? '', /طولانی/);
	assert.match(passwordProblem('ر'.repeat(37)) ?? '', /طولانی/, '37 Persian letters = 74 bytes');
	for (const bad of [undefined, null, 12345678, ['12345678']]) assert.ok(passwordProblem(bad), String(bad));
});

test('hashPassword / verifyPassword round trip; the dummy hash is a valid hash that matches nothing usual', async () => {
	const hash = await hashPassword('رمز-خیلی-خوب');
	assert.equal(await verifyPassword('رمز-خیلی-خوب', hash), true);
	assert.equal(await verifyPassword('رمز-خیلی-بد', hash), false);
	assert.equal(DUMMY_PASSWORD_HASH.length, 60);
	assert.equal(bcrypt.getRounds(DUMMY_PASSWORD_HASH), bcrypt.getRounds(hash), 'same cost, so both checks take as long');
	assert.equal(await verifyPassword('password', DUMMY_PASSWORD_HASH), false);
});
