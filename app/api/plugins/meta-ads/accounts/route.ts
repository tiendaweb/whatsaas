import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { metaAdAccounts, metaAdsTokens } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * `?visible=1` devuelve sólo las cuentas que deben aparecer en el selector del dashboard.
 * Sin el flag devuelve todas, que es lo que necesita la pantalla de ajustes.
 */
export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('metaAdsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const onlyVisible = new URL(request.url).searchParams.get('visible') === '1';

  const accounts = await db
    .select({
      id: metaAdAccounts.id,
      accountId: metaAdAccounts.accountId,
      name: metaAdAccounts.name,
      currency: metaAdAccounts.currency,
      timezoneName: metaAdAccounts.timezoneName,
      accountStatus: metaAdAccounts.accountStatus,
      businessName: metaAdAccounts.businessName,
      taxRate: metaAdAccounts.taxRate,
      visible: metaAdAccounts.visible,
      syncEnabled: metaAdAccounts.syncEnabled,
      lastSyncedAt: metaAdAccounts.lastSyncedAt,
      lastSyncStatus: metaAdAccounts.lastSyncStatus,
      lastError: metaAdAccounts.lastError,
      campaignsCount: metaAdAccounts.campaignsCount,
      tokenId: metaAdAccounts.tokenId,
      tokenLabel: metaAdsTokens.label,
      tokenStatus: metaAdsTokens.status,
    })
    .from(metaAdAccounts)
    .innerJoin(metaAdsTokens, eq(metaAdAccounts.tokenId, metaAdsTokens.id))
    .where(
      onlyVisible
        ? and(eq(metaAdAccounts.teamId, ctx.team.id), eq(metaAdAccounts.visible, true))
        : eq(metaAdAccounts.teamId, ctx.team.id),
    )
    .orderBy(asc(metaAdAccounts.name));

  return NextResponse.json(accounts.map((account) => ({ ...account, taxRate: Number(account.taxRate) })));
}
