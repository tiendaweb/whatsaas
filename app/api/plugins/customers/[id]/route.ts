import { NextResponse } from 'next/server';
import { and, asc, desc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, customFields, teamCustomerContacts, teamCustomers, teamCustomerStores, teamCustomerTransactions, teamMembershipPlans, teamMembershipSubscriptions, teamTaskItems, teamTaskMedia, teamTaskRelations } from '@/lib/db/schema';
import { resolveMediaUrl } from '@/lib/media-url';
import { storeUrl } from '@/lib/aapp/client';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { deleteRelationsFor } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

async function owned(teamId: number, id: number) { return db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.teamId, teamId), eq(teamCustomers.id, id)) }); }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const customerId = Number((await params).id);
  if (!Number.isInteger(customerId)) return NextResponse.json({ error: 'Invalid customer id' }, { status: 400 });
  const customer = await owned(ctx.team.id, customerId);
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  const [linkedContacts, subscriptions, stores, transactions, attachments, relations, customFieldDefs] = await Promise.all([
    db.select({ id: contacts.id, name: contacts.name, remoteJid: chats.remoteJid, profilePicUrl: chats.profilePicUrl, customData: contacts.customData }).from(teamCustomerContacts).innerJoin(contacts, eq(teamCustomerContacts.contactId, contacts.id)).innerJoin(chats, eq(contacts.chatId, chats.id)).where(and(eq(teamCustomerContacts.teamId, ctx.team.id), eq(teamCustomerContacts.customerId, customerId))),
    db.select({ id: teamMembershipSubscriptions.id, subscriptionNumber: teamMembershipSubscriptions.subscriptionNumber, status: teamMembershipSubscriptions.status, paymentStatus: teamMembershipSubscriptions.paymentStatus, startDate: teamMembershipSubscriptions.startDate, endDate: teamMembershipSubscriptions.endDate, planName: teamMembershipPlans.name, price: teamMembershipSubscriptions.price, currency: teamMembershipSubscriptions.currency }).from(teamMembershipSubscriptions).leftJoin(teamMembershipPlans, eq(teamMembershipSubscriptions.planId, teamMembershipPlans.id)).where(and(eq(teamMembershipSubscriptions.teamId, ctx.team.id), eq(teamMembershipSubscriptions.customerId, customerId))).orderBy(desc(teamMembershipSubscriptions.createdAt)),
    db.query.teamCustomerStores.findMany({ where: and(eq(teamCustomerStores.teamId, ctx.team.id), eq(teamCustomerStores.customerId, customerId)), orderBy: [desc(teamCustomerStores.updatedAt)] }),
    db.query.teamCustomerTransactions.findMany({ where: and(eq(teamCustomerTransactions.teamId, ctx.team.id), eq(teamCustomerTransactions.customerId, customerId)), orderBy: [desc(teamCustomerTransactions.transactionDate)], limit: 100 }),
    db.query.teamTaskMedia.findMany({ where: and(eq(teamTaskMedia.teamId, ctx.team.id), eq(teamTaskMedia.ownerType, 'customer'), eq(teamTaskMedia.ownerId, customerId)), orderBy: [desc(teamTaskMedia.createdAt)] }),
    db.query.teamTaskRelations.findMany({ where: and(eq(teamTaskRelations.teamId, ctx.team.id), or(and(eq(teamTaskRelations.sourceType, 'customer'), eq(teamTaskRelations.sourceId, customerId), eq(teamTaskRelations.targetType, 'task')), and(eq(teamTaskRelations.targetType, 'customer'), eq(teamTaskRelations.targetId, customerId), eq(teamTaskRelations.sourceType, 'task')))) }),
    db.query.customFields.findMany({ where: eq(customFields.teamId, ctx.team.id), orderBy: [asc(customFields.position)] }),
  ]);
  // El Set es necesario: durante un tiempo hubo escritores que guardaban el
  // vínculo en direcciones opuestas (customer→task y task→customer), así que
  // pueden existir dos filas para la misma tarea. Sin deduplicar, la ficha
  // del cliente lista la tarea dos veces.
  const taskIds = [...new Set(relations.map((r) => r.sourceType === 'task' ? r.sourceId : r.targetId))];
  const tasks = taskIds.length ? await db.query.teamTaskItems.findMany({ where: and(eq(teamTaskItems.teamId, ctx.team.id), or(...taskIds.map((id) => eq(teamTaskItems.id, id)))) }) : [];
  // Un cliente puede tener más de un contacto vinculado: se mezclan sus valores de
  // campos personalizados (el primer contacto que tenga cada clave gana).
  const customFieldValues: Record<string, unknown> = {};
  for (const contact of linkedContacts) {
    for (const [key, value] of Object.entries(contact.customData ?? {})) {
      if (customFieldValues[key] === undefined && value !== null && value !== '') customFieldValues[key] = value;
    }
  }
  return NextResponse.json({
    ...customer,
    contacts: linkedContacts.map(({ customData: _customData, ...contact }) => contact),
    subscriptions,
    stores: stores.map((store) => ({ ...store, url: storeUrl({ custom_domain: store.customDomain, card_url: store.cardUrl }) })),
    transactions,
    tasks: tasks.map((task) => ({ id: task.id, title: task.title, status: task.status, dueDate: task.dueDate, checklist: task.checklist })),
    attachments: attachments.map((file) => ({ ...file, url: resolveMediaUrl(file.url) || file.url })),
    customFieldDefs: customFieldDefs.map((field) => ({ key: field.key, name: field.name, type: field.type })),
    customFieldValues,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersWrite'); if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const customerId = Number((await params).id); const customer = await owned(ctx.team.id, customerId); if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = z.object({ name: z.string().trim().min(1).max(200).optional(), email: z.string().email().nullable().optional().or(z.literal('')), phone: z.string().max(80).nullable().optional(), notes: z.string().max(10000).optional(), status: z.enum(['active','inactive','archived']).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const [updated] = await db.update(teamCustomers).set({ ...parsed.data, email: parsed.data.email || null, updatedBy: ctx.user.id, updatedAt: new Date() }).where(eq(teamCustomers.id, customerId)).returning(); return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('customersWrite'); if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const customerId = Number((await params).id); const customer = await owned(ctx.team.id, customerId); if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Las relaciones tarea↔cliente no tienen clave foránea (la tabla es
  // polimórfica), así que Postgres no las limpia solo: hay que borrarlas acá
  // o quedan tareas apuntando a un cliente inexistente.
  await deleteRelationsFor(ctx.team.id, 'customer', customerId);
  await db.delete(teamCustomers).where(eq(teamCustomers.id, customerId)); return NextResponse.json({ ok: true });
}
