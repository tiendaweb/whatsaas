import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskProjects, teamTaskWorkspaces } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { and, eq, ne } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const body = await req.json();
  const { name, aiPrompt, order, color, icon } = body;

  const [updated] = await db.update(teamTaskWorkspaces)
    .set({
      ...(name !== undefined && { name: String(name).trim() || 'Workspace' }),
      ...(aiPrompt !== undefined && { aiPrompt: String(aiPrompt ?? '').slice(0, 20000) }),
      ...(order !== undefined && { order: Number(order) }),
      ...(color !== undefined && { color: color || null }),
      ...(icon !== undefined && { icon: icon || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(teamTaskWorkspaces.id, Number(id)), eq(teamTaskWorkspaces.teamId, ctx.team.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const targetId = Number(id);
  const replacement = await db.query.teamTaskWorkspaces.findFirst({
    where: and(eq(teamTaskWorkspaces.teamId, ctx.team.id), ne(teamTaskWorkspaces.id, targetId)),
    orderBy: (t, { asc }) => [asc(t.order), asc(t.createdAt)],
  });

  if (!replacement) return NextResponse.json({ error: 'Cannot delete the last workspace' }, { status: 400 });

  await db.update(teamTaskProjects)
    .set({ workspaceId: replacement.id, updatedAt: new Date() })
    .where(and(eq(teamTaskProjects.teamId, ctx.team.id), eq(teamTaskProjects.workspaceId, targetId)));

  await db.delete(teamTaskWorkspaces)
    .where(and(eq(teamTaskWorkspaces.id, targetId), eq(teamTaskWorkspaces.teamId, ctx.team.id)));

  return NextResponse.json({ ok: true, replacementWorkspaceId: replacement.id });
}
