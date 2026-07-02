import { NextResponse } from 'next/server';
import { getManageEmbedContext, isProjectInScope } from '@/lib/plugins/tasks/server/embed';
import { createColumnInProject } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const { token } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const { projectId, title } = body;
  if (!projectId || !title?.trim()) {
    return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });
  }

  if (!(await isProjectInScope(ctx, Number(projectId)))) {
    return NextResponse.json({ error: 'Project not in scope' }, { status: 403 });
  }

  const col = await createColumnInProject({
    teamId: ctx.teamId,
    projectId: Number(projectId),
    title,
    color: body.color ?? null,
    icon: body.icon ?? null,
  });
  if (!col) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json(col, { status: 201 });
}
