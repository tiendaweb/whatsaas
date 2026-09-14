import { NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  teamFinancialAccounts,
  teamFinancialEntries,
  teamFinancialEntryPayments,
  teamFinancingInstallments,
  teamFinancingPlans,
} from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { entryPaymentSchema } from '@/lib/plugins/finance/server/schema';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const entryId = Number((await params).id);
  if (!Number.isInteger(entryId)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const payments = await db.select().from(teamFinancialEntryPayments)
    .where(and(eq(teamFinancialEntryPayments.entryId, entryId), eq(teamFinancialEntryPayments.teamId, ctx.team.id)))
    .orderBy(asc(teamFinancialEntryPayments.paidOn));
  return NextResponse.json(payments);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const entryId = Number((await params).id);
  if (!Number.isInteger(entryId)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = entryPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const entry = await db.query.teamFinancialEntries.findFirst({
    where: and(eq(teamFinancialEntries.id, entryId), eq(teamFinancialEntries.teamId, ctx.team.id)),
    columns: { id: true, amount: true, currency: true, status: true },
  });
  if (!entry) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (entry.status === 'cancelled') return NextResponse.json({ error: 'entry_cancelled' }, { status: 409 });

  if (parsed.data.accountId) {
    const account = await db.query.teamFinancialAccounts.findFirst({
      where: and(eq(teamFinancialAccounts.id, parsed.data.accountId), eq(teamFinancialAccounts.teamId, ctx.team.id)),
      columns: { id: true, currency: true },
    });
    if (!account) return NextResponse.json({ error: 'invalid_account' }, { status: 400 });
    if (account.currency.toUpperCase() !== entry.currency.toUpperCase()) {
      return NextResponse.json({ error: 'account_currency_mismatch' }, { status: 400 });
    }
  }

  try {
    const payment = await db.transaction(async (tx) => {
      // Serializa cobros concurrentes sobre la misma cuota para que dos clics
      // simultáneos no puedan superar el saldo.
      await tx.execute(sql`select id from team_financial_entries where id = ${entryId} and team_id = ${ctx.team.id} for update`);
      const [{ total: beforeTotal }] = await tx.select({ total: sql<string>`coalesce(sum(${teamFinancialEntryPayments.amount}), 0)` })
        .from(teamFinancialEntryPayments)
        .where(and(eq(teamFinancialEntryPayments.entryId, entryId), eq(teamFinancialEntryPayments.teamId, ctx.team.id)));
      const alreadyPaid = Number(beforeTotal);
      const outstanding = Math.max(0, entry.amount - alreadyPaid);
      if (parsed.data.amount > outstanding) throw new Error('payment_exceeds_outstanding');

      const [created] = await tx.insert(teamFinancialEntryPayments).values({
        teamId: ctx.team.id,
        entryId,
        ...parsed.data,
        createdBy: ctx.user.id,
      }).returning();

      const [{ total }] = await tx.select({ total: sql<string>`coalesce(sum(${teamFinancialEntryPayments.amount}), 0)` })
        .from(teamFinancialEntryPayments)
        .where(and(eq(teamFinancialEntryPayments.entryId, entryId), eq(teamFinancialEntryPayments.teamId, ctx.team.id)));
      const projected = Number(total);
      const nextStatus = Number(total) >= entry.amount ? 'paid' : entry.status;

      if (Number(total) >= entry.amount && entry.status !== 'paid') {
        await tx.update(teamFinancialEntries).set({
          status: 'paid',
          paidOn: parsed.data.paidOn,
          updatedBy: ctx.user.id,
          updatedAt: new Date(),
        }).where(and(eq(teamFinancialEntries.id, entryId), eq(teamFinancialEntries.teamId, ctx.team.id)));
      }

      const installment = await tx.query.teamFinancingInstallments.findFirst({
        where: and(eq(teamFinancingInstallments.entryId, entryId), eq(teamFinancingInstallments.teamId, ctx.team.id)),
        columns: { planId: true },
      });
      if (installment && nextStatus === 'paid') {
        const remaining = await tx.select({ id: teamFinancingInstallments.id })
          .from(teamFinancingInstallments)
          .innerJoin(teamFinancialEntries, eq(teamFinancingInstallments.entryId, teamFinancialEntries.id))
          .where(and(
            eq(teamFinancingInstallments.teamId, ctx.team.id),
            eq(teamFinancingInstallments.planId, installment.planId),
            sql`${teamFinancialEntries.status} <> 'paid'`,
          ))
          .limit(1);
        if (remaining.length === 0) {
          await tx.update(teamFinancingPlans).set({ status: 'completed', updatedBy: ctx.user.id, updatedAt: new Date() })
            .where(and(eq(teamFinancingPlans.id, installment.planId), eq(teamFinancingPlans.teamId, ctx.team.id)));
        }
      }

      await tx.insert(activityLogs).values({
        teamId: ctx.team.id,
        userId: ctx.user.id,
        action: 'FINANCE_ENTRY_PAYMENT_CREATED',
        metadata: {
          entryId,
          amount: parsed.data.amount,
          currency: entry.currency,
          previousStatus: entry.status,
          nextStatus,
          paidOn: parsed.data.paidOn,
          accountId: parsed.data.accountId ?? null,
        },
      });
      return created;
    });

    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'payment_exceeds_outstanding') {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[finance entry payment POST]', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
