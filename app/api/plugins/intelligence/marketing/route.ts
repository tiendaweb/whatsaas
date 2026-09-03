import { NextResponse } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { metaAdAccounts, metaCampaignInsightsDaily } from '@/lib/db/schema';
import { getIntelligenceRequestContext } from '@/lib/plugins/intelligence/server/access';
import { applyTax, parseTaxRate } from '@/lib/ads/tax';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getIntelligenceRequestContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (!ctx.activePluginIds.has('meta-ads')) {
    return NextResponse.json({ available: false, byCurrency: [] });
  }

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  const startOfMonthDate = startOfMonth.toISOString().slice(0, 10);

  const rows = await db
    .select({
      accountId: metaAdAccounts.id,
      currency: metaAdAccounts.currency,
      taxRate: metaAdAccounts.taxRate,
      spendNet: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.spend}), 0)`,
      impressions: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.impressions}), 0)`,
      clicks: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.clicks}), 0)`,
    })
    .from(metaCampaignInsightsDaily)
    .innerJoin(metaAdAccounts, eq(metaAdAccounts.id, metaCampaignInsightsDaily.adAccountId))
    .where(and(eq(metaCampaignInsightsDaily.teamId, ctx.team.id), gte(metaCampaignInsightsDaily.date, startOfMonthDate)))
    .groupBy(metaAdAccounts.id, metaAdAccounts.currency, metaAdAccounts.taxRate);

  const byCurrency = new Map<string, { currency: string; spend: number; impressions: number; clicks: number }>();
  for (const row of rows) {
    const currency = row.currency || 'USD';
    const spendNet = Number(row.spendNet) || 0;
    const taxRate = parseTaxRate(row.taxRate);
    const spend = applyTax(spendNet, taxRate);
    const entry = byCurrency.get(currency) ?? { currency, spend: 0, impressions: 0, clicks: 0 };
    entry.spend += spend;
    entry.impressions += Number(row.impressions) || 0;
    entry.clicks += Number(row.clicks) || 0;
    byCurrency.set(currency, entry);
  }

  const result = Array.from(byCurrency.values()).map((entry) => ({
    ...entry,
    ctr: entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : null,
    cpc: entry.clicks > 0 ? entry.spend / entry.clicks : null,
    cpm: entry.impressions > 0 ? (entry.spend / entry.impressions) * 1000 : null,
  }));

  return NextResponse.json({ available: true, byCurrency: result });
}
