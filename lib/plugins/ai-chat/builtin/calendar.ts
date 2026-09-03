import { and, asc, eq, gte, lt, lte, ne, gt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamEventParticipants, teamEvents } from '@/lib/db/schema';
import { customerForContact } from '@/lib/customers/service';
import { zonedDateTimeToUtc } from '@/lib/plugins/scheduled-messages/aapp-renewals';
import { CHAT_TIMEZONE, formatZoned, logBotAction, parseDateInput, resolveActorUserId, resolveChatContact } from './context';
import { fail, ok, type BuiltinToolDefinition } from './types';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const fmt = (d: Date) => formatZoned(d);

async function overlapping(teamId: number, startsAt: Date, endsAt: Date) {
  return db.query.teamEvents.findMany({
    where: and(
      eq(teamEvents.teamId, teamId),
      ne(teamEvents.status, 'cancelled'),
      lt(teamEvents.startsAt, endsAt),
      gt(teamEvents.endsAt, startsAt),
    ),
    columns: { id: true, title: true, startsAt: true, endsAt: true },
  });
}

/** Calendario: turnos y citas con la persona que escribe. */
export const calendarTools: BuiltinToolDefinition[] = [
  {
    name: 'check_availability',
    pluginId: 'calendar',
    label: 'Consultar disponibilidad',
    summary: 'Muestra los horarios libres de un día para ofrecer un turno.',
    risk: 'read',
    description:
      'Devuelve los horarios libres de un día concreto, dentro del horario de atención indicado, para ofrecerle un turno o reunión a la persona. Llamala antes de book_appointment. Si el cliente no dijo día, preguntáselo primero.',
    parameters: {
      type: 'object',
      required: ['date'],
      properties: {
        date: { type: 'string', description: 'Día en formato YYYY-MM-DD (zona horaria del negocio)' },
        duration_minutes: { type: 'integer', description: 'Duración del turno en minutos. Por defecto 60.' },
        from_hour: { type: 'integer', description: 'Hora de inicio de atención (0-23). Por defecto 9.' },
        to_hour: { type: 'integer', description: 'Hora de fin de atención (1-24). Por defecto 18.' },
      },
    },
    execute: async (args, context) => {
      const day = typeof args.date === 'string' ? args.date.trim() : '';
      if (!DAY_RE.test(day)) return fail('date debe ser YYYY-MM-DD');
      const duration = Math.min(Math.max(Number(args.duration_minutes) || 60, 15), 480);
      const fromHour = Math.min(Math.max(Number(args.from_hour ?? 9), 0), 23);
      const toHour = Math.min(Math.max(Number(args.to_hour ?? 18), fromHour + 1), 24);
      const dayStart = zonedDateTimeToUtc(day, fromHour, 0, CHAT_TIMEZONE);
      const dayEnd = toHour === 24 ? zonedDateTimeToUtc(day, 23, 59, CHAT_TIMEZONE) : zonedDateTimeToUtc(day, toHour, 0, CHAT_TIMEZONE);

      const busy = await db.query.teamEvents.findMany({
        where: and(eq(teamEvents.teamId, context.teamId), ne(teamEvents.status, 'cancelled'), lt(teamEvents.startsAt, dayEnd), gt(teamEvents.endsAt, dayStart)),
        columns: { startsAt: true, endsAt: true },
        orderBy: [asc(teamEvents.startsAt)],
      });

      const step = Math.min(duration, 30);
      const free: string[] = [];
      const now = Date.now();
      for (let t = dayStart.getTime(); t + duration * 60_000 <= dayEnd.getTime() && free.length < 12; t += step * 60_000) {
        if (t < now) continue;
        const end = t + duration * 60_000;
        const clash = busy.some((b) => b.startsAt.getTime() < end && b.endsAt.getTime() > t);
        if (!clash) free.push(new Date(t).toISOString());
      }
      return ok({
        date: day,
        duration_minutes: duration,
        free_slots: free,
        free_slots_readable: free.map((iso) => formatZoned(new Date(iso), { hour: '2-digit', minute: '2-digit' })),
        busy_count: busy.length,
        timezone: CHAT_TIMEZONE,
      });
    },
  },
  {
    name: 'book_appointment',
    pluginId: 'calendar',
    label: 'Agendar turno o reunión',
    summary: 'Crea un evento en el calendario del equipo vinculado al contacto, validando que no se superponga.',
    risk: 'write',
    description:
      'Agenda un turno, reunión o llamada con la persona en el calendario del equipo. Confirmá antes día y hora con el cliente. Rechaza horarios superpuestos con otro evento; en ese caso ofrecé otro horario usando check_availability.',
    parameters: {
      type: 'object',
      required: ['starts_at'],
      properties: {
        starts_at: { type: 'string', description: 'Inicio en formato ISO 8601 en hora local del negocio, sin zona (ej. 2026-09-03T15:00:00)' },
        duration_minutes: { type: 'integer', description: 'Duración en minutos. Por defecto 60.' },
        title: { type: 'string', description: 'Título breve. Si falta, se arma con el nombre del contacto.' },
        kind: { type: 'string', enum: ['meeting', 'call'], description: 'Reunión presencial/virtual o llamada' },
        notes: { type: 'string', description: 'Motivo o detalles que dio el cliente' },
      },
    },
    execute: async (args, context) => {
      const startsAt = parseDateInput(args.starts_at);
      if (!startsAt) return fail('starts_at inválido');
      if (startsAt.getTime() < Date.now() - 60_000) return fail('No se puede agendar en el pasado');
      const duration = Math.min(Math.max(Number(args.duration_minutes) || 60, 15), 480);
      const endsAt = new Date(startsAt.getTime() + duration * 60_000);
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');

      const clashes = await overlapping(context.teamId, startsAt, endsAt);
      if (clashes.length > 0) {
        return fail('Ese horario ya está ocupado', { conflicts: clashes.map((c) => ({ starts_at: c.startsAt.toISOString(), ends_at: c.endsAt.toISOString() })) });
      }

      const [actorId, customer] = await Promise.all([resolveActorUserId(context.teamId, bundle.contact), customerForContact(context.teamId, bundle.contact.id)]);
      const title = (typeof args.title === 'string' && args.title.trim()) ? args.title.trim().slice(0, 180) : `Turno con ${bundle.displayName}`.slice(0, 180);
      const kind = args.kind === 'call' ? 'call' : 'meeting';

      const [event] = await db
        .insert(teamEvents)
        .values({
          teamId: context.teamId,
          title,
          startsAt,
          endsAt,
          attendees: [bundle.displayName],
          notes: typeof args.notes === 'string' ? args.notes.slice(0, 2000) : '',
          status: 'scheduled',
          kind,
          subtype: 'whatsapp-ai',
          contactId: bundle.contact.id,
          customerId: customer?.id ?? null,
          relatedUserId: bundle.contact.assignedUserId ?? actorId,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning();
      await db.insert(teamEventParticipants).values({ teamId: context.teamId, eventId: event.id, contactId: bundle.contact.id, role: 'attendee', responseStatus: 'accepted' }).onConflictDoNothing();
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ event_id: event.id, title, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), readable: fmt(startsAt) });
    },
  },
  {
    name: 'list_contact_appointments',
    pluginId: 'calendar',
    label: 'Ver turnos del contacto',
    summary: 'Lista los próximos turnos/reuniones agendados con esta persona.',
    risk: 'read',
    description: 'Lista los próximos turnos o reuniones agendados con la persona que escribe (para confirmar, recordar o reprogramar).',
    parameters: {
      type: 'object',
      properties: { include_past: { type: 'boolean', description: 'Incluir también los últimos 5 eventos pasados' } },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const now = new Date();
      const base = and(eq(teamEvents.teamId, context.teamId), eq(teamEvents.contactId, bundle.contact.id), ne(teamEvents.status, 'cancelled'));
      const upcoming = await db.query.teamEvents.findMany({ where: and(base, gte(teamEvents.endsAt, now)), orderBy: [asc(teamEvents.startsAt)], limit: 10 });
      const past = args.include_past
        ? await db.query.teamEvents.findMany({ where: and(base, lte(teamEvents.endsAt, now)), orderBy: [asc(teamEvents.startsAt)], limit: 5 })
        : [];
      const map = (e: typeof teamEvents.$inferSelect) => ({ event_id: e.id, title: e.title, starts_at: e.startsAt.toISOString(), ends_at: e.endsAt.toISOString(), readable: fmt(e.startsAt), status: e.status, kind: e.kind });
      return ok({ upcoming: upcoming.map(map), past: past.map(map) });
    },
  },
  {
    name: 'cancel_appointment',
    pluginId: 'calendar',
    label: 'Cancelar turno',
    summary: 'Cancela un turno de esta persona (sólo los suyos).',
    risk: 'write',
    description: 'Cancela un turno o reunión agendado con esta persona. Sólo puede cancelar eventos vinculados a este mismo contacto. Confirmá con el cliente antes de cancelar. Para reprogramar: cancelá y agendá uno nuevo.',
    parameters: {
      type: 'object',
      required: ['event_id'],
      properties: {
        event_id: { type: 'integer', description: 'id devuelto por list_contact_appointments o book_appointment' },
        reason: { type: 'string', description: 'Motivo que dio el cliente' },
      },
    },
    execute: async (args, context) => {
      const id = Number(args.event_id);
      if (!Number.isInteger(id)) return fail('event_id inválido');
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const event = await db.query.teamEvents.findFirst({ where: and(eq(teamEvents.id, id), eq(teamEvents.teamId, context.teamId), eq(teamEvents.contactId, bundle.contact.id)) });
      if (!event) return fail('No hay un turno con ese id para este contacto');
      if (event.status === 'cancelled') return ok({ event_id: id, already_cancelled: true });
      const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
      await db.update(teamEvents).set({ status: 'cancelled', outcome: reason ? `Cancelado por el cliente: ${reason}` : 'Cancelado por el cliente', updatedAt: new Date() }).where(eq(teamEvents.id, id));
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ event_id: id, cancelled: true, title: event.title });
    },
  },
];
