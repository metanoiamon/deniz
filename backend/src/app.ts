import './timezone.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { Prisma } from '@prisma/client';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { authRouter } from './routes/auth.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { menuRouter } from './routes/menu.routes.js';
import { surveyRouter } from './routes/survey.routes.js';
import { IMAGE_STORES } from './lib/uploads.js';
import { cors, originGuard } from './middleware/cors.js';
import { rateLimits } from './middleware/rate-limits.js';

// API only: the menu page and the admin panel are separate frontends.
//   /api/...                         → JSON API
//   /uploads/products/..., /banners/ → images
//   /health                          → for the deploy script and monitoring
export const app = express();
// پشت nginx، بدون این تنظیم req.ip برای همه یکسان می‌شه و محدودیت درخواست همه را با هم می‌بندد
app.set('trust proxy', config.trustProxy);
// ?a[b]=1 must not turn into an object: every parameter is a plain string (or a list of them)
app.set('query parser', 'simple');
app.disable('x-powered-by');

app.use(
	helmet({
		// عکس‌ها از دامنه‌ی فرانت (که ممکنه با این سرور یکی نباشه) نمایش داده می‌شن
		crossOriginResourcePolicy: { policy: 'cross-origin' },
	}),
);
// در تست‌ها لاگ هر درخواست فقط خروجی را شلوغ می‌کند
if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));
app.use(cors);
app.use(
	express.json({
		limit: '1mb',
		// PostgreSQL cannot store the NUL character: a text containing it would fail the query with a 500
		reviver: (_key, value) => (typeof value === 'string' && value.includes('\u0000') ? value.replace(/\u0000/g, '') : value),
	}),
);
app.use(cookieParser());
app.use('/api', rateLimits.publicRead, rateLimits.general);

// public and it queries the database: limited like a menu read
app.get('/health', rateLimits.publicRead, async (_req, res) => {
	res.setHeader('Cache-Control', 'no-store');
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ ok: true, service: 'deniz', db: true });
	} catch {
		res.status(503).json({ ok: false, service: 'deniz', db: false });
	}
});

for (const store of IMAGE_STORES) {
	app.use(store.url, express.static(store.dir, { maxAge: config.isProd ? '7d' : 0, index: false, dotfiles: 'deny', fallthrough: true }));
}
app.use('/api/admin', (_req, res, next) => {
	res.setHeader('X-Robots-Tag', 'noindex, nofollow');
	// admin answers carry customers' data: never stored by a browser or proxy cache
	res.setHeader('Cache-Control', 'no-store');
	next();
});
app.use('/api', originGuard);

// IMPORTANT: `authRouter` must be registered before `adminRouter` so that
// `/api/admin/login` (in auth.routes) is matched before adminRouter's `requireAdmin` runs.
app.use('/api', authRouter);
app.use('/api', menuRouter);
app.use('/api', surveyRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => {
	res.status(404).json({ message: req.path.startsWith('/api') ? 'مسیر API پیدا نشد.' : 'مسیر پیدا نشد.' });
});

interface ErrorLike {
	type?: string;
	status?: number;
	statusCode?: number;
	message?: string;
}

/**
 * Database errors no route expected. Routes answer the ones they know with a precise message; this is the safety net
 * for a write that lost a race with another request (the row changed or disappeared in between), so the client gets a
 * clear 4xx instead of «server error».
 */
function databaseError(err: unknown): { status: number; message: string } | null {
	if (err instanceof Prisma.PrismaClientKnownRequestError) {
		switch (err.code) {
			case 'P2025':
				return { status: 404, message: 'موردی پیدا نشد؛ شاید همین الان حذف شده باشد.' };
			case 'P2002':
				return { status: 409, message: 'مورد تکراری است.' };
			case 'P2003':
			case 'P2034':
				return { status: 409, message: 'اطلاعات همین الان تغییر کرد؛ صفحه را تازه کن و دوباره تلاش کن.' };
		}
	}
	if (err instanceof Prisma.PrismaClientInitializationError || (err instanceof Prisma.PrismaClientKnownRequestError && /^P10\d\d$/.test(err.code))) {
		return { status: 503, message: 'سرویس موقتاً در دسترس نیست؛ کمی بعد دوباره تلاش کن.' };
	}
	return null;
}

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
	// the answer already started (e.g. a stream broke): Express can only close the connection
	if (res.headersSent) return next(err);
	const error: ErrorLike = typeof err === 'object' && err !== null ? (err as ErrorLike) : { message: String(err) };
	const db = databaseError(err);
	// JSON خراب در body یعنی خطای کاربر، نه خطای سرور
	const status = db?.status ?? (error.type === 'entity.parse.failed' ? 400 : error.status || error.statusCode || 500);
	if (status >= 500 || db) console.error(err);
	let message: string;
	if (db) message = db.message;
	else if (error.type === 'entity.parse.failed') message = 'بدنه‌ی درخواست JSON معتبر نیست.';
	else if (error.type === 'entity.too.large') message = 'حجم درخواست بیش از حد مجاز است.';
	// any other error of the body parser (unsupported encoding or charset, aborted upload…) has an English message
	else if (error.type) message = 'درخواست نامعتبر است.';
	else if (status < 500) message = error.message || 'درخواست نامعتبر است.';
	else message = config.isProd ? 'خطای داخلی سرور؛ کمی بعد دوباره تلاش کن.' : error.message || 'خطای داخلی سرور.';
	res.status(status).json({ message });
});
