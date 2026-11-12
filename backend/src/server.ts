import './timezone.js';
import http from 'http';
import { app } from './app.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';
import { IMAGE_STORES } from './lib/uploads.js';

const cleanupUploads = () => Promise.all(IMAGE_STORES.map((store) => store.cleanupStaleTemp()));
const uploadCleanup = setInterval(cleanupUploads, 6 * 60 * 60 * 1000);
uploadCleanup.unref();
// also once at startup: a server that is restarted often would otherwise never reach the first interval
void cleanupUploads();

const server = http.createServer(app);
// nginx keeps idle upstream connections up to 60 s; Node must keep them longer, or nginx sometimes sends a request
// on a connection Node has just closed (a random 502)
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.on('error', (error: NodeJS.ErrnoException) => {
	if (error.code === 'EADDRINUSE') console.error(`پورت ${config.port} از قبل در حال استفاده است؛ PORT را در .env عوض کن یا برنامه‌ی دیگر را ببند.`);
	else console.error('اجرای سرور ناموفق بود:', error);
	process.exit(1);
});

server.listen(config.port, config.host, () => {
	console.log(`Deniz API running on http://${config.host}:${config.port} (public address: ${config.appUrl})`);
	const secure = config.isProd || config.crossSiteCookie;
	console.log(`NODE_ENV=${config.nodeEnv} → کوکی‌ها secure=${secure} (روی http فقط با secure=false کار می‌کنند).`);
});

// a forgotten promise must not take the server down silently: it is logged (systemd then shows it in the journal)
process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	clearInterval(uploadCleanup);
	console.log(`${signal} دریافت شد؛ در حال بستن امنِ سرور...`);
	server.close(async () => {
		await prisma.$disconnect().catch((error) => console.error('قطع اتصال دیتابیس ناموفق بود:', error));
		process.exit(0);
	});
	// idle keep-alive connections would otherwise hold close() open until they time out
	server.closeIdleConnections();
	// اگه تا ۱۰ ثانیه درخواست‌ها تموم نشدن، به‌زور ببند
	setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
