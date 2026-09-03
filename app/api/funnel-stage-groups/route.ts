import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { funnelStageGroups } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const groups = await db.query.funnelStageGroups.findMany({
      where: eq(funnelStageGroups.teamId, team.id),
      orderBy: (funnelStageGroups, { asc }) => [asc(funnelStageGroups.order)],
    });

    return NextResponse.json(groups);
  } catch (error: any) {
    console.error('Failed to fetch funnel stage groups:', error.message);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, description } = await request.json();
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

    const existing = await db.query.funnelStageGroups.findMany({
      where: eq(funnelStageGroups.teamId, team.id),
    });

    const [newGroup] = await db.insert(funnelStageGroups)
      .values({
        teamId: team.id,
        name,
        description: description || null,
        order: existing.length + 1,
      })
      .returning();

    return NextResponse.json(newGroup, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to create group.' }, { status: 500 });
  }
}
