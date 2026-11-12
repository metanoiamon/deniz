import type { Request, RequestHandler } from 'express';
import rateLimit, { type Options } from 'express-rate-limit';
import { normalizeUsername } from '../lib/roles.js';
import { config } from '../config.js';

// Every rate limit of the API in one place. Counted per client IP (behind nginx: the real customer's IP, see
// TRUST_PROXY), in memory: right for one server process.
//
// Customers on the restaurant's Wi-Fi all share one IP, so reading the menu and sending the survey get generous
// limits; the limits that protect something (logins) are strict.

export interface RateLimits {
	/** Menu, banners, survey questions, published comments: everything public that only reads. */
	publicRead: RequestHandler;
	/** Every other API request: admin panel, survey submissions. */
	general: RequestHandler;
	/** Survey submissions (on top of `general`). */
	surveySubmit: RequestHandler;
	/** Failed admin logins per IP. */
	loginPerIp: RequestHandler;
	/** Failed admin logins per username, from any IP: stops a slow attack on one account spread over many IPs. */
	loginPerUsername: RequestHandler;
}

const tooMany = { message: 'تعداد درخواست‌ها زیاد بود؛ کمی بعد دوباره تلاش کن.' };
const tooManyLogins = { message: 'تعداد تلاش‌های ناموفق ورود زیاد بود؛ ۱۵ دقیقه‌ی دیگر دوباره تلاش کن.' };

// Express matches routes case-insensitively, so /api/ADMIN/… is the admin API too and must count as such
const isPublicRead = (req: Request) => req.method === 'GET' && !req.path.toLowerCase().startsWith('/admin');

export function createRateLimits({ enabled }: { enabled: boolean }): RateLimits {
	const limit = (options: Partial<Options>): RequestHandler =>
		rateLimit({ standardHeaders: true, legacyHeaders: false, message: tooMany, ...options, skip: (req, res) => !enabled || (options.skip?.(req, res) ?? false) });
	return {
		publicRead: limit({ windowMs: 60_000, max: 1200, skip: (req) => !isPublicRead(req) }),
		general: limit({ windowMs: 60_000, max: 120, skip: (req) => isPublicRead(req) }),
		surveySubmit: limit({
			windowMs: 60 * 60_000,
			max: 30,
			message: { message: 'تعداد نظرسنجی‌های ارسالی از این شبکه زیاد بود؛ کمی بعد دوباره تلاش کن.' },
		}),
		// only failed attempts count: staff logging in correctly from the restaurant's shared IP never get locked out
		loginPerIp: limit({ windowMs: 15 * 60_000, max: 10, skipSuccessfulRequests: true, message: tooManyLogins }),
		loginPerUsername: limit({
			windowMs: 15 * 60_000,
			max: 20,
			skipSuccessfulRequests: true,
			message: tooManyLogins,
			keyGenerator: (req) => `user:${normalizeUsername(req.body?.username).slice(0, 64) || `ip:${req.ip ?? ''}`}`,
		}),
	};
}

/** The limits the server uses. Off in automated tests (every request comes from one IP); tested on their own. */
export const rateLimits = createRateLimits({ enabled: !config.isTest });
