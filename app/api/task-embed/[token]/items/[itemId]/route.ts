import { NextResponse } from 'next/server';
import {
  getManageEmbedContext,
  isColumnInScope,
  isProjectInScope,
  isTaskInScope,
} from '@/lib/plugins/tasks/server/embed';
import { deleteTaskItem, patchTaskItem, type TaskPatchInput } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string; itemId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const { token, itemId } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (!(await isTaskInScope(ctx, Number(itemId)))) {
    return NextResponse.json({ error: 'Task not in scope' }, { status: 403 });
  }

  const patch = (await req.json().catch(() => ({}))) as TaskPatchInput;

  // A move must land inside the embed's scope.
  if (patch.columnId !== undefined && !(await isColumnInScope(ctx, Number(patch.columnId)))) {
    return NextResponse.json({ error: 'Target column not in scope' }, { status: 403 });
  }
  if (patch.projectId !== undefined && !(await isProjectInScope(ctx, Number(patch.projectId)))) {
    return NextResponse.json({ error: 'Target project not in scope' }, { status: 403 });
  }

  const result = await patchTaskItem({ teamId: ctx.teamId, taskId: Number(itemId), patch });
  if ('error' in result) {
    const message = result.error === 'column_not_found' ? 'Column not found' : 'Not found';
    return NextResponse.json({ error: message }, { status: 404 });
  }

  return NextResponse.json(result.item);
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { token, itemId } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (!(await isTaskInScope(ctx, Number(itemId)))) {
    return NextResponse.json({ error: 'Task not in scope' }, { status: 403 });
  }

  await deleteTaskItem(ctx.teamId, Number(itemId));
  return NextResponse.json({ ok: true });
}
