import express from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { withLock } from '../lib/locks.js';
import { readPage } from '../lib/ordering.js';
import { rateLimits } from '../middleware/rate-limits.js';
import { commentOf, readSubmission, responseInclude, toPublicReview } from '../services/survey.service.js';

// The customer side of the survey: the questions, sending answers, and the public «نظرات» list (comments of
// responses the admin published). No login.
export const surveyRouter = express.Router();

/**
 * Honeypot: the form has a field with this name that people never see (hidden with CSS) and bots fill in. A filled
 * one gets the normal answer, so the bot does not learn it was caught, but nothing is saved.
 */
export const HONEYPOT_FIELD = 'website';

surveyRouter.get('/survey', async (_req, res, next) => {
	try {
		const questions = await prisma.surveyQuestion.findMany({
			where: { isActive: true },
			orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
			select: {
				id: true,
				title: true,
				type: true,
				isRequired: true,
				publicRole: true,
				options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, label: true } },
			},
		});
		// options only mean something for CHOICE questions
		res.json(questions.map((q) => (q.type === 'CHOICE' ? q : { ...q, options: undefined })));
	} catch (error) {
		next(error);
	}
});

const THANKS = { message: 'ممنون که نظرت را گفتی!' };

// A whole restaurant shares one Wi-Fi IP, so the limit per IP is generous; the honeypot stops bots.
surveyRouter.post('/survey', rateLimits.surveySubmit, async (req, res, next) => {
	try {
		const body = (req.body ?? {}) as Record<string, unknown>;
		// a bot gets exactly the answer a person gets, so it cannot tell it was caught
		if (body[HONEYPOT_FIELD] !== undefined && body[HONEYPOT_FIELD] !== null && body[HONEYPOT_FIELD] !== '') return res.status(201).json(THANKS);
		// Checking the answers and saving them happen under the shared survey lock: an admin cannot delete a question
		// or option, or change a question's type, between the check and the save.
		const result = await withLock(
			'survey',
			async (tx) => {
				const answers = await readSubmission(tx, body.answers);
				if (!answers.ok) return answers;
				await tx.surveyResponse.create({ data: { answers: { create: answers.data } } });
				return answers;
			},
			{ shared: true },
		);
		if (!result.ok) return res.status(400).json({ message: result.error });
		res.status(201).json(THANKS);
	} catch (error) {
		next(error);
	}
});

// ─── Public «نظرات» ───────────────────────────────────────────────────────────

const PUBLISHED = {
	isPublished: true,
	answers: { some: { question: { publicRole: 'COMMENT' }, textValue: { not: null } } },
} satisfies Prisma.SurveyResponseWhereInput;

/** Without ?page / ?limit the list is the newest ones only: an unbounded list would grow with every published comment. */
export const REVIEWS_WITHOUT_PAGING = 100;

surveyRouter.get('/reviews', async (req, res, next) => {
	try {
		const paged = req.query.page !== undefined || req.query.limit !== undefined;
		const pagination = paged ? readPage(req.query, { defaultLimit: 20, maxLimit: 100 }) : { page: 1, limit: REVIEWS_WITHOUT_PAGING, skip: 0 };
		if (!pagination) return res.status(400).json({ message: 'page و limit باید اعداد صحیح مثبت باشند و limit نباید بیشتر از ۱۰۰ باشد.' });
		const [responses, total] = await Promise.all([
			prisma.surveyResponse.findMany({
				where: PUBLISHED,
				include: responseInclude,
				orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
				skip: pagination.skip,
				take: pagination.limit,
			}),
			paged ? prisma.surveyResponse.count({ where: PUBLISHED }) : Promise.resolve(0),
		]);
		const reviews = responses.filter((r) => commentOf(r)).map(toPublicReview);
		if (!paged) return res.json(reviews);
		res.json({ data: reviews, page: pagination.page, limit: pagination.limit, total });
	} catch (error) {
		next(error);
	}
});
