import { NextResponse } from 'next/server';
import { getManageEmbedContext, isColumnInScope } from '@/lib/plugins/tasks/server/embed';
import { deleteColumn, updateColumn } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string; columnId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const { token, columnId } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (!(await isColumnInScope(ctx, Number(columnId)))) {
    return NextResponse.json({ error: 'Column not in scope' }, { status: 403 });
  }

  const patch = await req.json().catch(() => ({}));
  const updated = await updateColumn({ teamId: ctx.teamId, columnId: Number(columnId), patch });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { token, columnId } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (!(await isColumnInScope(ctx, Number(columnId)))) {
    return NextResponse.json({ error: 'Column not in scope' }, { status: 403 });
  }

  await deleteColumn(ctx.teamId, Number(columnId));
  return NextResponse.json({ ok: true });
}
