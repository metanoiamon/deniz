/** 0–9 → ۰–۹: numbers inside the Persian messages the API answers with are written in Persian digits. */
export function faDigits(value: number | string): string {
	return String(value).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/** Persian (۰–۹) and Arabic-Indic (٠–٩) digits → 0–9. Phone keyboards in Iran often type these. */
export function latinDigits(value: string): string {
	return value.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** An Iranian mobile number in any common spelling (+98…, 0098…, 9…, Persian digits) → 09xxxxxxxxx, or '' when invalid. */
export function normalizePhone(phone: unknown): string {
	let p = latinDigits(String(phone ?? ''))
		.trim()
		.replace(/[^0-9+]/g, '');
	if (p.startsWith('+98')) p = '0' + p.slice(3);
	else if (p.startsWith('0098')) p = '0' + p.slice(4);
	else if (p.startsWith('98') && p.length === 12) p = '0' + p.slice(2);
	else if (p.length === 10 && p.startsWith('9')) p = '0' + p;
	return /^09\d{9}$/.test(p) ? p : '';
}

/** "YYYY-MM-DD" that is a real calendar date. */
export function isValidDateString(value: unknown): value is string {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	const d = new Date(year, month - 1, day);
	return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/** "YYYY-MM-DD HH:mm" in the server's time zone (Asia/Tehran). */
export function localDateTime(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
