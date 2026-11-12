process.env.TZ = 'Asia/Tehran';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SurveyQuestionType } from '@prisma/client';
import { csvCell, csvPhone, isEmptyValue, maskPhone, readAnswerValue, readDateRange } from '../../src/services/survey.service.js';

const question = (type: SurveyQuestionType, options: number[] = []) =>
	({ id: 7, title: 'سوال', type, isRequired: false, publicRole: 'NONE', sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date(), options: options.map((id) => ({ id })) }) as const;

test('every answer type accepts exactly its own values', () => {
	const cases: [SurveyQuestionType, unknown[], unknown[]][] = [
		['STARS', [1, 3, 5], [0, 6, 2.5, '5', true, null]],
		['EMOJI', [1, 5], [0, 6, 4.5, '3']],
		['SLIDER', [0, 50, 100], [-1, 101, 50.5, '50']],
		['YES_NO', [true, false], ['true', 'بله', 1, 0]],
		['SHORT_TEXT', ['سلام', 'x'.repeat(100)], ['x'.repeat(101), 5, ['a']]],
		['LONG_TEXT', ['متن', 'x'.repeat(1000)], ['x'.repeat(1001), { text: 'a' }]],
		['PHONE', ['09121234567', '۰۹۱۲۱۲۳۴۵۶۷', '+98 912 123 4567'], ['12345', 9121234567, '021-12345678']],
	];
	for (const [type, good, bad] of cases) {
		for (const value of good) assert.equal(readAnswerValue(question(type), value).ok, true, `${type} ${String(value)}`);
		for (const value of bad) assert.equal(readAnswerValue(question(type), value).ok, false, `${type} ${String(value)}`);
	}
	assert.equal(readAnswerValue(question('CHOICE', [3, 4]), 4).ok, true);
	assert.deepEqual(readAnswerValue(question('CHOICE', [3, 4]), '4'), { ok: true, data: { questionId: 7, optionId: 4 } }, 'a radio value is a string');
	for (const bad of [5, '5', '4.0', ' 4', 4.5, true, [4], null]) assert.equal(readAnswerValue(question('CHOICE', [3, 4]), bad).ok, false, String(bad));
});

test('answers are stored in the right column, texts trimmed, phones normalized', () => {
	assert.deepEqual(readAnswerValue(question('STARS'), 4), { ok: true, data: { questionId: 7, intValue: 4 } });
	assert.deepEqual(readAnswerValue(question('YES_NO'), false), { ok: true, data: { questionId: 7, boolValue: false } });
	assert.deepEqual(readAnswerValue(question('CHOICE', [3]), 3), { ok: true, data: { questionId: 7, optionId: 3 } });
	assert.deepEqual(readAnswerValue(question('SHORT_TEXT'), '  سارا  '), { ok: true, data: { questionId: 7, textValue: 'سارا' } });
	assert.deepEqual(readAnswerValue(question('PHONE'), '۰۹۱۲ ۱۲۳ ۴۵۶۷'), { ok: true, data: { questionId: 7, textValue: '09121234567' } });
	const failed = readAnswerValue(question('STARS'), 9);
	assert.ok(!failed.ok && failed.error.includes('«سوال»'), 'the message names the question');
});

test('empty means not answered: null, undefined, blank text; false and 0 are answers', () => {
	for (const empty of [null, undefined, '', '   ']) assert.equal(isEmptyValue(empty), true, String(empty));
	for (const value of [false, 0, 'x']) assert.equal(isEmptyValue(value), false, String(value));
});

test('csvPhone: a mobile number stays text in Excel (leading zero kept)', () => {
	assert.equal(csvPhone('09121234567'), '0912 123 4567');
	assert.equal(csvPhone('123'), '123');
});

test('csvCell: quotes what needs quoting, and a customer\'s text never runs as a spreadsheet formula', () => {
	assert.equal(csvCell('سلام'), 'سلام');
	assert.equal(csvCell(null), '');
	assert.equal(csvCell(5), '5');
	assert.equal(csvCell('a,b'), '"a,b"');
	assert.equal(csvCell('a"b'), '"a""b"');
	assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
	for (const formula of ['=1+1', '+1+1', '-1+1', '@SUM(A1)', '\t=1', '\r=1']) assert.ok(csvCell(formula).replace(/^"/, '').startsWith("'"), JSON.stringify(formula));
	assert.equal(csvCell('=HYPERLINK("http://x")'), '"\'=HYPERLINK(""http://x"")"');
});

test('maskPhone keeps the start and end only', () => {
	assert.equal(maskPhone('09121234567'), '0912***4567');
	assert.equal(maskPhone('123'), '***');
});

test('readDateRange: both days included, Tehran time; bad input refused', () => {
	const range = readDateRange({ from: '2026-10-01', to: '2026-10-31' });
	assert.ok(range.ok);
	if (!range.ok) return;
	assert.equal((range.data.gte as Date).toISOString(), '2026-09-30T20:30:00.000Z', 'midnight in Tehran');
	assert.equal((range.data.lt as Date).toISOString(), '2026-10-31T20:30:00.000Z', 'the start of the day after «to»');
	assert.deepEqual(readDateRange({}), { ok: true, data: {} });
	assert.deepEqual(readDateRange({ from: '' }), { ok: true, data: {} });
	for (const bad of [{ from: '2026-13-01' }, { to: 'yesterday' }, { from: ['2026-10-01'] }, { from: '2026-10-05', to: '2026-10-01' }]) {
		assert.equal(readDateRange(bad).ok, false, JSON.stringify(bad));
	}
	assert.equal(readDateRange({ from: '2026-10-05', to: '2026-10-05' }).ok, true, 'a single day');
});
