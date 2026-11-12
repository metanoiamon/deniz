import bcrypt from 'bcryptjs';
import { faDigits } from './text.js';

// bcrypt only uses the first 72 BYTES of a password and silently ignores the rest: with a longer password, two
// passwords that share their first 72 bytes are the same password. A Persian letter is 2 bytes in UTF-8, so the
// limit is checked in bytes, not characters.
export const PASSWORD_MIN_CHARS = 8;
export const PASSWORD_MAX_BYTES = 72;
const COST = 10;

/** An error message, or null when the password is acceptable. */
export function passwordProblem(password: unknown): string | null {
	if (typeof password !== 'string') return 'رمز عبور نامعتبر است.';
	if (password.length < PASSWORD_MIN_CHARS) return `رمز عبور باید حداقل ${faDigits(PASSWORD_MIN_CHARS)} کاراکتر باشد.`;
	if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
		return 'رمز عبور خیلی طولانی است (حداکثر ۷۲ بایت: حدود ۷۰ حرف انگلیسی یا ۳۶ حرف فارسی).';
	}
	return null;
}

export function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

// A real bcrypt hash (60 characters, same cost) of a random string: comparing against it when the username does
// not exist takes as long as a real check, so response times do not reveal which usernames exist.
export const DUMMY_PASSWORD_HASH = '$2b$10$aSeBTOggmRzaYYKHqHDz2eQPrC5Eacr6fNxBub.SHZAKJ3gq1ahba';
