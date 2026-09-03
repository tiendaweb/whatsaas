import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskColumns } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { assertProject, assertTask, createTaskLocation, getProjectFirstColumn, insertRelation, nextTaskOrder } from '@/lib/plugins/tasks/server/task-os';
import { and, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const task = await assertTask(ctx.team.id, Number(id));
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const body = await req.json();
  const projectId = Number(body.projectId);
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

  const project = await assertProject(ctx.team.id, projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const requestedColumnId = body.columnId ? Number(body.columnId) : null;
  const column = requestedColumnId
    ? await db.query.teamTaskColumns.findFirst({
        where: and(eq(teamTaskColumns.id, requestedColumnId), eq(teamTaskColumns.projectId, projectId), eq(teamTaskColumns.teamId, ctx.team.id)),
      })
    : await getProjectFirstColumn(ctx.team.id, projectId);

  if (!column) return NextResponse.json({ error: 'Column not found' }, { status: 404 });

  const order = await nextTaskOrder(ctx.team.id, column.id);
  const location = await createTaskLocation({
    taskId: task.id,
    teamId: ctx.team.id,
    projectId,
    columnId: column.id,
    order,
  });

  await insertRelation({
    teamId: ctx.team.id,
    userId: ctx.user.id,
    sourceType: 'task',
    sourceId: task.id,
    targetType: 'project',
    targetId: projectId,
    relationType: 'shared_in',
  });

  return NextResponse.json(location, { status: 201 });
}
