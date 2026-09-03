import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listSignals, markSignals, scanNewMessages, listRadarMuted, setRadarMuted } from '@/lib/plugins/sales-ops/server/radar';
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
    const muted = await listRadarMuted(ctx.team.id);
    return NextResponse.json({ ...payload, muted });
  } catch (error) {
    console.error('[sales-ops/signals] GET', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}

const MARK_STATUSES = ['seen', 'handled', 'dismissed'] as const;

/**
 * POST `{action:'scan', limit?, engine?}`: fuerza un barrido del radar.
 * POST `{action:'mark', signalIds:[…], status}`: atiende varias señales de una
 * (la bandeja agrupa por contacto y ahí un contacto son N señales).
 */
export async function POST(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  let body: { action?: string; limit?: number; engine?: string; signalIds?: unknown; status?: string; chatId?: unknown; muted?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.action === 'mute') {
    const chatId = Number(body.chatId);
    if (!Number.isInteger(chatId) || chatId <= 0) return NextResponse.json({ error: 'chatId inválido.' }, { status: 400 });
    try {
      return NextResponse.json(await setRadarMuted(ctx.team.id, ctx.user.id, chatId, body.muted !== false));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
    }
  }

  if (body.action === 'mark') {
    const ids = Array.isArray(body.signalIds) ? body.signalIds.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
    if (!ids.length) return NextResponse.json({ error: 'signalIds vacío.' }, { status: 400 });
    const status = MARK_STATUSES.find((s) => s === body.status);
    if (!status) return NextResponse.json({ error: 'status debe ser seen, handled o dismissed.' }, { status: 400 });
    try {
      const signals = await markSignals(ctx.team.id, ctx.user.id, ids, status);
      return NextResponse.json({ signals, marked: signals.length });
    } catch (error) {
      console.error('[sales-ops/signals] POST mark', error);
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
    }
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
