import { NextResponse } from 'next/server';
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamContracts,
  teamCustomers,
  teamFinancialEntries,
  teamPurchaseOrders,
  teamSaleCommissions,
  teamSales,
  teamSupportTickets,
} from '@/lib/db/schema';
import { getIntelligenceRequestContext } from '@/lib/plugins/intelligence/server/access';

export const dynamic = 'force-dynamic';

const OPEN_TICKET_STATUSES = sql`${teamSupportTickets.status} in ('open','in_progress','waiting_customer')`;
const OPEN_PO_STATUSES = sql`${teamPurchaseOrders.status} in ('draft','sent','confirmed')`;

export async function GET() {
  const ctx = await getIntelligenceRequestContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const teamId = ctx.team.id;
  const has = (pluginId: string) => ctx.activePluginIds.has(pluginId);

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const startOfMonthDate = startOfMonth.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    finance,
    sales,
    customers,
    purchasesPending,
    hrPendingCommissions,
    supportOpen,
    supportUrgent,
    contractsActive,
    contractsExpiring,
  ] = await Promise.all([
    has('finance')
      ? db.select({
          incomePaid: sql<number>`coalesce(sum(case when ${teamFinancialEntries.type} = 'income' and ${teamFinancialEntries.status} = 'paid' and ${teamFinancialEntries.occurredOn} >= ${startOfMonthDate} then ${teamFinancialEntries.amount} else 0 end), 0)`,
          expensePaid: sql<number>`coalesce(sum(case when ${teamFinancialEntries.type} = 'expense' and ${teamFinancialEntries.status} = 'paid' and ${teamFinancialEntries.occurredOn} >= ${startOfMonthDate} then ${teamFinancialEntries.amount} else 0 end), 0)`,
          pending: sql<number>`coalesce(sum(case when ${teamFinancialEntries.status} = 'pending' then ${teamFinancialEntries.amount} else 0 end), 0)`,
        }).from(teamFinancialEntries).where(eq(teamFinancialEntries.teamId, teamId))
      : Promise.resolve(null),
    db.select({
        count: sql<number>`count(*)`,
        total: sql<number>`coalesce(sum(${teamSales.total}), 0)`,
      }).from(teamSales)
      .where(and(eq(teamSales.teamId, teamId), isNotNull(teamSales.paidAt), gte(teamSales.paidAt, startOfMonth))),
    db.select({ count: sql<number>`count(*)` }).from(teamCustomers)
      .where(and(eq(teamCustomers.teamId, teamId), eq(teamCustomers.status, 'active'))),
    has('purchases')
      ? db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${teamPurchaseOrders.totalAmount}), 0)` })
          .from(teamPurchaseOrders).where(and(eq(teamPurchaseOrders.teamId, teamId), OPEN_PO_STATUSES))
      : Promise.resolve(null),
    has('hr')
      ? db.select({ total: sql<number>`coalesce(sum(${teamSaleCommissions.commissionAmount}), 0)` })
          .from(teamSaleCommissions).where(and(eq(teamSaleCommissions.teamId, teamId), eq(teamSaleCommissions.status, 'pending')))
      : Promise.resolve(null),
    has('support')
      ? db.select({ count: sql<number>`count(*)` }).from(teamSupportTickets).where(and(eq(teamSupportTickets.teamId, teamId), OPEN_TICKET_STATUSES))
      : Promise.resolve(null),
    has('support')
      ? db.select({ count: sql<number>`count(*)` }).from(teamSupportTickets)
          .where(and(eq(teamSupportTickets.teamId, teamId), OPEN_TICKET_STATUSES, eq(teamSupportTickets.priority, 'urgent')))
      : Promise.resolve(null),
    has('contracts')
      ? db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${teamContracts.value}), 0)` })
          .from(teamContracts).where(and(eq(teamContracts.teamId, teamId), eq(teamContracts.status, 'active')))
      : Promise.resolve(null),
    has('contracts')
      ? db.select({ count: sql<number>`count(*)` }).from(teamContracts)
          .where(and(eq(teamContracts.teamId, teamId), eq(teamContracts.status, 'active'), gte(teamContracts.endDate, today), sql`${teamContracts.endDate} <= ${in30Days}`))
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    finance: finance ? {
      incomePaid: Number(finance[0]?.incomePaid ?? 0),
      expensePaid: Number(finance[0]?.expensePaid ?? 0),
      pending: Number(finance[0]?.pending ?? 0),
    } : null,
    sales: { count: Number(sales[0]?.count ?? 0), total: Number(sales[0]?.total ?? 0) },
    customers: { active: Number(customers[0]?.count ?? 0) },
    purchases: purchasesPending ? { pendingCount: Number(purchasesPending[0]?.count ?? 0), pendingTotal: Number(purchasesPending[0]?.total ?? 0) } : null,
    hr: hrPendingCommissions ? { pendingCommissions: Number(hrPendingCommissions[0]?.total ?? 0) } : null,
    support: supportOpen ? { open: Number(supportOpen[0]?.count ?? 0), urgent: Number(supportUrgent?.[0]?.count ?? 0) } : null,
    contracts: contractsActive ? {
      activeCount: Number(contractsActive[0]?.count ?? 0),
      activeTotal: Number(contractsActive[0]?.total ?? 0),
      expiringSoon: Number(contractsExpiring?.[0]?.count ?? 0),
    } : null,
  });
}
