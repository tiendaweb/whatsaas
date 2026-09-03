import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { activityLogs } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { createCostCenter, FinanceCostCenterError, listCostCenters } from '@/lib/plugins/finance/server/cost-centers';
import { costCenterSchema } from '@/lib/plugins/finance/server/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getFinanceRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await listCostCenters(ctx.team.id));
}

export async function POST(request: Request) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = costCenterSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const { costCenter, idempotent } = await createCostCenter(ctx.team.id, ctx.user.id, parsed.data);
    if (!idempotent) {
      await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_COST_CENTER_CREATED', ipAddress: parsed.data.name });
    }
    return NextResponse.json(costCenter, { status: idempotent ? 200 : 201 });
  } catch (error) {
    if (error instanceof FinanceCostCenterError) return NextResponse.json({ error: error.code }, { status: 409 });
    throw error;
  }
}
