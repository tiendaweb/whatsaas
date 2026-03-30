import { getTeamForUser, getUser, getUserMembership } from '@/lib/db/queries';
import type { MemberPermissions } from '@/lib/permissions';

export async function getPluginRequestContext(requiredPermission: keyof Omit<MemberPermissions, 'chatVisibility'>) {
  const [team, user, membership] = await Promise.all([getTeamForUser(), getUser(), getUserMembership()]);

  if (!team || !user || !membership) {
    return { ok: false as const, status: 401, message: 'Unauthorized' };
  }

  if (membership.role !== 'owner' && membership.role !== 'admin' && membership.permissions?.[requiredPermission] !== true) {
    return { ok: false as const, status: 403, message: 'Forbidden' };
  }

  return { ok: true as const, team, user, membership };
}
