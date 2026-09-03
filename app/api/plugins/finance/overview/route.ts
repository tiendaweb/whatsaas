import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  teamAappConnections,
  teamCostCenters,
  teamCustomers,
  teamFinancialAccounts,
  teamFinancialEntries,
  teamFinancialReceipts,
  teamMembershipCompanies,
  teamMembershipPlans,
  teamMembershipSubscriptions,
} from '@/lib/db/schema';
import { resolveMediaUrl } from '@/lib/media-url';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const [entries, receipts, customers, companies, plans, subscriptions, aappConnection, accounts, costCenters] = await Promise.all([
    db.select({
      id: teamFinancialEntries.id,
      type: teamFinancialEntries.type,
      title: teamFinancialEntries.title,
      description: teamFinancialEntries.description,
      category: teamFinancialEntries.category,
      amount: teamFinancialEntries.amount,
      currency: teamFinancialEntries.currency,
      accountId: teamFinancialEntries.accountId,
      costCenterId: teamFinancialEntries.costCenterId,
      saleId: teamFinancialEntries.saleId,
      projectId: teamFinancialEntries.projectId,
      status: teamFinancialEntries.status,
      occurredOn: teamFinancialEntries.occurredOn,
      dueOn: teamFinancialEntries.dueOn,
      paidOn: teamFinancialEntries.paidOn,
      recurrence: teamFinancialEntries.recurrence,
      recurrenceEndOn: teamFinancialEntries.recurrenceEndOn,
      nextDueOn: teamFinancialEntries.nextDueOn,
      paymentMethod: teamFinancialEntries.paymentMethod,
      counterparty: teamFinancialEntries.counterparty,
      customerId: teamFinancialEntries.customerId,
      customerName: teamCustomers.name,
      companyId: teamFinancialEntries.companyId,
      companyName: teamMembershipCompanies.name,
      planId: teamFinancialEntries.planId,
      planName: teamMembershipPlans.name,
      subscriptionId: teamFinancialEntries.subscriptionId,
      subscriptionNumber: teamMembershipSubscriptions.subscriptionNumber,
      externalSource: teamFinancialEntries.externalSource,
      createdAt: teamFinancialEntries.createdAt,
    }).from(teamFinancialEntries)
      .leftJoin(teamCustomers, eq(teamFinancialEntries.customerId, teamCustomers.id))
      .leftJoin(teamMembershipCompanies, eq(teamFinancialEntries.companyId, teamMembershipCompanies.id))
      .leftJoin(teamMembershipPlans, eq(teamFinancialEntries.planId, teamMembershipPlans.id))
      .leftJoin(teamMembershipSubscriptions, eq(teamFinancialEntries.subscriptionId, teamMembershipSubscriptions.id))
      .where(eq(teamFinancialEntries.teamId, ctx.team.id))
      .orderBy(desc(teamFinancialEntries.occurredOn), desc(teamFinancialEntries.id))
      .limit(1000),
    db.select({
      id: teamFinancialReceipts.id,
      entryId: teamFinancialReceipts.entryId,
      entryTitle: teamFinancialEntries.title,
      messageId: teamFinancialReceipts.messageId,
      chatId: teamFinancialReceipts.chatId,
      chatName: chats.name,
      mediaUrl: teamFinancialReceipts.mediaUrl,
      mimeType: teamFinancialReceipts.mimeType,
      fileName: teamFinancialReceipts.fileName,
      documentDate: teamFinancialReceipts.documentDate,
      paymentDate: teamFinancialReceipts.paymentDate,
      tags: teamFinancialReceipts.tags,
      notes: teamFinancialReceipts.notes,
      createdAt: teamFinancialReceipts.createdAt,
    }).from(teamFinancialReceipts)
      .leftJoin(teamFinancialEntries, eq(teamFinancialReceipts.entryId, teamFinancialEntries.id))
      .leftJoin(chats, eq(teamFinancialReceipts.chatId, chats.id))
      .where(eq(teamFinancialReceipts.teamId, ctx.team.id))
      .orderBy(desc(teamFinancialReceipts.createdAt))
      .limit(500),
    db.select({ id: teamCustomers.id, name: teamCustomers.name }).from(teamCustomers).where(eq(teamCustomers.teamId, ctx.team.id)).orderBy(teamCustomers.name),
    db.select({ id: teamMembershipCompanies.id, name: teamMembershipCompanies.name }).from(teamMembershipCompanies).where(eq(teamMembershipCompanies.teamId, ctx.team.id)).orderBy(teamMembershipCompanies.name),
    db.select({ id: teamMembershipPlans.id, name: teamMembershipPlans.name, companyId: teamMembershipPlans.companyId }).from(teamMembershipPlans).where(eq(teamMembershipPlans.teamId, ctx.team.id)).orderBy(teamMembershipPlans.name),
    db.select({ id: teamMembershipSubscriptions.id, subscriptionNumber: teamMembershipSubscriptions.subscriptionNumber, planName: teamMembershipSubscriptions.planNameSnapshot, customerId: teamMembershipSubscriptions.customerId, companyId: teamMembershipSubscriptions.companyId, planId: teamMembershipSubscriptions.planId }).from(teamMembershipSubscriptions).where(eq(teamMembershipSubscriptions.teamId, ctx.team.id)).orderBy(desc(teamMembershipSubscriptions.createdAt)),
    db.query.teamAappConnections.findFirst({ where: eq(teamAappConnections.teamId, ctx.team.id), columns: { status: true, lastSyncedAt: true } }),
    db.select().from(teamFinancialAccounts).where(eq(teamFinancialAccounts.teamId, ctx.team.id)).orderBy(teamFinancialAccounts.name),
    db.select().from(teamCostCenters).where(eq(teamCostCenters.teamId, ctx.team.id)).orderBy(teamCostCenters.name),
  ]);

  const openIncome = entries.filter((e) => e.type === 'income' && (e.status === 'pending' || e.status === 'overdue'));
  const openExpense = entries.filter((e) => e.type === 'expense' && (e.status === 'pending' || e.status === 'overdue'));
  const receivablesByCurrency: Record<string, number> = {};
  for (const e of openIncome) receivablesByCurrency[e.currency] = (receivablesByCurrency[e.currency] ?? 0) + e.amount;
  const payablesByCurrency: Record<string, number> = {};
  for (const e of openExpense) payablesByCurrency[e.currency] = (payablesByCurrency[e.currency] ?? 0) + e.amount;

  const expenseByCostCenter: Record<number, number> = {};
  for (const e of entries) {
    if (e.type === 'expense' && e.status === 'paid' && e.costCenterId) {
      expenseByCostCenter[e.costCenterId] = (expenseByCostCenter[e.costCenterId] ?? 0) + e.amount;
    }
  }

  const accountBalances = accounts.map((account) => {
    const linkedEntries = entries.filter((e) => e.accountId === account.id && e.status === 'paid');
    const netEntries = linkedEntries.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);
    return { ...account, balance: account.openingBalance + netEntries };
  });
  const availableBalanceByCurrency: Record<string, number> = {};
  for (const account of accountBalances) {
    if (!account.isActive) continue;
    availableBalanceByCurrency[account.currency] = (availableBalanceByCurrency[account.currency] ?? 0) + account.balance;
  }

  return NextResponse.json({
    entries,
    receipts: receipts.map((receipt) => ({ ...receipt, mediaUrl: resolveMediaUrl(receipt.mediaUrl) || receipt.mediaUrl })),
    options: { customers, companies, plans, subscriptions, accounts, costCenters },
    aappSpace: { connected: aappConnection?.status === 'connected', lastSyncedAt: aappConnection?.lastSyncedAt ?? null },
    treasury: {
      accountBalances,
      availableBalanceByCurrency,
      receivablesByCurrency,
      payablesByCurrency,
      expenseByCostCenter,
    },
  });
}
