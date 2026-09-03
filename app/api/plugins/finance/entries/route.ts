import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamFinancialEntries } from '@/lib/db/schema';
import { getFinanceRequestContext } from '@/lib/plugins/finance/server/access';
import { financialEntrySchema, nextRecurrenceDate, resolveFinancialRelations } from '@/lib/plugins/finance/server/schema';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const ctx = await getFinanceRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = financialEntrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const relations = await resolveFinancialRelations(ctx.team.id, parsed.data);
    const paidOn = parsed.data.status === 'paid' ? (parsed.data.paidOn ?? parsed.data.occurredOn) : (parsed.data.paidOn ?? null);
    const nextDueOn = parsed.data.recurrence === 'none'
      ? null
      : (parsed.data.nextDueOn ?? nextRecurrenceDate(parsed.data.dueOn ?? parsed.data.occurredOn, parsed.data.recurrence));
    const [entry] = await db.transaction(async (tx) => {
      const created = await tx.insert(teamFinancialEntries).values({
        teamId: ctx.team.id,
        ...parsed.data,
        ...relations,
        dueOn: parsed.data.dueOn ?? null,
        paidOn,
        recurrenceEndOn: parsed.data.recurrenceEndOn ?? null,
        nextDueOn,
        paymentMethod: parsed.data.paymentMethod || null,
        counterparty: parsed.data.counterparty || null,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }).returning();
      await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'FINANCE_ENTRY_CREATED', ipAddress: parsed.data.type });
      return created;
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid_')) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('[finance entries POST]', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
