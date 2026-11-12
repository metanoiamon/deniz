import express from 'express';
import { prisma } from '../lib/prisma.js';
import { clearAdminCookie, setAdminCookie, signAdminToken, verifyAdminToken } from '../lib/auth.js';
import { normalizeUsername } from '../lib/roles.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../lib/passwords.js';
import { rateLimits } from '../middleware/rate-limits.js';

export const authRouter = express.Router();

authRouter.post('/admin/login', rateLimits.loginPerIp, rateLimits.loginPerUsername, async (req, res, next) => {
	try {
		// باید با normalizeUsername موقع ساخت ادمین هماهنگ باشه، وگرنه ورود شکست می‌خوره
		const username = normalizeUsername(req.body?.username);
		const password = typeof req.body?.password === 'string' ? req.body.password : '';
		if (!username || !password) return res.status(400).json({ message: 'نام کاربری و رمز عبور الزامی است.' });
		if (username.length > 64 || password.length > 128) return res.status(401).json({ message: 'اطلاعات ورود اشتباه است.' });

		const admin = await prisma.adminUser.findUnique({ where: { username } });
		// حتی وقتی ادمین وجود ندارد یک مقایسه‌ی ساختگی انجام می‌شود تا زمان پاسخ
		// در هر دو حالت یکسان بماند و نام‌های کاربری معتبر از روی زمان لو نروند.
		const ok = await verifyPassword(password, admin?.passwordHash || DUMMY_PASSWORD_HASH);
		if (!admin || !admin.isActive || !ok) return res.status(401).json({ message: 'اطلاعات ورود اشتباه است.' });
		setAdminCookie(res, signAdminToken(admin));
		res.json({
			message: 'ورود ادمین انجام شد.',
			admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role },
		});
	} catch (error) {
		next(error);
	}
});

// Logging out also ends the token on the server (its version is bumped), so a copied cookie stops working at once
// instead of staying valid until it expires. This signs the admin out on every device.
authRouter.post('/admin/logout', async (req, res, next) => {
	try {
		const token: string | undefined = req.cookies?.adminToken;
		if (token) {
			let payload: { sub: string; ver?: number } | null = null;
			try {
				payload = verifyAdminToken(token);
			} catch {
				// an expired or broken token: nothing to revoke
			}
			if (payload) {
				await prisma.adminUser.updateMany({ where: { id: payload.sub, tokenVersion: payload.ver ?? 0 }, data: { tokenVersion: { increment: 1 } } });
			}
		}
		clearAdminCookie(res);
		res.json({ message: 'خروج ادمین انجام شد.' });
	} catch (error) {
		next(error);
	}
});
