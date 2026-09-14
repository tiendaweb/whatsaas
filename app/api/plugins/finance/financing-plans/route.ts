import { NextResponse } from 'next/server';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import {
  createFinancingPlan,
  financingPlanSchema,
  FinancingError,
  listFinancingPlans,
} from '@/lib/plugins/finance/server/financing';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await listFinancingPlans(ctx.team.id));
}

export async function POST(request: Request) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = financingPlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const plan = await createFinancingPlan(ctx.team.id, ctx.user.id, parsed.data);
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    if (error instanceof FinancingError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('[finance financing-plans POST]', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
