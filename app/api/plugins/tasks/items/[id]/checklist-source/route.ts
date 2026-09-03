import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskItems, type TaskChecklistItem } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { assertTask, insertRelation } from '@/lib/plugins/tasks/server/task-os';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const target = await assertTask(ctx.team.id, Number(id));
  if (!target) return NextResponse.json({ error: 'Target task not found' }, { status: 404 });

  const body = await req.json();
  const source = await assertTask(ctx.team.id, Number(body.sourceTaskId));
  if (!source) return NextResponse.json({ error: 'Source task not found' }, { status: 404 });
  if (source.id === target.id) return NextResponse.json({ error: 'Cannot add task to itself' }, { status: 400 });

  const checklist: TaskChecklistItem[] = [
    ...(target.checklist ?? []),
    {
      id: nanoid(),
      text: source.title,
      completed: source.status === 'done',
      sourceTaskId: source.id,
      sourceSnapshot: {
        title: source.title,
        notes: source.notes,
        dueDate: source.dueDate ? source.dueDate.toISOString() : null,
      },
    },
  ];

  const [updated] = await db.update(teamTaskItems)
    .set({ checklist, updatedAt: new Date() })
    .where(and(eq(teamTaskItems.id, target.id), eq(teamTaskItems.teamId, ctx.team.id)))
    .returning();

  await insertRelation({
    teamId: ctx.team.id,
    userId: ctx.user.id,
    sourceType: 'task',
    sourceId: target.id,
    targetType: 'task',
    targetId: source.id,
    relationType: 'checklist_source',
  });

  return NextResponse.json(updated);
}
