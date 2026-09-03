import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { activityLogs } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { deleteCostCenter, FinanceCostCenterError, updateCostCenter } from '@/lib/plugins/finance/server/cost-centers';
import { costCenterSchema } from '@/lib/plugins/finance/server/schema';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = costCenterSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const costCenter = await updateCostCenter(ctx.team.id, ctx.user.id, id, parsed.data);
    if (!costCenter) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_COST_CENTER_UPDATED', ipAddress: String(id) });
    return NextResponse.json(costCenter);
  } catch (error) {
    if (error instanceof FinanceCostCenterError) return NextResponse.json({ error: error.code }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  try {
    const deleted = await deleteCostCenter(ctx.team.id, ctx.user.id, id);
    if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_COST_CENTER_DELETED', ipAddress: String(id) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FinanceCostCenterError) return NextResponse.json({ error: error.code }, { status: 409 });
    throw error;
  }
}
