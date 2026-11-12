import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

// Rules that span several rows ("at most 10 active banners", "at least one active developer", "one comment question")
// cannot be guarded by a unique index. Two requests that both check the rule and then write would both pass. Each
// such rule runs inside a transaction that first takes a PostgreSQL advisory lock, so the check and the write happen
// one request at a time. The lock is released automatically when the transaction ends (commit, rollback or crash),
// and it also works when several server processes share the database.

export const LOCKS = {
	/** Admin accounts: the last active developer. */
	admins: 41_001,
	/** Banners: the active limit. */
	banners: 41_002,
	/**
	 * Survey structure. Changing questions / options takes it exclusively; a customer's submission takes it shared
	 * (submissions never wait for each other, only for a structure change in progress).
	 */
	survey: 41_003,
} as const;

export type LockName = keyof typeof LOCKS;

/** Runs `work` in a transaction that holds the advisory lock `name` (exclusive, or shared with `shared: true`). */
export function withLock<T>(name: LockName, work: (tx: Prisma.TransactionClient) => Promise<T>, { shared = false }: { shared?: boolean } = {}): Promise<T> {
	const key = LOCKS[name];
	return prisma.$transaction(
		async (tx) => {
			if (shared) await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(${key}::bigint)`;
			else await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key}::bigint)`;
			return work(tx);
		},
		// waiting for the lock counts against maxWait / timeout, so a stuck holder cannot hang requests forever
		{ maxWait: 10_000, timeout: 20_000 },
	);
}
