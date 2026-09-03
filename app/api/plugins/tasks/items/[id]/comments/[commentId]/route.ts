import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskComments } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { eq, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { commentId } = await params;
  await db.delete(teamTaskComments)
    .where(and(eq(teamTaskComments.id, Number(commentId)), eq(teamTaskComments.teamId, ctx.team.id)));

  return NextResponse.json({ ok: true });
}
