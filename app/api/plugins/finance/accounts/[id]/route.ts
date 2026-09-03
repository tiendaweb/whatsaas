import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamFinancialAccounts, teamFinancialEntries, teamFinancialEntryPayments } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { financialAccountSchema } from '@/lib/plugins/finance/server/schema';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = financialAccountSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [account] = await db.update(teamFinancialAccounts).set({
    ...parsed.data,
    updatedBy: ctx.user.id,
    updatedAt: new Date(),
  }).where(and(eq(teamFinancialAccounts.id, id), eq(teamFinancialAccounts.teamId, ctx.team.id))).returning();
  if (!account) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_ACCOUNT_UPDATED', ipAddress: String(id) });
  return NextResponse.json(account);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const [linkedEntry] = await db.select({ id: teamFinancialEntries.id }).from(teamFinancialEntries)
    .where(and(eq(teamFinancialEntries.accountId, id), eq(teamFinancialEntries.teamId, ctx.team.id))).limit(1);
  const [linkedPayment] = await db.select({ id: teamFinancialEntryPayments.id }).from(teamFinancialEntryPayments)
    .where(and(eq(teamFinancialEntryPayments.accountId, id), eq(teamFinancialEntryPayments.teamId, ctx.team.id))).limit(1);
  if (linkedEntry || linkedPayment) return NextResponse.json({ error: 'account_in_use' }, { status: 409 });

  const [deleted] = await db.delete(teamFinancialAccounts)
    .where(and(eq(teamFinancialAccounts.id, id), eq(teamFinancialAccounts.teamId, ctx.team.id)))
    .returning({ id: teamFinancialAccounts.id });
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_ACCOUNT_DELETED', ipAddress: String(id) });
  return NextResponse.json({ ok: true });
}
