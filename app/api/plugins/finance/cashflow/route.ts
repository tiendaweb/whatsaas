import { NextResponse } from 'next/server';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamFinancialAccounts, teamFinancialEntries } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';

export const dynamic = 'force-dynamic';

function isoWeek(dateStr: string) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 90, 7), 365);
  const currency = (searchParams.get('currency') || 'ARS').toUpperCase();

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  const [accounts, paidEntries, pendingEntries] = await Promise.all([
    db.select({ openingBalance: teamFinancialAccounts.openingBalance })
      .from(teamFinancialAccounts)
      .where(and(eq(teamFinancialAccounts.teamId, ctx.team.id), eq(teamFinancialAccounts.isActive, true), eq(teamFinancialAccounts.currency, currency))),
    db.select({ type: teamFinancialEntries.type, amount: teamFinancialEntries.amount })
      .from(teamFinancialEntries)
      .where(and(eq(teamFinancialEntries.teamId, ctx.team.id), eq(teamFinancialEntries.currency, currency), eq(teamFinancialEntries.status, 'paid'))),
    db.select({
      type: teamFinancialEntries.type,
      amount: teamFinancialEntries.amount,
      effectiveDate: sql<string>`coalesce(${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn})`,
    }).from(teamFinancialEntries)
      .where(and(
        eq(teamFinancialEntries.teamId, ctx.team.id),
        eq(teamFinancialEntries.currency, currency),
        inArray(teamFinancialEntries.status, ['pending', 'overdue']),
        sql`coalesce(${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn}) <= ${horizon}`,
      )),
  ]);

  const openingTotal = accounts.reduce((sum, account) => sum + account.openingBalance, 0);
  const paidIncome = paidEntries.filter((e) => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
  const paidExpense = paidEntries.filter((e) => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
  const currentBalance = openingTotal + paidIncome - paidExpense;

  const buckets = new Map<string, { period: string; income: number; expense: number }>();
  for (const entry of pendingEntries) {
    const period = isoWeek(entry.effectiveDate);
    const bucket = buckets.get(period) ?? { period, income: 0, expense: 0 };
    if (entry.type === 'income') bucket.income += entry.amount;
    else bucket.expense += entry.amount;
    buckets.set(period, bucket);
  }

  const projection = Array.from(buckets.values()).sort((a, b) => a.period.localeCompare(b.period));
  let running = currentBalance;
  const projectionWithBalance = projection.map((bucket) => {
    running = running + bucket.income - bucket.expense;
    return { ...bucket, projectedBalance: running };
  });

  return NextResponse.json({
    currency,
    today,
    horizon,
    currentBalance,
    projection: projectionWithBalance,
  });
}
