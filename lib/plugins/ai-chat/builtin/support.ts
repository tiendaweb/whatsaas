import { and, desc, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { SUPPORT_TICKET_PRIORITIES, teamSupportTicketComments, teamSupportTickets } from '@/lib/db/schema';
import { customerForContact } from '@/lib/customers/service';
import { logBotAction, resolveActorUserId, resolveChatContact } from './context';
import { clip, fail, ok, type BuiltinToolDefinition } from './types';

/** Soporte: tickets del cliente. */
export const supportTools: BuiltinToolDefinition[] = [
  {
    name: 'open_support_ticket',
    pluginId: 'support',
    label: 'Abrir ticket de soporte',
    summary: 'Crea un ticket con el reclamo o problema del cliente, vinculado a su contacto y a este chat.',
    risk: 'write',
    description:
      'Abre un ticket de soporte con el problema o reclamo que describe la persona, para que el equipo lo siga. Usala cuando haya una falla, queja, garantía o pedido que requiera seguimiento y no puedas resolverlo en el momento. Resumí el problema en subject y poné todos los detalles en description. Devolvé al cliente el número de ticket.',
    parameters: {
      type: 'object',
      required: ['subject', 'description'],
      properties: {
        subject: { type: 'string', description: 'Título breve del problema' },
        description: { type: 'string', description: 'Detalle completo: qué pasó, cuándo, producto/servicio afectado' },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Urgencia percibida. Por defecto normal.' },
        category: { type: 'string', description: 'Categoría libre (facturación, técnico, entrega…)' },
      },
    },
    execute: async (args, context) => {
      const subject = typeof args.subject === 'string' ? args.subject.trim().slice(0, 300) : '';
      const description = typeof args.description === 'string' ? args.description.trim().slice(0, 5000) : '';
      if (!subject || !description) return fail('subject y description son obligatorios');
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const [actorId, customer] = await Promise.all([resolveActorUserId(context.teamId, bundle.contact), customerForContact(context.teamId, bundle.contact.id)]);
      const priority = (SUPPORT_TICKET_PRIORITIES as readonly string[]).includes(args.priority) ? args.priority : 'normal';
      const [ticket] = await db
        .insert(teamSupportTickets)
        .values({
          teamId: context.teamId,
          customerId: customer?.id ?? null,
          contactId: bundle.contact.id,
          chatId: context.chatId,
          category: typeof args.category === 'string' ? args.category.trim().slice(0, 60) : null,
          priority,
          status: 'open',
          subject,
          description: `${description}\n\n(Abierto por el agente IA desde WhatsApp)`,
          assignedUserId: bundle.contact.assignedUserId ?? null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: teamSupportTickets.id });
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ ticket_id: ticket.id, ticket_number: `#${ticket.id}`, status: 'open', priority });
    },
  },
  {
    name: 'get_support_ticket_status',
    pluginId: 'support',
    label: 'Consultar tickets',
    summary: 'Estado de los tickets de la persona y última respuesta pública del equipo.',
    risk: 'read',
    description: 'Devuelve los tickets de soporte de la persona (o uno concreto por id) con estado, prioridad, resolución y la última respuesta pública del equipo. Usala cuando pregunte "cómo va mi reclamo".',
    parameters: { type: 'object', properties: { ticket_id: { type: 'integer', description: 'id de un ticket concreto (opcional)' } } },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const customer = await customerForContact(context.teamId, bundle.contact.id);
      const owned = customer
        ? or(eq(teamSupportTickets.contactId, bundle.contact.id), eq(teamSupportTickets.customerId, customer.id), eq(teamSupportTickets.chatId, context.chatId))!
        : or(eq(teamSupportTickets.contactId, bundle.contact.id), eq(teamSupportTickets.chatId, context.chatId))!;
      const where = [eq(teamSupportTickets.teamId, context.teamId), owned];
      const id = Number(args.ticket_id);
      if (Number.isInteger(id) && id > 0) where.push(eq(teamSupportTickets.id, id));
      const tickets = await db.select().from(teamSupportTickets).where(and(...where)).orderBy(desc(teamSupportTickets.createdAt)).limit(8);
      if (tickets.length === 0) return ok({ tickets: [], note: id ? 'No hay un ticket con ese id para esta persona.' : 'La persona no tiene tickets.' });
      const result = [] as any[];
      for (const t of tickets) {
        const [lastPublic] = await db
          .select({ body: teamSupportTicketComments.body, createdAt: teamSupportTicketComments.createdAt })
          .from(teamSupportTicketComments)
          .where(and(eq(teamSupportTicketComments.ticketId, t.id), eq(teamSupportTicketComments.isInternal, false)))
          .orderBy(desc(teamSupportTicketComments.createdAt))
          .limit(1);
        result.push({ ticket_id: t.id, subject: t.subject, status: t.status, priority: t.priority, category: t.category, created_at: t.createdAt.toISOString(), resolution: clip(t.resolution, 400) || null, last_public_reply: lastPublic ? { at: lastPublic.createdAt.toISOString(), body: clip(lastPublic.body, 400) } : null });
      }
      return ok({ tickets: result });
    },
  },
];
