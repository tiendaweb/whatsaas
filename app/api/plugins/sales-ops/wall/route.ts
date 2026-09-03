import { NextRequest, NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { HISTORY_KINDS, listTeamWall, type HistoryKind } from '@/lib/plugins/sales-ops/server/history';

export const dynamic = 'force-dynamic';

/**
 * GET ?limit=&cursor=&kinds= → muro del equipo.
 *
 * Es la misma auditoría que alimenta el historial de cada ficha, leída por
 * momento en vez de por contacto: qué se hizo hoy, sobre quién y con qué.
 */
export async function GET(request: NextRequest) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get('limit'));
  const kinds = (sp.get('kinds') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k): k is HistoryKind => (HISTORY_KINDS as readonly string[]).includes(k));
  try {
    return NextResponse.json(
      await listTeamWall(ctx.team.id, {
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
        cursor: sp.get('cursor'),
        kinds: kinds.length ? kinds : undefined,
      }),
    );
  } catch (error) {
    console.error('[sales-ops/wall]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
