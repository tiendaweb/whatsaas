import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskRelations } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  await db.delete(teamTaskRelations).where(
    and(
      eq(teamTaskRelations.id, Number(id)),
      eq(teamTaskRelations.teamId, ctx.team.id),
    ),
  );

  return NextResponse.json({ ok: true });
}
