import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPlugins } from '@/lib/db/schema';
import { scanNewMessages, type RadarEngine, type ScanReport } from '@/lib/plugins/sales-ops/server/radar';
import { SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
/** Hasta 200 mensajes por equipo; los ambiguos pasan por la IA de a uno. */
export const maxDuration = 300;

/**
 * Radar de respuestas: clasifica los mensajes entrantes nuevos de cada equipo
 * con el plugin `sales-ops` activo.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" ".../sales-ops-radar?team=2&limit=50&engine=rules"
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/sales-ops-radar] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit'));
  const teamParam = Number(url.searchParams.get('team'));
  const engineParam = url.searchParams.get('engine');
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), 1000) : 200;
  const engine: RadarEngine = engineParam === 'rules' ? 'rules' : 'server';

  const inicio = Date.now();
  try {
    let teamIds: number[];
    if (Number.isInteger(teamParam) && teamParam > 0) {
      teamIds = [teamParam];
    } else {
      const rows = await db
        .select({ teamId: teamPlugins.teamId })
        .from(teamPlugins)
        .where(and(eq(teamPlugins.pluginId, SALES_OPS_PLUGIN_ID), eq(teamPlugins.enabled, true)));
      teamIds = rows.map((r) => r.teamId);
    }

    const teams: Record<number, ScanReport | { error: string }> = {};
    let created = 0;
    for (const teamId of teamIds) {
      try {
        const report = await scanNewMessages(teamId, { limit, engine });
        teams[teamId] = report;
        created += report.created;
      } catch (error) {
        teams[teamId] = { error: error instanceof Error ? error.message : 'Error inesperado' };
        console.error(`[cron/sales-ops-radar] equipo ${teamId}`, error);
      }
    }

    const seconds = Math.round((Date.now() - inicio) / 1000);
    if (created > 0) console.log(`[cron/sales-ops-radar] ${created} señales nuevas en ${teamIds.length} equipo(s), ${seconds}s`);
    return NextResponse.json({ success: true, seconds, teams: teamIds.length, created, engine, reports: teams });
  } catch (error) {
    console.error('[cron/sales-ops-radar] error', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
