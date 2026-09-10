import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { editAction, removeFromBatch } from '@/lib/plugins/sales-ops/server/queue';
import { REJECT_REASONS } from '@/lib/plugins/sales-ops/shared/taxonomy';
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

const motivoSchema = z.object({
  reason: z.string().trim().max(300).optional(),
  code: z.enum(REJECT_REASONS).optional(),
});

/**
 * DELETE → quita el contacto del lote (la fila pasa a `rejected`) con su motivo.
 *
 * Vale para filas propuestas, pendientes o aprobadas sin ejecutar; lo que ya
 * salió no se toca. No borra la fila: queda el rastro de que estuvo en el lote,
 * de quién la sacó y por qué.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const actionId = Number((await params).actionId);
  if (!Number.isInteger(actionId) || actionId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const motivo = motivoSchema.safeParse(await request.json().catch(() => ({})));
  try {
    return NextResponse.json(await removeFromBatch(ctx.team.id, ctx.user.id, actionId, motivo.success ? motivo.data : undefined));
  } catch (error) {
    return queueErrorResponse(error);
  }
}
