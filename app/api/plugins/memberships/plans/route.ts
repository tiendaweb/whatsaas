import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembershipPlans } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { syncPlanPrices } from '@/lib/plugins/memberships/server/prices';
import { assertCompanyOwnership, planSchema } from '@/lib/plugins/memberships/server/plan-schema';
import { PLAN_VISIBILITIES, type PlanVisibility } from '@/lib/plugins/memberships/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('membershipsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { searchParams } = new URL(request.url);
  const companyIdParam = searchParams.get('companyId');
  const companyId = companyIdParam ? parseInt(companyIdParam, 10) : null;
  const visibilityParam = searchParams.get('visibility');

  if (visibilityParam && !PLAN_VISIBILITIES.includes(visibilityParam as PlanVisibility)) {
    return NextResponse.json({ error: 'Invalid visibility' }, { status: 400 });
  }

  const filters = [eq(teamMembershipPlans.teamId, ctx.team.id)];
  if (companyId && !isNaN(companyId)) filters.push(eq(teamMembershipPlans.companyId, companyId));
  if (visibilityParam) filters.push(eq(teamMembershipPlans.visibility, visibilityParam));

  const where = filters.length === 1 ? filters[0] : and(...filters);

  const plans = await db.query.teamMembershipPlans.findMany({
    where,
    orderBy: [asc(teamMembershipPlans.position), asc(teamMembershipPlans.name)],
    with: { company: { columns: { id: true, name: true, logoUrl: true } } },
  });

  return NextResponse.json(plans);
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  if (!(await assertCompanyOwnership(ctx.team.id, d.companyId))) {
    return NextResponse.json({ error: 'Empresa inválida' }, { status: 400 });
  }

  const [created] = await db
    .insert(teamMembershipPlans)
    .values({
      teamId: ctx.team.id,
      companyId: d.companyId ?? null,
      name: d.name,
      description: d.description,
      billingType: d.billingType,
      price: d.price,
      setupFee: d.setupFee,
      maintenanceAmount: d.maintenanceAmount,
      maintenanceIntervalMonths: d.maintenanceIntervalMonths ?? null,
      billingLabel: d.billingType === 'custom' ? d.billingLabel ?? null : null,
      currency: d.currency,
      prices: syncPlanPrices({ prices: d.prices.length ? d.prices : undefined, currency: d.currency, price: d.price }),
      features: d.features,
      visibility: d.visibility,
      status: d.status,
      position: d.position ?? 0,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
