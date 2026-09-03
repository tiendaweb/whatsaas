import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamFinancialEntries, teamSaleCommissions, users } from '@/lib/db/schema';
import { getHrRequestContext } from '@/lib/plugins/hr/server/access';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';

const SALE_COMMISSION_STATUSES = ['pending', 'approved', 'paid', 'cancelled'] as const;

const patchSchema = z.object({
  status: z.enum(SALE_COMMISSION_STATUSES).optional(),
  notes: z.string().max(2000).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getHrRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await db.query.teamSaleCommissions.findFirst({
    where: and(eq(teamSaleCommissions.id, id), eq(teamSaleCommissions.teamId, ctx.team.id)),
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const commission = await db.transaction(async (tx) => {
    let financeEntryId = existing.financeEntryId;

    if (parsed.data.status === 'paid' && existing.status !== 'paid' && !financeEntryId) {
      const activePlugins = await resolveActivePluginsForTeam(ctx.team.id, ctx.user.id);
      if (activePlugins.some((plugin) => plugin.pluginId === 'finance')) {
        const [seller] = await tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, existing.userId));
        const [entry] = await tx.insert(teamFinancialEntries).values({
          teamId: ctx.team.id,
          type: 'expense',
          title: `Comisión #${existing.saleId} — ${seller?.name ?? seller?.email ?? 'vendedor'}`,
          category: 'commission',
          amount: existing.commissionAmount,
          currency: existing.currency,
          status: 'paid',
          occurredOn: new Date().toISOString().slice(0, 10),
          paidOn: new Date().toISOString().slice(0, 10),
          saleId: existing.saleId,
          externalSource: 'hr_commission',
          externalId: String(existing.id),
          createdBy: ctx.user.id,
          updatedBy: ctx.user.id,
        }).onConflictDoNothing().returning();
        financeEntryId = entry?.id ?? null;
      }
    }

    const [updated] = await tx.update(teamSaleCommissions).set({
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      financeEntryId,
      updatedAt: new Date(),
    }).where(and(eq(teamSaleCommissions.id, id), eq(teamSaleCommissions.teamId, ctx.team.id))).returning();

    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'HR_COMMISSION_UPDATED', ipAddress: String(id) });
    return updated;
  });

  return NextResponse.json(commission);
}
