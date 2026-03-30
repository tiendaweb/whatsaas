import { NextResponse } from 'next/server';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { resolveDashboardNavForTeam } from '@/lib/plugins/core/registry';

export async function GET() {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const navItems = await resolveDashboardNavForTeam(team.id, user.id);
  return NextResponse.json(navItems);
}
