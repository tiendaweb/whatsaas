/**
 * Roles de plataforma (users.role). La columna es varchar, no un pgEnum: el repo
 * ya escribe 'owner' desde signUp, así que había 3 valores de facto antes de esto.
 */
export const USER_ROLES = ['admin', 'owner', 'member', 'reseller'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isPlatformAdmin(user: { role?: string | null } | null | undefined) {
  return user?.role === 'admin';
}

export function isReseller(user: { role?: string | null } | null | undefined) {
  return user?.role === 'reseller';
}
