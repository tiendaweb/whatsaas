import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamCustomerTransactions, teamCustomers, teamFinancialEntries } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';

function amountToCents(value: string | null) {
  const normalized = value?.trim().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

export async function POST() {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const transactions = await db.select({
    externalId: teamCustomerTransactions.externalId,
    customerId: teamCustomerTransactions.customerId,
    customerName: teamCustomers.name,
    amount: teamCustomerTransactions.amount,
    currency: teamCustomerTransactions.currency,
    paymentStatus: teamCustomerTransactions.paymentStatus,
    gateway: teamCustomerTransactions.gateway,
    transactionDate: teamCustomerTransactions.transactionDate,
    externalData: teamCustomerTransactions.externalData,
    createdAt: teamCustomerTransactions.createdAt,
  }).from(teamCustomerTransactions)
    .leftJoin(teamCustomers, eq(teamCustomerTransactions.customerId, teamCustomers.id))
    .where(eq(teamCustomerTransactions.teamId, ctx.team.id));

  let synced = 0;
  let skipped = 0;
  await db.transaction(async (tx) => {
    for (const transaction of transactions) {
      const paymentStatus = transaction.paymentStatus?.toUpperCase();
      const amount = amountToCents(transaction.amount);
      if (!['SUCCESS', 'PENDING'].includes(paymentStatus || '') || amount == null) {
        skipped += 1;
        continue;
      }
      const occurredOn = (transaction.transactionDate ?? transaction.createdAt).toISOString().slice(0, 10);
      const gateway = transaction.gateway?.trim() || 'AAPP SPACE';
      const title = transaction.customerName ? `${transaction.customerName} · ${gateway}` : `AAPP SPACE · ${gateway}`;
      await tx.insert(teamFinancialEntries).values({
        teamId: ctx.team.id,
        type: 'income',
        title: title.slice(0, 200),
        description: '',
        category: 'aapp_space',
        amount,
        currency: (transaction.currency || 'ARS').slice(0, 3).toUpperCase(),
        status: paymentStatus === 'SUCCESS' ? 'paid' : 'pending',
        occurredOn,
        paidOn: paymentStatus === 'SUCCESS' ? occurredOn : null,
        paymentMethod: gateway.slice(0, 80),
        counterparty: transaction.customerName?.slice(0, 200) || null,
        customerId: transaction.customerId,
        externalSource: 'aapp_space',
        externalId: transaction.externalId,
        externalData: { ...transaction.externalData, paymentStatus: transaction.paymentStatus, gateway: transaction.gateway },
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).onConflictDoUpdate({
        target: [teamFinancialEntries.teamId, teamFinancialEntries.externalSource, teamFinancialEntries.externalId],
        set: {
          title: title.slice(0, 200),
          amount,
          currency: (transaction.currency || 'ARS').slice(0, 3).toUpperCase(),
          status: paymentStatus === 'SUCCESS' ? 'paid' : 'pending',
          occurredOn,
          paidOn: paymentStatus === 'SUCCESS' ? occurredOn : null,
          paymentMethod: gateway.slice(0, 80),
          counterparty: transaction.customerName?.slice(0, 200) || null,
          customerId: transaction.customerId,
          externalData: { ...transaction.externalData, paymentStatus: transaction.paymentStatus, gateway: transaction.gateway },
          updatedBy: ctx.user.id,
          updatedAt: new Date(),
        },
      });
      synced += 1;
    }
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_AAPP_SYNCED', ipAddress: `synced:${synced}` });
  });

  return NextResponse.json({ synced, skipped });
}
