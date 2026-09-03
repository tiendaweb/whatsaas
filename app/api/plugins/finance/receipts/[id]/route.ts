import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamFinancialReceipts } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const [deleted] = await db.delete(teamFinancialReceipts).where(and(eq(teamFinancialReceipts.id, id), eq(teamFinancialReceipts.teamId, ctx.team.id))).returning({ id: teamFinancialReceipts.id });
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_RECEIPT_REMOVED', ipAddress: String(id) });
  return NextResponse.json({ ok: true });
}
