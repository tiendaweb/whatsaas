import { NextResponse } from 'next/server';
import { getManageEmbedContext, isColumnInScope } from '@/lib/plugins/tasks/server/embed';
import { createTaskInColumn } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const { token } = await params;
  const ctx = await getManageEmbedContext(token);
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const { columnId, title, notes, labelIds, checklist, dueDate, status } = body;
  if (!columnId || !title?.trim()) {
    return NextResponse.json({ error: 'columnId and title required' }, { status: 400 });
  }

  if (!(await isColumnInScope(ctx, Number(columnId)))) {
    return NextResponse.json({ error: 'Column not in scope' }, { status: 403 });
  }

  const item = await createTaskInColumn({
    teamId: ctx.teamId,
    userId: null,
    columnId: Number(columnId),
    title,
    notes,
    labelIds,
    checklist,
    dueDate,
    status,
  });
  if (!item) return NextResponse.json({ error: 'Column not found' }, { status: 404 });

  return NextResponse.json(item, { status: 201 });
}
