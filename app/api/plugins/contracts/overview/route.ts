import { NextResponse } from 'next/server';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamContracts } from '@/lib/db/schema';
import { getContractsRequestContext } from '@/lib/plugins/contracts/server/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getContractsRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [active, expiringSoon] = await Promise.all([
    db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${teamContracts.value}), 0)` })
      .from(teamContracts)
      .where(and(eq(teamContracts.teamId, ctx.team.id), eq(teamContracts.status, 'active'))),
    db.select({ count: sql<number>`count(*)` })
      .from(teamContracts)
      .where(and(
        eq(teamContracts.teamId, ctx.team.id),
        eq(teamContracts.status, 'active'),
        gte(teamContracts.endDate, today),
        lte(teamContracts.endDate, in30Days),
      )),
  ]);

  return NextResponse.json({
    activeContracts: { count: Number(active[0]?.count ?? 0), total: Number(active[0]?.total ?? 0) },
    expiringSoon: Number(expiringSoon[0]?.count ?? 0),
  });
}
