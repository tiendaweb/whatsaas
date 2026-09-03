import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamExchangeRates } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { exchangeRateSchema } from '@/lib/plugins/finance/server/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const base = searchParams.get('base')?.toUpperCase();
  const quote = searchParams.get('quote')?.toUpperCase();

  const conditions = [eq(teamExchangeRates.teamId, ctx.team.id)];
  if (base) conditions.push(eq(teamExchangeRates.baseCurrency, base));
  if (quote) conditions.push(eq(teamExchangeRates.quoteCurrency, quote));

  const rates = await db.select().from(teamExchangeRates)
    .where(and(...conditions))
    .orderBy(desc(teamExchangeRates.rateDate))
    .limit(500);

  return NextResponse.json(rates);
}

export async function POST(request: Request) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = exchangeRateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [rate] = await db.transaction(async (tx) => {
    const created = await tx.insert(teamExchangeRates).values({
      teamId: ctx.team.id,
      ...parsed.data,
      rate: String(parsed.data.rate),
      createdBy: ctx.user.id,
    }).returning();
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_EXCHANGE_RATE_CREATED', ipAddress: `${parsed.data.baseCurrency}/${parsed.data.quoteCurrency}` });
    return created;
  });
  return NextResponse.json(rate, { status: 201 });
}
