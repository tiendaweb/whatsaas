import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMemberPlugins } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { RADAR_PLUGIN_ID, isRadarUserEmail } from '@/lib/plugins/radar/shared/constants';

export type RadarTarget = { teamId: number; userId: number; email: string };

/**
 * Mismo patrón que getChatGPTDashboardTarget / getGrokTarget: el plugin Radar
 * solo funciona para noelia@whatspro.uno, y además tiene que estar habilitado
 * para su usuario en team_member_plugins (activationMode: 'user').
 */
export async function getRadarTarget(): Promise<RadarTarget | null> {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user || !isRadarUserEmail(user.email)) return null;

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
