import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskDependencies } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { assertTask } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json();
  const taskId = Number(body.taskId);
  const dependsOnTaskId = Number(body.dependsOnTaskId);
  if (!taskId || !dependsOnTaskId || taskId === dependsOnTaskId) return NextResponse.json({ error: 'Invalid dependency' }, { status: 400 });

  const [task, dependency] = await Promise.all([
    assertTask(ctx.team.id, taskId),
    assertTask(ctx.team.id, dependsOnTaskId),
  ]);
  if (!task || !dependency) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  const [row] = await db.insert(teamTaskDependencies).values({
    teamId: ctx.team.id,
    taskId,
    dependsOnTaskId,
    createdBy: ctx.user.id,
  }).onConflictDoNothing().returning();

  return NextResponse.json(row ?? { ok: true }, { status: 201 });
}
