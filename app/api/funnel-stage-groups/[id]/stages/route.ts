import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { funnelStageGroups, funnelStageGroupMembers, funnelStages } from '@/lib/db/schema';
import { eq, and, inArray, max } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// GET: list stages in this group ordered by group-specific order
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const groupId = parseInt(id);

    const group = await db.query.funnelStageGroups.findFirst({
      where: and(eq(funnelStageGroups.id, groupId), eq(funnelStageGroups.teamId, team.id)),
    });
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const members = await db.query.funnelStageGroupMembers.findMany({
      where: eq(funnelStageGroupMembers.groupId, groupId),
      orderBy: (m, { asc }) => [asc(m.order)],
      with: { stage: true },
    });

    const stages = members.map(m => ({ ...m.stage, groupOrder: m.order, memberId: m.id }));
    return NextResponse.json(stages);
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST: add existing stage(s) to group
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const groupId = parseInt(id);
    const { stageIds } = await request.json();

    if (!stageIds || !Array.isArray(stageIds) || stageIds.length === 0) {
      return NextResponse.json({ error: 'stageIds required' }, { status: 400 });
    }

    const group = await db.query.funnelStageGroups.findFirst({
      where: and(eq(funnelStageGroups.id, groupId), eq(funnelStageGroups.teamId, team.id)),
    });
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Verify all stages belong to this team
    const validStages = await db.query.funnelStages.findMany({
      where: and(eq(funnelStages.teamId, team.id), inArray(funnelStages.id, stageIds)),
    });
    if (validStages.length !== stageIds.length) {
      return NextResponse.json({ error: 'Invalid stage IDs' }, { status: 400 });
    }

    // Get current max order in this group
    const [maxResult] = await db
      .select({ max: max(funnelStageGroupMembers.order) })
      .from(funnelStageGroupMembers)
      .where(eq(funnelStageGroupMembers.groupId, groupId));

    let nextOrder = (maxResult?.max ?? 0) + 1;

    const values = stageIds.map((stageId: number) => ({
      groupId,
      stageId,
      order: nextOrder++,
    }));

    await db.insert(funnelStageGroupMembers)
      .values(values)
      .onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
