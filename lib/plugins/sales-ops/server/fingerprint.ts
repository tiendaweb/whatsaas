import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, messageAudioInsights, messages } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { resolverCliente, type FuenteCliente } from '@/lib/customers/es-cliente';

/**
 * Huella del estado de un chat para saber si un análisis quedó viejo (`stale`).
 *
 * Cambia cuando entra un mensaje nuevo (id o timestamp del último), cuando
 * una ficha de audio termina de transcribirse (cantidad de insights `done`) o
 * cuando el contacto pasa a ser cliente (ficha y fuente según
 * `resolverCliente`): las tres cosas cambian la evidencia que vio la IA.
 * Vincular a un cliente ANTES no invalidaba nada, y el chat seguía en la cola
 * como lead. No entra nada más del CRM (etiquetas, etapa) a propósito: eso
 * son hipótesis, no evidencia.
 *
 * El tramo del cliente se agrega sólo cuando hay cliente, así las huellas de
 * los leads (la enorme mayoría) siguen siendo las mismas que antes y no se
 * marca todo como cambiado de golpe.
 */
export type FingerprintParts = {
  chatId: number;
  lastMessageId: string | null;
  lastMessageTimestamp: string | null;
  audioInsightsDone: number;
  /** Ficha y fuente del cliente (`resolverCliente`); `null` si es lead. */
  customerId: number | null;
  fuente: FuenteCliente | null;
};

export function computeFingerprint(parts: FingerprintParts): string {
  const raw = [parts.chatId, parts.lastMessageId ?? '', parts.lastMessageTimestamp ?? '', parts.audioInsightsDone];
  if (parts.fuente) raw.push(`${parts.customerId ?? ''}:${parts.fuente}`);
  return createHash('sha256').update(raw.join('|')).digest('hex');
}

export async function chatFingerprintParts(teamId: number, chatId: number): Promise<FingerprintParts | null> {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
    columns: { id: true },
  });
  if (!chat) return null;

  const [[last], [done], cliente] = await Promise.all([
    db
      .select({ id: messages.id, timestamp: messages.timestamp })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp), desc(messages.id))
      .limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(messageAudioInsights)
      .where(and(eq(messageAudioInsights.chatId, chatId), eq(messageAudioInsights.status, 'done'))),
    resolverCliente(teamId, { chatId }),
  ]);

  return {
    chatId,
    lastMessageId: last?.id ?? null,
    lastMessageTimestamp: last?.timestamp ? new Date(last.timestamp).toISOString() : null,
    audioInsightsDone: Number(done?.n ?? 0),
    customerId: cliente.customerId,
    fuente: cliente.fuente,
  };
}

/** sha256(chatId|lastMessageId|lastMessageTimestamp|audios done[|cliente]). `null` si el chat no es del equipo. */
export async function chatFingerprint(teamId: number, chatId: number): Promise<string | null> {
  const parts = await chatFingerprintParts(teamId, chatId);
  return parts ? computeFingerprint(parts) : null;
}
