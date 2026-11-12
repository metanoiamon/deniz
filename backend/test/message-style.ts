/**
 * The style of a Persian message the API answers with, or null when it is fine: a full sentence (ends with . ! or ؟)
 * and numbers in Persian digits. Text inside «» is quoted user input (a question title, a setting name) and may hold
 * anything.
 */
export function messageStyleProblem(message: string): string | null {
	const text = message.trim();
	if (!/[.!؟]$/.test(text)) return 'does not end with . ! or ؟';
	if (/[0-9]/.test(text.replace(/«[^»]*»/g, ''))) return 'has Latin digits (use faDigits)';
	return null;
}
