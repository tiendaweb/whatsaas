import { NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamCustomerContacts,
  teamCustomers,
  teamCustomerStores,
  teamDomains,
  teamMembershipPlans,
  teamMembershipSubscriptions,
} from '@/lib/db/schema';
import { storeUrl } from '@/lib/aapp/client';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Los teléfonos de aapp.space vienen con formatos mezclados; wa.me sólo acepta dígitos. */
function whatsappPhone(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '').replace(/^00/, '');
  return digits.length >= 8 ? digits : null;
}

function externalCreatedAt(externalData: Record<string, unknown>): string | null {
  const raw = externalData?.created_at;
  if (!raw) return null;
  const date = new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET() {
  const ctx = await getPluginRequestContext('aappSpaceRead');
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  }

  const customers = await db
    .select()
    .from(teamCustomers)
    .where(and(eq(teamCustomers.teamId, ctx.team.id), eq(teamCustomers.source, 'aapp_space')));

  if (customers.length === 0) {
    return NextResponse.json([]);
  }

  const customerIds = customers.map((customer) => customer.id);

  const [stores, subscriptions, links, domains] = await Promise.all([
    db
      .select()
      .from(teamCustomerStores)
      .where(and(
        eq(teamCustomerStores.teamId, ctx.team.id),
        inArray(teamCustomerStores.customerId, customerIds),
      )),
    db
      .select({
        customerId: teamMembershipSubscriptions.customerId,
        status: teamMembershipSubscriptions.status,
        endDate: teamMembershipSubscriptions.endDate,
        planName: teamMembershipPlans.name,
      })
      .from(teamMembershipSubscriptions)
      .leftJoin(teamMembershipPlans, eq(teamMembershipSubscriptions.planId, teamMembershipPlans.id))
      .where(and(
        eq(teamMembershipSubscriptions.teamId, ctx.team.id),
        inArray(teamMembershipSubscriptions.customerId, customerIds),
      ))
      .orderBy(desc(teamMembershipSubscriptions.createdAt)),
    db
      .select({ customerId: teamCustomerContacts.customerId, contactId: teamCustomerContacts.contactId })
      .from(teamCustomerContacts)
      .where(and(
        eq(teamCustomerContacts.teamId, ctx.team.id),
        inArray(teamCustomerContacts.customerId, customerIds),
      )),
    db
      .select({
        customerId: teamDomains.customerId,
        name: teamDomains.name,
        expiresAt: teamDomains.expiresAt,
        status: teamDomains.status,
      })
      .from(teamDomains)
      .where(and(eq(teamDomains.teamId, ctx.team.id), inArray(teamDomains.customerId, customerIds))),
  ]);

  const storesByCustomer = new Map<number, typeof stores>();
  for (const store of stores) {
    if (!store.customerId) continue;
    const list = storesByCustomer.get(store.customerId) ?? [];
    list.push(store);
    storesByCustomer.set(store.customerId, list);
  }

  // Las subscripciones vienen ordenadas por createdAt desc: la primera de cada cliente es la vigente.
  const subscriptionByCustomer = new Map<number, (typeof subscriptions)[number]>();
  for (const subscription of subscriptions) {
    if (subscription.customerId && !subscriptionByCustomer.has(subscription.customerId)) {
      subscriptionByCustomer.set(subscription.customerId, subscription);
    }
  }

  const contactByCustomer = new Map(links.map((link) => [link.customerId, link.contactId]));

  const domainsByCustomer = new Map<number, typeof domains>();
  for (const domain of domains) {
    if (!domain.customerId) continue;
    const list = domainsByCustomer.get(domain.customerId) ?? [];
    list.push(domain);
    domainsByCustomer.set(domain.customerId, list);
  }

  const payload = customers.map((customer) => {
    const customerStores = storesByCustomer.get(customer.id) ?? [];
    const subscription = subscriptionByCustomer.get(customer.id) ?? null;
    const registeredDomains = domainsByCustomer.get(customer.id) ?? [];

    const sites = customerStores
      .map((store) => ({
        id: store.id,
        title: store.title || store.subTitle || `Sitio ${store.externalId}`,
        // aapp.space distingue tarjeta de presentación (vcard) de tienda online (store).
        kind: store.cardType === 'store' ? ('store' as const) : ('vcard' as const),
        url: storeUrl({ custom_domain: store.customDomain, card_url: store.cardUrl }),
        customDomain: store.customDomain || null,
        status: store.status,
        createdAt: externalCreatedAt(store.externalData),
      }))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    const hasDomain = sites.some((site) => Boolean(site.customDomain)) || registeredDomains.length > 0;

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      whatsappPhone: whatsappPhone(customer.phone),
      status: customer.status,
      profileImage: customer.profileImage,
      contactId: contactByCustomer.get(customer.id) ?? null,
      // Fecha de alta en aapp.space, no la de nuestra sincronización.
      registeredAt: externalCreatedAt(customer.externalData),
      subscription: subscription
        ? { status: subscription.status, endDate: subscription.endDate, planName: subscription.planName }
        : null,
      hasDomain,
      domains: registeredDomains.map((domain) => ({
        name: domain.name,
        expiresAt: domain.expiresAt,
        status: domain.status,
      })),
      sites,
    };
  });

  payload.sort((a, b) => (b.registeredAt ?? '').localeCompare(a.registeredAt ?? ''));

  return NextResponse.json(payload);
}
