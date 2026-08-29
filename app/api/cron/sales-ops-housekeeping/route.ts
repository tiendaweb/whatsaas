import { NextResponse } from 'next/server';
import { runHousekeeping, teamsWithAnalysis } from '@/lib/plugins/sales-ops/server/housekeeping';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
/** Recalcular prioridad de ~1.000 análisis por equipo es un UPDATE por fila: varios minutos como tope. */
export const maxDuration = 300;

/**
 * Housekeeping diario del Command Center Comercial: expira propuestas, propone
 * pre-descarte, devuelve vencidos a la cola y recalcula prioridad.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" ".../api/cron/sales-ops-housekeeping?team=2"
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/sales-ops-housekeeping] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const teamParam = Number(url.searchParams.get('team'));
  const inicio = Date.now();
  try {
    const teamIds = Number.isInteger(teamParam) && teamParam > 0 ? [teamParam] : await teamsWithAnalysis();
    const reports = [];
    for (const teamId of teamIds) {
      try {
        reports.push(await runHousekeeping(teamId));
      } catch (error) {
        console.error(`[cron/sales-ops-housekeeping] team ${teamId} failed`, error);
        reports.push({ teamId, error: error instanceof Error ? error.message : 'Error inesperado' });
      }
    }
    const segundos = Math.round((Date.now() - inicio) / 1000);
    console.log(`[cron/sales-ops-housekeeping] ${reports.length} equipos, ${segundos}s`);
    return NextResponse.json({ success: true, seconds: segundos, teams: reports });
  } catch (error) {
    console.error('[cron/sales-ops-housekeeping] error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
