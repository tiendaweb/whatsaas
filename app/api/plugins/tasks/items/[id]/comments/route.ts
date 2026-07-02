import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { addTaskComment, listTaskComments } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const comments = await listTaskComments(ctx.team.id, Number(id));
  return NextResponse.json(comments);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const body = await req.json();
  const { text } = body;
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 });

  const comment = await addTaskComment({ teamId: ctx.team.id, userId: ctx.user.id, taskId: Number(id), text });
  if (!comment) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  return NextResponse.json(comment, { status: 201 });
}
