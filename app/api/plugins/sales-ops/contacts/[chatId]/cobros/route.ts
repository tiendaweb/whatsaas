import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { CobroError, deudaDelContacto, registrarCobro } from '@/lib/plugins/sales-ops/server/cobros';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ chatId: string }> };

const schema = z.object({
  /** En unidades (50000 = $50.000). */
  amount: z.number().positive(),
  currency: z.string().trim().length(3),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  method: z.string().max(80).nullable().optional(),
  accountId: z.number().int().positive().nullable().optional(),
  concept: z.string().max(200).nullable().optional(),
  saleId: z.number().int().positive().nullable().optional(),
  entryId: z.number().int().positive().nullable().optional(),
  receiptMessageId: z.string().max(255).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /** Si no viene, se deriva: un mismo cobro (chat + importe + moneda + fecha) no se registra dos veces por doble clic. */
  idempotencyKey: z.string().min(6).max(80).optional(),
  via: z.enum(['focus', 'ficha', 'cola']).optional(),
  dryRun: z.boolean().optional(),
});

/** GET → lo que el contacto debe y pagó (ventas/asientos con ids). */
export async function GET(_request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const chatId = Number((await params).chatId);
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  try {
    return NextResponse.json(await deudaDelContacto(ctx.team.id, { chatId }));
  } catch (error) {
    if (error instanceof CobroError) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

/**
 * POST → registra el cobro (mismo `registrarCobro` que la Cola al aprobar y el
 * conector): venta + asiento + pago, cliente vinculado, chat a G11.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const chatId = Number((await params).chatId);
  if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { amount, currency, method?, paidOn?, concept? }' }, { status: 400 });
  const d = parsed.data;
  const idempotencyKey = d.idempotencyKey ?? `cobro:${chatId}:${d.currency.toUpperCase()}:${Math.round(d.amount * 100)}:${d.paidOn ?? 'hoy'}`;
  try {
    const result = await registrarCobro(ctx.team.id, ctx.user.id, {
      chatId,
      amount: d.amount,
      currency: d.currency,
      paidOn: d.paidOn ?? null,
      method: d.method ?? null,
      accountId: d.accountId ?? null,
      concept: d.concept ?? null,
      saleId: d.saleId ?? null,
      entryId: d.entryId ?? null,
      receiptMessageId: d.receiptMessageId ?? null,
      notes: d.notes ?? null,
      idempotencyKey,
      via: d.via ?? 'ficha',
      dryRun: d.dryRun,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CobroError) return NextResponse.json({ error: error.message }, { status: 422 });
    console.error('[sales-ops/cobros]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
