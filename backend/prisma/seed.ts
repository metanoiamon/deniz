import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedMenu } from './seed-menu.js';
import { seedSurvey } from './seed-survey.js';
import { USERNAME_PATTERN, normalizeUsername } from '../src/lib/roles.js';
import { hashPassword, passwordProblem } from '../src/lib/passwords.js';

// Initial data for an empty database. Safe to run again: nothing that already exists is changed.

const prisma = new PrismaClient();

const settings = [
	['currencyLabel', 'تومان'],
	['cafeName', 'فست فود دنیز'],
];

/** The values from .env.example: public, so never acceptable as a real password. */
const EXAMPLE_PASSWORDS = ['choose-a-strong-password'];

async function main() {
	// .env is checked before anything is written, so a mistake there leaves the database untouched
	const username = normalizeUsername(process.env.SEED_ADMIN_USERNAME || 'developer');
	const password = process.env.SEED_ADMIN_PASSWORD || '';
	const name = (process.env.SEED_ADMIN_NAME || 'Developer').trim().slice(0, 80) || 'Developer';
	if (!USERNAME_PATTERN.test(username)) {
		throw new Error('SEED_ADMIN_USERNAME باید ۳ تا ۳۲ کاراکتر و فقط حروف انگلیسی کوچک، عدد، نقطه، خط تیره یا زیرخط باشد.');
	}
	const problem = passwordProblem(password);
	if (!password || problem) throw new Error(`SEED_ADMIN_PASSWORD: ${problem ?? 'باید تنظیم شود.'}`);
	if (EXAMPLE_PASSWORDS.includes(password)) throw new Error('SEED_ADMIN_PASSWORD هنوز مقدار نمونه‌ی .env.example است؛ یک رمز واقعی بگذار.');

	// update خالی: اگر رکورد از قبل هست، دست نمی‌خورد. seed فقط مقدار اولیه می‌سازد،
	// نه اینکه تنظیمات واقعی را با اجرای دوباره پاک کند.
	for (const [key, value] of settings) {
		await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
	}

	// حساب اول همیشه «توسعه‌دهنده» است.
	const existingAdmin = await prisma.adminUser.findUnique({ where: { username } });
	if (existingAdmin) {
		console.log(`ادمین «${username}» از قبل وجود دارد؛ رمز و نقشش دست‌نخورده ماند.`);
	} else {
		await prisma.adminUser.create({ data: { username, name, passwordHash: await hashPassword(password), role: 'DEVELOPER', isActive: true } });
		console.log(`ادمین توسعه‌دهنده «${username}» ساخته شد. حالا SEED_ADMIN_PASSWORD را از .env پاک کن؛ دیگر لازم نیست.`);
	}

	// منو (با عکس‌ها) از prisma/seed-data، اگر وجود داشته باشد؛ فقط روی دیتابیس خالی
	await seedMenu(prisma);
	// سوال‌های اولیه‌ی نظرسنجی؛ فقط وقتی هنوز هیچ سوالی نیست
	await seedSurvey(prisma);

	console.log('Seed completed.');
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => prisma.$disconnect());
