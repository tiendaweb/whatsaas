import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { deleteColumn, updateColumn } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const patch = await req.json();

  const updated = await updateColumn({ teamId: ctx.team.id, columnId: Number(id), patch });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  await deleteColumn(ctx.team.id, Number(id));
  return NextResponse.json({ ok: true });
}
