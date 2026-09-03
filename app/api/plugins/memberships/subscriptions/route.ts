import { NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { contacts, teamCustomers, teamMembershipPlans, teamMembershipSubscriptions } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { BILLING_TYPES, PAYMENT_STATUS, SUBSCRIPTION_STATUS } from '@/lib/plugins/memberships/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');

const subscriptionSchema = z.object({
  subscriptionNumber: z.string().min(1).max(50),
  planId: z.number().int().optional().nullable(),
  customerId: z.number().int().optional().nullable(),
  contactId: z.number().int().optional().nullable(),
  price: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  billingType: z.enum(BILLING_TYPES).optional(),
  status: z.enum(SUBSCRIPTION_STATUS).default('active'),
  paymentStatus: z.enum(PAYMENT_STATUS).default('pending'),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).default(''),
}).refine((data) => data.customerId != null || data.contactId != null, { message: 'Selecciona un cliente o contacto' });

export async function GET() {
  const ctx = await getPluginRequestContext('membershipsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const subs = await db.query.teamMembershipSubscriptions.findMany({
    where: eq(teamMembershipSubscriptions.teamId, ctx.team.id),
    orderBy: [desc(teamMembershipSubscriptions.createdAt)],
    with: {
      plan: { columns: { id: true, name: true } },
      company: { columns: { id: true, name: true } },
      customer: {
        columns: {
          id: true,
          name: true,
          email: true,
          phone: true,
          source: true,
          profileImage: true,
          externalId: true,
        },
      },
      contact: {
        columns: { id: true, name: true },
        with: { chat: { columns: { remoteJid: true } } },
      },
    },
  });

  const missingAappCustomerIds = Array.from(new Set(
    subs
      .filter((subscription) => !subscription.customer && subscription.externalSource === 'aapp_space' && subscription.externalId)
      .map((subscription) => subscription.externalId as string),
  ));

  const fallbackCustomers = missingAappCustomerIds.length > 0
    ? await db.query.teamCustomers.findMany({
        where: and(
          eq(teamCustomers.teamId, ctx.team.id),
          eq(teamCustomers.source, 'aapp_space'),
          inArray(teamCustomers.externalId, missingAappCustomerIds),
        ),
        columns: {
          id: true,
          name: true,
          email: true,
          phone: true,
          source: true,
          profileImage: true,
          externalId: true,
        },
      })
    : [];
  const fallbackCustomerByExternalId = new Map(
    fallbackCustomers.map((customer) => [customer.externalId, customer]),
  );

  return NextResponse.json(subs.map((subscription) => ({
    ...subscription,
    customer: subscription.customer
      ?? (subscription.externalId ? fallbackCustomerByExternalId.get(subscription.externalId) : null)
      ?? null,
  })));
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;

  if (d.contactId != null) {
    const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.id, d.contactId), eq(contacts.teamId, ctx.team.id)), columns: { id: true } });
    if (!contact) return NextResponse.json({ error: 'Contacto inválido' }, { status: 400 });
  }
  if (d.customerId != null) {
    const customer = await db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.id, d.customerId), eq(teamCustomers.teamId, ctx.team.id)), columns: { id: true } });
    if (!customer) return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });
  }

  // Snapshot desde el plan (si se eligió uno del equipo).
  let planNameSnapshot = '';
  let companyId: number | null = null;
  let price = d.price ?? 0;
  let currency = d.currency ?? 'USD';
  let billingType = d.billingType ?? 'monthly';

  if (d.planId != null) {
    const plan = await db.query.teamMembershipPlans.findFirst({
      where: and(eq(teamMembershipPlans.id, d.planId), eq(teamMembershipPlans.teamId, ctx.team.id)),
    });
    if (!plan) return NextResponse.json({ error: 'Plan inválido' }, { status: 400 });
    planNameSnapshot = plan.name;
    companyId = plan.companyId;
    price = d.price ?? plan.price;
    currency = d.currency ?? plan.currency;
    billingType = d.billingType ?? plan.billingType as (typeof BILLING_TYPES)[number];
  }

  const [created] = await db
    .insert(teamMembershipSubscriptions)
    .values({
      teamId: ctx.team.id,
      subscriptionNumber: d.subscriptionNumber,
      planId: d.planId ?? null,
      companyId,
      customerId: d.customerId ?? null,
      contactId: d.contactId ?? null,
      planNameSnapshot,
      price,
      currency,
      billingType,
      status: d.status,
      paymentStatus: d.paymentStatus,
      startDate: d.startDate,
      endDate: d.endDate ?? null,
      notes: d.notes,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
