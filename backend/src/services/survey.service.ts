import type { Prisma, SurveyPublicRole, SurveyQuestionType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { faDigits, isValidDateString, localDateTime, normalizePhone } from '../lib/text.js';
import { parseId } from '../lib/ordering.js';

// The survey: what an answer of each question type may be, the public «نظرات» list made of published responses,
// statistics and the CSV export.

export const QUESTION_TYPES: readonly SurveyQuestionType[] = ['STARS', 'EMOJI', 'YES_NO', 'SLIDER', 'CHOICE', 'SHORT_TEXT', 'LONG_TEXT', 'PHONE'];
export const PUBLIC_ROLES: readonly SurveyPublicRole[] = ['NONE', 'NAME', 'COMMENT'];
/** Question types whose answer can be the public name / comment. */
export const TEXT_TYPES: readonly SurveyQuestionType[] = ['SHORT_TEXT', 'LONG_TEXT'];
export const SCALE_TYPES: readonly SurveyQuestionType[] = ['STARS', 'EMOJI'];

export const SHORT_TEXT_MAX = 100;
export const LONG_TEXT_MAX = 1000;

export function isQuestionType(value: unknown): value is SurveyQuestionType {
	return typeof value === 'string' && (QUESTION_TYPES as readonly string[]).includes(value);
}

export function isPublicRole(value: unknown): value is SurveyPublicRole {
	return typeof value === 'string' && (PUBLIC_ROLES as readonly string[]).includes(value);
}

// ─── Reading a submission ─────────────────────────────────────────────────────

type QuestionWithOptions = Prisma.SurveyQuestionGetPayload<{ include: { options: { select: { id: true } } } }>;

export type AnswerData = Pick<Prisma.SurveyAnswerUncheckedCreateWithoutResponseInput, 'questionId' | 'intValue' | 'boolValue' | 'textValue' | 'optionId'>;

type ReadResult = { ok: true; data: AnswerData } | { ok: false; error: string };

/** Empty = not answered: null, undefined, '' or only spaces. */
export function isEmptyValue(value: unknown): boolean {
	return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

/** One answer's value, checked against its question's type. */
export function readAnswerValue(question: QuestionWithOptions, value: unknown): ReadResult {
	const fail = (detail: string): ReadResult => ({ ok: false, error: `«${question.title}»: ${detail}` });
	const questionId = question.id;
	switch (question.type) {
		case 'STARS':
		case 'EMOJI': {
			if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) return fail('امتیاز باید عددی از ۱ تا ۵ باشد.');
			return { ok: true, data: { questionId, intValue: value } };
		}
		case 'SLIDER': {
			if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) return fail('مقدار باید عددی از ۰ تا ۱۰۰ باشد.');
			return { ok: true, data: { questionId, intValue: value } };
		}
		case 'YES_NO': {
			if (typeof value !== 'boolean') return fail('جواب باید بله یا خیر باشد.');
			return { ok: true, data: { questionId, boolValue: value } };
		}
		case 'CHOICE': {
			// an option id, like every id a number or a numeric string: a radio input's value is always a string
			const optionId = parseId(value);
			if (optionId === null || !question.options.some((o) => o.id === optionId)) return fail('گزینه‌ی انتخاب‌شده نامعتبر است.');
			return { ok: true, data: { questionId, optionId } };
		}
		case 'SHORT_TEXT':
		case 'LONG_TEXT': {
			const max = question.type === 'SHORT_TEXT' ? SHORT_TEXT_MAX : LONG_TEXT_MAX;
			if (typeof value !== 'string') return fail('جواب باید متن باشد.');
			if (value.trim().length > max) return fail(`متن حداکثر ${faDigits(max)} کاراکتر است.`);
			return { ok: true, data: { questionId, textValue: value.trim() } };
		}
		case 'PHONE': {
			const phone = typeof value === 'string' ? normalizePhone(value) : '';
			if (!phone) return fail('شماره موبایل نامعتبر است (مثال: ۰۹۱۲۱۲۳۴۵۶۷).');
			return { ok: true, data: { questionId, textValue: phone } };
		}
	}
}

/**
 * A whole submission: `[{ questionId, value }]` against the active questions. Optional questions may be left out or
 * empty; required ones must be answered. Returns the answers to store (empty ones dropped).
 */
export async function readSubmission(
	db: Prisma.TransactionClient,
	raw: unknown,
): Promise<{ ok: true; data: AnswerData[] } | { ok: false; error: string }> {
	if (!Array.isArray(raw)) return { ok: false, error: 'فهرست جواب‌ها نامعتبر است.' };
	if (raw.length > 100) return { ok: false, error: 'تعداد جواب‌ها بیش از حد است.' };
	const questions = await db.surveyQuestion.findMany({
		where: { isActive: true },
		orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
		include: { options: { select: { id: true } } },
	});
	if (!questions.length) return { ok: false, error: 'فعلاً نظرسنجی فعالی وجود ندارد.' };
	const byId = new Map(questions.map((q) => [q.id, q]));
	const given = new Map<number, unknown>();
	for (const entry of raw) {
		const questionId = parseId((entry as { questionId?: unknown } | null)?.questionId);
		const question = questionId === null ? undefined : byId.get(questionId);
		if (!question) return { ok: false, error: 'یکی از سوال‌ها پیدا نشد؛ صفحه را تازه کن.' };
		if (given.has(question.id)) return { ok: false, error: `«${question.title}» دو بار جواب داده شده است.` };
		given.set(question.id, (entry as { value?: unknown }).value);
	}
	const answers: AnswerData[] = [];
	for (const question of questions) {
		const value = given.get(question.id);
		if (isEmptyValue(value)) {
			if (question.isRequired) return { ok: false, error: `به «${question.title}» جواب بده.` };
			continue;
		}
		const answer = readAnswerValue(question, value);
		if (!answer.ok) return answer;
		answers.push(answer.data);
	}
	if (!answers.length) return { ok: false, error: 'حداقل به یک سوال جواب بده.' };
	return { ok: true, data: answers };
}

// ─── Showing answers ──────────────────────────────────────────────────────────

const answerInclude = {
	question: { select: { id: true, title: true, type: true, publicRole: true, sortOrder: true } },
	option: { select: { id: true, label: true } },
} satisfies Prisma.SurveyAnswerInclude;

type AnswerWithQuestion = Prisma.SurveyAnswerGetPayload<{ include: typeof answerInclude }>;

/** The value as the API shows it: number (STARS, EMOJI, SLIDER), boolean (YES_NO), string (CHOICE label, texts, PHONE). */
function answerValue(answer: AnswerWithQuestion): number | boolean | string | null {
	switch (answer.question.type) {
		case 'STARS':
		case 'EMOJI':
		case 'SLIDER':
			return answer.intValue;
		case 'YES_NO':
			return answer.boolValue;
		case 'CHOICE':
			return answer.option?.label ?? null;
		default:
			return answer.textValue;
	}
}

export const responseInclude = { answers: { include: answerInclude } } satisfies Prisma.SurveyResponseInclude;
type ResponseWithAnswers = Prisma.SurveyResponseGetPayload<{ include: typeof responseInclude }>;

function sortedAnswers(response: ResponseWithAnswers): AnswerWithQuestion[] {
	return [...response.answers].sort((a, b) => a.question.sortOrder - b.question.sortOrder || a.question.id - b.question.id);
}

/** 09121234567 → 0912***4567: staff see that a number was left, managers see the number. */
export function maskPhone(phone: string): string {
	return phone.length === 11 ? `${phone.slice(0, 4)}***${phone.slice(7)}` : '***';
}

/** Admin shape of a response: its answers in form order. With `maskPhones`, phone answers are partly hidden. */
export function toAdminResponse(response: ResponseWithAnswers, { maskPhones = false }: { maskPhones?: boolean } = {}) {
	const { answers: _answers, updatedById: _updatedById, ...fields } = response;
	return {
		...fields,
		answers: sortedAnswers(response).map((a) => {
			const value = answerValue(a);
			return {
				questionId: a.question.id,
				question: a.question.title,
				type: a.question.type,
				value: maskPhones && a.question.type === 'PHONE' && typeof value === 'string' ? maskPhone(value) : value,
				...(a.question.type === 'CHOICE' ? { optionId: a.optionId } : {}),
			};
		}),
	};
}

/** The text of a response's answer to the question with this public role (current roles). */
function roleText(response: ResponseWithAnswers, role: SurveyPublicRole): string | null {
	return response.answers.find((a) => a.question.publicRole === role && a.textValue)?.textValue ?? null;
}

export function commentOf(response: ResponseWithAnswers): string | null {
	return roleText(response, 'COMMENT');
}

/** Public shape (the «نظرات» list): author, comment, the restaurant's reply. */
export function toPublicReview(response: ResponseWithAnswers) {
	return { id: response.id, name: roleText(response, 'NAME'), text: commentOf(response) ?? '', reply: response.reply, createdAt: response.createdAt };
}

// ─── Date range ───────────────────────────────────────────────────────────────

/** `?from=YYYY-MM-DD&to=YYYY-MM-DD` (both optional, both days included, Tehran time) → a createdAt filter. */
export function readDateRange(query: Record<string, unknown>): { ok: true; data: Prisma.DateTimeFilter } | { ok: false; error: string } {
	const filter: Prisma.DateTimeFilter = {};
	for (const key of ['from', 'to'] as const) {
		const value = query[key];
		if (value === undefined || value === '') continue;
		if (!isValidDateString(value)) return { ok: false, error: 'تاریخ باید میلادی و به شکل YYYY-MM-DD باشد.' };
		const [y, m, d] = value.split('-').map(Number);
		if (key === 'from') filter.gte = new Date(y, m - 1, d);
		else filter.lt = new Date(y, m - 1, d + 1);
	}
	if (filter.gte && filter.lt && filter.gte >= filter.lt) return { ok: false, error: 'تاریخ شروع باید قبل از تاریخ پایان باشد.' };
	return { ok: true, data: filter };
}

// ─── Statistics ───────────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Per question (in form order, inactive ones too when they have answers in the range): counts and averages. */
export async function surveyStats(createdAt: Prisma.DateTimeFilter) {
	const inRange: Prisma.SurveyAnswerWhereInput = { response: { createdAt } };
	const [responses, questions, ints, bools, choices, texts] = await Promise.all([
		prisma.surveyResponse.count({ where: { createdAt } }),
		prisma.surveyQuestion.findMany({
			orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
			include: { options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, label: true } } },
		}),
		prisma.surveyAnswer.groupBy({ by: ['questionId', 'intValue'], where: { ...inRange, intValue: { not: null } }, _count: { _all: true } }),
		prisma.surveyAnswer.groupBy({ by: ['questionId', 'boolValue'], where: { ...inRange, boolValue: { not: null } }, _count: { _all: true } }),
		prisma.surveyAnswer.groupBy({ by: ['questionId', 'optionId'], where: { ...inRange, optionId: { not: null } }, _count: { _all: true } }),
		prisma.surveyAnswer.groupBy({ by: ['questionId'], where: { ...inRange, textValue: { not: null } }, _count: { _all: true } }),
	]);

	const result = [];
	for (const q of questions) {
		const base = { questionId: q.id, title: q.title, type: q.type, isActive: q.isActive };
		if (SCALE_TYPES.includes(q.type) || q.type === 'SLIDER') {
			const rows = ints.filter((r) => r.questionId === q.id);
			const count = rows.reduce((sum, r) => sum + r._count._all, 0);
			const total = rows.reduce((sum, r) => sum + (r.intValue as number) * r._count._all, 0);
			const average = count ? round1(total / count) : null;
			if (SCALE_TYPES.includes(q.type)) {
				// distribution[0] = how many gave 1, … distribution[4] = how many gave 5
				const distribution = [1, 2, 3, 4, 5].map((v) => rows.find((r) => r.intValue === v)?._count._all ?? 0);
				result.push({ ...base, answered: count, average, distribution });
			} else {
				// 0–20, 21–40, 41–60, 61–80, 81–100
				const distribution = [0, 0, 0, 0, 0];
				for (const r of rows) distribution[Math.min(4, Math.max(0, Math.ceil((r.intValue as number) / 20) - 1))] += r._count._all;
				result.push({ ...base, answered: count, average, distribution });
			}
		} else if (q.type === 'YES_NO') {
			const yes = bools.find((r) => r.questionId === q.id && r.boolValue === true)?._count._all ?? 0;
			const no = bools.find((r) => r.questionId === q.id && r.boolValue === false)?._count._all ?? 0;
			result.push({ ...base, answered: yes + no, yes, no });
		} else if (q.type === 'CHOICE') {
			const options = q.options.map((o) => ({ optionId: o.id, label: o.label, count: choices.find((r) => r.optionId === o.id)?._count._all ?? 0 }));
			result.push({ ...base, answered: options.reduce((sum, o) => sum + o.count, 0), options });
		} else {
			result.push({ ...base, answered: texts.find((r) => r.questionId === q.id)?._count._all ?? 0 });
		}
	}
	return { responses, questions: result.filter((q) => q.isActive || q.answered > 0) };
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function csvCell(value: unknown): string {
	const text = value === null || value === undefined ? '' : String(value);
	// cells that a spreadsheet would run as a formula are prefixed, so a customer's text can never execute
	const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
	return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Excel reads 09121234567 as the number 9121234567 and drops the leading zero; with spaces it stays text. */
export function csvPhone(phone: string): string {
	return /^09\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}

/** All responses in the range as CSV (UTF-8 with BOM, so Excel shows Persian correctly), oldest first. */
export async function surveyCsv(createdAt: Prisma.DateTimeFilter): Promise<string> {
	const [questions, responses] = await Promise.all([
		prisma.surveyQuestion.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, title: true, isActive: true, _count: { select: { answers: true } } } }),
		prisma.surveyResponse.findMany({ where: { createdAt }, orderBy: { createdAt: 'asc' }, include: responseInclude }),
	]);
	const columns = questions.filter((q) => q.isActive || q._count.answers > 0);
	const lines = [['شماره', 'تاریخ', ...columns.map((q) => q.title), 'منتشرشده در سایت', 'جواب رستوران'].map(csvCell).join(',')];
	for (const response of responses) {
		const byQuestion = new Map(response.answers.map((a) => [a.questionId, a]));
		const cells = columns.map((q) => {
			const answer = byQuestion.get(q.id);
			if (!answer) return '';
			const value = answerValue(answer);
			if (answer.question.type === 'PHONE' && typeof value === 'string') return csvPhone(value);
			return typeof value === 'boolean' ? (value ? 'بله' : 'خیر') : value;
		});
		lines.push([response.id, localDateTime(response.createdAt), ...cells, response.isPublished ? 'بله' : 'خیر', response.reply].map(csvCell).join(','));
	}
	return '﻿' + lines.join('\r\n') + '\r\n';
}
