import 'server-only';

import { getTeamForUser, getUser } from '@/lib/db/queries';
import { assertDashboardAccess, type GrokTarget } from './oauth';

export async function getGrokDashboardTarget(): Promise<GrokTarget | null> {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) return null;
  if (!(await assertDashboardAccess(team.id, user.id, user.email))) return null;
  return { teamId: team.id, userId: user.id, email: user.email };
}
