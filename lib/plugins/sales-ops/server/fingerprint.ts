import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, messageAudioInsights, messages } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

/**
 * Huella del estado de un chat para saber si un análisis quedó viejo (`stale`).
 *
 * Cambia cuando entra un mensaje nuevo (id o timestamp del último) o cuando
 * una ficha de audio termina de transcribirse (cantidad de insights `done`):
 * las dos cosas cambian la evidencia que vio la IA. No entra nada del CRM
 * (etiquetas, etapa) a propósito: eso son hipótesis, no evidencia.
 */
export type FingerprintParts = {
  chatId: number;
  lastMessageId: string | null;
  lastMessageTimestamp: string | null;
  audioInsightsDone: number;
};

export function computeFingerprint(parts: FingerprintParts): string {
  const raw = [parts.chatId, parts.lastMessageId ?? '', parts.lastMessageTimestamp ?? '', parts.audioInsightsDone].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

export async function chatFingerprintParts(teamId: number, chatId: number): Promise<FingerprintParts | null> {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
    columns: { id: true },
  });
  if (!chat) return null;

  const [last] = await db
    .select({ id: messages.id, timestamp: messages.timestamp })
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(desc(messages.timestamp), desc(messages.id))
    .limit(1);

  const [done] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messageAudioInsights)
    .where(and(eq(messageAudioInsights.chatId, chatId), eq(messageAudioInsights.status, 'done')));

  return {
    chatId,
    lastMessageId: last?.id ?? null,
    lastMessageTimestamp: last?.timestamp ? new Date(last.timestamp).toISOString() : null,
    audioInsightsDone: Number(done?.n ?? 0),
  };
}

/** sha256(chatId|lastMessageId|lastMessageTimestamp|audios done). `null` si el chat no es del equipo. */
export async function chatFingerprint(teamId: number, chatId: number): Promise<string | null> {
  const parts = await chatFingerprintParts(teamId, chatId);
  return parts ? computeFingerprint(parts) : null;
}
