import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { funnelStageGroups, funnelStageGroupMembers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const groupId = parseInt(id);
    const { stages } = await request.json();

    const group = await db.query.funnelStageGroups.findFirst({
      where: and(eq(funnelStageGroups.id, groupId), eq(funnelStageGroups.teamId, team.id)),
    });
    if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await Promise.all(
      stages.map((s: { stageId: number; order: number }) =>
        db.update(funnelStageGroupMembers)
          .set({ order: s.order })
          .where(
            and(
              eq(funnelStageGroupMembers.groupId, groupId),
              eq(funnelStageGroupMembers.stageId, s.stageId),
            )
          )
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
