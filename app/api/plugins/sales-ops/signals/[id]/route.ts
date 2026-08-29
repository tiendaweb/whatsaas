import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { markSignal } from '@/lib/plugins/sales-ops/server/radar';

export const dynamic = 'force-dynamic';

const ALLOWED = ['seen', 'handled', 'dismissed'] as const;

/** PATCH `{status:'seen'|'handled'|'dismissed'}`. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const signalId = Number(id);
  if (!Number.isInteger(signalId) || signalId <= 0) return NextResponse.json({ error: 'Id inválido.' }, { status: 400 });

  let body: { status?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const status = ALLOWED.find((s) => s === body.status);
  if (!status) return NextResponse.json({ error: 'status debe ser seen, handled o dismissed.' }, { status: 400 });

  try {
    const signal = await markSignal(ctx.team.id, ctx.user.id, signalId, status);
    if (!signal) return NextResponse.json({ error: 'Señal no encontrada.' }, { status: 404 });
    return NextResponse.json({ signal });
  } catch (error) {
    console.error('[sales-ops/signals/:id] PATCH', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
