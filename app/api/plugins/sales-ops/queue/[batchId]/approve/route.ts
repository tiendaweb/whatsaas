import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { approveBatch } from '@/lib/plugins/sales-ops/server/queue';
import { executeApprovedBatch, type ExecuteBatchResult } from '@/lib/plugins/sales-ops/server/execute';
import { esEjecutableEnServidor } from '@/lib/plugins/sales-ops/shared/taxonomy';
import { queueErrorResponse } from '../../errors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
/** Con `execute`, aprobar también manda: una tanda de envíos puede tardar. */
export const maxDuration = 300;

const schema = z.object({
  excludeActionIds: z.array(z.number().int().positive()).max(5000).optional(),
  /**
   * Aprobar Y ejecutar en el mismo request lo que el servidor sabe hacer solo
   * (`SERVER_EXECUTABLE_KINDS`). Es el default de la Cola: aprobar un programado
   * con texto y fecha es querer que quede programado, no que espere a alguien.
   * `false` deja las filas en `approved` para un conector o para "Ejecutar".
   */
  execute: z.boolean().optional(),
});

/**
 * POST { excludeActionIds?, execute? } → aprueba el lote y, con `execute`
 * (default true), ejecuta ahí mismo lo aprobado si el tipo se puede hacer
 * desde el servidor. Devuelve el resultado de la aprobación y, si corrió, el de
 * la ejecución (`execution`), fila por fila.
 */
export async function POST(request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { batchId } = await params;
  const parsed = schema.safeParse((await request.json().catch(() => ({}))) ?? {});
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  try {
    const approved = await approveBatch(ctx.team.id, ctx.user.id, batchId, { excludeActionIds: parsed.data.excludeActionIds });
    let execution: ExecuteBatchResult | null = null;
    if (parsed.data.execute !== false && approved.approved > 0 && esEjecutableEnServidor(approved.kind)) {
      execution = await executeApprovedBatch(ctx.team.id, ctx.user.id, batchId, { actionIds: approved.approvedIds, max: 200 });
    }
    return NextResponse.json({ ...approved, execution });
  } catch (error) {
    return queueErrorResponse(error);
  }
}
