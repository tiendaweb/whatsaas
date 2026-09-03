import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats } from '@/lib/db/schema';
import { pusherServer } from '@/lib/pusher-server';

/**
 * Marca chats como leídos por id.
 *
 * Recibe ids YA filtrados por el scope del usuario: el predicado de visibilidad
 * referencia `contacts.assignedUserId`, y eso en un `UPDATE chats ... WHERE` sin
 * FROM lo rechaza Postgres con "missing FROM-clause entry for table contacts".
 * No salta en desarrollo —para un owner el scope es sólo `teamId`—, explota en
 * producción y sólo para los agentes con visibilidad acotada.
 */
export async function markChatsRead(teamId: number, chatIds: number[]): Promise<number[]> {
  const ids = [...new Set(chatIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return [];

  const updated = await db
    .update(chats)
    .set({ unreadCount: 0 })
    .where(and(eq(chats.teamId, teamId), inArray(chats.id, ids)))
    .returning({ id: chats.id, remoteJid: chats.remoteJid });

  // Un solo trigger con el array, no uno por chat.
  if (updated.length) {
    try {
      await pusherServer.trigger(`team-${teamId}`, 'chat-list-update', {
        chats: updated.map((row) => ({ id: row.id, remoteJid: row.remoteJid, unreadCount: 0 })),
        ...(updated.length === 1
          ? { id: updated[0].id, remoteJid: updated[0].remoteJid, unreadCount: 0 }
          : {}),
      });
    } catch (error) {
      console.error('[chats] pusher chat-list-update failed', error);
    }
  }

  return updated.map((row) => row.id);
}
