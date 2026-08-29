import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listPendingChats, type PendingSource } from '@/lib/plugins/sales-ops/server/classifier';

export const dynamic = 'force-dynamic';

const SOURCES: PendingSource[] = ['prefiltro', 'stale', 'all'];

/** GET ?source=prefiltro|stale|all&limit=50 → chats que necesitan clasificación. */
export async function GET(request: Request) {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const teamId = ctx.team.id;

  const url = new URL(request.url);
  const sourceParam = url.searchParams.get('source') ?? 'prefiltro';
  const source = SOURCES.includes(sourceParam as PendingSource) ? (sourceParam as PendingSource) : null;
  if (!source) return NextResponse.json({ error: 'source debe ser prefiltro, stale o all' }, { status: 400 });
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), 500) : 50;

  try {
    const rows = await listPendingChats(teamId, { source, limit });
    return NextResponse.json({ source, total: rows.length, rows, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[sales-ops/pending]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
