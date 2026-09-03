import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamScheduledMessages } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { computeNextRunAt } from '@/lib/plugins/scheduled-messages/schedule';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('scheduledMessagesWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const msgId = parseInt(id, 10);
  if (isNaN(msgId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await db.query.teamScheduledMessages.findFirst({
    where: and(eq(teamScheduledMessages.id, msgId), eq(teamScheduledMessages.teamId, ctx.team.id)),
  });

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Toggle: active <-> paused (don't toggle completed/failed)
  const currentStatus = existing.status;
  if (currentStatus === 'completed' || currentStatus === 'failed') {
    return NextResponse.json({ error: 'Cannot toggle a completed or failed message' }, { status: 400 });
  }

  const newStatus = currentStatus === 'active' ? 'paused' : 'active';

  // If reactivating, recompute nextRunAt
  const nextRunAt = newStatus === 'active'
    ? computeNextRunAt({
        scheduleType: existing.scheduleType,
        scheduledAt: existing.scheduledAt,
        hour: existing.hour,
        minute: existing.minute,
        weekdays: existing.weekdays as number[],
      })
    : existing.nextRunAt;

  const [updated] = await db
    .update(teamScheduledMessages)
    .set({ status: newStatus, nextRunAt, updatedAt: new Date() })
    .where(and(eq(teamScheduledMessages.id, msgId), eq(teamScheduledMessages.teamId, ctx.team.id)))
    .returning();

  return NextResponse.json(updated);
}
