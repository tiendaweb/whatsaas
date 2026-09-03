import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  chats,
  contacts,
  teamCustomerContacts,
  teamCustomers,
} from '@/lib/db/schema';

export type Customer = typeof teamCustomers.$inferSelect;

export type ConvertContactOverrides = {
  name?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string;
  industry?: string | null;
  website?: string | null;
  employees?: number | null;
  annualRevenue?: number | null;
  location?: string | null;
};

export type ConvertContactResult = {
  customer: Customer;
  /** `false` cuando el contacto ya tenía cliente o se encontró uno por email/teléfono. */
  created: boolean;
  /** `true` si se vinculó a un cliente que ya existía en vez de crear uno nuevo. */
  linkedToExisting: boolean;
};

/**
 * Convierte un contacto en cliente, o lo vincula al que ya existe.
 *
 * Esta lógica vivía dentro del handler MCP `whatspro_register_customer`
 * (grok-connector/server/actions.ts) y por eso el botón de la UI no podía usarla.
 * Acá queda como servicio con firma `(teamId, …)`, que es lo que el resto del
 * producto espera y lo que hace barato exponerla después por conector.
 *
 * El orden de deduplicación importa y es el mismo que ya usaba el conector:
 *   1. vínculo previo en `team_customer_contacts`
 *   2. email
 *   3. teléfono (el del contacto, o el inferido del JID de su chat)
 * Sin esos tres pasos, convertir dos veces al mismo contacto crea dos fichas.
 */
export async function convertContactToCustomer(
  teamId: number,
  contactId: number,
  overrides: ConvertContactOverrides,
  actorId: number | null,
): Promise<ConvertContactResult> {
  const [row] = await db
    .select({ contact: contacts, remoteJid: chats.remoteJid })
    .from(contacts)
    .leftJoin(chats, eq(contacts.chatId, chats.id))
    .where(and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)))
    .limit(1);

  if (!row) throw new Error('El contacto no existe en este equipo.');
  const contact = row.contact;

  // 1. ¿ya tiene cliente?
  const existingLink = await db
    .select({ customer: teamCustomers })
    .from(teamCustomerContacts)
    .innerJoin(teamCustomers, eq(teamCustomerContacts.customerId, teamCustomers.id))
    .where(
      and(
        eq(teamCustomerContacts.teamId, teamId),
        eq(teamCustomerContacts.contactId, contactId),
      ),
    )
    .limit(1);

  let customer: Customer | null = existingLink[0]?.customer ?? null;
  let linkedToExisting = customer != null;

  const inferredPhone = row.remoteJid ? row.remoteJid.split('@')[0].replace(/\D/g, '') : null;
  const email = overrides.email !== undefined ? overrides.email : contact.email;
  const phone = overrides.phone !== undefined ? overrides.phone : (contact.phone ?? inferredPhone);

  // 2 y 3. deduplicar por email o teléfono
  if (!customer && (email || phone)) {
    const candidates = [
      email ? ilike(teamCustomers.email, email) : undefined,
      phone ? eq(teamCustomers.phone, phone) : undefined,
    ].filter((clause): clause is NonNullable<typeof clause> => clause != null);

    const [match] = await db
      .select()
      .from(teamCustomers)
      .where(and(eq(teamCustomers.teamId, teamId), or(...candidates)))
      .limit(1);
    if (match) {
      customer = match;
      linkedToExisting = true;
    }
  }

  const name = overrides.name?.trim() || contact.company?.trim() || contact.name;
  if (!name) throw new Error('Hace falta un nombre para crear el cliente.');

  const companyFields = {
    ...(overrides.industry !== undefined ? { industry: overrides.industry } : {}),
    ...(overrides.website !== undefined ? { website: overrides.website } : {}),
    ...(overrides.employees !== undefined ? { employees: overrides.employees } : {}),
    ...(overrides.annualRevenue !== undefined ? { annualRevenue: overrides.annualRevenue } : {}),
    ...(overrides.location !== undefined ? { location: overrides.location } : {}),
  };

  let created = false;
  if (customer) {
    const [updated] = await db
      .update(teamCustomers)
      .set({
        name,
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(overrides.notes !== undefined ? { notes: overrides.notes } : {}),
        ...companyFields,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(and(eq(teamCustomers.id, customer.id), eq(teamCustomers.teamId, teamId)))
      .returning();
    customer = updated;
  } else {
    const [inserted] = await db
      .insert(teamCustomers)
      .values({
        teamId,
        name,
        email: email || null,
        phone: phone || null,
        notes: overrides.notes ?? '',
        source: 'manual',
        customerSince: new Date(),
        ...companyFields,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning();
    customer = inserted;
    created = true;
  }

  await db
    .insert(teamCustomerContacts)
    .values({ teamId, customerId: customer.id, contactId })
    .onConflictDoNothing();

  await db.insert(activityLogs).values({
    teamId,
    userId: actorId,
    action: created ? 'CUSTOMER_CREATED_FROM_CONTACT' : 'CUSTOMER_LINKED_TO_CONTACT',
    metadata: { customerId: customer.id, contactId, created },
  });

  return { customer, created, linkedToExisting };
}

/** El cliente ya vinculado a un contacto, si lo hay. */
export async function customerForContact(
  teamId: number,
  contactId: number,
): Promise<Customer | null> {
  const [row] = await db
    .select({ customer: teamCustomers })
    .from(teamCustomerContacts)
    .innerJoin(teamCustomers, eq(teamCustomerContacts.customerId, teamCustomers.id))
    .where(
      and(eq(teamCustomerContacts.teamId, teamId), eq(teamCustomerContacts.contactId, contactId)),
    )
    .limit(1);
  return row?.customer ?? null;
}
