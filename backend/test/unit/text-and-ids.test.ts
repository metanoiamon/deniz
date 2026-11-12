process.env.TZ = 'Asia/Tehran';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDateString, latinDigits, localDateTime, normalizePhone } from '../../src/lib/text.js';
import { MAX_DB_INT, nextSortOrder, parseId, readFullOrder, readPage } from '../../src/lib/ordering.js';

test('latinDigits turns Persian and Arabic-Indic digits into 0–9', () => {
	assert.equal(latinDigits('۰۹۱۲'), '0912');
	assert.equal(latinDigits('٠٩١٢'), '0912');
	assert.equal(latinDigits('abc ۱۲۳'), 'abc 123');
});

test('normalizePhone accepts every common spelling of an Iranian mobile number, nothing else', () => {
	for (const input of ['09121234567', '۰۹۱۲۱۲۳۴۵۶۷', '+989121234567', '00989121234567', '989121234567', '9121234567', '0912 123 4567', '0912-123-4567']) {
		assert.equal(normalizePhone(input), '09121234567', input);
	}
	for (const input of ['', '12345', '0212345678', '091212345678', '+1 555 123 4567', 'abc', null, undefined]) {
		assert.notEqual(normalizePhone(input), '09121234567', String(input));
	}
	assert.equal(normalizePhone('0212345678'), '', 'a landline is not a mobile number');
});

test('isValidDateString accepts only real calendar dates', () => {
	assert.equal(isValidDateString('2026-10-26'), true);
	assert.equal(isValidDateString('2028-02-29'), true, 'leap day');
	for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '26-10-26', '2026/10/26', '', 20261026, null, ['2026-10-26']]) {
		assert.equal(isValidDateString(bad), false, String(bad));
	}
});

test('localDateTime prints Tehran time', () => {
	assert.equal(localDateTime(new Date('2026-10-26T10:00:00Z')), '2026-10-26 13:30');
});

test('parseId: positive integers that fit a PostgreSQL integer, from numbers or digit strings only', () => {
	assert.equal(parseId(1), 1);
	assert.equal(parseId('42'), 42);
	assert.equal(parseId(MAX_DB_INT), MAX_DB_INT);
	for (const bad of [0, -1, 1.5, MAX_DB_INT + 1, 99999999999, '99999999999', '', ' 1', '1e3', '0x10', '+1', 'abc', NaN, Infinity, null, undefined, true, [1], { id: 1 }]) {
		assert.equal(parseId(bad), null, String(bad));
	}
});

test('readFullOrder: every id exactly once, nothing else', () => {
	assert.deepEqual(readFullOrder([3, 1, 2], [1, 2, 3]), [3, 1, 2]);
	assert.deepEqual(readFullOrder(['2', '1'], [1, 2]), [2, 1], 'numeric strings are fine');
	assert.deepEqual(readFullOrder([], []), []);
	for (const bad of [[1, 2], [1, 2, 3, 4], [1, 1, 2], [1, 2, 9], 'x', null, [1, 2, 'x']]) {
		assert.equal(readFullOrder(bad, [1, 2, 3]), null, JSON.stringify(bad));
	}
});

test('nextSortOrder puts a new row last', () => {
	assert.equal(nextSortOrder(null), 0);
	assert.equal(nextSortOrder(undefined), 0);
	assert.equal(nextSortOrder(4), 5);
});

test('readPage: defaults, bounds, and no absurd pages', () => {
	const opts = { defaultLimit: 50, maxLimit: 200 };
	assert.deepEqual(readPage({}, opts), { page: 1, limit: 50, skip: 0 });
	assert.deepEqual(readPage({ page: '3', limit: '20' }, opts), { page: 3, limit: 20, skip: 40 });
	for (const bad of [{ page: '0' }, { page: '-1' }, { limit: '201' }, { limit: '0' }, { page: '100001' }, { page: 'x' }, { page: ['1', '2'] }]) {
		assert.equal(readPage(bad, opts), null, JSON.stringify(bad));
	}
});
