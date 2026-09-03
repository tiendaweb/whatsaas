import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { activityLogs } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { createBudget, FinanceBudgetError, listBudgetsWithExecution } from '@/lib/plugins/finance/server/budgets';
import { budgetSchema } from '@/lib/plugins/finance/server/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await listBudgetsWithExecution(ctx.team.id));
}

export async function POST(request: Request) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = budgetSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const { budget, idempotent } = await createBudget(ctx.team.id, ctx.user.id, parsed.data);
    if (!idempotent) {
      await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_BUDGET_CREATED', ipAddress: parsed.data.name });
    }
    return NextResponse.json(budget, { status: idempotent ? 200 : 201 });
  } catch (error) {
    if (error instanceof FinanceBudgetError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
