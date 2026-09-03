import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { moveDeal } from '@/lib/deals/service';
import { DEAL_STAGES } from '@/lib/deals/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const moveSchema = z.object({
  stage: z.enum(DEAL_STAGES),
  position: z.number().int().min(0),
});

/**
 * Mover una tarjeta del kanban.
 *
 * Endpoint propio porque el drag dispara muchas escrituras chicas y no tiene que
 * arrastrar el payload completo. Y NO factura: soltar en "Ganada" sólo cambia la
 * etapa. La venta se emite desde `/close`, con confirmación e idempotencia.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('dealsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', issues: parsed.error.issues }, { status: 400 });
  }

  const deal = await moveDeal(ctx.team.id, Number((await params).id), parsed.data, ctx.user.id);
  if (!deal) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true, deal });
}
