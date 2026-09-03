import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskRelations } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { assertEntity, insertRelation, type TaskEntityType } from '@/lib/plugins/tasks/server/task-os';
import { and, eq, or } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const TYPES = new Set([
  'workspace', 'project', 'task', 'contact', 'customer', 'document',
  // Venta, comprobante, membresía y empresa: una tarea puede responder a
  // cualquiera de ellos, no sólo al cliente que los tiene colgados.
  'sale', 'transaction', 'subscription', 'company',
  // Vincular la carpeta hace que sus documentos hereden el cliente.
  'document_folder',
]);

export async function GET(req: Request) {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const id = Number(url.searchParams.get('id'));
  if (!type || !TYPES.has(type) || !id) return NextResponse.json({ error: 'type and id required' }, { status: 400 });

  const rows = await db.query.teamTaskRelations.findMany({
    where: and(
      eq(teamTaskRelations.teamId, ctx.team.id),
      or(
        and(eq(teamTaskRelations.sourceType, type), eq(teamTaskRelations.sourceId, id)),
        and(eq(teamTaskRelations.targetType, type), eq(teamTaskRelations.targetId, id)),
      ),
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json();
  const sourceType = String(body.sourceType ?? '') as TaskEntityType;
  const targetType = String(body.targetType ?? '') as TaskEntityType;
  const sourceId = Number(body.sourceId);
  const targetId = Number(body.targetId);
  if (!TYPES.has(sourceType) || !TYPES.has(targetType) || !sourceId || !targetId) {
    return NextResponse.json({ error: 'Invalid relation' }, { status: 400 });
  }

  const [sourceOk, targetOk] = await Promise.all([
    assertEntity(ctx.team.id, sourceType, sourceId),
    assertEntity(ctx.team.id, targetType, targetId),
  ]);
  if (!sourceOk || !targetOk) return NextResponse.json({ error: 'Related entity not found' }, { status: 404 });

  const relation = await insertRelation({
    teamId: ctx.team.id,
    userId: ctx.user.id,
    sourceType,
    sourceId,
    targetType,
    targetId,
    relationType: String(body.relationType ?? 'related'),
    metadata: body.metadata ?? {},
  });
  return NextResponse.json(relation ?? { ok: true }, { status: 201 });
}
