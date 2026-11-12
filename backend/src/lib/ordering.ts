// Ids from the URL / body, and lists the admin orders by hand (menu types, categories, products, banners, questions).

/** PostgreSQL `integer` (all our numeric ids): a bigger number would make the database query fail. */
export const MAX_DB_INT = 2_147_483_647;

/** A positive integer id that fits the database, or null. Accepts numbers and numeric strings ("12"). */
export function parseId(value: unknown): number | null {
	if (typeof value !== 'number' && typeof value !== 'string') return null;
	if (typeof value === 'string' && !/^\d{1,10}$/.test(value)) return null;
	const id = Number(value);
	return Number.isInteger(id) && id > 0 && id <= MAX_DB_INT ? id : null;
}

/**
 * Reads `ids` for a reorder request: it must name every id of `existing` exactly once (nothing missing,
 * nothing extra, no duplicates). Returns the ids in the new order, or null when the list is not valid.
 */
export function readFullOrder(raw: unknown, existing: readonly number[]): number[] | null {
	if (!Array.isArray(raw) || raw.length !== existing.length) return null;
	const ids = raw.map(parseId);
	if (!ids.every((id): id is number => id !== null)) return null;
	const wanted = new Set(existing);
	if (new Set(ids).size !== ids.length || !ids.every((id) => wanted.has(id))) return null;
	return ids;
}

/** sortOrder for a row added at the end of a list whose current maximum is `max` (null = empty list). */
export function nextSortOrder(max: number | null | undefined): number {
	return (max ?? -1) + 1;
}

/** `?page=&limit=` for admin lists. A page far beyond the data is pointless and could overflow the query offset. */
export function readPage(query: Record<string, unknown>, { defaultLimit, maxLimit }: { defaultLimit: number; maxLimit: number }) {
	const page = query.page === undefined ? 1 : parseId(query.page);
	const limit = query.limit === undefined ? defaultLimit : parseId(query.limit);
	if (page === null || limit === null || page > 100_000 || limit > maxLimit) return null;
	return { page, limit, skip: (page - 1) * limit };
}
