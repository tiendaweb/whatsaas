import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { createTaskInColumn } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json();
  const { columnId, title, notes, labelIds, checklist, dueDate, parentTaskId, status } = body;
  if (!columnId || !title?.trim()) return NextResponse.json({ error: 'columnId and title required' }, { status: 400 });

  const item = await createTaskInColumn({
    teamId: ctx.team.id,
    userId: ctx.user.id,
    columnId: Number(columnId),
    title,
    notes,
    labelIds,
    checklist,
    dueDate,
    parentTaskId: parentTaskId ? Number(parentTaskId) : null,
    status,
  });
  if (!item) return NextResponse.json({ error: 'Column not found' }, { status: 404 });

  return NextResponse.json(item, { status: 201 });
}
