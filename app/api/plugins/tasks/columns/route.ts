import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { createColumnInProject } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json();
  const { projectId, title } = body;
  if (!projectId || !title?.trim()) return NextResponse.json({ error: 'projectId and title required' }, { status: 400 });

  const col = await createColumnInProject({
    teamId: ctx.team.id,
    projectId: Number(projectId),
    title,
    color: body.color ?? null,
    icon: body.icon ?? null,
  });
  if (!col) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  return NextResponse.json(col, { status: 201 });
}
