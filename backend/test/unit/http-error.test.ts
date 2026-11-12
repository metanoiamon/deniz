import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, createHttpError, prismaCode } from '../../src/lib/http-error.js';

test('HttpError carries the status, the message and optional extra answer fields', () => {
	const error = createHttpError(400, 'نام محصول الزامی است');
	assert.ok(error instanceof HttpError);
	assert.equal(error.status, 400);
	assert.equal(error.message, 'نام محصول الزامی است');
	assert.equal(error.extra, undefined);
	assert.deepEqual(new HttpError(409, 'x', { answerCount: 3 }).extra, { answerCount: 3 });
});

test('prismaCode reads the code of a Prisma error and nothing else', () => {
	assert.equal(prismaCode({ code: 'P2002' }), 'P2002');
	assert.equal(prismaCode(new Error('x')), undefined);
	assert.equal(prismaCode({ code: 42 }), undefined);
	assert.equal(prismaCode(null), undefined);
	assert.equal(prismaCode('P2002'), undefined);
});
