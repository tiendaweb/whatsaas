import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskItems, teamTaskMedia, teamTaskProjects, teamTaskRelations, teamTaskWorkspaces } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { and, eq, inArray, or } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const body = await req.json();
  const { name, aiPrompt, backgroundUrl, labels, order, workspaceId, color, icon } = body;
  const cleanName = typeof name === 'string' ? name.trim() : name;
  const nextWorkspaceId = workspaceId !== undefined && workspaceId !== null && workspaceId !== ''
    ? Number(workspaceId)
    : null;

  if (name !== undefined && !cleanName) {
    return NextResponse.json({ error: 'Project name required' }, { status: 400 });
  }

  if (nextWorkspaceId) {
    const workspace = await db.query.teamTaskWorkspaces.findFirst({
      where: and(eq(teamTaskWorkspaces.id, nextWorkspaceId), eq(teamTaskWorkspaces.teamId, ctx.team.id)),
      columns: { id: true },
    });
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const [updated] = await db.update(teamTaskProjects)
    .set({
      ...(name !== undefined && { name: cleanName }),
      ...(aiPrompt !== undefined && { aiPrompt: String(aiPrompt ?? '').slice(0, 20000) }),
      ...(backgroundUrl !== undefined && { backgroundUrl }),
      ...(labels !== undefined && { labels }),
      ...(order !== undefined && { order }),
      ...(workspaceId !== undefined && { workspaceId: nextWorkspaceId }),
      ...(color !== undefined && { color: color || null }),
      ...(icon !== undefined && { icon: icon || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(teamTaskProjects.id, Number(id)), eq(teamTaskProjects.teamId, ctx.team.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const projectId = Number(id);
  const project = await db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.id, projectId), eq(teamTaskProjects.teamId, ctx.team.id)),
    columns: { id: true },
  });

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const tasks = await db.query.teamTaskItems.findMany({
    where: and(eq(teamTaskItems.projectId, projectId), eq(teamTaskItems.teamId, ctx.team.id)),
    columns: { id: true },
  });
  const taskIds = tasks.map((task) => task.id);

  const relationClauses = [
    and(eq(teamTaskRelations.sourceType, 'project'), eq(teamTaskRelations.sourceId, projectId)),
    and(eq(teamTaskRelations.targetType, 'project'), eq(teamTaskRelations.targetId, projectId)),
  ];
  if (taskIds.length > 0) {
    relationClauses.push(
      and(eq(teamTaskRelations.sourceType, 'task'), inArray(teamTaskRelations.sourceId, taskIds)),
      and(eq(teamTaskRelations.targetType, 'task'), inArray(teamTaskRelations.targetId, taskIds)),
    );
  }

  await db.delete(teamTaskRelations)
    .where(and(eq(teamTaskRelations.teamId, ctx.team.id), or(...relationClauses)));

  await db.delete(teamTaskMedia)
    .where(and(eq(teamTaskMedia.teamId, ctx.team.id), eq(teamTaskMedia.ownerType, 'project'), eq(teamTaskMedia.ownerId, projectId)));

  if (taskIds.length > 0) {
    await db.delete(teamTaskMedia)
      .where(and(eq(teamTaskMedia.teamId, ctx.team.id), eq(teamTaskMedia.ownerType, 'task'), inArray(teamTaskMedia.ownerId, taskIds)));
  }

  await db.delete(teamTaskProjects)
    .where(and(eq(teamTaskProjects.id, projectId), eq(teamTaskProjects.teamId, ctx.team.id)));

  return NextResponse.json({ ok: true });
}
