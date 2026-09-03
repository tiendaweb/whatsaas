import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { deleteTaskItem, patchTaskItem } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const patch = await req.json();

  const result = await patchTaskItem({ teamId: ctx.team.id, taskId: Number(id), patch });
  if ('error' in result) {
    if (result.error === 'column_not_found') {
      return NextResponse.json({ error: 'Column not found' }, { status: 404 });
    }
    if (result.error === 'column_project_mismatch') {
      return NextResponse.json({ error: 'Column does not belong to project' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(result.item);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  await deleteTaskItem(ctx.team.id, Number(id));
  return NextResponse.json({ ok: true });
}
