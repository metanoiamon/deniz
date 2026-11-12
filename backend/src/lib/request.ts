import type { Request } from 'express';
import type { AdminUser } from '@prisma/client';
import { createHttpError } from './http-error.js';

/** The signed-in admin. Only valid behind `requireAdmin`. */
export function currentAdmin(req: Request): AdminUser {
	if (!req.admin) throw createHttpError(401, 'ورود ادمین لازم است.');
	return req.admin;
}
