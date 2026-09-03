import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { automationSessions, chats, users } from '@/lib/db/schema';
import { createSystemMessage } from '@/lib/db/system-messages';

/**
 * Cierra ("corta") un chat a mano.
 *
 * Tres efectos, siempre juntos: se completan las sesiones de automatización
 * activas, se apagan las automatizaciones para ese chat hasta que alguien
 * dispare una a mano (`automationDisabled`), y queda un mensaje de sistema con
 * quién lo cerró. Sin sesión: la route y el conector MCP llaman a esto mismo.
 */
export async function closeChat(teamId: number, userId: number, chatId: number) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
    columns: { id: true },
  });
  if (!chat) throw new Error('Chat not found.');

  const actor = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { name: true, email: true },
  });

  const completed = await db
    .update(automationSessions)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(and(eq(automationSessions.chatId, chatId), eq(automationSessions.status, 'active')))
    .returning({ id: automationSessions.id });

  await db
    .update(chats)
    .set({ automationDisabled: true })
    .where(and(eq(chats.id, chatId), eq(chats.teamId, teamId)));

  await createSystemMessage(teamId, chatId, `@@syslog_chat_closed|name=${actor?.name || actor?.email || 'usuario'}`);

  return { chatId, completedAutomationSessions: completed.length, automationDisabled: true };
}
