import 'server-only';
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamEvents } from '@/lib/db/schema';
import { notify } from './service';

/**
 * Recordatorios de la agenda.
 *
 * Cada evento dice con cuántos minutos de anticipación avisar
 * (`reminder_minutes`). El cron mira la ventana de los próximos minutos y crea
 * el aviso; `dedupeKey` con el id del evento y los minutos hace que correr dos
 * veces no mande dos veces. Las series repetidas no están: para eso hay que
 * expandirlas, y por ahora el aviso es del próximo disparo de la fila.
 */
export async function generarRecordatorios(ventanaMinutos = 5): Promise<{ creados: number }> {
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
  const filas = await db
    .select({
      id: teamEvents.id,
      teamId: teamEvents.teamId,
      title: teamEvents.title,
      startsAt: teamEvents.startsAt,
      location: teamEvents.location,
      reminderMinutes: teamEvents.reminderMinutes,
      relatedUserId: teamEvents.relatedUserId,
      createdBy: teamEvents.createdBy,
    })
    .from(teamEvents)
    .where(and(ne(teamEvents.status, 'canceled'), gte(teamEvents.startsAt, ahora), lte(teamEvents.startsAt, hasta), sql`jsonb_array_length(${teamEvents.reminderMinutes}) > 0`))
    .limit(500);

  let creados = 0;
  for (const e of filas) {
    for (const minutos of e.reminderMinutes ?? []) {
      const cuando = new Date(new Date(e.startsAt).getTime() - minutos * 60000);
      const diff = cuando.getTime() - ahora.getTime();
      // Ventana hacia adelante: el cron corre cada minuto, así que basta con
      // tomar lo que cae en los próximos minutos (y lo que se pasó hace poco).
      if (diff > ventanaMinutos * 60000 || diff < -10 * 60000) continue;
      const hora = new Date(e.startsAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const { ids } = await notify({
        teamId: e.teamId,
        userId: e.relatedUserId ?? e.createdBy ?? null,
        kind: 'calendar.reminder',
        title: minutos >= 1440 ? `Mañana: ${e.title}` : `En ${minutos} min: ${e.title}`,
        body: [`Empieza a las ${hora}.`, e.location ? `Dónde: ${e.location}` : null].filter(Boolean).join(' '),
        url: '/plugins/calendar',
        channels: ['inapp', 'push', 'whatsapp'],
        entityType: 'event',
        entityId: e.id,
        source: 'cron',
        dedupeKey: `event:${e.id}:reminder:${minutos}`,
      });
      creados += ids.length;
    }
  }
  return { creados };
}
