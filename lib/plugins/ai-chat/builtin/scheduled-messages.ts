import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamScheduledMessages } from '@/lib/db/schema';
import { computeNextRunAt } from '@/lib/plugins/scheduled-messages/schedule';
import { formatZoned, logBotAction, parseDateInput, resolveActorUserId, resolveChatContact } from './context';
import { fail, ok, type BuiltinToolDefinition } from './types';

/** Mensajes programados: recordatorios al propio cliente. */
export const scheduledMessagesTools: BuiltinToolDefinition[] = [
  {
    name: 'schedule_message',
    pluginId: 'scheduled-messages',
    label: 'Programar recordatorio',
    summary: 'Programa un mensaje de WhatsApp a esta persona para una fecha y hora (recordatorio de turno, pago, seguimiento).',
    risk: 'write',
    description:
      'Programa un mensaje de WhatsApp para esta misma persona en una fecha y hora futura: recordatorio de turno, de pago, "te escribo el lunes", etc. Confirmá el momento con el cliente. Redactá el mensaje completo y amable, como lo leerá el cliente.',
    parameters: {
      type: 'object',
      required: ['message', 'send_at'],
      properties: {
        message: { type: 'string', description: 'Texto final del mensaje que recibirá el cliente' },
        send_at: { type: 'string', description: 'Fecha y hora de envío en ISO 8601 en hora local del negocio, sin zona (ej. 2026-09-03T09:00:00)' },
      },
    },
    execute: async (args, context) => {
      const message = typeof args.message === 'string' ? args.message.trim().slice(0, 3000) : '';
      if (!message) return fail('message es obligatorio');
      const sendAt = parseDateInput(args.send_at);
      if (!sendAt) return fail('send_at inválido');
      if (sendAt.getTime() < Date.now() + 60_000) return fail('send_at debe ser al menos un minuto en el futuro');
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      if (!bundle.chat.instanceId) return fail('El chat no tiene una instancia de WhatsApp asociada');
      const actorId = await resolveActorUserId(context.teamId, bundle.contact);
      const [row] = await db
        .insert(teamScheduledMessages)
        .values({
          teamId: context.teamId,
          name: `IA · ${bundle.displayName} · ${formatZoned(sendAt, { dateStyle: 'short', timeStyle: 'short' })}`.slice(0, 200),
          status: 'active',
          instanceId: bundle.chat.instanceId,
          targetNumbers: [bundle.phone],
          scheduleType: 'once',
          scheduledAt: sendAt,
          actionType: 'message',
          message,
          maxRuns: 1,
          nextRunAt: computeNextRunAt({ scheduleType: 'once', scheduledAt: sendAt }),
          createdBy: actorId,
        })
        .returning({ id: teamScheduledMessages.id });
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ scheduled_message_id: row.id, send_at: sendAt.toISOString(), readable: formatZoned(sendAt) });
    },
  },
  {
    name: 'cancel_scheduled_message',
    pluginId: 'scheduled-messages',
    label: 'Cancelar recordatorio',
    summary: 'Pausa un mensaje programado para esta persona; sin id, lista los pendientes.',
    risk: 'write',
    description: 'Cancela (pausa) un mensaje programado dirigido a esta persona. Si no pasás scheduled_message_id devuelve la lista de los pendientes para que elijas. Sólo afecta mensajes cuyo destinatario es este mismo número.',
    parameters: {
      type: 'object',
      properties: { scheduled_message_id: { type: 'integer', description: 'id del mensaje programado a cancelar' } },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const pending = await db
        .select({ id: teamScheduledMessages.id, message: teamScheduledMessages.message, nextRunAt: teamScheduledMessages.nextRunAt, targetNumbers: teamScheduledMessages.targetNumbers })
        .from(teamScheduledMessages)
        .where(and(eq(teamScheduledMessages.teamId, context.teamId), eq(teamScheduledMessages.status, 'active'), eq(teamScheduledMessages.scheduleType, 'once'), sql`${teamScheduledMessages.targetNumbers} @> ${JSON.stringify([bundle.phone])}::jsonb`));
      const list = pending.map((p) => ({ scheduled_message_id: p.id, send_at: p.nextRunAt?.toISOString() ?? null, message: (p.message ?? '').slice(0, 160) }));
      const id = Number(args.scheduled_message_id);
      if (!Number.isInteger(id) || id < 1) return ok({ pending: list, note: 'Pasá scheduled_message_id para cancelar uno.' });
      if (!pending.some((p) => p.id === id)) return fail('No hay un mensaje programado pendiente con ese id para este contacto', { pending: list });
      await db.update(teamScheduledMessages).set({ status: 'paused', updatedAt: new Date() }).where(eq(teamScheduledMessages.id, id));
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ scheduled_message_id: id, cancelled: true });
    },
  },
];
