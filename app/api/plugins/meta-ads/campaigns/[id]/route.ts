import { NextResponse } from 'next/server';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { metaAdAccounts, metaCampaignInsightsDaily, metaCampaigns } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { objectiveLabel, resultLabel } from '@/lib/ads/results';
import { applyTax, parseTaxRate } from '@/lib/ads/tax';
import { buildKpis, num, resolveGranularity, seriesLabel } from '@/lib/ads/aggregate';
import type { CampaignDetailResponse, OverviewSeriesPoint } from '@/lib/ads/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('metaAdsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Campaña inválida.' }, { status: 400 });

  const [row] = await db
    .select({ campaign: metaCampaigns, account: metaAdAccounts })
    .from(metaCampaigns)
    .innerJoin(metaAdAccounts, eq(metaCampaigns.adAccountId, metaAdAccounts.id))
    .where(and(eq(metaCampaigns.id, id), eq(metaCampaigns.teamId, ctx.team.id)))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'La campaña no existe.' }, { status: 404 });

  const { campaign, account } = row;
  const taxRate = parseTaxRate(account.taxRate);

  const url = new URL(request.url);
  const until = url.searchParams.get('until') || isoDate(new Date());
  const since = url.searchParams.get('since') || isoDate(new Date(Date.now() - 29 * DAY_MS));
  const granularity = resolveGranularity(url.searchParams.get('granularity'), since, until);

  const scope = and(
    eq(metaCampaignInsightsDaily.campaignRowId, id),
    gte(metaCampaignInsightsDaily.date, since),
    lte(metaCampaignInsightsDaily.date, until),
  );

  // Literal, no parámetro: ver el comentario en overview/route.ts.
  const bucket = sql<string>`to_char(date_trunc('${sql.raw(granularity)}', ${metaCampaignInsightsDaily.date}::timestamp), 'YYYY-MM-DD')`;

  const [dailyRows, seriesRows] = await Promise.all([
    db.select().from(metaCampaignInsightsDaily).where(scope).orderBy(asc(metaCampaignInsightsDaily.date)),
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
  ]);

  const totals = buildKpis(
    {
      spendNet: dailyRows.reduce((sum, item) => sum + num(item.spend), 0),
      results: dailyRows.reduce((sum, item) => sum + num(item.results), 0),
      impressions: dailyRows.reduce((sum, item) => sum + item.impressions, 0),
      clicks: dailyRows.reduce((sum, item) => sum + item.clicks, 0),
      reach: dailyRows.reduce((max, item) => Math.max(max, item.reach), 0),
    },
    taxRate,
  );

  // Desglose de TODAS las acciones del período, no sólo la que cuenta como resultado.
  const actionTotals = new Map<string, number>();
  for (const daily of dailyRows) {
    for (const action of daily.actions ?? []) {
      actionTotals.set(action.action_type, (actionTotals.get(action.action_type) ?? 0) + (Number(action.value) || 0));
    }
  }

  const series: OverviewSeriesPoint[] = seriesRows.map((item) => {
    const spendNet = num(item.spend);
    const spend = applyTax(spendNet, taxRate);
    const results = num(item.results);

    return {
      date: item.bucket,
      label: seriesLabel(item.bucket, granularity),
      spend,
      spendNet,
      results,
      impressions: num(item.impressions),
      clicks: num(item.clicks),
      costPerResult: results > 0 ? spend / results : null,
    };
  });

  const activeDays = dailyRows.filter((item) => num(item.spend) > 0).length;

  const payload: CampaignDetailResponse = {
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
    campaign: {
      id: campaign.id,
      campaignId: campaign.campaignId,
      name: campaign.name,
      status: campaign.status,
      effectiveStatus: campaign.effectiveStatus,
      objective: campaign.objective,
      objectiveLabel: objectiveLabel(campaign.objective),
      buyingType: campaign.buyingType,
      resultActionType: campaign.resultActionType,
      resultLabel: resultLabel(campaign.resultActionType),
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
      dailyBudget: campaign.dailyBudget === null ? null : applyTax(num(campaign.dailyBudget), taxRate),
      lifetimeBudget: campaign.lifetimeBudget === null ? null : applyTax(num(campaign.lifetimeBudget), taxRate),
      createdTime: campaign.createdTime ? campaign.createdTime.toISOString() : null,
      startTime: campaign.startTime ? campaign.startTime.toISOString() : null,
      stopTime: campaign.stopTime ? campaign.stopTime.toISOString() : null,
      activeDays,
    },
    totals,
    series,
    daily: dailyRows.map((item) => {
      const spendNet = num(item.spend);
      const spend = applyTax(spendNet, taxRate);
      const results = num(item.results);

      return {
        date: item.date,
        spend,
        spendNet,
        results,
        impressions: item.impressions,
        reach: item.reach,
        clicks: item.clicks,
        ctr: item.impressions > 0 ? (item.clicks / item.impressions) * 100 : null,
        costPerResult: results > 0 ? spend / results : null,
      };
    }),
    actions: [...actionTotals.entries()]
      .map(([actionType, value]) => ({
        actionType,
        label: resultLabel(actionType),
        value,
        // Costo por acción con impuesto, calculado sobre el total del período.
        costPerAction: value > 0 ? totals.spend / value : null,
      }))
      .sort((a, b) => b.value - a.value),
  };

  return NextResponse.json(payload);
}
