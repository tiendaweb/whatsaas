import { NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamFinancialAccounts, teamFinancialEntries, teamFinancialEntryPayments } from '@/lib/db/schema';
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
    columns: { id: true, amount: true, status: true },
  });
  if (!entry) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (parsed.data.accountId) {
    const account = await db.query.teamFinancialAccounts.findFirst({
      where: and(eq(teamFinancialAccounts.id, parsed.data.accountId), eq(teamFinancialAccounts.teamId, ctx.team.id)),
      columns: { id: true },
    });
    if (!account) return NextResponse.json({ error: 'invalid_account' }, { status: 400 });
  }

  const payment = await db.transaction(async (tx) => {
    const [created] = await tx.insert(teamFinancialEntryPayments).values({
      teamId: ctx.team.id,
      entryId,
      ...parsed.data,
      createdBy: ctx.user.id,
    }).returning();

    const [{ total }] = await tx.select({ total: sql<string>`coalesce(sum(${teamFinancialEntryPayments.amount}), 0)` })
      .from(teamFinancialEntryPayments)
      .where(eq(teamFinancialEntryPayments.entryId, entryId));

    if (Number(total) >= entry.amount && entry.status !== 'paid') {
      await tx.update(teamFinancialEntries).set({
        status: 'paid',
        paidOn: parsed.data.paidOn,
        updatedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(teamFinancialEntries.id, entryId));
    }

    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_ENTRY_PAYMENT_CREATED', ipAddress: String(entryId) });
    return created;
  });

  return NextResponse.json(payment, { status: 201 });
}
