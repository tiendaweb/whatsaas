import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMemberPlugins } from '@/lib/db/schema';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import type { GrokTarget } from '@/lib/plugins/grok-connector/server/oauth';

export const CHATGPT_CONNECTOR_PLUGIN_ID = 'chatgpt-connector';
export const CHATGPT_TARGET_EMAIL = 'noelia@whatspro.uno';

export async function getChatGPTDashboardTarget(): Promise<GrokTarget | null> {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user || user.email.trim().toLowerCase() !== CHATGPT_TARGET_EMAIL) return null;

  const assignment = await db.query.teamMemberPlugins.findFirst({
    where: and(
      eq(teamMemberPlugins.teamId, team.id),
      eq(teamMemberPlugins.userId, user.id),
      eq(teamMemberPlugins.pluginId, CHATGPT_CONNECTOR_PLUGIN_ID),
      eq(teamMemberPlugins.enabled, true),
    ),
    columns: { id: true },
  });

  return assignment ? { teamId: team.id, userId: user.id, email: user.email } : null;
}
