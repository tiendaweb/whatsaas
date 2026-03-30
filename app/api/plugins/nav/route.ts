import { NextResponse } from 'next/server';
import { getTeamForUser } from '@/lib/db/queries';
import { resolveDashboardNavForTeam } from '@/lib/plugins/core/registry';

export async function GET() {
  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const navItems = await resolveDashboardNavForTeam(team.id);
  return NextResponse.json(navItems);
}
