import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { approveAction } from '@/lib/plugins/sales-ops/server/queue';
import { executeApprovedBatch, type ExecuteBatchResult } from '@/lib/plugins/sales-ops/server/execute';
import { esEjecutableEnServidor } from '@/lib/plugins/sales-ops/shared/taxonomy';
import { queueErrorResponse } from '../../../errors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
/** Con `execute`, aprobar también manda. */
export const maxDuration = 120;

const schema = z.object({
  recommendation: z.string().max(4000).optional(),
  originalText: z.string().max(4000).optional(),
  aiInstruction: z.string().max(1000).optional(),
  /**
   * Aprobar Y ejecutar en el mismo request, igual que el lote. Es el default,
   * porque desde Modo Noelia aprobar un mensaje es querer que salga: dejarlo en
   * `approved` esperando a otro dejaba al operador creyendo que había mandado.
   * `false` lo deja aprobado para que lo tome un conector o el botón "Ejecutar".
   */
  execute: z.boolean().optional(),
});

/**
 * Aprueba sólo esta fila —sin tocar las demás del lote— y, salvo que se pida lo
 * contrario, ejecuta ahí mismo lo que el servidor sabe hacer solo.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const actionId = Number((await params).actionId);
  if (!Number.isInteger(actionId) || actionId <= 0) return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  const parsed = schema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  try {
    const approved = await approveAction(ctx.team.id, ctx.user.id, actionId, parsed.data);
    let execution: ExecuteBatchResult | null = null;
    if (parsed.data.execute !== false && approved.approvedIds.length > 0 && esEjecutableEnServidor(approved.kind)) {
      execution = await executeApprovedBatch(ctx.team.id, ctx.user.id, approved.batchId, { actionIds: approved.approvedIds, max: 1 });
    }
    return NextResponse.json({ ...approved, execution });
  } catch (error) {
    return queueErrorResponse(error);
  }
}
