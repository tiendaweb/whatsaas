import { NextResponse } from 'next/server';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamFinancialEntries } from '@/lib/db/schema';
import { getIntelligenceRequestContext } from '@/lib/plugins/intelligence/server/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getIntelligenceRequestContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  if (!ctx.activePluginIds.has('finance')) {
    return NextResponse.json({ available: false, months: [] });
  }

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);
  sixMonthsAgo.setUTCDate(1);
  const fromDate = sixMonthsAgo.toISOString().slice(0, 10);

  const rows = await db
    .select({
      month: sql<string>`to_char(${teamFinancialEntries.occurredOn}, 'YYYY-MM')`,
      type: teamFinancialEntries.type,
      total: sql<number>`sum(${teamFinancialEntries.amount})`,
    })
    .from(teamFinancialEntries)
    .where(and(
      eq(teamFinancialEntries.teamId, ctx.team.id),
      eq(teamFinancialEntries.status, 'paid'),
      gte(teamFinancialEntries.occurredOn, fromDate),
    ))
    .groupBy(sql`to_char(${teamFinancialEntries.occurredOn}, 'YYYY-MM')`, teamFinancialEntries.type);

  const months: { month: string; income: number; expense: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push({ month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, income: 0, expense: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const row of rows) {
    const entry = byMonth.get(row.month);
    if (!entry) continue;
    if (row.type === 'income') entry.income = Number(row.total);
    else entry.expense = Number(row.total);
  }

  return NextResponse.json({ available: true, months });
}
