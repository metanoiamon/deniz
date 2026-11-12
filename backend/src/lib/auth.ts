import jwt from 'jsonwebtoken';
import type { CookieOptions, Response } from 'express';
import type { AdminRole } from '@prisma/client';
import { config } from '../config.js';

// Only admins log in. Customers use the menu and the survey without an account.

export interface AdminTokenPayload {
	sub: string;
	username: string;
	role: AdminRole;
	ver: number;
	type: 'admin';
}

const ADMIN_COOKIE = 'adminToken';
const ADMIN_COOKIE_MAX_AGE = 12 * 60 * 60 * 1000;

export function signAdminToken(admin: { id: string; username: string; role: AdminRole; tokenVersion?: number | null }): string {
	const payload: AdminTokenPayload = { sub: admin.id, username: admin.username, role: admin.role, ver: admin.tokenVersion ?? 0, type: 'admin' };
	return jwt.sign(payload, config.adminJwtSecret, { algorithm: 'HS256', expiresIn: '12h' });
}

export function verifyAdminToken(token: string): AdminTokenPayload {
	// the algorithm is pinned: a token must be signed exactly the way signAdminToken signs it
	const payload = jwt.verify(token, config.adminJwtSecret, { algorithms: ['HS256'] });
	if (typeof payload !== 'object' || payload === null || (payload as { type?: unknown }).type !== 'admin') {
		throw new Error('نوع توکن نامعتبر است.');
	}
	return payload as unknown as AdminTokenPayload;
}

function cookieOptions(): CookieOptions {
	// panel on another site (ADMIN_COOKIE_CROSS_SITE): SameSite=None, which browsers only accept with Secure
	if (config.crossSiteCookie) return { httpOnly: true, sameSite: 'none', secure: true, path: '/' };
	return { httpOnly: true, sameSite: 'strict', secure: config.isProd, path: '/' };
}

export function setAdminCookie(res: Response, token: string): void {
	res.cookie(ADMIN_COOKIE, token, { ...cookieOptions(), maxAge: ADMIN_COOKIE_MAX_AGE });
}

export function clearAdminCookie(res: Response): void {
	res.clearCookie(ADMIN_COOKIE, cookieOptions());
}
