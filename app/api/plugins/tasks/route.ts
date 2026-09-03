import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskProjects, teamTaskColumns } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { ensureDefaultTaskWorkspace } from '@/lib/plugins/tasks/server/workspaces';
import { loadTaskOsData } from '@/lib/plugins/tasks/server/task-os';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  await ensureDefaultTaskWorkspace(ctx.team.id, ctx.user.id);

  const workspaces = await loadTaskOsData(ctx.team.id);
  return NextResponse.json(workspaces.flatMap((workspace) => workspace.projects));
}

export async function POST(req: Request) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json();
  const { name, backgroundUrl, workspaceId } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const workspace = workspaceId
    ? { id: Number(workspaceId) }
    : await ensureDefaultTaskWorkspace(ctx.team.id, ctx.user.id);

  const maxOrder = await db.query.teamTaskProjects.findMany({
    where: eq(teamTaskProjects.teamId, ctx.team.id),
    orderBy: (t, { desc }) => [desc(t.order)],
    limit: 1,
  });
  const order = maxOrder.length ? maxOrder[0].order + 1 : 0;

  const [project] = await db.insert(teamTaskProjects).values({
    teamId: ctx.team.id,
    workspaceId: workspace.id,
    name: name.trim(),
    backgroundUrl: backgroundUrl ?? null,
    color: body.color ?? null,
    icon: body.icon ?? null,
    createdBy: ctx.user.id,
    order,
  }).returning();

  const defaultColumns = ['Por hacer', 'En progreso', 'Completado'];
  await db.insert(teamTaskColumns).values(
    defaultColumns.map((title, i) => ({ projectId: project.id, teamId: ctx.team.id, title, order: i }))
  );

  return NextResponse.json(project, { status: 201 });
}
