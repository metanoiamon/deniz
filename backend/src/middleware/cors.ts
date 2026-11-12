import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

// The frontend may live on another address than this API (CORS_ORIGINS in .env). Only those origins get CORS
// headers, with credentials, so the admin panel's login cookie travels with its requests.

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isAllowed(origin: string | undefined): origin is string {
	return Boolean(origin && config.corsOrigins.includes(origin));
}

export function cors(req: Request, res: Response, next: NextFunction): void {
	// the answer depends on Origin whenever CORS is configured: a cache (nginx, a CDN) must not reuse it for another site
	if (config.corsOrigins.length) res.vary('Origin');
	const origin = req.get('origin');
	if (isAllowed(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
		res.setHeader('Access-Control-Allow-Credentials', 'true');
		if (req.method === 'OPTIONS') {
			res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
			res.setHeader('Access-Control-Max-Age', '600');
			res.status(204).end();
			return;
		}
	}
	next();
}

/** The origin of this request's own address, as the browser sees it (behind nginx: from X-Forwarded-Proto and Host). */
function ownOrigin(req: Request): string | null {
	const host = req.get('host');
	return host ? `${req.protocol}://${host}` : null;
}

/**
 * CSRF guard for every write (POST / PUT / PATCH / DELETE): a browser always sends Origin with a write that a page
 * started, so a write whose Origin is neither this API's own address nor a frontend in CORS_ORIGINS came from a page
 * of some other site and is refused. A request without Origin is not a browser page of another site (curl, a server,
 * an old form-less client) and is not affected. This backs up the SameSite cookie: a sibling subdomain counts as the
 * same *site* for SameSite, and with ADMIN_COOKIE_CROSS_SITE the cookie is sent from every site.
 */
export function originGuard(req: Request, res: Response, next: NextFunction): void {
	if (SAFE_METHODS.has(req.method)) return next();
	const origin = req.get('origin');
	if (!origin || isAllowed(origin) || origin === ownOrigin(req)) return next();
	res.status(403).json({ message: 'درخواست از این آدرس مجاز نیست.' });
}
