import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { contacts, teamCustomers, teamDomains } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const createDomainSchema = z.object({
  name: z.string().min(1).max(255),
  registrar: z.string().max(100).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  registeredAt: z.string().optional().nullable(),
  autoRenew: z.boolean().default(false),
  status: z.enum(['active', 'expiring_soon', 'expired', 'transferred']).default('active'),
  contactId: z.number().int().optional().nullable(),
  notes: z.string().default(''),
  price: z.number().int().optional().nullable(),
  currency: z.string().length(3).default('USD'),
  tags: z.array(z.string()).default([]),
  notifyDaysBefore: z.number().int().default(30),
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return new Date(value);
}

export async function GET() {
  const context = await getPluginRequestContext('domainsRead');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const domains = await db
    .select({
      id: teamDomains.id,
      teamId: teamDomains.teamId,
      name: teamDomains.name,
      registrar: teamDomains.registrar,
      expiresAt: teamDomains.expiresAt,
      registeredAt: teamDomains.registeredAt,
      autoRenew: teamDomains.autoRenew,
      status: teamDomains.status,
      contactId: teamDomains.contactId,
      contactName: contacts.name,
      customerId: teamDomains.customerId,
      customerName: teamCustomers.name,
      notes: teamDomains.notes,
      price: teamDomains.price,
      currency: teamDomains.currency,
      tags: teamDomains.tags,
      notifyDaysBefore: teamDomains.notifyDaysBefore,
      source: teamDomains.source,
      createdAt: teamDomains.createdAt,
      updatedAt: teamDomains.updatedAt,
    })
    .from(teamDomains)
    .leftJoin(contacts, eq(teamDomains.contactId, contacts.id))
    .leftJoin(teamCustomers, eq(teamDomains.customerId, teamCustomers.id))
    .where(eq(teamDomains.teamId, context.team.id))
    .orderBy(asc(teamDomains.expiresAt), asc(teamDomains.name));

  return NextResponse.json(domains);
}

export async function POST(request: Request) {
  const context = await getPluginRequestContext('domainsWrite');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const body = await request.json();
  const parsed = createDomainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(teamDomains)
    .values({
      teamId: context.team.id,
      name: parsed.data.name,
      registrar: parsed.data.registrar ?? null,
      expiresAt: parseDate(parsed.data.expiresAt),
      registeredAt: parseDate(parsed.data.registeredAt),
      autoRenew: parsed.data.autoRenew,
      status: parsed.data.status,
      contactId: parsed.data.contactId ?? null,
      notes: parsed.data.notes,
      price: parsed.data.price ?? null,
      currency: parsed.data.currency,
      tags: parsed.data.tags,
      notifyDaysBefore: parsed.data.notifyDaysBefore,
      createdBy: context.user.id,
      updatedBy: context.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
