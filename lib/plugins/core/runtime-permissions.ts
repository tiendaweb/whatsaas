import { getTeamForUser, getUser, getUserMembership } from '@/lib/db/queries';
import type { MemberPermissions } from '@/lib/permissions';
import { hasPermission } from '@/lib/permissions';

export async function getPluginRequestContext(requiredPermission: keyof Omit<MemberPermissions, 'chatVisibility'>) {
  const [team, user, membership] = await Promise.all([getTeamForUser(), getUser(), getUserMembership()]);

  if (!team || !user || !membership) {
    return { ok: false as const, status: 401, message: 'Unauthorized' };
  }

  // Los permisos guardados pueden ser anteriores a una clave nueva. La misma
  // resolución canónica que usa el resto de la app mezcla el preset del rol;
  // mirar el JSON crudo dejaba a agentes sin `tasksRead` aunque su rol sí lo
  // concediera, y producía diferencias entre navegación, API y conectores.
  if (!hasPermission(membership.role, membership.permissions, requiredPermission)) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }

  return { ok: true as const, team, user, membership };
}
