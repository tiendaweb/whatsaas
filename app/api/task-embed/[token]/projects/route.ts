import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskColumns, teamTaskProjects } from '@/lib/db/schema';
import { getManageEmbedContext } from '@/lib/plugins/tasks/server/embed';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const { token } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (ctx.scope.type !== 'workspace') {
    return NextResponse.json({ error: 'Project creation requires a workspace embed.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const maxOrder = await db.query.teamTaskProjects.findMany({
    where: and(eq(teamTaskProjects.teamId, ctx.teamId), eq(teamTaskProjects.workspaceId, ctx.scope.workspaceId)),
    orderBy: (t, { desc }) => [desc(t.order)],
    limit: 1,
  });
  const order = maxOrder.length ? maxOrder[0].order + 1 : 0;

  const [project] = await db.insert(teamTaskProjects).values({
    teamId: ctx.teamId,
    workspaceId: ctx.scope.workspaceId,
    name,
    backgroundUrl: body.backgroundUrl ?? null,
    labels: Array.isArray(body.labels) ? body.labels : [],
    color: body.color ?? null,
    icon: body.icon ?? null,
    createdBy: null,
    order,
  }).returning();

  const defaultColumns = ['Por hacer', 'En progreso', 'Completado'];
  await db.insert(teamTaskColumns).values(
    defaultColumns.map((title, index) => ({
      projectId: project.id,
      teamId: ctx.teamId,
      title,
      order: index,
    })),
  );

  return NextResponse.json(project, { status: 201 });
}
