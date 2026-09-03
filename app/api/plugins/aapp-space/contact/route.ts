import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamCustomerContacts,
  teamCustomers,
  teamCustomerStores,
  teamMembershipPlans,
  teamMembershipSubscriptions,
} from '@/lib/db/schema';
import { storeUrl } from '@/lib/aapp/client';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('customersRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const contactId = Number(new URL(request.url).searchParams.get('contactId'));
  if (!Number.isInteger(contactId) || contactId <= 0) return NextResponse.json(null);

  const [link] = await db
    .select({ customer: teamCustomers })
    .from(teamCustomerContacts)
    .innerJoin(teamCustomers, eq(teamCustomerContacts.customerId, teamCustomers.id))
    .where(and(
      eq(teamCustomerContacts.teamId, ctx.team.id),
      eq(teamCustomerContacts.contactId, contactId),
      eq(teamCustomers.source, 'aapp_space'),
    ))
    .limit(1);
  if (!link) return NextResponse.json(null);

  const [subscription] = await db
    .select({
      id: teamMembershipSubscriptions.id,
      status: teamMembershipSubscriptions.status,
      paymentStatus: teamMembershipSubscriptions.paymentStatus,
      startDate: teamMembershipSubscriptions.startDate,
      endDate: teamMembershipSubscriptions.endDate,
      planName: teamMembershipPlans.name,
      billingType: teamMembershipSubscriptions.billingType,
    })
    .from(teamMembershipSubscriptions)
    .leftJoin(teamMembershipPlans, eq(teamMembershipSubscriptions.planId, teamMembershipPlans.id))
    .where(and(
      eq(teamMembershipSubscriptions.teamId, ctx.team.id),
      eq(teamMembershipSubscriptions.customerId, link.customer.id),
    ))
    .orderBy(desc(teamMembershipSubscriptions.createdAt))
    .limit(1);

  const stores = await db.query.teamCustomerStores.findMany({
    where: and(eq(teamCustomerStores.teamId, ctx.team.id), eq(teamCustomerStores.customerId, link.customer.id)),
    orderBy: [desc(teamCustomerStores.updatedAt)],
  });

  return NextResponse.json({
    customer: { id: link.customer.id, name: link.customer.name, email: link.customer.email, phone: link.customer.phone },
    subscription: subscription ?? null,
    websites: stores.map((item) => ({
      id: item.id,
      title: item.title || item.subTitle || `Sitio web ${item.externalId}`,
      url: storeUrl({ custom_domain: item.customDomain, card_url: item.cardUrl }),
      status: item.status,
    })),
  });
}
