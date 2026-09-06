import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { executeApprovedBatch } from '@/lib/plugins/sales-ops/server/execute';
import { queueErrorResponse } from '../../errors';

export const dynamic = 'force-dynamic';
/** Envía uno por uno contra Evolution: una tanda puede tardar. */
export const maxDuration = 300;

const schema = z.object({
  /** Confirmación explícita: perder un campo nunca puede significar "mandá". */
  confirm: z.literal('EJECUTAR'),
  /** Hasta 200 por request, igual que aprobar: el botón dice "Ejecutar N" y tiene que ejecutar N. */
  actionIds: z.array(z.number().int().positive()).max(200).optional(),
});

/**
 * POST { confirm: "EJECUTAR" } → ejecuta las acciones **aprobadas** del lote.
 *
 * Es la Fase 6: hasta ahora aprobar dejaba todo en `approved` y el envío lo
 * hacía una persona o un conector. Nada de acá salta la aprobación humana —
 * sólo toca filas que ya están en `approved`— y cada envío vuelve a verificar
 * que el cliente no haya escrito después de que se aprobó.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { batchId } = await params;
  if (!batchId) return NextResponse.json({ error: 'Falta el lote' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Falta la confirmación explícita: { confirm: "EJECUTAR" }' }, { status: 400 });
  try {
    return NextResponse.json(await executeApprovedBatch(ctx.team.id, ctx.user.id, batchId, { actionIds: parsed.data.actionIds }));
  } catch (error) {
    return queueErrorResponse(error);
  }
}
