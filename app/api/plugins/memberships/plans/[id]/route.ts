import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembershipPlans } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { syncPlanPrices } from '@/lib/plugins/memberships/server/prices';
import { assertCompanyOwnership, planSchema } from '@/lib/plugins/memberships/server/plan-schema';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const updateSchema = planSchema.partial();

async function getOwned(teamId: number, id: number) {
  return db.query.teamMembershipPlans.findFirst({
    where: and(eq(teamMembershipPlans.id, id), eq(teamMembershipPlans.teamId, teamId)),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const planId = parseInt(id, 10);
  if (isNaN(planId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await getOwned(ctx.team.id, planId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  if (d.companyId !== undefined && !(await assertCompanyOwnership(ctx.team.id, d.companyId))) {
    return NextResponse.json({ error: 'Empresa inválida' }, { status: 400 });
  }

  const nextBillingType = d.billingType ?? existing.billingType;

  const [updated] = await db
    .update(teamMembershipPlans)
    .set({
      ...(d.companyId !== undefined ? { companyId: d.companyId ?? null } : {}),
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.billingType !== undefined ? { billingType: d.billingType } : {}),
      ...(d.price !== undefined ? { price: d.price } : {}),
      ...(d.setupFee !== undefined ? { setupFee: d.setupFee } : {}),
      ...(d.maintenanceAmount !== undefined ? { maintenanceAmount: d.maintenanceAmount } : {}),
      ...(d.maintenanceIntervalMonths !== undefined ? { maintenanceIntervalMonths: d.maintenanceIntervalMonths ?? null } : {}),
      ...(d.billingLabel !== undefined || d.billingType !== undefined
        ? { billingLabel: nextBillingType === 'custom' ? (d.billingLabel ?? existing.billingLabel ?? null) : null }
        : {}),
      ...(d.currency !== undefined ? { currency: d.currency } : {}),
      // Aunque no manden `prices`, la fila de la moneda principal sigue al precio.
      ...(d.prices !== undefined || d.price !== undefined || d.currency !== undefined
        ? {
            prices: syncPlanPrices({
              prices: d.prices,
              previous: existing.prices,
              currency: d.currency ?? existing.currency,
              price: d.price ?? existing.price,
            }),
          }
        : {}),
      ...(d.features !== undefined ? { features: d.features } : {}),
      ...(d.visibility !== undefined ? { visibility: d.visibility } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.position !== undefined ? { position: d.position } : {}),
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    })
    .where(eq(teamMembershipPlans.id, planId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const planId = parseInt(id, 10);
  if (isNaN(planId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const existing = await getOwned(ctx.team.id, planId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.delete(teamMembershipPlans).where(eq(teamMembershipPlans.id, planId));
  return NextResponse.json({ ok: true });
}
