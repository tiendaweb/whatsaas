import { NextResponse } from 'next/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembershipPlans, teamMembershipSubscriptions } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import {
  deleteMembershipCompany,
  getMembershipCompany,
  membershipCompanyUpdateSchema,
  updateMembershipCompany,
} from '@/lib/plugins/memberships/server/companies';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('membershipsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const company = await getMembershipCompany(ctx.team.id, companyId);
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [plans, subscriptions] = await Promise.all([
    db.query.teamMembershipPlans.findMany({
      where: and(
        eq(teamMembershipPlans.teamId, ctx.team.id),
        eq(teamMembershipPlans.companyId, companyId),
      ),
      orderBy: [asc(teamMembershipPlans.position), asc(teamMembershipPlans.name)],
    }),
    db.query.teamMembershipSubscriptions.findMany({
      where: and(
        eq(teamMembershipSubscriptions.teamId, ctx.team.id),
        eq(teamMembershipSubscriptions.companyId, companyId),
      ),
      orderBy: [desc(teamMembershipSubscriptions.createdAt)],
      with: {
        plan: { columns: { id: true, name: true } },
        customer: { columns: { id: true, name: true, email: true, phone: true } },
        contact: {
          columns: { id: true, name: true },
          with: { chat: { columns: { remoteJid: true } } },
        },
      },
    }),
  ]);

  const recipients = new Set(
    subscriptions.map((subscription) =>
      subscription.customerId != null
        ? `customer:${subscription.customerId}`
        : `contact:${subscription.contactId}`,
    ),
  );

  return NextResponse.json({
    ...company,
    plans,
    subscriptions,
    metrics: {
      plans: plans.length,
      activePlans: plans.filter((plan) => plan.status === 'active').length,
      subscriptions: subscriptions.length,
      activeSubscriptions: subscriptions.filter((subscription) => subscription.status === 'active').length,
      overdueSubscriptions: subscriptions.filter(
        (subscription) => subscription.paymentStatus === 'overdue',
      ).length,
      customers: recipients.size,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json();
  const parsed = membershipCompanyUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await updateMembershipCompany(ctx.team.id, ctx.user.id, companyId, parsed.data);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const companyId = parseInt(id, 10);
  if (isNaN(companyId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const deleted = await deleteMembershipCompany(ctx.team.id, ctx.user.id, companyId);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
