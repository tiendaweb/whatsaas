import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listSignals, scanNewMessages } from '@/lib/plugins/sales-ops/server/radar';
import { SIGNAL_KINDS, SIGNAL_STATUSES, type SignalKind, type SignalStatus } from '@/lib/plugins/sales-ops/shared/taxonomy';

export const dynamic = 'force-dynamic';

/** GET: lista de señales (`?status=new|seen|handled|dismissed|all&kind=&limit=&cursor=`). */
export async function GET(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const kindParam = url.searchParams.get('kind');
  const limitParam = Number(url.searchParams.get('limit'));
  const status = statusParam === 'all' || (SIGNAL_STATUSES as readonly string[]).includes(statusParam ?? '') ? (statusParam as SignalStatus | 'all') : 'new';
  const kind = (SIGNAL_KINDS as readonly string[]).includes(kindParam ?? '') ? (kindParam as SignalKind) : undefined;

  try {
    const payload = await listSignals(ctx.team.id, {
      status,
      kind,
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
      cursor: url.searchParams.get('cursor'),
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[sales-ops/signals] GET', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

/** POST `{action:'scan', limit?, engine?}`: fuerza un barrido del radar. */
export async function POST(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  let body: { action?: string; limit?: number; engine?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body.action !== 'scan') return NextResponse.json({ error: 'Acción desconocida.' }, { status: 400 });

  try {
    const report = await scanNewMessages(ctx.team.id, {
      limit: typeof body.limit === 'number' && body.limit > 0 ? Math.min(body.limit, 500) : 200,
      engine: body.engine === 'rules' ? 'rules' : 'server',
    });
    return NextResponse.json(report);
  } catch (error) {
    console.error('[sales-ops/signals] POST scan', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
