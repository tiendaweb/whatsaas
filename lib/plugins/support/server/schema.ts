import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, teamCustomers, SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES } from '@/lib/db/schema';

const optionalPositiveId = z.number().int().positive().nullable().optional();

export const ticketSchema = z.object({
  customerId: optionalPositiveId,
  contactId: optionalPositiveId,
  chatId: optionalPositiveId,
  category: z.string().trim().max(60).nullable().optional(),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).default('normal'),
  status: z.enum(SUPPORT_TICKET_STATUSES).default('open'),
  subject: z.string().trim().min(1).max(300),
  description: z.string().max(5000).default(''),
  resolution: z.string().max(5000).default(''),
  assignedUserId: optionalPositiveId,
  dueAt: z.string().datetime().nullable().optional(),
}).refine((data) => Boolean(data.customerId) || Boolean(data.contactId), {
  message: 'customerId or contactId is required',
  path: ['customerId'],
});
export type TicketInput = z.infer<typeof ticketSchema>;

export const ticketCommentSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  isInternal: z.boolean().default(true),
});
export type TicketCommentInput = z.infer<typeof ticketCommentSchema>;

export async function assertCustomerInTeam(teamId: number, customerId: number) {
  const customer = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, teamId)),
    columns: { id: true },
  });
  if (!customer) throw new Error('invalid_customer');
  return customer;
}

export async function assertContactInTeam(teamId: number, contactId: number) {
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)),
    columns: { id: true },
  });
  if (!contact) throw new Error('invalid_contact');
  return contact;
}

export async function assertChatInTeam(teamId: number, chatId: number) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
    columns: { id: true },
  });
  if (!chat) throw new Error('invalid_chat');
  return chat;
}
