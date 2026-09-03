import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/drizzle';
import { contacts, teamCustomerContacts, teamCustomers } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export const dynamic = 'force-dynamic';

const querySchema = z.object({ contactId: z.coerce.number().int().positive() });

export async function GET(request: NextRequest) {
  const ctx = await getPluginRequestContext('customersRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const parsed = querySchema.safeParse({ contactId: request.nextUrl.searchParams.get('contactId') });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });

  const [linked] = await db
    .select({ customerId: teamCustomerContacts.customerId })
    .from(teamCustomerContacts)
    .innerJoin(teamCustomers, eq(teamCustomerContacts.customerId, teamCustomers.id))
    .innerJoin(contacts, eq(teamCustomerContacts.contactId, contacts.id))
    .where(and(
      eq(teamCustomerContacts.teamId, ctx.team.id),
      eq(teamCustomers.teamId, ctx.team.id),
      eq(contacts.teamId, ctx.team.id),
      eq(teamCustomerContacts.contactId, parsed.data.contactId),
    ))
    .orderBy(desc(teamCustomerContacts.createdAt))
    .limit(1);

  if (linked) return NextResponse.json({ customerId: linked.customerId });

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, parsed.data.contactId), eq(contacts.teamId, ctx.team.id)),
    columns: { id: true },
    with: { chat: { columns: { remoteJid: true } } },
  });
  const phoneDigits = contact?.chat?.remoteJid?.split('@')[0].replace(/\D/g, '') ?? '';
  if (!phoneDigits) return NextResponse.json({ customerId: null });

  const [customerByPhone] = await db
    .select({ customerId: teamCustomers.id })
    .from(teamCustomers)
    .where(and(
      eq(teamCustomers.teamId, ctx.team.id),
      sql`regexp_replace(coalesce(${teamCustomers.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`,
    ))
    .orderBy(desc(teamCustomers.updatedAt))
    .limit(1);

  return NextResponse.json({ customerId: customerByPhone?.customerId ?? null });
}
