import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamCommissionRules, teamSaleCommissions } from '@/lib/db/schema';
import { getHrRequestContext } from '@/lib/plugins/hr/server/access';
import { commissionRuleSchema } from '@/lib/plugins/hr/server/schema';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getHrRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = commissionRuleSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [rule] = await db.update(teamCommissionRules).set({
    ...parsed.data,
    updatedAt: new Date(),
  }).where(and(eq(teamCommissionRules.id, id), eq(teamCommissionRules.teamId, ctx.team.id))).returning();
  if (!rule) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'HR_COMMISSION_RULE_UPDATED', ipAddress: String(id) });
  return NextResponse.json(rule);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getHrRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const [linked] = await db.select({ id: teamSaleCommissions.id }).from(teamSaleCommissions)
    .where(and(eq(teamSaleCommissions.ruleId, id), eq(teamSaleCommissions.teamId, ctx.team.id))).limit(1);
  if (linked) return NextResponse.json({ error: 'rule_in_use' }, { status: 409 });

  const [deleted] = await db.delete(teamCommissionRules)
    .where(and(eq(teamCommissionRules.id, id), eq(teamCommissionRules.teamId, ctx.team.id)))
    .returning({ id: teamCommissionRules.id });
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'HR_COMMISSION_RULE_DELETED', ipAddress: String(id) });
  return NextResponse.json({ ok: true });
}
