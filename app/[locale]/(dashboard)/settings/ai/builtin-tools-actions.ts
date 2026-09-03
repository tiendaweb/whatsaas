'use server';

import { getTeamForUser, getUser } from '@/lib/db/queries';
import { listBuiltinToolCatalog, setBuiltinToolEnabled } from '@/lib/plugins/ai-chat/builtin';

export async function getBuiltinAiTools() {
  const team = await getTeamForUser();
  if (!team) return [];
  return listBuiltinToolCatalog(team.id);
}

export async function toggleBuiltinAiTool(toolName: string, enabled: boolean) {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team) return { error: 'Unauthorized' };
  try {
    await setBuiltinToolEnabled({ teamId: team.id, toolName, enabled, userId: user?.id });
    return { success: true };
  } catch (error: any) {
    return { error: error?.message || 'Database error' };
  }
}
