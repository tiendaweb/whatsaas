import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamFinancialEntries } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { FinanceEntryError, updateFinancialEntry } from '@/lib/plugins/finance/server/entries';
import { FINANCIAL_STATUSES } from '@/lib/plugins/finance/server/schema';

const updateSchema = z.object({
  status: z.enum(FINANCIAL_STATUSES),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    // Misma regla que el conector (lib/plugins/finance/server/entries.ts). La
    // pantalla siempre manda paidOn al marcar pagado; si no viniera, hoy.
    const resultado = await updateFinancialEntry(ctx.team.id, ctx.user.id, id, {
      status: parsed.data.status,
      paid_on: parsed.data.status === 'paid' ? (parsed.data.paidOn ?? new Date().toISOString().slice(0, 10)) : (parsed.data.paidOn ?? null),
    });
    await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_ENTRY_STATUS_UPDATED', ipAddress: parsed.data.status });
    return NextResponse.json(resultado.entry);
  } catch (error) {
    if (error instanceof FinanceEntryError) {
      const notFound = error.message.includes('no existe');
      return NextResponse.json({ error: notFound ? 'not_found' : error.message }, { status: notFound ? 404 : 400 });
    }
    throw error;
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const [deleted] = await db.delete(teamFinancialEntries).where(and(eq(teamFinancialEntries.id, id), eq(teamFinancialEntries.teamId, ctx.team.id))).returning({ id: teamFinancialEntries.id });
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_ENTRY_DELETED', ipAddress: String(id) });
  return NextResponse.json({ ok: true });
}
