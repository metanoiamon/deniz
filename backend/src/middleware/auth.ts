import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AdminRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { verifyAdminToken } from '../lib/auth.js';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<unknown> {
	const token: string | undefined = req.cookies?.adminToken;
	if (!token) return res.status(401).json({ message: 'ورود ادمین لازم است.' });

	let payload: { sub: string; ver?: number };
	try {
		payload = verifyAdminToken(token);
	} catch (_) {
		return res.status(401).json({ message: 'نشست ادمین نامعتبر است.' });
	}

	try {
		const admin = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
		if (!admin || !admin.isActive) return res.status(401).json({ message: 'ادمین فعال نیست.' });
		// the token was revoked: logout, password or role change, or the account was deactivated
		if ((payload.ver ?? 0) !== (admin.tokenVersion ?? 0)) {
			return res.status(401).json({ message: 'نشست تمام شده؛ دوباره وارد شو.' });
		}
		req.admin = admin;
		next();
	} catch (error) {
		console.error('requireAdmin: خواندن ادمین از دیتابیس ناموفق بود:', error);
		res.status(503).json({ message: 'سرویس موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کن.' });
	}
}

/** Allows the request only for the given roles, e.g. requireRole('DEVELOPER', 'MAIN'). */
export function requireRole(...roles: readonly AdminRole[]): RequestHandler {
	return (req, res, next) => {
		if (!req.admin) return res.status(401).json({ message: 'ورود ادمین لازم است.' });
		if (!roles.includes(req.admin.role)) return res.status(403).json({ message: 'سطح دسترسی کافی نیست.' });
		next();
	};
}
