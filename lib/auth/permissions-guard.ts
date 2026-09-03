import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { hasPermission, canSeeAllChats, getChatVisibility, getPermissions, type PermissionResource, type MemberPermissions, type ChatVisibility } from '@/lib/permissions';

export type PermissionContext = {
  userId: number;
  teamId: number;
  role: string;
  permissions: MemberPermissions;
  canSeeAllChats: boolean;
  chatVisibility: ChatVisibility;
};

export async function checkRoutePermission(
  resource: PermissionResource
): Promise<{ error?: NextResponse; context?: PermissionContext }> {
  const user = await getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const membership = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
  });

  if (!membership) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const perms = getPermissions(membership.role, membership.permissions);

  if (!hasPermission(membership.role, membership.permissions, resource)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return {
    context: {
      userId: user.id,
      teamId: membership.teamId,
      role: membership.role,
      permissions: perms,
      canSeeAllChats: canSeeAllChats(membership.role, membership.permissions),
      chatVisibility: getChatVisibility(membership.role, membership.permissions),
    },
  };
}

export async function getUserPermissionContext(): Promise<PermissionContext | null> {
  const user = await getUser();
  if (!user) return null;

  const membership = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
  });

  if (!membership) return null;

  const perms = getPermissions(membership.role, membership.permissions);

  return {
    userId: user.id,
    teamId: membership.teamId,
    role: membership.role,
    permissions: perms,
    canSeeAllChats: canSeeAllChats(membership.role, membership.permissions),
    chatVisibility: getChatVisibility(membership.role, membership.permissions),
  };
}

/**
 * El mismo `PermissionContext`, pero armado sin sesión.
 *
 * Los conectores MCP corren con `{ teamId, userId }` y nada más: no hay cookies,
 * no hay `getUser()`. Sin esto, todo lo que vive detrás de un `PermissionContext`
 * —Escritorio, Centro de Comandos, `chatScope`— queda fuera del alcance de una IA
 * aunque la lógica de negocio ya esté extraída y sea pura.
 *
 * A diferencia de `getUserPermissionContext`, la membresía se busca por
 * `(teamId, userId)`: un usuario en dos equipos acá no puede resolver al equipo
 * equivocado. Devuelve `null` si esa membresía no existe, que es la única forma
 * de que un token de un equipo toque datos de otro.
 */
export async function buildPermissionContext(
  teamId: number,
  userId: number,
): Promise<PermissionContext | null> {
  if (!Number.isInteger(teamId) || teamId <= 0 || !Number.isInteger(userId) || userId <= 0) return null;

  const membership = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)),
  });

  if (!membership) return null;

  return {
    userId,
    teamId,
    role: membership.role,
    permissions: getPermissions(membership.role, membership.permissions),
    canSeeAllChats: canSeeAllChats(membership.role, membership.permissions),
    chatVisibility: getChatVisibility(membership.role, membership.permissions),
  };
}
