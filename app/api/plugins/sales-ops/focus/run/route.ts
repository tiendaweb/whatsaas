import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { ejecutarPedidoFocus } from '@/lib/plugins/sales-ops/server/focus';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const schema = z.object({
  chatId: z.number().int().positive().nullable().optional(),
  prompt: z.string().min(3).max(4000),
  /** Texto actual del programado que se está editando. */
  message: z.string().max(4000).nullable().optional(),
  name: z.string().max(200).nullable().optional(),
});

/**
 * POST → "Ejecutar ahora" del Focus.
 *
 * Devuelve `{ mode: 'texto', text }` cuando el servidor pudo resolverlo
 * redactando (la pantalla se queda en este cliente con el borrador cargado),
 * `{ mode: 'programar' | 'crm' | 'cobro' }` cuando hay algo para confirmar de un
 * botón, o `{ mode: 'conector', reason }` cuando hace falta un conector (la
 * pantalla ofrece el otro botón). No guarda nada —tampoco el cobro, que se
 * propone acá y se registra desde `contacts/{chatId}/cobros` cuando la persona
 * lo confirma—: lo que se guarda lo decide la persona.
 */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido: { prompt, chatId?, message? }' }, { status: 400 });

  const outcome = await ejecutarPedidoFocus(ctx.team.id, parsed.data);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: 422 });
  return NextResponse.json(outcome);
}
