import fs from 'fs/promises';
import path from 'path';
import { randomInt } from 'crypto';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { UPLOADS_DIR } from './paths.js';
import { HttpError, createHttpError } from './http-error.js';

// Uploaded images live in uploads/<folder>/ (outside the source, so a deploy never overwrites them and they are
// never committed) and are served at /uploads/<folder>/. A fresh upload is named temp-…; once a record really uses
// it, it is renamed to its permanent name, so the stale-temp cleanup never deletes it.

export const PLACEHOLDER_IMAGE = 'placeholder.png';
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Map, not a plain object: a mimetype such as "constructor" must not match an Object.prototype key
const ALL_TYPES = new Map([
	['image/jpeg', 'jpg'],
	['image/png', 'png'],
	['image/webp', 'webp'],
	['image/gif', 'gif'],
]);

// Magic numbers: the browser-supplied mimetype is not trusted on its own.
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
	jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
	gif: (b) => b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a',
	webp: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};

export class ImageStore {
	readonly dir: string;
	readonly url: string;
	private readonly safeName: RegExp;
	private readonly types: Map<string, string>;
	private readonly allowPlaceholder: boolean;

	constructor(folder: string, { extensions, allowPlaceholder }: { extensions: readonly string[]; allowPlaceholder: boolean }) {
		this.dir = path.join(UPLOADS_DIR, folder);
		this.url = `/uploads/${folder}/`;
		this.types = new Map([...ALL_TYPES].filter(([, ext]) => extensions.includes(ext)));
		// Only names the server itself generated are accepted (no paths, no dot tricks).
		this.safeName = new RegExp(`^(temp-)?\\d{10,16}-\\d{1,10}\\.(${extensions.join('|')})$`);
		this.allowPlaceholder = allowPlaceholder;
	}

	/** Human-readable list of the accepted formats, for error messages. */
	get formats(): string {
		return [...this.types.values()].join('، ');
	}

	isSafeName(name: unknown): name is string {
		return typeof name === 'string' && ((this.allowPlaceholder && name === PLACEHOLDER_IMAGE) || this.safeName.test(name));
	}

	isTemp(name: unknown): name is string {
		return typeof name === 'string' && name.startsWith('temp-') && this.safeName.test(name);
	}

	async exists(name: string): Promise<boolean> {
		if (this.allowPlaceholder && name === PLACEHOLDER_IMAGE) return true;
		try {
			await fs.access(path.join(this.dir, name));
			return true;
		} catch {
			return false;
		}
	}

	async remove(name: string | null | undefined): Promise<void> {
		if (!name || name === PLACEHOLDER_IMAGE || !this.safeName.test(name)) return;
		await fs.unlink(path.join(this.dir, name)).catch(() => {});
	}

	/**
	 * Gives a temp upload its permanent name. Two requests using the same upload at once: the second finds the file
	 * gone and gets a 400, never a 500.
	 */
	async promote(name: string): Promise<string> {
		if (!this.isTemp(name)) return name;
		const finalName = name.slice('temp-'.length);
		try {
			await fs.rename(path.join(this.dir, name), path.join(this.dir, finalName));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new HttpError(400, 'فایل تصویر پیدا نشد؛ دوباره آپلود کن.');
			throw error;
		}
		return finalName;
	}

	/**
	 * Saves a record that takes a new image: the upload is promoted first, and if saving then fails for any reason
	 * the promoted file is deleted again (otherwise it would stay on disk forever: the cleanup only removes temp files).
	 */
	async saveWithImage<T>(image: string | undefined, save: (finalName: string | undefined) => Promise<T>): Promise<T> {
		const finalName = image === undefined ? undefined : await this.promote(image);
		try {
			return await save(finalName);
		} catch (error) {
			if (finalName && finalName !== image) await this.remove(finalName);
			throw error;
		}
	}

	/** Deletes temp uploads older than a day that nothing ended up using. */
	async cleanupStaleTemp(): Promise<void> {
		try {
			const files = await fs.readdir(this.dir);
			const cutoff = Date.now() - 24 * 60 * 60 * 1000;
			await Promise.all(
				files
					.filter((file) => this.isTemp(file))
					.map(async (file) => {
						const stats = await fs.stat(path.join(this.dir, file));
						if (stats.mtimeMs < cutoff) await fs.unlink(path.join(this.dir, file)).catch(() => {});
					}),
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
			console.error('پاک‌سازی آپلودهای موقت ناموفق بود:', error instanceof Error ? error.message : error);
		}
	}

	/**
	 * POST handler: one file in the multipart field `image` → `{ filename }` (a temp name to send with the record).
	 * The real file content is checked, not only what the browser claims.
	 */
	uploadHandler(): RequestHandler {
		const upload = multer({
			storage: multer.diskStorage({
				destination: async (_req, _file, cb) => {
					try {
						await fs.mkdir(this.dir, { recursive: true });
						cb(null, this.dir);
					} catch (error) {
						cb(error as Error, this.dir);
					}
				},
				// temp files are reachable by URL until used, so the name must not be guessable
				filename: (_req, file, cb) => {
					cb(null, `temp-${Date.now()}-${randomInt(1, 2_147_483_647)}.${this.types.get(file.mimetype) ?? 'jpg'}`);
				},
			}),
			fileFilter: (_req, file, cb) => {
				if (this.types.has(file.mimetype)) return cb(null, true);
				cb(createHttpError(400, `فقط فایل تصویری مجاز است (${this.formats}).`));
			},
			limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 5, parts: 6, fieldSize: 1024, headerPairs: 50 },
		});
		return (req, res, next) => {
			upload.single('image')(req, res, async (error: unknown) => {
				if (error) {
					if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
						return res.status(413).json({ message: 'حجم فایل بیشتر از ۵ مگابایت است.' });
					}
					if (error instanceof multer.MulterError) return res.status(400).json({ message: 'فایل آپلودشده نامعتبر است.' });
					return next(error);
				}
				try {
					if (!req.file) return res.status(400).json({ message: 'فایلی ارسال نشد.' });
					if (!(await fileMatchesExtension(req.file.path))) {
						await fs.unlink(req.file.path).catch(() => {});
						return res.status(400).json({ message: 'محتوای فایل یک تصویر معتبر نیست.' });
					}
					this.cleanupStaleTemp();
					res.json({ filename: req.file.filename });
				} catch (err) {
					if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
					next(err);
				}
			});
		};
	}

	/**
	 * Validates an image name sent with a record: only a fresh upload, the record's current image or (where allowed)
	 * the placeholder. Pointing at another record's file is refused: deleting one record would delete the shared file.
	 */
	async checkChosen(image: unknown, currentImage: string | null): Promise<string | null> {
		if (!this.isSafeName(image)) return 'نام فایل تصویر نامعتبر است.';
		if (image !== PLACEHOLDER_IMAGE && image !== currentImage && !this.isTemp(image)) {
			return 'تصویر باید از طریق آپلود همین فرم انتخاب شود.';
		}
		if (!(await this.exists(image))) return 'فایل تصویر پیدا نشد؛ دوباره آپلود کن.';
		return null;
	}
}

export async function fileMatchesExtension(filePath: string): Promise<boolean> {
	const ext = path.extname(filePath).slice(1);
	const check = SIGNATURES[ext];
	if (!check) return false;
	const handle = await fs.open(filePath, 'r');
	try {
		const buffer = Buffer.alloc(16);
		await handle.read(buffer, 0, 16, 0);
		return check(buffer);
	} finally {
		await handle.close();
	}
}

export const productImages = new ImageStore('products', { extensions: ['jpg', 'png', 'webp', 'gif'], allowPlaceholder: true });
// gif is left out on purpose: an animated banner is heavy for a phone on mobile data
export const bannerImages = new ImageStore('banners', { extensions: ['jpg', 'png', 'webp'], allowPlaceholder: false });
export const IMAGE_STORES = [productImages, bannerImages] as const;
