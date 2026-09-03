import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { metaAdsSyncRuns } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('metaAdsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const accountId = Number(new URL(request.url).searchParams.get('accountId'));
  if (!Number.isInteger(accountId)) {
    return NextResponse.json({ error: 'Cuenta inválida.' }, { status: 400 });
  }

  const runs = await db
    .select()
    .from(metaAdsSyncRuns)
    .where(and(eq(metaAdsSyncRuns.teamId, ctx.team.id), eq(metaAdsSyncRuns.adAccountId, accountId)))
    .orderBy(desc(metaAdsSyncRuns.startedAt))
    .limit(20);

  return NextResponse.json(runs);
}
