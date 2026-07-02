import { NextResponse } from 'next/server';
import { getManageEmbedContext, isTaskInScope } from '@/lib/plugins/tasks/server/embed';
import { addTaskComment, listTaskComments } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<{ token: string; itemId: string }> };

export async function GET(_req: Request, { params }: RouteContext) {
  const { token, itemId } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (!(await isTaskInScope(ctx, Number(itemId)))) {
    return NextResponse.json({ error: 'Task not in scope' }, { status: 403 });
  }

  const comments = await listTaskComments(ctx.teamId, Number(itemId));
  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: RouteContext) {
  const { token, itemId } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (!(await isTaskInScope(ctx, Number(itemId)))) {
    return NextResponse.json({ error: 'Task not in scope' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body?.text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const comment = await addTaskComment({ teamId: ctx.teamId, userId: null, taskId: Number(itemId), text: body.text });
  if (!comment) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  return NextResponse.json(comment, { status: 201 });
}
