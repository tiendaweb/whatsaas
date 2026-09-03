import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { closeDealAsLost, closeDealAsWon } from '@/lib/deals/conversions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const closeSchema = z.object({
  result: z.enum(['won', 'lost']),
  // Obligatoria en `won`: es lo único que impide facturar dos veces el mismo
  // cierre si el usuario hace doble clic o el cliente reintenta.
  idempotencyKey: z.string().min(8).max(120).optional(),
  createSale: z.boolean().optional(),
  currency: z.string().length(3).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  reason: z.string().max(2000).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('dealsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = closeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', issues: parsed.error.issues }, { status: 400 });
  }
  const dealId = Number((await params).id);

  if (parsed.data.result === 'lost') {
    const deal = await closeDealAsLost(ctx.team.id, dealId, parsed.data.reason ?? '', ctx.user.id);
    if (!deal) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
    return NextResponse.json({ deal, sale: null, reused: false });
  }

  // Ganar emite una venta. Sin permiso de ventas no se puede facturar de rebote
  // desde Oportunidades.
  if (parsed.data.createSale !== false && ctx.membership.role !== 'owner' && ctx.membership.role !== 'admin' && ctx.membership.permissions?.salesWrite !== true) {
    return NextResponse.json({ error: 'Falta permiso para registrar la venta' }, { status: 403 });
  }
  if (!parsed.data.idempotencyKey) {
    return NextResponse.json({ error: 'idempotencyKey es obligatoria al ganar una oportunidad' }, { status: 400 });
  }

  const result = await closeDealAsWon(
    ctx.team.id,
    dealId,
    {
      idempotencyKey: parsed.data.idempotencyKey,
      createSale: parsed.data.createSale,
      currency: parsed.data.currency,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
    ctx.user.id,
  );
  if (!result) return NextResponse.json({ error: 'No encontrada' }, { status: 404 });
  return NextResponse.json(result);
}
