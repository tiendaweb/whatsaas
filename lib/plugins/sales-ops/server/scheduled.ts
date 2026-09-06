import 'server-only';
import { db } from '@/lib/db/drizzle';
import { teamScheduledMessages } from '@/lib/db/schema';
import { computeNextRunAt } from '@/lib/plugins/scheduled-messages/schedule';
import { pausarAutomatizacionesDelProgramado } from '@/lib/chats/pausar-automatizacion';
import { formatoLocal, proximoHorarioFuturo } from '@/lib/time/zona';

/**
 * Deja un mensaje programado a partir de una acción aprobada de la cola.
 *
 * Es el mismo registro que crea la app Mensajes programados (y la función
 * integrada del bot): `scheduleType: 'once'`, un solo destinatario, `maxRuns`
 * 1. Lo que cambia es el origen: `name` lleva el id de la acción para poder
 * rastrear de qué lote salió, y no se manda nada acá —lo manda el cron del
 * plugin a la hora indicada.
 */
export async function scheduleActionMessage(input: {
  teamId: number;
  userId: number;
  actionId: number;
  remoteJid: string;
  instanceId: number | null;
  name: string;
  text: string;
  sendAt: Date;
}): Promise<{ id: number } | { error: string }> {
  if (!input.instanceId) return { error: 'El chat no tiene una instancia de WhatsApp asociada.' };
  if (input.sendAt.getTime() < Date.now() + 60_000) {
    const proximo = proximoHorarioFuturo(input.sendAt);
    return { error: `La fecha de salida (${formatoLocal(input.sendAt)}) ya pasó. Corregí la fila con una futura, por ejemplo ${formatoLocal(proximo.date)}.` };
  }
  const phone = (input.remoteJid || '').split('@')[0].replace(/\D/g, '');
  if (!phone) return { error: 'No se pudo resolver el teléfono del chat.' };
  const [row] = await db
    .insert(teamScheduledMessages)
    .values({
      teamId: input.teamId,
      name: `Cola · ${input.name} · #${input.actionId}`.slice(0, 200),
      status: 'active',
      instanceId: input.instanceId,
      targetNumbers: [phone],
      scheduleType: 'once',
      scheduledAt: input.sendAt,
      actionType: 'message',
      message: input.text.slice(0, 3000),
      maxRuns: 1,
      nextRunAt: computeNextRunAt({ scheduleType: 'once', scheduledAt: input.sendAt }),
      createdBy: input.userId,
    })
    .returning({ id: teamScheduledMessages.id });
  // El chat sale de los flujos automáticos: si no, cuando el cliente conteste
  // este mensaje el flujo se le adelanta. Ver lib/chats/pausar-automatizacion.
  await pausarAutomatizacionesDelProgramado(input.teamId, {
    id: row.id,
    name: input.name,
    status: 'active',
    actionType: 'message',
    instanceId: input.instanceId,
    targetNumbers: [phone],
  });
  return { id: row.id };
}
