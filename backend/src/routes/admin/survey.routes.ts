import express from 'express';
import type { Prisma, SurveyPublicRole, SurveyQuestionType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError, prismaCode } from '../../lib/http-error.js';
import { withLock } from '../../lib/locks.js';
import { currentAdmin } from '../../lib/request.js';
import { requireRole } from '../../middleware/auth.js';
import { ROLE_GROUPS, hasRole } from '../../lib/roles.js';
import { nextSortOrder, parseId, readFullOrder, readPage } from '../../lib/ordering.js';
import { faDigits } from '../../lib/text.js';
import {
	TEXT_TYPES,
	commentOf,
	isPublicRole,
	isQuestionType,
	readDateRange,
	responseInclude,
	surveyCsv,
	surveyStats,
	toAdminResponse,
} from '../../services/survey.service.js';

// The survey in the admin panel. Mounted inside adminRouter (requireAdmin has already run).
//   - the questions shape what every customer is asked, statistics and the export hold every answer: manager only
//   - reading responses, publishing a comment and replying to it is everyday work: staff too
export const adminSurveyRouter = express.Router();
const requireStaff = requireRole(...ROLE_GROUPS.staff);
const requireManager = requireRole(...ROLE_GROUPS.manager);

const TITLE_MAX = 150;
const OPTION_LABEL_MAX = 60;
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 10;
const ACTIVE_QUESTIONS_MAX = 30;
const REPLY_MAX = 500;

const QUESTION_ORDER = [{ sortOrder: 'asc' }, { id: 'asc' }] satisfies Prisma.SurveyQuestionOrderByWithRelationInput[];
const questionInclude = {
	options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, label: true, sortOrder: true } },
	_count: { select: { answers: true } },
} satisfies Prisma.SurveyQuestionInclude;

type QuestionWithOptions = Prisma.SurveyQuestionGetPayload<{ include: typeof questionInclude }>;

/** Admin shape: the question, its options (CHOICE only) and how many answers it has (type is locked once > 0). */
function toAdminQuestion({ _count, options, ...question }: QuestionWithOptions) {
	return { ...question, options: question.type === 'CHOICE' ? options : [], answerCount: _count.answers };
}

async function loadQuestion(id: number) {
	return prisma.surveyQuestion.findUniqueOrThrow({ where: { id }, include: questionInclude });
}

type InputResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

function readLabel(value: unknown): InputResult<string> {
	if (typeof value !== 'string' || !value.trim()) return { ok: false, error: 'متن گزینه الزامی است.' };
	if (value.trim().length > OPTION_LABEL_MAX) return { ok: false, error: `متن گزینه حداکثر ${faDigits(OPTION_LABEL_MAX)} کاراکتر است.` };
	return { ok: true, data: value.trim() };
}

function readLabels(value: unknown): InputResult<string[]> {
	if (!Array.isArray(value)) return { ok: false, error: 'فهرست گزینه‌ها نامعتبر است.' };
	if (value.length < OPTIONS_MIN || value.length > OPTIONS_MAX) return { ok: false, error: `سوال چندگزینه‌ای باید ${faDigits(OPTIONS_MIN)} تا ${faDigits(OPTIONS_MAX)} گزینه داشته باشد.` };
	const labels: string[] = [];
	for (const item of value) {
		const label = readLabel(item);
		if (!label.ok) return label;
		if (labels.includes(label.data)) return { ok: false, error: `گزینه‌ی «${label.data}» دو بار آمده است.` };
		labels.push(label.data);
	}
	return { ok: true, data: labels };
}

interface QuestionFields {
	title: string;
	type: SurveyQuestionType;
	isRequired: boolean;
	publicRole: SurveyPublicRole;
	isActive: boolean;
}

/** Validates question input; `current` = the question being edited (null on create). */
function readQuestionInput(body: unknown, current: QuestionWithOptions | null): InputResult<{ fields: Partial<QuestionFields>; options?: string[] }> {
	const b = (body ?? {}) as Record<string, unknown>;
	const fields: Partial<QuestionFields> = {};
	if (b.title !== undefined || !current) {
		if (typeof b.title !== 'string' || !b.title.trim()) return { ok: false, error: 'متن سوال الزامی است.' };
		if (b.title.trim().length > TITLE_MAX) return { ok: false, error: `متن سوال حداکثر ${faDigits(TITLE_MAX)} کاراکتر است.` };
		fields.title = b.title.trim();
	}
	if (b.type !== undefined || !current) {
		if (!isQuestionType(b.type)) return { ok: false, error: 'نوع جواب نامعتبر است.' };
		if (current && b.type !== current.type && current._count.answers > 0) {
			return { ok: false, status: 409, error: 'این سوال جواب دارد و نوع جوابش دیگر عوض نمی‌شود؛ یک سوال تازه بساز و این یکی را غیرفعال کن.' };
		}
		fields.type = b.type;
	}
	for (const flag of ['isRequired', 'isActive'] as const) {
		if (b[flag] === undefined) continue;
		if (typeof b[flag] !== 'boolean') return { ok: false, error: 'مقدار انتخاب‌شده باید true یا false باشد.' };
		fields[flag] = b[flag] as boolean;
	}
	if (b.publicRole !== undefined) {
		if (!isPublicRole(b.publicRole)) return { ok: false, error: 'نقش سوال در «نظرات» نامعتبر است.' };
		fields.publicRole = b.publicRole;
	}

	const type = fields.type ?? (current?.type as SurveyQuestionType);
	const role = fields.publicRole ?? current?.publicRole ?? 'NONE';
	if (role !== 'NONE' && !TEXT_TYPES.includes(type)) {
		return { ok: false, error: 'فقط سوال متنی می‌تواند نام یا متن نظرِ نمایش‌داده‌شده در سایت باشد.' };
	}
	// a question that stops being a text question loses its public role with it
	if (current && fields.type && !TEXT_TYPES.includes(fields.type) && b.publicRole === undefined) fields.publicRole = 'NONE';

	let options: string[] | undefined;
	const becomesChoice = type === 'CHOICE' && (!current || current.type !== 'CHOICE');
	if (b.options !== undefined || becomesChoice) {
		if (type !== 'CHOICE') return { ok: false, error: 'گزینه فقط برای سوال چندگزینه‌ای است.' };
		if (current && !becomesChoice) return { ok: false, error: 'گزینه‌های این سوال را با مسیرهای مخصوص گزینه‌ها ویرایش کن.' };
		const labels = readLabels(b.options);
		if (!labels.ok) return labels;
		options = labels.data;
	}
	return { ok: true, data: { fields, options } };
}

// Every change to the questions and options runs under the exclusive «survey» lock, with its checks read inside
// the lock: «at most one comment question», «at most 30 active», «the type is locked once answered», «at least two
// options» and «no duplicate option» stay true even when two admins act at once, and no customer's submission is
// checked against a question that is being changed at that moment (submissions hold the same lock, shared).

/** Another active question already has this public role? (only one author / comment question). */
async function assertRoleFree(tx: Prisma.TransactionClient, role: SurveyPublicRole, exceptId: number | null): Promise<void> {
	if (role === 'NONE') return;
	const other = await tx.surveyQuestion.findFirst({ where: { publicRole: role, isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) } });
	if (!other) return;
	const what = role === 'NAME' ? 'نام نویسنده' : 'متن نظر';
	throw new HttpError(409, `سوال «${other.title}» از قبل ${what} در «نظرات» سایت است؛ اول نقش آن را بردار.`);
}

async function assertRoomForActive(tx: Prisma.TransactionClient): Promise<void> {
	if ((await tx.surveyQuestion.count({ where: { isActive: true } })) >= ACTIVE_QUESTIONS_MAX) {
		throw new HttpError(409, `حداکثر ${faDigits(ACTIVE_QUESTIONS_MAX)} سوال فعال مجاز است.`);
	}
}

/** A known client error from inside a lock → its answer. */
function sendKnown(res: express.Response, error: unknown): boolean {
	if (!(error instanceof HttpError)) return false;
	res.status(error.status).json({ message: error.message, ...(error.extra ?? {}) });
	return true;
}

// ─── Questions ────────────────────────────────────────────────────────────────

adminSurveyRouter.get('/survey/questions', requireStaff, async (_req, res, next) => {
	try {
		const questions = await prisma.surveyQuestion.findMany({ orderBy: QUESTION_ORDER, include: questionInclude });
		res.json({ questions: questions.map(toAdminQuestion) });
	} catch (error) {
		next(error);
	}
});

adminSurveyRouter.post('/survey/questions', requireManager, async (req, res, next) => {
	try {
		const input = readQuestionInput(req.body, null);
		if (!input.ok) return res.status(input.status ?? 400).json({ message: input.error });
		const fields = input.data.fields as QuestionFields;
		const id = await withLock('survey', async (tx) => {
			if (fields.isActive !== false) {
				await assertRoomForActive(tx);
				await assertRoleFree(tx, fields.publicRole ?? 'NONE', null);
			}
			// سوال تازه آخر فرم می‌نشیند
			const last = await tx.surveyQuestion.aggregate({ _max: { sortOrder: true } });
			const created = await tx.surveyQuestion.create({
				data: {
					...fields,
					sortOrder: nextSortOrder(last._max.sortOrder),
					options: { create: (input.data.options ?? []).map((label, sortOrder) => ({ label, sortOrder })) },
				},
			});
			return created.id;
		});
		res.status(201).json({ question: toAdminQuestion(await loadQuestion(id)) });
	} catch (error) {
		if (sendKnown(res, error)) return;
		next(error);
	}
});

// ترتیب سوال‌ها روی فرم: لیست کامل شناسه‌ی همه‌ی سوال‌ها (فعال و غیرفعال)
adminSurveyRouter.put('/survey/questions/order', requireManager, async (req, res, next) => {
	try {
		await withLock('survey', async (tx) => {
			const existing = await tx.surveyQuestion.findMany({ select: { id: true } });
			const ids = readFullOrder(req.body?.ids, existing.map((q) => q.id));
			if (!ids) throw new HttpError(400, 'ترتیب باید شامل همه‌ی سوال‌ها، هر کدام یک بار، باشد.');
			for (const [index, id] of ids.entries()) await tx.surveyQuestion.update({ where: { id }, data: { sortOrder: index } });
		});
		const questions = await prisma.surveyQuestion.findMany({ orderBy: QUESTION_ORDER, include: questionInclude });
		res.json({ questions: questions.map(toAdminQuestion) });
	} catch (error) {
		if (sendKnown(res, error)) return;
		next(error);
	}
});

adminSurveyRouter.patch('/survey/questions/:id', requireManager, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		await withLock('survey', async (tx) => {
			const current = await tx.surveyQuestion.findUnique({ where: { id }, include: questionInclude });
			if (!current) throw new HttpError(404, 'سوال پیدا نشد.');
			const input = readQuestionInput(req.body, current);
			if (!input.ok) throw new HttpError(input.status ?? 400, input.error);
			const { fields, options } = input.data;
			const willBeActive = fields.isActive ?? current.isActive;
			if (willBeActive && !current.isActive) await assertRoomForActive(tx);
			if (willBeActive) await assertRoleFree(tx, fields.publicRole ?? current.publicRole, id);
			const leavesChoice = current.type === 'CHOICE' && fields.type !== undefined && fields.type !== 'CHOICE';
			await tx.surveyQuestion.update({ where: { id }, data: fields });
			if (leavesChoice) await tx.surveyOption.deleteMany({ where: { questionId: id } });
			if (options) await tx.surveyOption.createMany({ data: options.map((label, sortOrder) => ({ questionId: id, label, sortOrder })) });
		});
		res.json({ question: toAdminQuestion(await loadQuestion(id)) });
	} catch (error) {
		if (sendKnown(res, error)) return;
		next(error);
	}
});

// سوالی که جواب دارد فقط با ?force=1 (بعد از تایید صریح در پنل) حذف می‌شود و جواب‌هایش هم می‌روند؛
// معمولاً غیرفعال کردنش بهتر است.
adminSurveyRouter.delete('/survey/questions/:id', requireManager, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		await withLock('survey', async (tx) => {
			const question = await tx.surveyQuestion.findUnique({ where: { id }, include: questionInclude });
			if (!question) throw new HttpError(404, 'سوال پیدا نشد.');
			const count = question._count.answers;
			if (count > 0 && req.query.force !== '1') {
				throw new HttpError(409, `این سوال ${faDigits(count)} جواب دارد؛ با حذفش جواب‌ها هم پاک می‌شوند. به‌جایش غیرفعالش کن.`, { answerCount: count });
			}
			await tx.surveyQuestion.delete({ where: { id } });
		});
		res.json({ message: 'سوال حذف شد.' });
	} catch (error) {
		if (sendKnown(res, error)) return;
		next(error);
	}
});

// ─── Options of a CHOICE question ─────────────────────────────────────────────

adminSurveyRouter.post('/survey/questions/:id/options', requireManager, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const label = readLabel(req.body?.label);
		if (!label.ok) return res.status(400).json({ message: label.error });
		await withLock('survey', async (tx) => {
			const question = await tx.surveyQuestion.findUnique({ where: { id }, include: questionInclude });
			if (!question) throw new HttpError(404, 'سوال پیدا نشد.');
			if (question.type !== 'CHOICE') throw new HttpError(400, 'گزینه فقط برای سوال چندگزینه‌ای است.');
			if (question.options.length >= OPTIONS_MAX) throw new HttpError(400, `هر سوال حداکثر ${faDigits(OPTIONS_MAX)} گزینه می‌تواند داشته باشد.`);
			if (question.options.some((o) => o.label === label.data)) throw new HttpError(409, `گزینه‌ی «${label.data}» از قبل وجود دارد.`);
			const sortOrder = nextSortOrder(Math.max(-1, ...question.options.map((o) => o.sortOrder)));
			await tx.surveyOption.create({ data: { questionId: id, label: label.data, sortOrder } });
		});
		res.status(201).json({ question: toAdminQuestion(await loadQuestion(id)) });
	} catch (error) {
		if (sendKnown(res, error)) return;
		next(error);
	}
});

adminSurveyRouter.put('/survey/questions/:id/options/order', requireManager, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		await withLock('survey', async (tx) => {
			const existing = await tx.surveyOption.findMany({ where: { questionId: id }, select: { id: true } });
			const ids = readFullOrder(req.body?.ids, existing.map((o) => o.id));
			if (!ids || !ids.length) throw new HttpError(400, 'ترتیب باید شامل همه‌ی گزینه‌های این سوال، هر کدام یک بار، باشد.');
			for (const [index, optionId] of ids.entries()) await tx.surveyOption.update({ where: { id: optionId }, data: { sortOrder: index } });
		});
		res.json({ question: toAdminQuestion(await loadQuestion(id)) });
	} catch (error) {
		if (sendKnown(res, error)) return;
		next(error);
	}
});

// تغییر متن گزینه روی جواب‌های قبلی هم اثر دارد (جواب به گزینه اشاره می‌کند، نه به متنش)
adminSurveyRouter.patch('/survey/options/:id', requireManager, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const label = readLabel(req.body?.label);
		if (!label.ok) return res.status(400).json({ message: label.error });
		const questionId = await withLock('survey', async (tx) => {
			const option = await tx.surveyOption.findUnique({ where: { id } });
			if (!option) throw new HttpError(404, 'گزینه پیدا نشد.');
			const twin = await tx.surveyOption.findFirst({ where: { questionId: option.questionId, label: label.data, id: { not: id } } });
			if (twin) throw new HttpError(409, `گزینه‌ی «${label.data}» از قبل وجود دارد.`);
			await tx.surveyOption.update({ where: { id }, data: { label: label.data } });
			return option.questionId;
		});
		res.json({ question: toAdminQuestion(await loadQuestion(questionId)) });
	} catch (error) {
		if (sendKnown(res, error)) return;
		next(error);
	}
});

adminSurveyRouter.delete('/survey/options/:id', requireManager, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const questionId = await withLock('survey', async (tx) => {
			const option = await tx.surveyOption.findUnique({ where: { id }, include: { _count: { select: { answers: true } } } });
			if (!option) throw new HttpError(404, 'گزینه پیدا نشد.');
			if ((await tx.surveyOption.count({ where: { questionId: option.questionId } })) <= OPTIONS_MIN) {
				throw new HttpError(400, `سوال چندگزینه‌ای حداقل ${faDigits(OPTIONS_MIN)} گزینه لازم دارد.`);
			}
			const count = option._count.answers;
			if (count > 0 && req.query.force !== '1') {
				throw new HttpError(409, `${faDigits(count)} نفر این گزینه را انتخاب کرده‌اند؛ با حذفش این جواب‌ها هم پاک می‌شوند.`, { answerCount: count });
			}
			await tx.surveyOption.delete({ where: { id } });
			return option.questionId;
		});
		res.json({ question: toAdminQuestion(await loadQuestion(questionId)) });
	} catch (error) {
		if (sendKnown(res, error)) return;
		next(error);
	}
});

// ─── Responses ────────────────────────────────────────────────────────────────

const RESPONSE_FILTERS = ['all', 'unread', 'published', 'commented'] as const;
type ResponseFilter = (typeof RESPONSE_FILTERS)[number];

const WITH_COMMENT = { answers: { some: { question: { publicRole: 'COMMENT' }, textValue: { not: null } } } } satisfies Prisma.SurveyResponseWhereInput;

function filterWhere(filter: ResponseFilter): Prisma.SurveyResponseWhereInput {
	switch (filter) {
		case 'unread':
			return { isRead: false };
		case 'published':
			return { isPublished: true };
		// has a comment that could be published
		case 'commented':
			return WITH_COMMENT;
		default:
			return {};
	}
}

/** Staff see that a phone number was left, not the number itself; managers see it (to call the customer back). */
const responseView = (req: express.Request) => ({ maskPhones: !hasRole(currentAdmin(req), 'manager') });

adminSurveyRouter.get('/survey/responses', requireStaff, async (req, res, next) => {
	try {
		const filter = req.query.filter ?? 'all';
		if (typeof filter !== 'string' || !(RESPONSE_FILTERS as readonly string[]).includes(filter)) {
			return res.status(400).json({ message: 'فیلتر نامعتبر است.' });
		}
		const range = readDateRange(req.query);
		if (!range.ok) return res.status(400).json({ message: range.error });
		const paging = readPage(req.query, { defaultLimit: 50, maxLimit: 200 });
		if (!paging) return res.status(400).json({ message: 'page و limit باید اعداد صحیح مثبت باشند و limit نباید بیشتر از ۲۰۰ باشد.' });
		const where: Prisma.SurveyResponseWhereInput = { ...filterWhere(filter as ResponseFilter), createdAt: range.data };
		const [responses, total, unread] = await Promise.all([
			prisma.surveyResponse.findMany({
				where,
				include: responseInclude,
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				skip: paging.skip,
				take: paging.limit,
			}),
			prisma.surveyResponse.count({ where }),
			prisma.surveyResponse.count({ where: { isRead: false } }),
		]);
		const view = responseView(req);
		res.json({ responses: responses.map((r) => toAdminResponse(r, view)), total, unread, page: paging.page, limit: paging.limit });
	} catch (error) {
		next(error);
	}
});

adminSurveyRouter.patch('/survey/responses/:id', requireStaff, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		const { isRead, isPublished, reply } = (req.body ?? {}) as Record<string, unknown>;
		for (const value of [isRead, isPublished]) {
			if (value !== undefined && typeof value !== 'boolean') return res.status(400).json({ message: 'مقدار انتخاب‌شده باید true یا false باشد.' });
		}
		if (reply !== undefined && reply !== null && typeof reply !== 'string') return res.status(400).json({ message: 'متن جواب رستوران نامعتبر است.' });
		if (typeof reply === 'string' && reply.trim().length > REPLY_MAX) return res.status(400).json({ message: `جواب رستوران حداکثر ${faDigits(REPLY_MAX)} کاراکتر است.` });
		const existing = await prisma.surveyResponse.findUnique({ where: { id }, include: responseInclude });
		if (!existing) return res.status(404).json({ message: 'پاسخ پیدا نشد.' });
		if (isPublished === true && !commentOf(existing)) {
			return res.status(409).json({ message: 'این پاسخ متن نظری ندارد که در سایت نشان داده شود.' });
		}
		const data: Prisma.SurveyResponseUncheckedUpdateInput = { updatedById: currentAdmin(req).id };
		if (isRead !== undefined) data.isRead = isRead as boolean;
		if (isPublished !== undefined) data.isPublished = isPublished as boolean;
		// پاسخ خالی یعنی حذف پاسخ
		if (reply !== undefined) data.reply = typeof reply === 'string' && reply.trim() ? reply.trim() : null;
		// منتشر کردن یا جواب دادن یعنی ادمین آن را دیده
		if ((isPublished === true || (typeof reply === 'string' && reply.trim())) && isRead === undefined) data.isRead = true;
		const response = await prisma.surveyResponse.update({ where: { id }, data, include: responseInclude });
		res.json({ response: toAdminResponse(response, responseView(req)) });
	} catch (error) {
		if (prismaCode(error) === 'P2025') return res.status(404).json({ message: 'پاسخ پیدا نشد.' });
		next(error);
	}
});

adminSurveyRouter.delete('/survey/responses/:id', requireStaff, async (req, res, next) => {
	try {
		const id = parseId(req.params.id);
		if (!id) return res.status(400).json({ message: 'شناسه نامعتبر است.' });
		await prisma.surveyResponse.delete({ where: { id } });
		res.json({ message: 'پاسخ حذف شد.' });
	} catch (error) {
		if (prismaCode(error) === 'P2025') return res.status(404).json({ message: 'پاسخ پیدا نشد.' });
		next(error);
	}
});

// ─── Statistics and export ────────────────────────────────────────────────────

adminSurveyRouter.get('/survey/stats', requireManager, async (req, res, next) => {
	try {
		const range = readDateRange(req.query);
		if (!range.ok) return res.status(400).json({ message: range.error });
		res.json(await surveyStats(range.data));
	} catch (error) {
		next(error);
	}
});

adminSurveyRouter.get('/survey/export.csv', requireManager, async (req, res, next) => {
	try {
		const range = readDateRange(req.query);
		if (!range.ok) return res.status(400).json({ message: range.error });
		const csv = await surveyCsv(range.data);
		const name = ['survey', req.query.from, req.query.to].filter(Boolean).join('_');
		res.setHeader('Content-Type', 'text/csv; charset=utf-8');
		res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
		res.send(csv);
	} catch (error) {
		next(error);
	}
});
