import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  metaAdAccounts,
  metaAdsSyncRuns,
  metaAdsTokens,
  metaCampaignInsightsDaily,
  metaCampaigns,
} from '@/lib/db/schema';
import { MetaGraphError } from '@/lib/social/meta-graph';
import {
  listAdAccounts,
  listCampaignInsightsDaily,
  listCampaigns,
  minorToMajor,
  type MetaAdAccount as RemoteAdAccount,
} from './meta-ads';
import { resolveResult } from './results';

/** Meta atribuye conversiones con retraso, así que las métricas recientes cambian. */
export const RESYNC_WINDOW_DAYS = 7;
export const FIRST_BACKFILL_DAYS = 90;
/** Meta retiene ~13 meses: pedir más devuelve error o vacío. */
export const MAX_BACKFILL_DAYS = 395;
export const MAX_CHUNK_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SyncSummary = {
  skipped?: boolean;
  campaignsUpserted: number;
  insightsUpserted: number;
  status: 'ok' | 'partial' | 'error';
  since: string;
  until: string;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const parseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function chunkRange(since: string, until: string): Array<{ since: string; until: string }> {
  const chunks: Array<{ since: string; until: string }> = [];
  let start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);

  while (start <= end) {
    const chunkEnd = new Date(Math.min(start.getTime() + (MAX_CHUNK_DAYS - 1) * DAY_MS, end.getTime()));
    chunks.push({ since: isoDate(start), until: isoDate(chunkEnd) });
    start = new Date(chunkEnd.getTime() + DAY_MS);
  }

  return chunks;
}

/** Descubre las cuentas publicitarias que alcanza un token y las guarda. */
export async function discoverAndUpsertAccounts(
  teamId: number,
  tokenId: number,
  token: string,
): Promise<RemoteAdAccount[]> {
  const accounts = await listAdAccounts(token);
  const now = new Date();

  for (const account of accounts) {
    const values = {
      name: account.name,
      currency: account.currency,
      timezoneName: account.timezone_name ?? null,
      accountStatus: account.account_status ?? null,
      businessId: account.business?.id ?? null,
      businessName: account.business?.name ?? null,
      amountSpent: String(minorToMajor(account.amount_spent, account.currency) ?? 0),
      tokenId,
      updatedAt: now,
    };

    await db
      .insert(metaAdAccounts)
      .values({ teamId, accountId: account.account_id, ...values })
      .onConflictDoUpdate({
        target: [metaAdAccounts.teamId, metaAdAccounts.accountId],
        set: values,
      });
  }

  return accounts;
}

/**
 * Baja campañas y métricas diarias de una cuenta. Es idempotente: todo es upsert sobre
 * (ad_account_id, campaign_id) y (campaign_row_id, date), así que correrlo N veces sobre
 * el mismo rango deja exactamente el mismo estado. Nunca borra histórico.
 */
export async function syncAdAccount(params: {
  teamId: number;
  adAccountRowId: number;
  trigger: 'manual' | 'cron';
  since?: string;
  until?: string;
  startedBy?: number | null;
}): Promise<SyncSummary> {
  const { teamId, adAccountRowId, trigger, startedBy = null } = params;

  const [account] = await db
    .select()
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.id, adAccountRowId), eq(metaAdAccounts.teamId, teamId)))
    .limit(1);

  if (!account) throw new Error('La cuenta publicitaria no existe.');

  const [token] = await db
    .select()
    .from(metaAdsTokens)
    .where(eq(metaAdsTokens.id, account.tokenId))
    .limit(1);

  if (!token) throw new Error('La cuenta no tiene un token asociado.');
  if (token.status === 'invalid') {
    throw new Error('El token de Meta está vencido. Reemplazalo para volver a sincronizar.');
  }

  // Anti-solapamiento: si ya hay un run corriendo hace poco, no arrancamos otro.
  const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);
  const [running] = await db
    .select({ id: metaAdsSyncRuns.id })
    .from(metaAdsSyncRuns)
    .where(and(
      eq(metaAdsSyncRuns.adAccountId, adAccountRowId),
      eq(metaAdsSyncRuns.status, 'running'),
      gt(metaAdsSyncRuns.startedAt, staleThreshold),
    ))
    .limit(1);

  const now = new Date();
  const until = params.until ?? isoDate(now);
  const defaultSpanDays = account.lastSyncedAt ? RESYNC_WINDOW_DAYS : FIRST_BACKFILL_DAYS;
  const floor = new Date(now.getTime() - MAX_BACKFILL_DAYS * DAY_MS);
  const requestedSince = params.since
    ? new Date(`${params.since}T00:00:00Z`)
    : new Date(now.getTime() - (defaultSpanDays - 1) * DAY_MS);
  const since = isoDate(requestedSince < floor ? floor : requestedSince);

  if (running) {
    return { skipped: true, campaignsUpserted: 0, insightsUpserted: 0, status: 'ok', since, until };
  }

  const [run] = await db
    .insert(metaAdsSyncRuns)
    .values({ teamId, adAccountId: adAccountRowId, trigger, status: 'running', since, until, startedBy })
    .returning({ id: metaAdsSyncRuns.id });

  let campaignsUpserted = 0;
  let insightsUpserted = 0;
  let status: 'ok' | 'partial' = 'ok';

  try {
    const remoteCampaigns = await listCampaigns(account.accountId, token.token);

    // campaignId de Meta → { rowId, objective } para resolver el resultado de cada fila.
    const campaignIndex = new Map<string, { rowId: number; objective: string | null }>();

    for (const campaign of remoteCampaigns) {
      const values = {
        name: campaign.name,
        status: campaign.status ?? null,
        effectiveStatus: campaign.effective_status ?? null,
        objective: campaign.objective ?? null,
        buyingType: campaign.buying_type ?? null,
        // Los presupuestos SÍ vienen en centavos (a diferencia de spend).
        dailyBudget: (() => {
          const value = minorToMajor(campaign.daily_budget, account.currency);
          return value === null ? null : String(value);
        })(),
        lifetimeBudget: (() => {
          const value = minorToMajor(campaign.lifetime_budget, account.currency);
          return value === null ? null : String(value);
        })(),
        createdTime: parseDate(campaign.created_time),
        startTime: parseDate(campaign.start_time),
        stopTime: parseDate(campaign.stop_time),
        updatedTime: parseDate(campaign.updated_time),
        lastSyncedAt: now,
        updatedAt: now,
      };

      const [row] = await db
        .insert(metaCampaigns)
        .values({ teamId, adAccountId: adAccountRowId, campaignId: campaign.id, ...values })
        .onConflictDoUpdate({
          target: [metaCampaigns.adAccountId, metaCampaigns.campaignId],
          set: values,
        })
        .returning({ id: metaCampaigns.id });

      campaignIndex.set(campaign.id, { rowId: row.id, objective: campaign.objective ?? null });
      campaignsUpserted++;
    }

    for (const chunk of chunkRange(since, until)) {
      let rows;
      try {
        rows = await listCampaignInsightsDaily(account.accountId, token.token, chunk);
      } catch (error) {
        if (error instanceof MetaGraphError && error.isTransient) {
          // Ya reintentó con backoff dentro del cliente: dejamos el rango para el próximo tick.
          status = 'partial';
          continue;
        }
        throw error;
      }

      for (const row of rows) {
        let entry = campaignIndex.get(row.campaign_id);

        // Una campaña borrada desaparece del listado pero conserva métricas: la guardamos
        // como stub en vez de tirar el histórico.
        if (!entry) {
          const stub = {
            name: row.campaign_name || `Campaña ${row.campaign_id}`,
            status: 'UNKNOWN',
            lastSyncedAt: now,
            updatedAt: now,
          };
          const [created] = await db
            .insert(metaCampaigns)
            .values({ teamId, adAccountId: adAccountRowId, campaignId: row.campaign_id, ...stub })
            .onConflictDoUpdate({
              target: [metaCampaigns.adAccountId, metaCampaigns.campaignId],
              set: { lastSyncedAt: now, updatedAt: now },
            })
            .returning({ id: metaCampaigns.id, objective: metaCampaigns.objective });

          entry = { rowId: created.id, objective: created.objective };
          campaignIndex.set(row.campaign_id, entry);
        }

        const impressions = Number(row.impressions) || 0;
        const { resultActionType, results } = resolveResult(entry.objective, {
          actions: row.actions,
          impressions,
        });

        const values = {
          campaignId: row.campaign_id,
          // spend viene en moneda de la cuenta, NO en centavos: no dividir.
          spend: String(Number(row.spend) || 0),
          impressions,
          reach: Number(row.reach) || 0,
          clicks: Number(row.clicks) || 0,
          inlineLinkClicks: Number(row.inline_link_clicks) || 0,
          frequency: row.frequency ? String(Number(row.frequency) || 0) : null,
          results: String(results),
          resultActionType,
          actions: row.actions ?? [],
          costPerActionType: row.cost_per_action_type ?? [],
          currency: account.currency,
          syncedAt: now,
        };

        await db
          .insert(metaCampaignInsightsDaily)
          .values({
            teamId,
            adAccountId: adAccountRowId,
            campaignRowId: entry.rowId,
            date: row.date_start,
            ...values,
          })
          .onConflictDoUpdate({
            target: [metaCampaignInsightsDaily.campaignRowId, metaCampaignInsightsDaily.date],
            set: values,
          });

        insightsUpserted++;
      }
    }

    // El tipo de resultado de la campaña = el más frecuente en su histórico reciente.
    await db.execute(sql`
      update meta_campaigns c
      set result_action_type = s.result_action_type
      from (
        select distinct on (campaign_row_id) campaign_row_id, result_action_type
        from meta_campaign_insights_daily
        where ad_account_id = ${adAccountRowId} and results > 0
        order by campaign_row_id, date desc
      ) s
      where c.id = s.campaign_row_id and c.ad_account_id = ${adAccountRowId}
    `);

    await db
      .update(metaAdAccounts)
      .set({
        lastSyncedAt: now,
        lastSyncStatus: status,
        lastError: null,
        campaignsCount: campaignsUpserted,
        updatedAt: now,
      })
      .where(eq(metaAdAccounts.id, adAccountRowId));

    await db
      .update(metaAdsSyncRuns)
      .set({ status, campaignsUpserted, insightsUpserted, finishedAt: new Date() })
      .where(eq(metaAdsSyncRuns.id, run.id));

    return { campaignsUpserted, insightsUpserted, status, since, until };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';

    // Token vencido: lo marcamos para que la UI pida reemplazarlo y el cron lo saltee.
    if (error instanceof MetaGraphError && error.isTokenError) {
      await db
        .update(metaAdsTokens)
        .set({ status: 'invalid', lastError: message.slice(0, 2000), updatedAt: new Date() })
        .where(eq(metaAdsTokens.id, token.id));
    }

    await db
      .update(metaAdAccounts)
      .set({ lastSyncStatus: 'error', lastError: message.slice(0, 2000), updatedAt: new Date() })
      .where(eq(metaAdAccounts.id, adAccountRowId));

    await db
      .update(metaAdsSyncRuns)
      .set({ status: 'error', error: message.slice(0, 2000), finishedAt: new Date() })
      .where(eq(metaAdsSyncRuns.id, run.id));

    console.error('[meta-ads/sync]', { teamId, adAccountRowId, error });
    throw error;
  }
}
