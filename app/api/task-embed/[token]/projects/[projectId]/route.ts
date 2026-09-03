import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskProjects } from '@/lib/db/schema';
import { getManageEmbedContext, isProjectInScope } from '@/lib/plugins/tasks/server/embed';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string; projectId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const { token, projectId } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number(projectId);
  if (!(await isProjectInScope(ctx, id))) {
    return NextResponse.json({ error: 'Project not in scope' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const [updated] = await db.update(teamTaskProjects)
    .set({
      ...(body.name !== undefined && { name: String(body.name).trim() || 'Proyecto' }),
      ...(body.backgroundUrl !== undefined && { backgroundUrl: body.backgroundUrl || null }),
      ...(body.labels !== undefined && { labels: Array.isArray(body.labels) ? body.labels : [] }),
      ...(body.order !== undefined && { order: Number(body.order) }),
      ...(body.color !== undefined && { color: body.color || null }),
      ...(body.icon !== undefined && { icon: body.icon || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(teamTaskProjects.id, id), eq(teamTaskProjects.teamId, ctx.teamId)))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { token, projectId } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number(projectId);
  if (!(await isProjectInScope(ctx, id))) {
    return NextResponse.json({ error: 'Project not in scope' }, { status: 403 });
  }
  if (ctx.scope.type === 'project') {
    return NextResponse.json({ error: 'Cannot delete the scoped project from its own embed.' }, { status: 403 });
  }

  await db.delete(teamTaskProjects)
    .where(and(eq(teamTaskProjects.id, id), eq(teamTaskProjects.teamId, ctx.teamId)));

  return NextResponse.json({ ok: true });
}
