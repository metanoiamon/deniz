import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword, passwordProblem } from '../src/lib/passwords.js';
import { normalizeUsername } from '../src/lib/roles.js';

// رمز ادمین را به مقدار SEED_ADMIN_PASSWORD در .env تغییر می‌دهد.
// seed این کار را نمی‌کند (برای ادمینِ موجود رمز را دست‌نخورده می‌گذارد).

const prisma = new PrismaClient();

async function main() {
	const username = normalizeUsername(process.env.SEED_ADMIN_USERNAME || 'developer');
	const password = process.env.SEED_ADMIN_PASSWORD || '';

	const problem = passwordProblem(password);
	if (!password || problem) throw new Error(`SEED_ADMIN_PASSWORD: ${problem ?? 'باید در .env تنظیم شود.'}`);
	if (password === 'choose-a-strong-password') throw new Error('این رمز نمونه است؛ یک رمز واقعی بگذار.');

	const admin = await prisma.adminUser.findUnique({ where: { username } });
	if (!admin) throw new Error(`ادمینی با نام کاربری «${username}» پیدا نشد.`);

	await prisma.adminUser.update({
		where: { username },
		data: {
			passwordHash: await hashPassword(password),
			isActive: true,
			// توکن‌های قبلی (کوکی‌های ورود) باطل می‌شوند
			tokenVersion: { increment: 1 },
		},
	});

	console.log(`رمز ادمین «${username}» تغییر کرد. حالا با همین رمز وارد شو و بعد آن را از .env پاک کن.`);
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(async () => prisma.$disconnect());