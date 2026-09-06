import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSalesOpsTasksContext } from '@/lib/plugins/sales-ops/server/access';
import { documentarPaso, loadProduccion } from '@/lib/plugins/sales-ops/server/produccion';

export const dynamic = 'force-dynamic';

/** GET → demos, clientes y bitácora del Command Center con avance por proyecto. */
export async function GET() {
  const ctx = await getSalesOpsTasksContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  try {
    return NextResponse.json(await loadProduccion(ctx.team.id, ctx.user.id));
  } catch (error) {
    console.error('[sales-ops/produccion]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const schema = z.object({ action: z.literal('documentar'), title: z.string().min(2).max(200), notes: z.string().max(20000).optional(), chatId: z.number().int().positive().nullable().optional() });

/** POST { action: 'documentar', title, notes?, chatId? } → un paso en la Bitácora. */
export async function POST(request: NextRequest) {
  const ctx = await getSalesOpsTasksContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  try {
    return NextResponse.json(await documentarPaso(ctx.team.id, ctx.user.id, parsed.data), { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 422 });
  }
}
