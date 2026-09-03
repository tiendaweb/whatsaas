import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, departmentMembers, teamMemberPlugins } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import type { PermissionContext } from '@/lib/auth/permissions-guard';
import { RADAR_PLUGIN_ID } from '@/lib/plugins/radar/shared/constants';

export type RadarTarget = { teamId: number; userId: number; email: string };

/**
 * Radar funciona para cualquier miembro que lo tenga habilitado en
 * `team_member_plugins` (el manifiesto declara `activationMode: 'user'`).
 * Antes había además un candado por email que dejaba afuera al resto del
 * equipo aunque tuvieran el plugin activo.
 */
export async function getRadarTarget(): Promise<RadarTarget | null> {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return null;

  const assignment = await db.query.teamMemberPlugins.findFirst({
    where: and(
      eq(teamMemberPlugins.teamId, team.id),
      eq(teamMemberPlugins.userId, user.id),
      eq(teamMemberPlugins.pluginId, RADAR_PLUGIN_ID),
      eq(teamMemberPlugins.enabled, true),
    ),
    columns: { id: true },
  });

  return assignment ? { teamId: team.id, userId: user.id, email: user.email } : null;
}

/**
 * Control de acceso a un contacto puntual, compartido por todas las rutas de
 * Radar que abren la ficha de un cliente. Vive acá (y no duplicado en cada
 * route handler) porque cualquier divergencia entre copias es una fuga de
 * datos entre agentes: la regla de visibilidad tiene que ser una sola.
 */
export type RadarContactAccess = {
  contact: {
    id: number;
    chatId: number;
    name: string | null;
    customData: unknown;
    assignedUserId: number | null;
    assignedDepartmentId: number | null;
  } | null;
  allowed: boolean;
};

export async function userCanAccessContact(
  contactId: number,
  permCtx: PermissionContext,
): Promise<RadarContactAccess> {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, permCtx.teamId)),
    columns: {
      id: true,
      chatId: true,
      name: true,
      customData: true,
      assignedUserId: true,
      assignedDepartmentId: true,
    },
  });

  if (!contact) return { contact: null, allowed: false };
  if (permCtx.canSeeAllChats) return { contact, allowed: true };
  if (contact.assignedUserId === permCtx.userId) return { contact, allowed: true };

  if (permCtx.chatVisibility === 'department' && contact.assignedDepartmentId) {
    const memberships = await db.query.departmentMembers.findMany({
      where: eq(departmentMembers.userId, permCtx.userId),
      columns: { departmentId: true },
    });
    const departmentIds = memberships.map((m) => m.departmentId);
    return { contact, allowed: departmentIds.includes(contact.assignedDepartmentId) };
  }

  return { contact, allowed: false };
}
