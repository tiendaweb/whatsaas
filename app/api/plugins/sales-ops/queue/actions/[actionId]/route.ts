import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { editAction, removeFromBatch } from '@/lib/plugins/sales-ops/server/queue';
import { queueErrorResponse } from '../../errors';

export const dynamic = 'force-dynamic';

const schema = z.object({
  text: z.string().max(4000).optional(),
  taskTitle: z.string().max(200).optional(),
});

/**
 * PATCH → corrige el texto de una acción propuesta.
 *
 * Revisar un lote era todo o nada: si un mensaje de veinte tenía una palabra
 * mal, había que excluir ese contacto y armar otro lote para él. Ahora se
 * corrige en el lugar.
 *
 * Se corta en `approved` a propósito: aprobar es firmar un texto concreto, y si
 * después se pudiera editar, la firma no querría decir nada.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const actionId = Number((await params).actionId);
  if (!Number.isInteger(actionId) || actionId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { text?, taskTitle? }' }, { status: 400 });

  try {
    const result = await editAction(ctx.team.id, ctx.user.id, actionId, { text: parsed.data.text, taskTitle: parsed.data.taskTitle });
    return NextResponse.json({ id: result.actionId, payload: result.payload });
  } catch (error) {
    return queueErrorResponse(error);
  }
}

/**
 * DELETE → quita el contacto del lote (la fila pasa a `rejected`).
 *
 * Vale para filas propuestas, pendientes o aprobadas sin ejecutar; lo que ya
 * salió no se toca. No borra la fila: queda el rastro de que estuvo en el lote
 * y de quién la sacó.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const actionId = Number((await params).actionId);
  if (!Number.isInteger(actionId) || actionId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  try {
    return NextResponse.json(await removeFromBatch(ctx.team.id, ctx.user.id, actionId));
  } catch (error) {
    return queueErrorResponse(error);
  }
}
