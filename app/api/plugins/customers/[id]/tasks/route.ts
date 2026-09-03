import { NextResponse } from 'next/server';
import { and, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCustomers, teamTaskRelations } from '@/lib/db/schema';
import { createTaskInColumn, insertRelation, assertTask } from '@/lib/plugins/tasks/server/task-os';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersWrite'); if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const customerId = Number((await params).id); const customer = await db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.teamId, ctx.team.id), eq(teamCustomers.id, customerId)) });
  if (!customer) return NextResponse.json({ error: 'Cliente inválido' }, { status: 404 });
  const body = await request.json(); let taskId = Number(body.taskId);
  if (!taskId && body.columnId && body.title) { const task = await createTaskInColumn({ teamId: ctx.team.id, userId: ctx.user.id, columnId: Number(body.columnId), title: String(body.title), notes: String(body.notes || '') }); taskId = task?.id || 0; }
  if (!taskId || !await assertTask(ctx.team.id, taskId)) return NextResponse.json({ error: 'Tarea inválida' }, { status: 400 });
  const relation = await insertRelation({ teamId: ctx.team.id, userId: ctx.user.id, sourceType: 'customer', sourceId: customerId, targetType: 'task', targetId: taskId, relationType: 'related', metadata: {} });
  return NextResponse.json(relation || { ok: true }, { status: 201 });
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersWrite'); if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const customerId = Number((await params).id); const taskId = Number(new URL(request.url).searchParams.get('taskId'));
  await db.delete(teamTaskRelations).where(and(eq(teamTaskRelations.teamId, ctx.team.id), or(and(eq(teamTaskRelations.sourceType, 'customer'), eq(teamTaskRelations.sourceId, customerId), eq(teamTaskRelations.targetType, 'task'), eq(teamTaskRelations.targetId, taskId)), and(eq(teamTaskRelations.targetType, 'customer'), eq(teamTaskRelations.targetId, customerId), eq(teamTaskRelations.sourceType, 'task'), eq(teamTaskRelations.sourceId, taskId))))); return NextResponse.json({ ok: true });
}
