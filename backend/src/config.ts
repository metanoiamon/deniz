import 'dotenv/config';

// Every setting from .env, checked once at startup. In production a missing or unsafe value stops the server
// with a clear message, instead of running half-configured.

const isProd = process.env.NODE_ENV === 'production';

/** "https://deniz.ir, https://admin.deniz.ir/" → ["https://deniz.ir", "https://admin.deniz.ir"] */
export function readOrigins(raw: string | undefined): string[] {
	if (!raw?.trim()) return [];
	return raw
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => {
			let url: URL;
			try {
				url = new URL(item);
			} catch {
				throw new Error(`CORS_ORIGINS: «${item}» یک آدرس معتبر نیست (مثال: https://deniz.ir).`);
			}
			if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`CORS_ORIGINS: «${item}» باید با http:// یا https:// شروع شود.`);
			if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
				throw new Error(`CORS_ORIGINS: «${item}» فقط باید پروتکل و دامنه باشد، بدون مسیر (مثال: https://deniz.ir).`);
			}
			return url.origin;
		});
}

/**
 * How many reverse proxies stand in front of the server (nginx = 1; a CDN in front of nginx = 2). Express then takes
 * the client's IP from X-Forwarded-For at that depth, so the rate limits count real customers, not the proxy.
 */
export function readTrustProxy(raw: string | undefined, production: boolean): number {
	if (raw === undefined || raw.trim() === '') return production ? 1 : 0;
	const hops = Number(raw);
	if (!Number.isInteger(hops) || hops < 0 || hops > 5) throw new Error('TRUST_PROXY باید عددی صحیح از ۰ تا ۵ باشد (تعداد پراکسی‌های جلوی سرور؛ با nginx: 1).');
	return hops;
}

const secret = process.env.ADMIN_JWT_SECRET ?? '';
if (isProd) {
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL باید در production تنظیم شود.');
	if (secret.length < 32) throw new Error('ADMIN_JWT_SECRET باید در production حداقل ۳۲ کاراکتر باشد (مثلاً خروجی: openssl rand -hex 32).');
	// the value from .env.example is public: anyone could sign admin tokens with it
	if (secret.startsWith('change-me')) throw new Error('ADMIN_JWT_SECRET هنوز مقدار نمونه‌ی .env.example است؛ یک مقدار تصادفی بگذار (openssl rand -hex 32).');
} else if (!secret) {
	console.warn('⚠️  هشدار: کلید JWT پیش‌فرض در حال استفاده است. این حالت فقط برای توسعه‌ی محلی امن است.');
} else if (secret.length < 32) {
	console.warn('⚠️  هشدار: ADMIN_JWT_SECRET کوتاه‌تر از ۳۲ کاراکتر است و به‌راحتی حدس زده می‌شود.');
}

const corsOrigins = readOrigins(process.env.CORS_ORIGINS);
const crossSiteCookie = process.env.ADMIN_COOKIE_CROSS_SITE === 'true';
if (crossSiteCookie && !corsOrigins.length) {
	throw new Error('ADMIN_COOKIE_CROSS_SITE=true بدون CORS_ORIGINS معنی ندارد؛ آدرس فرانت را در CORS_ORIGINS بنویس.');
}
if (crossSiteCookie && !isProd) {
	console.warn('⚠️  هشدار: کوکی cross-site فقط روی https کار می‌کند؛ در توسعه‌ی محلی (http) مرورگر آن را نمی‌پذیرد.');
}

const port = Number(process.env.PORT);

export const config = {
	port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000,
	/** Address to listen on. Behind nginx keep 127.0.0.1, so the API is reachable only through nginx. */
	host: process.env.HOST?.trim() || (isProd ? '127.0.0.1' : '0.0.0.0'),
	nodeEnv: process.env.NODE_ENV || 'development',
	appUrl: process.env.APP_URL || 'http://localhost:3000',
	adminJwtSecret: secret || 'dev-admin-secret-change-me',
	trustProxy: readTrustProxy(process.env.TRUST_PROXY, isProd),
	/** Frontend origins allowed to call this API from the browser. Empty = frontend and API on the same address. */
	corsOrigins,
	/**
	 * The admin panel is on a different *site* than the API (e.g. a vercel.app domain), not just another subdomain:
	 * the admin cookie must then be SameSite=None (https only).
	 */
	crossSiteCookie,
	isProd,
	isTest: process.env.NODE_ENV === 'test',
} as const;
