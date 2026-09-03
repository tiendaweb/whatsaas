import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamFinancialAccounts } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { financialAccountSchema } from '@/lib/plugins/finance/server/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const accounts = await db.select().from(teamFinancialAccounts)
    .where(eq(teamFinancialAccounts.teamId, ctx.team.id))
    .orderBy(asc(teamFinancialAccounts.name));

  return NextResponse.json(accounts);
}

export async function POST(request: Request) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = financialAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [account] = await db.transaction(async (tx) => {
    const created = await tx.insert(teamFinancialAccounts).values({
      teamId: ctx.team.id,
      ...parsed.data,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    }).returning();
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_ACCOUNT_CREATED', ipAddress: parsed.data.name });
    return created;
  });
  return NextResponse.json(account, { status: 201 });
}
