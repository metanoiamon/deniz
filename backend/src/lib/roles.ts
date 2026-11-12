// Single place that decides who may do what in the admin panel.
// DEVELOPER: the template owner. Full access; the only role that manages developer accounts.
// MAIN:      restaurant manager. Everything except developer accounts.
// SECONDARY: restaurant staff. Categories, products and survey responses.
import type { AdminRole } from '@prisma/client';

export const ADMIN_ROLES: readonly AdminRole[] = ['DEVELOPER', 'MAIN', 'SECONDARY'];

export const ROLE_GROUPS = {
	// dashboard, settings, admin accounts, menu types (tabs), banners, survey questions / statistics / export
	manager: ['DEVELOPER', 'MAIN'],
	// categories, products, survey responses (read, publish, reply)
	staff: ['DEVELOPER', 'MAIN', 'SECONDARY'],
} as const satisfies Record<string, readonly AdminRole[]>;

export type RoleGroup = keyof typeof ROLE_GROUPS;

export function isAdminRole(value: unknown): value is AdminRole {
	return typeof value === 'string' && (ADMIN_ROLES as readonly string[]).includes(value);
}

export function hasRole(admin: { role: AdminRole } | null | undefined, group: RoleGroup): boolean {
	return Boolean(admin && (ROLE_GROUPS[group] as readonly AdminRole[]).includes(admin.role));
}

/** Can `actor` create/edit/delete an admin account that has (or will have) `targetRole`? */
export function canManageRole(actor: { role: AdminRole } | null | undefined, targetRole: AdminRole): boolean {
	if (!actor) return false;
	if (actor.role === 'DEVELOPER') return true;
	if (actor.role === 'MAIN') return targetRole !== 'DEVELOPER';
	return false;
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export function normalizeUsername(value: unknown): string {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
