import { NextResponse } from 'next/server';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { metaAdAccounts, metaAdsTokens } from '@/lib/db/schema';
import { syncAdAccount } from '@/lib/ads/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ACCOUNTS_PER_TICK = 10;
const MIN_INTERVAL_HOURS = 3;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/sync-meta-ads] CRON_SECRET is not configured');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const staleBefore = new Date(Date.now() - MIN_INTERVAL_HOURS * 60 * 60 * 1000);

  // Sólo cuentas con auto-sync y token válido. Las más viejas primero.
  const due = await db
    .select({ id: metaAdAccounts.id, teamId: metaAdAccounts.teamId, name: metaAdAccounts.name })
    .from(metaAdAccounts)
    .innerJoin(metaAdsTokens, eq(metaAdAccounts.tokenId, metaAdsTokens.id))
    .where(and(
      eq(metaAdAccounts.syncEnabled, true),
      eq(metaAdsTokens.status, 'active'),
      or(isNull(metaAdAccounts.lastSyncedAt), lt(metaAdAccounts.lastSyncedAt, staleBefore)),
    ))
    .orderBy(sql`${metaAdAccounts.lastSyncedAt} asc nulls first`)
    .limit(ACCOUNTS_PER_TICK);

  const results: Array<{ account: string; ok: boolean; detail: string }> = [];

  for (const account of due) {
    try {
      const summary = await syncAdAccount({
        teamId: account.teamId,
        adAccountRowId: account.id,
        trigger: 'cron',
      });

      results.push({
        account: account.name,
        ok: true,
        detail: summary.skipped
          ? 'ya había un sync en curso'
          : `${summary.campaignsUpserted} campañas, ${summary.insightsUpserted} días`,
      });
    } catch (error) {
      // Una cuenta rota no debe frenar a las demás: el sync ya dejó el error registrado.
      const message = error instanceof Error ? error.message : 'error desconocido';
      results.push({ account: account.name, ok: false, detail: message });
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
