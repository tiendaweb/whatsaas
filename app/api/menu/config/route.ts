import { NextResponse } from 'next/server';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { getTeamMenuOverrides, resolveMenuForTeam } from '@/lib/menu/service';

export async function GET() {
  const [team, user] = await Promise.all([getTeamForUser(), getUser()]);
  if (!team || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [overrides, resolved] = await Promise.all([
    getTeamMenuOverrides(team.id),
    resolveMenuForTeam(team.id, user.id),
  ]);

  return NextResponse.json({
    overrides,
    mainNav: resolved.mainNav,
    apps: resolved.apps,
  });
}
