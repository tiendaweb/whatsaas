import { NextResponse } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPurchaseOrders, teamVendors } from '@/lib/db/schema';
import { getPurchasesRequestContext } from '@/lib/plugins/purchases/server/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getPurchasesRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [pending, thisMonth, activeVendors] = await Promise.all([
    db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${teamPurchaseOrders.totalAmount}), 0)` })
      .from(teamPurchaseOrders)
      .where(and(eq(teamPurchaseOrders.teamId, ctx.team.id), sql`${teamPurchaseOrders.status} in ('draft','sent','confirmed')`)),
    db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${teamPurchaseOrders.totalAmount}), 0)` })
      .from(teamPurchaseOrders)
      .where(and(eq(teamPurchaseOrders.teamId, ctx.team.id), gte(teamPurchaseOrders.createdAt, startOfMonth))),
    db.select({ count: sql<number>`count(*)` })
      .from(teamVendors)
      .where(and(eq(teamVendors.teamId, ctx.team.id), eq(teamVendors.isActive, true))),
  ]);

  return NextResponse.json({
    pendingOrders: { count: Number(pending[0]?.count ?? 0), total: Number(pending[0]?.total ?? 0) },
    ordersThisMonth: { count: Number(thisMonth[0]?.count ?? 0), total: Number(thisMonth[0]?.total ?? 0) },
    activeVendors: Number(activeVendors[0]?.count ?? 0),
  });
}
