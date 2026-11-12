import type { AdminUser } from '@prisma/client';

declare global {
	namespace Express {
		interface Request {
			/** Set by requireAdmin. */
			admin?: AdminUser;
		}
	}
}

export {};
