import 'server-only';

import crypto from 'crypto';
import { and, eq, ilike, max, or } from 'drizzle-orm';
import { z } from 'zod';
import { ensureCustomFieldsTable } from '@/lib/contacts/custom-fields';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  chats,
  contacts,
  customFields,
  dashboardBookmarkGroups,
  dashboardBookmarkItems,
  departments,
  funnelStages,
  messages,
  teamCustomerContacts,
  teamCustomers,
  teamMembershipPlans,
  teamMembershipSubscriptions,
  teamMembers,
  teamNotes,
} from '@/lib/db/schema';
import { hasPermission, type MemberPermissions } from '@/lib/permissions';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { BILLING_TYPES, PAYMENT_STATUS, SUBSCRIPTION_STATUS } from '@/lib/plugins/memberships/constants';
import { pusherServer } from '@/lib/pusher-server';

type JsonSchema = Record<string, unknown>;
export type GrokActionContext = { teamId: number; userId: number };
type ContactReference = { contact_id?: number; chat_id?: number };

export type GrokActionTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

const contactReferenceProperties = {
  contact_id: { type: 'integer', minimum: 1, description: 'ID del contacto de WhatsPro.' },
  chat_id: { type: 'integer', minimum: 1, description: 'ID del chat de WhatsPro asociado al contacto.' },
};

export const grokActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_save_contact',
    description: 'Crea un contacto desde un chat o actualiza sus datos y asignaciones. Usa IDs obtenidos con las herramientas de lectura.',
    inputSchema: {
      type: 'object',
      properties: {
        ...contactReferenceProperties,
        name: { type: 'string', minLength: 1, maxLength: 200 },
        assigned_user_id: { type: ['integer', 'null'], minimum: 1 },
        assigned_department_id: { type: ['integer', 'null'], minimum: 1 },
      },
      anyOf: [{ required: ['contact_id'] }, { required: ['chat_id'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_change_crm_stage',
    description: 'Mueve un contacto a una etapa del CRM o elimina su etapa actual.',
    inputSchema: {
      type: 'object',
      required: ['contact_id', 'funnel_stage_id'],
      properties: {
        contact_id: contactReferenceProperties.contact_id,
        funnel_stage_id: { type: ['integer', 'null'], minimum: 1, description: 'ID de etapa; null deja el contacto sin etapa.' },
        show_time_in_stage: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_set_custom_fields',
    description: 'Guarda valores de campos personalizados en un contacto. Las claves deben existir en el catálogo custom-fields.',
    inputSchema: {
      type: 'object',
      required: ['contact_id', 'fields'],
      properties: {
        contact_id: contactReferenceProperties.contact_id,
        fields: {
          type: 'object',
          minProperties: 1,
          maxProperties: 50,
          additionalProperties: { type: ['string', 'number', 'boolean', 'null'] },
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_assign_to_agenda',
    description: 'Agrega el chat de un contacto a una agenda existente del dashboard. La operación es idempotente.',
    inputSchema: {
      type: 'object',
      required: ['agenda_id'],
      properties: { ...contactReferenceProperties, agenda_id: { type: 'integer', minimum: 1 } },
      anyOf: [{ required: ['contact_id'] }, { required: ['chat_id'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_add_internal_note',
    description: 'Agrega una nota interna visible en la conversación y nunca la envía al contacto por WhatsApp.',
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: {
        ...contactReferenceProperties,
        text: { type: 'string', minLength: 1, maxLength: 5000 },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80 },
      },
      anyOf: [{ required: ['contact_id'] }, { required: ['chat_id'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_add_contact_note',
    description: 'Agrega una nota al historial de notas del contacto en el CRM.',
    inputSchema: {
      type: 'object',
      required: ['contact_id', 'text'],
      properties: {
        contact_id: contactReferenceProperties.contact_id,
        text: { type: 'string', minLength: 1, maxLength: 5000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_create_note',
    description: 'Crea una nota de equipo en el plugin Notas.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 180 },
        content: { type: 'string', maxLength: 20000 },
        tags: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 80 } },
        pinned: { type: 'boolean' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        due_date: { type: ['string', 'null'], description: 'Fecha ISO 8601 o YYYY-MM-DD.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_register_customer',
    description: 'Registra un cliente o actualiza el cliente ya vinculado al contacto, evitando duplicados por contacto, email o teléfono.',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: contactReferenceProperties.contact_id,
        name: { type: 'string', minLength: 1, maxLength: 200 },
        email: { type: ['string', 'null'], format: 'email', maxLength: 255 },
        phone: { type: ['string', 'null'], maxLength: 80 },
        notes: { type: 'string', maxLength: 10000 },
      },
      anyOf: [{ required: ['contact_id'] }, { required: ['name'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_register_membership',
    description: 'Registra una membresía para un cliente o contacto. Usa idempotency_key para que los reintentos no dupliquen la suscripción.',
    inputSchema: {
      type: 'object',
      required: ['subscription_number', 'start_date', 'idempotency_key'],
      properties: {
        subscription_number: { type: 'string', minLength: 1, maxLength: 50 },
        plan_id: { type: ['integer', 'null'], minimum: 1 },
        customer_id: { type: ['integer', 'null'], minimum: 1 },
        contact_id: { type: ['integer', 'null'], minimum: 1 },
        price: { type: 'integer', minimum: 0, description: 'Importe en centavos.' },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        billing_type: { type: 'string', enum: BILLING_TYPES },
        status: { type: 'string', enum: SUBSCRIPTION_STATUS },
        payment_status: { type: 'string', enum: PAYMENT_STATUS },
        start_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        end_date: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        notes: { type: 'string', maxLength: 2000 },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80 },
      },
      anyOf: [{ required: ['customer_id'] }, { required: ['contact_id'] }],
      additionalProperties: false,
    },
  },
];

const contactReferenceSchema = z.object({
  contact_id: z.number().int().positive().optional(),
  chat_id: z.number().int().positive().optional(),
}).refine((value) => value.contact_id != null || value.chat_id != null, 'contact_id or chat_id is required');

const saveContactSchema = contactReferenceSchema.extend({
  name: z.string().trim().min(1).max(200).optional(),
  assigned_user_id: z.number().int().positive().nullable().optional(),
  assigned_department_id: z.number().int().positive().nullable().optional(),
});

const changeStageSchema = z.object({
  contact_id: z.number().int().positive(),
  funnel_stage_id: z.number().int().positive().nullable(),
  show_time_in_stage: z.boolean().optional(),
});

const customFieldsSchema = z.object({
  contact_id: z.number().int().positive(),
  fields: z.record(z.string().min(1).max(100), z.union([z.string(), z.number(), z.boolean(), z.null()])).refine(
    (fields) => Object.keys(fields).length > 0 && Object.keys(fields).length <= 50,
    'Provide between 1 and 50 fields',
  ),
});

const agendaSchema = contactReferenceSchema.extend({ agenda_id: z.number().int().positive() });
const internalNoteSchema = contactReferenceSchema.extend({
  text: z.string().trim().min(1).max(5000),
  idempotency_key: z.string().trim().min(8).max(80).optional(),
});
const contactNoteSchema = z.object({ contact_id: z.number().int().positive(), text: z.string().trim().min(1).max(5000) });
const noteSchema = z.object({
  title: z.string().trim().min(1).max(180),
  content: z.string().max(20000).default(''),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  pinned: z.boolean().default(false),
  status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
  due_date: z.string().nullable().optional(),
});
const customerSchema = z.object({
  contact_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  notes: z.string().max(10000).optional(),
}).refine((value) => value.contact_id != null || value.name != null, 'contact_id or name is required');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const membershipSchema = z.object({
  subscription_number: z.string().trim().min(1).max(50),
  plan_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  price: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  billing_type: z.enum(BILLING_TYPES).optional(),
  status: z.enum(SUBSCRIPTION_STATUS).default('active'),
  payment_status: z.enum(PAYMENT_STATUS).default('pending'),
  start_date: isoDate,
  end_date: isoDate.nullable().optional(),
  notes: z.string().max(2000).default(''),
  idempotency_key: z.string().trim().min(8).max(80),
}).refine((value) => value.customer_id != null || value.contact_id != null, 'customer_id or contact_id is required');

export type ActionPermission = keyof Omit<MemberPermissions, 'chatVisibility'>;

export async function assertPermission(context: GrokActionContext, permission: ActionPermission, pluginId?: string) {
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, context.teamId), eq(teamMembers.userId, context.userId)),
    columns: { role: true, permissions: true },
  });
  if (!member || !hasPermission(member.role, member.permissions as MemberPermissions | null, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
  if (pluginId) {
    const active = await resolveActivePluginsForTeam(context.teamId, context.userId);
    if (!active.some((plugin) => plugin.pluginId === pluginId)) throw new Error(`Plugin is not enabled: ${pluginId}`);
  }
}

export async function audit(context: GrokActionContext, action: string, entityId: number | string) {
  await db.insert(activityLogs).values({
    teamId: context.teamId,
    userId: context.userId,
    action,
    ipAddress: String(entityId).slice(0, 45),
  });
}

function validationError(error: z.ZodError) {
  return `Invalid arguments: ${error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`;
}

export function parse<T>(schema: z.ZodType<T>, input: Record<string, unknown>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(validationError(parsed.error));
  return parsed.data;
}

async function ownedContact(context: GrokActionContext, contactId: number) {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, context.teamId)),
    with: { chat: { columns: { id: true, remoteJid: true, name: true, pushName: true } } },
  });
  if (!contact) throw new Error('Contact not found.');
  return contact;
}

async function ownedChat(context: GrokActionContext, chatId: number) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, context.teamId)),
    columns: { id: true, remoteJid: true, name: true, pushName: true },
  });
  if (!chat) throw new Error('Chat not found.');
  return chat;
}

async function resolveContact(context: GrokActionContext, reference: ContactReference, create = false, name?: string) {
  if (reference.contact_id) return ownedContact(context, reference.contact_id);
  const chat = await ownedChat(context, reference.chat_id!);
  const existing = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, context.teamId), eq(contacts.chatId, chat.id)),
    with: { chat: { columns: { id: true, remoteJid: true, name: true, pushName: true } } },
  });
  if (existing) return existing;
  if (!create) throw new Error('The chat is not saved as a contact. Run whatspro_save_contact first.');
  const [created] = await db.insert(contacts).values({
    teamId: context.teamId,
    chatId: chat.id,
    name: name?.trim() || chat.name || chat.pushName || chat.remoteJid.split('@')[0] || 'Contacto',
  }).returning();
  return { ...created, chat };
}

async function saveContact(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(saveContactSchema, input);
  if (data.assigned_user_id != null) {
    const member = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, context.teamId), eq(teamMembers.userId, data.assigned_user_id)),
      columns: { userId: true },
    });
    if (!member) throw new Error('Assigned user is not a member of this team.');
  }
  if (data.assigned_department_id != null) {
    const department = await db.query.departments.findFirst({
      where: and(eq(departments.id, data.assigned_department_id), eq(departments.teamId, context.teamId)),
      columns: { id: true },
    });
    if (!department) throw new Error('Department not found.');
  }
  const contact = await resolveContact(context, data, true, data.name);
  const patch = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.assigned_user_id !== undefined ? { assignedUserId: data.assigned_user_id } : {}),
    ...(data.assigned_department_id !== undefined ? { assignedDepartmentId: data.assigned_department_id } : {}),
    updatedAt: new Date(),
  };
  const [saved] = await db.update(contacts).set(patch).where(and(eq(contacts.id, contact.id), eq(contacts.teamId, context.teamId))).returning();
  await audit(context, 'GROK_CONTACT_SAVED', saved.id);
  return { success: true, contact: saved };
}

async function changeCrmStage(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(changeStageSchema, input);
  await ownedContact(context, data.contact_id);
  let stage: { id: number; name: string } | null = null;
  if (data.funnel_stage_id != null) {
    stage = await db.query.funnelStages.findFirst({
      where: and(eq(funnelStages.id, data.funnel_stage_id), eq(funnelStages.teamId, context.teamId)),
      columns: { id: true, name: true },
    }) ?? null;
    if (!stage) throw new Error('CRM stage not found.');
  }
  const [updated] = await db.update(contacts).set({
    funnelStageId: stage?.id ?? null,
    ...(data.show_time_in_stage !== undefined ? { showTimeInStage: data.show_time_in_stage } : {}),
    updatedAt: new Date(),
  }).where(and(eq(contacts.id, data.contact_id), eq(contacts.teamId, context.teamId))).returning();
  await audit(context, 'GROK_CRM_STAGE_CHANGED', updated.id);
  return { success: true, contact_id: updated.id, funnel_stage: stage };
}

async function setCustomFields(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  await ensureCustomFieldsTable();
  const data = parse(customFieldsSchema, input);
  const contact = await ownedContact(context, data.contact_id);
  const keys = Object.keys(data.fields);
  const definitions = await db.query.customFields.findMany({ where: eq(customFields.teamId, context.teamId) });
  const known = new Set(definitions.map((field) => field.key));
  const unknown = keys.filter((key) => !known.has(key));
  if (unknown.length) throw new Error(`Unknown custom field keys: ${unknown.join(', ')}.`);
  const customData = { ...(contact.customData ?? {}), ...data.fields };
  const [updated] = await db.update(contacts).set({ customData, updatedAt: new Date() })
    .where(and(eq(contacts.id, contact.id), eq(contacts.teamId, context.teamId))).returning();
  await audit(context, 'GROK_CUSTOM_FIELDS_UPDATED', updated.id);
  return { success: true, contact_id: updated.id, custom_data: updated.customData };
}

async function assignToAgenda(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(agendaSchema, input);
  const [contact, agenda] = await Promise.all([
    resolveContact(context, data),
    db.query.dashboardBookmarkGroups.findFirst({
      where: and(eq(dashboardBookmarkGroups.id, data.agenda_id), eq(dashboardBookmarkGroups.teamId, context.teamId)),
      columns: { id: true, name: true },
    }),
  ]);
  if (!agenda) throw new Error('Agenda not found.');
  const [existing] = await db.select().from(dashboardBookmarkItems).where(and(
    eq(dashboardBookmarkItems.teamId, context.teamId),
    eq(dashboardBookmarkItems.groupId, agenda.id),
    eq(dashboardBookmarkItems.chatId, contact.chatId),
  )).limit(1);
  if (existing) return { success: true, already_assigned: true, agenda, item: existing };
  const [last] = await db.select({ order: max(dashboardBookmarkItems.order) }).from(dashboardBookmarkItems)
    .where(and(eq(dashboardBookmarkItems.teamId, context.teamId), eq(dashboardBookmarkItems.groupId, agenda.id)));
  const [created] = await db.insert(dashboardBookmarkItems).values({
    teamId: context.teamId,
    groupId: agenda.id,
    entityType: 'chat',
    chatId: contact.chatId,
    order: (last?.order ?? -1) + 1,
    createdBy: context.userId,
  }).onConflictDoNothing().returning();
  const item = created ?? (await db.select().from(dashboardBookmarkItems).where(and(
    eq(dashboardBookmarkItems.groupId, agenda.id),
    eq(dashboardBookmarkItems.chatId, contact.chatId),
  )).limit(1))[0];
  await audit(context, 'GROK_CONTACT_ASSIGNED_TO_AGENDA', item.id);
  return { success: true, already_assigned: !created, agenda, item };
}

async function addInternalNote(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(internalNoteSchema, input);
  const contact = await resolveContact(context, data);
  const suffix = data.idempotency_key
    ? crypto.createHash('sha256').update(`${context.teamId}:${contact.chatId}:${data.idempotency_key}`).digest('hex').slice(0, 32)
    : `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const messageId = `grok_internal_${suffix}`;
  const timestamp = new Date();
  const [created] = await db.insert(messages).values({
    id: messageId,
    chatId: contact.chatId,
    fromMe: true,
    messageType: 'conversation',
    text: data.text,
    timestamp,
    status: 'read',
    isInternal: true,
    isAi: true,
  }).onConflictDoNothing().returning();
  const note = created ?? await db.query.messages.findFirst({ where: and(eq(messages.id, messageId), eq(messages.chatId, contact.chatId)) });
  if (!note) throw new Error('Could not create or recover the internal note.');
  if (created) {
    await db.update(chats).set({ lastMessageTimestamp: timestamp }).where(and(eq(chats.id, contact.chatId), eq(chats.teamId, context.teamId)));
    await Promise.all([
      pusherServer.trigger(`team-${context.teamId}`, 'new-message', { ...created, timestamp: timestamp.toISOString(), remoteJid: contact.chat.remoteJid }),
      pusherServer.trigger(`team-${context.teamId}`, 'chat-list-update', { id: contact.chatId, lastMessageTimestamp: timestamp.toISOString(), remoteJid: contact.chat.remoteJid, unreadCount: 0 }),
    ]).catch((error) => console.error('[grok-connector] Could not publish internal note update', error));
    await audit(context, 'GROK_INTERNAL_NOTE_CREATED', contact.id);
  }
  return { success: true, already_created: !created, note };
}

async function addContactNote(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(contactNoteSchema, input);
  const contact = await ownedContact(context, data.contact_id);
  const timestamp = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date());
  const entry = `[Grok · ${timestamp} UTC]\n${data.text}`;
  const notes = contact.notes ? `${contact.notes}\n\n${entry}` : entry;
  const [updated] = await db.update(contacts).set({ notes, updatedAt: new Date() })
    .where(and(eq(contacts.id, contact.id), eq(contacts.teamId, context.teamId))).returning({ id: contacts.id, notes: contacts.notes });
  await audit(context, 'GROK_CONTACT_NOTE_ADDED', updated.id);
  return { success: true, contact: updated };
}

async function createNote(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'notesWrite', 'notes');
  const data = parse(noteSchema, input);
  let dueDate: Date | null = null;
  if (data.due_date) {
    dueDate = /^\d{4}-\d{2}-\d{2}$/.test(data.due_date) ? new Date(`${data.due_date}T00:00:00Z`) : new Date(data.due_date);
    if (Number.isNaN(dueDate.getTime())) throw new Error('due_date must be a valid ISO 8601 date.');
  }
  const [created] = await db.insert(teamNotes).values({
    teamId: context.teamId,
    title: data.title,
    content: data.content,
    tags: data.tags,
    pinned: data.pinned,
    status: data.status,
    dueDate,
    createdBy: context.userId,
    updatedBy: context.userId,
  }).returning();
  await audit(context, 'GROK_TEAM_NOTE_CREATED', created.id);
  return { success: true, note: created };
}

async function registerCustomer(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'customersWrite', 'customers');
  const data = parse(customerSchema, input);
  const contact = data.contact_id ? await ownedContact(context, data.contact_id) : null;
  let customer: typeof teamCustomers.$inferSelect | null = contact ? await db.query.teamCustomerContacts.findFirst({
    where: and(eq(teamCustomerContacts.teamId, context.teamId), eq(teamCustomerContacts.contactId, contact.id)),
    with: { customer: true },
  }).then((link) => link?.customer ?? null) : null;
  const inferredPhone = contact?.chat.remoteJid.split('@')[0].replace(/\D/g, '') || null;
  const phone = data.phone !== undefined ? data.phone : inferredPhone;
  if (!customer && (data.email || phone)) {
    const candidates = [data.email ? ilike(teamCustomers.email, data.email) : undefined, phone ? eq(teamCustomers.phone, phone) : undefined].filter(Boolean);
    customer = await db.query.teamCustomers.findFirst({
      where: and(eq(teamCustomers.teamId, context.teamId), or(...candidates as [NonNullable<(typeof candidates)[number]>, ...NonNullable<(typeof candidates)[number]>[]])),
    }) ?? null;
  }
  const name = data.name ?? contact?.name;
  if (!name) throw new Error('name is required when no contact is supplied.');
  let created = false;
  if (customer) {
    [customer] = await db.update(teamCustomers).set({
      name,
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.phone !== undefined || inferredPhone ? { phone } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      updatedBy: context.userId,
      updatedAt: new Date(),
    }).where(and(eq(teamCustomers.id, customer.id), eq(teamCustomers.teamId, context.teamId))).returning();
  } else {
    [customer] = await db.insert(teamCustomers).values({
      teamId: context.teamId,
      name,
      email: data.email || null,
      phone,
      notes: data.notes ?? '',
      source: 'manual',
      createdBy: context.userId,
      updatedBy: context.userId,
    }).returning();
    created = true;
  }
  if (contact) await db.insert(teamCustomerContacts).values({ teamId: context.teamId, customerId: customer.id, contactId: contact.id }).onConflictDoNothing();
  await audit(context, created ? 'GROK_CUSTOMER_CREATED' : 'GROK_CUSTOMER_UPDATED', customer.id);
  return { success: true, created, customer, linked_contact_id: contact?.id ?? null };
}

async function registerMembership(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'membershipsWrite', 'memberships');
  const data = parse(membershipSchema, input);
  const existing = await db.query.teamMembershipSubscriptions.findFirst({ where: and(
    eq(teamMembershipSubscriptions.teamId, context.teamId),
    eq(teamMembershipSubscriptions.externalSource, 'grok'),
    eq(teamMembershipSubscriptions.externalId, data.idempotency_key),
  ) });
  if (existing) return { success: true, already_created: true, membership: existing };
  if (data.contact_id != null) await ownedContact(context, data.contact_id);
  if (data.customer_id != null) {
    const customer = await db.query.teamCustomers.findFirst({ where: and(eq(teamCustomers.id, data.customer_id), eq(teamCustomers.teamId, context.teamId)), columns: { id: true } });
    if (!customer) throw new Error('Customer not found.');
  }
  let planNameSnapshot = '';
  let companyId: number | null = null;
  let price = data.price ?? 0;
  let currency = data.currency?.toUpperCase() ?? 'USD';
  let billingType: (typeof BILLING_TYPES)[number] = data.billing_type ?? 'monthly';
  if (data.plan_id != null) {
    const plan = await db.query.teamMembershipPlans.findFirst({ where: and(eq(teamMembershipPlans.id, data.plan_id), eq(teamMembershipPlans.teamId, context.teamId)) });
    if (!plan) throw new Error('Membership plan not found.');
    planNameSnapshot = plan.name;
    companyId = plan.companyId;
    price = data.price ?? plan.price;
    currency = data.currency?.toUpperCase() ?? plan.currency;
    billingType = data.billing_type ?? plan.billingType as (typeof BILLING_TYPES)[number];
  }
  const [created] = await db.insert(teamMembershipSubscriptions).values({
    teamId: context.teamId,
    subscriptionNumber: data.subscription_number,
    planId: data.plan_id ?? null,
    companyId,
    customerId: data.customer_id ?? null,
    contactId: data.contact_id ?? null,
    externalSource: 'grok',
    externalId: data.idempotency_key,
    planNameSnapshot,
    price,
    currency,
    billingType,
    status: data.status,
    paymentStatus: data.payment_status,
    startDate: data.start_date,
    endDate: data.end_date ?? null,
    notes: data.notes,
    createdBy: context.userId,
    updatedBy: context.userId,
  }).onConflictDoNothing().returning();
  const membership = created ?? await db.query.teamMembershipSubscriptions.findFirst({ where: and(
    eq(teamMembershipSubscriptions.teamId, context.teamId),
    eq(teamMembershipSubscriptions.externalSource, 'grok'),
    eq(teamMembershipSubscriptions.externalId, data.idempotency_key),
  ) });
  if (!membership) throw new Error('Could not create or recover the membership.');
  if (created) await audit(context, 'GROK_MEMBERSHIP_REGISTERED', created.id);
  return { success: true, already_created: !created, membership };
}

export async function executeGrokAction(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_save_contact') return saveContact(input, context);
  if (name === 'whatspro_change_crm_stage') return changeCrmStage(input, context);
  if (name === 'whatspro_set_custom_fields') return setCustomFields(input, context);
  if (name === 'whatspro_assign_to_agenda') return assignToAgenda(input, context);
  if (name === 'whatspro_add_internal_note') return addInternalNote(input, context);
  if (name === 'whatspro_add_contact_note') return addContactNote(input, context);
  if (name === 'whatspro_create_note') return createNote(input, context);
  if (name === 'whatspro_register_customer') return registerCustomer(input, context);
  if (name === 'whatspro_register_membership') return registerMembership(input, context);
  throw new Error(`Unknown Grok action: ${name}`);
}
