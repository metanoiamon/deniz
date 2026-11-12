import { prisma } from '../lib/prisma.js';

// A handful of key/value settings, read only by the admin panel. Read straight from the database: a cache would
// add a stale-read race for no measurable gain.

export type Settings = Record<string, string>;

export async function getSettings(): Promise<Settings> {
	const rows = await prisma.setting.findMany();
	return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

export async function setSettings(values: Record<string, string>): Promise<void> {
	await prisma.$transaction(
		Object.entries(values).map(([key, value]) => prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })),
	);
}
