import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { metaAdAccounts } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { buildAdsOverview } from '@/lib/ads/overview';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('metaAdsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const accountId = Number(url.searchParams.get('accountId'));
  if (!Number.isInteger(accountId)) {
    return NextResponse.json({ error: 'Cuenta inválida.' }, { status: 400 });
  }

  const [account] = await db
    .select()
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.id, accountId), eq(metaAdAccounts.teamId, ctx.team.id)))
    .limit(1);

  if (!account) return NextResponse.json({ error: 'La cuenta no existe.' }, { status: 404 });

  const payload = await buildAdsOverview(ctx.team.id, account, {
    since: url.searchParams.get('since'),
    until: url.searchParams.get('until'),
    granularity: url.searchParams.get('granularity'),
  });

  return NextResponse.json(payload);
}
