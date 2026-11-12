// The starter survey: the restaurant's own form, with the fixes agreed on (2026-10):
//   - «آیا از برخورد پرسنل رضایت داشتید؟» (yes/no) dropped: the staff star rating already says it
//   - «نسبت کیفیت به قیمت» with clear options instead of 100% / 90% / 80% / under 80%
//   - an optional phone number, so the restaurant can call back an unhappy customer
// Created only when there is no question yet; after that the admin panel owns the questions.
import type { PrismaClient, SurveyPublicRole, SurveyQuestionType } from '@prisma/client';

interface StarterQuestion {
	title: string;
	type: SurveyQuestionType;
	isRequired: boolean;
	publicRole?: SurveyPublicRole;
	options?: string[];
}

const STARTER: StarterQuestion[] = [
	{ title: 'میزان رضایت از غذا', type: 'STARS', isRequired: true },
	{ title: 'میزان رضایت از برخورد پرسنل', type: 'STARS', isRequired: true },
	{ title: 'میزان بهداشت غذا', type: 'SLIDER', isRequired: true },
	{ title: 'نظرتان نسبت به کیفیت مواد اولیه استفاده‌شده', type: 'EMOJI', isRequired: true },
	{ title: 'نسبت کیفیت به قیمت', type: 'CHOICE', isRequired: true, options: ['ارزان‌تر از کیفیتش', 'منصفانه', 'گران‌تر از کیفیتش'] },
	{ title: 'آیا علاقه‌مند به خرید مجدد از ما هستید؟', type: 'YES_NO', isRequired: true },
	{ title: 'نام و نام خانوادگی', type: 'SHORT_TEXT', isRequired: false, publicRole: 'NAME' },
	{ title: 'شماره تماس (اگر مایلید با شما تماس بگیریم)', type: 'PHONE', isRequired: false },
	{ title: 'پیشنهادات خود را با ما در میان بگذارید.', type: 'LONG_TEXT', isRequired: false, publicRole: 'COMMENT' },
];

export async function seedSurvey(prisma: PrismaClient): Promise<void> {
	if ((await prisma.surveyQuestion.count()) > 0) {
		console.log('نظرسنجی از قبل سوال دارد؛ سوال‌های اولیه اضافه نشد.');
		return;
	}
	await prisma.$transaction(
		STARTER.map((q, sortOrder) =>
			prisma.surveyQuestion.create({
				data: {
					title: q.title,
					type: q.type,
					isRequired: q.isRequired,
					publicRole: q.publicRole ?? 'NONE',
					sortOrder,
					options: { create: (q.options ?? []).map((label, index) => ({ label, sortOrder: index })) },
				},
			}),
		),
	);
	console.log(`نظرسنجی: ${STARTER.length} سوال اولیه ساخته شد.`);
}
