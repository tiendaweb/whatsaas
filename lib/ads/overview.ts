import 'server-only';

/**
 * Composición del overview de Meta Ads con firma `(teamId, …)`.
 *
 * Vivía inline en `app/api/plugins/meta-ads/overview/route.ts`, atada a
 * `getPluginRequestContext` (sesión). La route y la tool MCP
 * `whatspro_metaads_report` consumen esta misma función.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { metaAdAccounts, metaCampaignInsightsDaily, metaCampaigns } from '@/lib/db/schema';
import { objectiveLabel, resultLabel } from '@/lib/ads/results';
import { applyTax, parseTaxRate } from '@/lib/ads/tax';
import { buildKpis, num, seriesLabel, resolveGranularity } from '@/lib/ads/aggregate';
import type {
  OverviewCampaignRow,
  OverviewResponse,
  OverviewSeriesPoint,
} from '@/lib/ads/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

async function loadTotals(teamId: number, accountId: number, since: string, until: string, taxRate: number) {
  const [row] = await db
    .select({
      spend: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.spend}), 0)`,
      results: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.results}), 0)`,
      impressions: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.impressions}), 0)`,
      clicks: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.clicks}), 0)`,
      // reach no se suma entre días: tomamos el pico como referencia, nunca el total.
      reach: sql<string>`coalesce(max(${metaCampaignInsightsDaily.reach}), 0)`,
    })
    .from(metaCampaignInsightsDaily)
    .where(and(
      eq(metaCampaignInsightsDaily.teamId, teamId),
      eq(metaCampaignInsightsDaily.adAccountId, accountId),
      gte(metaCampaignInsightsDaily.date, since),
      lte(metaCampaignInsightsDaily.date, until),
    ));

  return buildKpis(
    {
      spendNet: num(row?.spend),
      results: num(row?.results),
      impressions: num(row?.impressions),
      clicks: num(row?.clicks),
      reach: num(row?.reach),
    },
    taxRate,
  );
}

export async function buildAdsOverview(
  teamId: number,
  account: typeof metaAdAccounts.$inferSelect,
  options: { since?: string | null; until?: string | null; granularity?: string | null } = {},
): Promise<OverviewResponse> {
  const taxRate = parseTaxRate(account.taxRate);
  const until = options.until || isoDate(new Date());
  const since = options.since || isoDate(new Date(Date.now() - 29 * DAY_MS));
  const granularity = resolveGranularity(options.granularity ?? null, since, until);

  const spanDays = Math.max(
    1,
    Math.round((new Date(`${until}T00:00:00Z`).getTime() - new Date(`${since}T00:00:00Z`).getTime()) / DAY_MS) + 1,
  );
  const previousUntil = isoDate(new Date(new Date(`${since}T00:00:00Z`).getTime() - DAY_MS));
  const previousSince = isoDate(new Date(new Date(`${since}T00:00:00Z`).getTime() - spanDays * DAY_MS));

  const scope = and(
    eq(metaCampaignInsightsDaily.teamId, teamId),
    eq(metaCampaignInsightsDaily.adAccountId, account.id),
    gte(metaCampaignInsightsDaily.date, since),
    lte(metaCampaignInsightsDaily.date, until),
  );

  // La granularidad va como literal, NO como parámetro: drizzle emite un placeholder
  // distinto en el SELECT y en el GROUP BY, y Postgres compara las expresiones de
  // agrupación sintácticamente → rechaza la query. resolveGranularity() ya la validó
  // contra day|week|month, así que interpolarla es seguro.
  const bucket = sql<string>`to_char(date_trunc('${sql.raw(granularity)}', ${metaCampaignInsightsDaily.date}::timestamp), 'YYYY-MM-DD')`;

  const [seriesRows, campaignRows, kpis, previousKpis] = await Promise.all([
    db
      .select({
        bucket,
        spend: sql<string>`sum(${metaCampaignInsightsDaily.spend})`,
        results: sql<string>`sum(${metaCampaignInsightsDaily.results})`,
        impressions: sql<string>`sum(${metaCampaignInsightsDaily.impressions})`,
        clicks: sql<string>`sum(${metaCampaignInsightsDaily.clicks})`,
      })
      .from(metaCampaignInsightsDaily)
      .where(scope)
      .groupBy(bucket)
      .orderBy(bucket),

    db
      .select({
        id: metaCampaigns.id,
        campaignId: metaCampaigns.campaignId,
        name: metaCampaigns.name,
        status: metaCampaigns.status,
        effectiveStatus: metaCampaigns.effectiveStatus,
        objective: metaCampaigns.objective,
        buyingType: metaCampaigns.buyingType,
        resultActionType: metaCampaigns.resultActionType,
        dailyBudget: metaCampaigns.dailyBudget,
        lifetimeBudget: metaCampaigns.lifetimeBudget,
        createdTime: metaCampaigns.createdTime,
        startTime: metaCampaigns.startTime,
        stopTime: metaCampaigns.stopTime,
        spend: sql<string>`sum(${metaCampaignInsightsDaily.spend})`,
        results: sql<string>`sum(${metaCampaignInsightsDaily.results})`,
        impressions: sql<string>`sum(${metaCampaignInsightsDaily.impressions})`,
        clicks: sql<string>`sum(${metaCampaignInsightsDaily.clicks})`,
        reach: sql<string>`max(${metaCampaignInsightsDaily.reach})`,
        activeDays: sql<string>`count(*) filter (where ${metaCampaignInsightsDaily.spend} > 0)`,
      })
      .from(metaCampaignInsightsDaily)
      .innerJoin(metaCampaigns, eq(metaCampaignInsightsDaily.campaignRowId, metaCampaigns.id))
      .where(scope)
      .groupBy(
        metaCampaigns.id,
        metaCampaigns.campaignId,
        metaCampaigns.name,
        metaCampaigns.status,
        metaCampaigns.effectiveStatus,
        metaCampaigns.objective,
        metaCampaigns.buyingType,
        metaCampaigns.resultActionType,
        metaCampaigns.dailyBudget,
        metaCampaigns.lifetimeBudget,
        metaCampaigns.createdTime,
        metaCampaigns.startTime,
        metaCampaigns.stopTime,
      ),

    loadTotals(teamId, account.id, since, until, taxRate),
    loadTotals(teamId, account.id, previousSince, previousUntil, taxRate),
  ]);

  const campaigns: OverviewCampaignRow[] = campaignRows
    .map((row) => {
      const totals = buildKpis(
        {
          spendNet: num(row.spend),
          results: num(row.results),
          impressions: num(row.impressions),
          clicks: num(row.clicks),
          reach: num(row.reach),
        },
        taxRate,
      );

      return {
        id: row.id,
        campaignId: row.campaignId,
        name: row.name,
        status: row.status,
        effectiveStatus: row.effectiveStatus,
        objective: row.objective,
        objectiveLabel: objectiveLabel(row.objective),
        buyingType: row.buyingType,
        resultActionType: row.resultActionType,
        resultLabel: resultLabel(row.resultActionType),
        spend: totals.spend,
        spendNet: totals.spendNet,
        results: totals.results,
        costPerResult: totals.costPerResult,
        impressions: totals.impressions,
        reach: totals.reach,
        clicks: totals.clicks,
        ctr: totals.ctr,
        cpc: totals.cpc,
        cpm: totals.cpm,
        dailyBudget: row.dailyBudget === null ? null : applyTax(num(row.dailyBudget), taxRate),
        lifetimeBudget: row.lifetimeBudget === null ? null : applyTax(num(row.lifetimeBudget), taxRate),
        createdTime: row.createdTime ? row.createdTime.toISOString() : null,
        startTime: row.startTime ? row.startTime.toISOString() : null,
        stopTime: row.stopTime ? row.stopTime.toISOString() : null,
        activeDays: num(row.activeDays),
      } satisfies OverviewCampaignRow;
    })
    .sort((a, b) => b.spend - a.spend);

  const series: OverviewSeriesPoint[] = seriesRows.map((row) => {
    const spendNet = num(row.spend);
    const spend = applyTax(spendNet, taxRate);
    const results = num(row.results);

    return {
      date: row.bucket,
      label: seriesLabel(row.bucket, granularity),
      spend,
      spendNet,
      results,
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      costPerResult: results > 0 ? spend / results : null,
    };
  });

  const activeCampaigns = campaigns.filter((campaign) => campaign.status === 'ACTIVE').length;

  const distinctResultTypes = new Set(
    campaigns.filter((campaign) => campaign.results > 0).map((campaign) => campaign.resultActionType),
  );
  const sharedResultLabel =
    distinctResultTypes.size === 1 ? resultLabel([...distinctResultTypes][0]) : 'Resultados';

  return {
    account: {
      id: account.id,
      name: account.name,
      accountId: account.accountId,
      currency: account.currency,
      timezoneName: account.timezoneName,
      taxRate,
      lastSyncedAt: account.lastSyncedAt ? account.lastSyncedAt.toISOString() : null,
      lastSyncStatus: account.lastSyncStatus,
    },
    range: { since, until },
    granularity,
    kpis: { ...kpis, activeCampaigns },
    previousKpis,
    series,
    campaigns,
    resultLabel: sharedResultLabel,
  };
}
