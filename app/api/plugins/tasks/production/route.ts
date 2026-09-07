import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { createProductionOrder, loadProductionOs } from '@/lib/plugins/tasks/server/production-os';
import { PAYMENT_STATES, WORK_KINDS } from '@/lib/plugins/tasks/shared/produccion';
import { CATALOGO_KEYS } from '@/lib/plugins/tasks/shared/catalogo';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().trim().min(2).max(500),
  workKind: z.enum(WORK_KINDS),
  notes: z.string().max(20000).optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  projectId: z.number().int().positive().nullable().optional(),
  columnId: z.number().int().positive().nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  contactId: z.number().int().positive().nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
  chatId: z.number().int().positive().nullable().optional(),
  aiPrompt: z.string().max(20000).optional(),
  // Lo comercial: si viene `catalogKey`, el servidor rellena lo que falte.
  catalogKey: z.enum(CATALOGO_KEYS as [string, ...string[]]).nullable().optional(),
  ticketAmount: z.number().int().min(0).nullable().optional(),
  ticketCurrency: z.enum(['ARS', 'USD']).nullable().optional(),
  estimatedMinutes: z.number().int().min(0).max(100000).nullable().optional(),
  revisionRoundsIncluded: z.number().int().min(0).max(5).nullable().optional(),
  paymentState: z.enum(PAYMENT_STATES).nullable().optional(),
  // Se limpia en el servidor (`limpiarHandoff`): sólo entran claves y valores conocidos.
  handoff: z.record(z.string(), z.unknown()).nullable().optional(),
});

/**
 * GET → el tablero entero. GET ?summary=1 → sólo los contadores.
 *
 * La tarjeta "Producción pendiente" de Hoy necesita cinco números y se
 * refresca sola cada minuto: mandarle los pedidos completos con sus checklists
 * y sus prompts es varios cientos de kB por cliente para pintar un "12".
 */
export async function GET(request: NextRequest) {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  try {
    const data = await loadProductionOs(ctx.team.id);
    if (new URL(request.url).searchParams.get('summary')) return NextResponse.json({ counts: data.counts });
    return NextResponse.json(data);
  } catch (error) {
    console.error('[tasks/production GET]', error);
    return NextResponse.json({ error: 'No se pudo cargar Producción OS.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'El pedido tiene campos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createProductionOrder(ctx.team.id, ctx.user.id, { ...parsed.data, source: 'user' });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error('[tasks/production POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo crear el pedido.' }, { status: 422 });
  }
}
