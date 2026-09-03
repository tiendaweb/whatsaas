import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { quickReplies } from '@/lib/db/schema';

/**
 * Respuestas rápidas del equipo (atajos "/algo" del compositor).
 *
 * El atajo se guarda sin la barra inicial y en minúsculas, y el contenido con
 * saltos de línea normalizados: la pantalla y el conector MCP pasan por acá,
 * así que una respuesta creada desde cualquier lado se ve igual en el chat.
 */

export type QuickReply = typeof quickReplies.$inferSelect;

export function normalizeShortcut(shortcut: unknown) {
  return String(shortcut ?? '').replace(/^\//, '').trim().toLowerCase();
}

export function normalizeContent(content: unknown) {
  return typeof content === 'string' ? content.replace(/\r\n/g, '\n') : '';
}

function serialize(reply: QuickReply) {
  return { ...reply, content: normalizeContent(reply.content) };
}

export async function listQuickReplies(teamId: number) {
  const replies = await db.query.quickReplies.findMany({
    where: eq(quickReplies.teamId, teamId),
    orderBy: [desc(quickReplies.createdAt)],
  });
  return replies.map(serialize);
}

export async function createQuickReply(
  teamId: number,
  _userId: number,
  input: { shortcut: string; content: string },
) {
  const shortcut = normalizeShortcut(input.shortcut);
  const content = normalizeContent(input.content);
  if (!shortcut || !content.trim()) throw new Error('shortcut and content are required');
  if (shortcut.length > 50) throw new Error('El atajo no puede superar los 50 caracteres.');

  const [created] = await db
    .insert(quickReplies)
    .values({ teamId, shortcut, content })
    .returning();
  return serialize(created);
}

export async function updateQuickReply(
  teamId: number,
  _userId: number,
  id: number,
  patch: { shortcut?: string; content?: string },
) {
  const set: Partial<{ shortcut: string; content: string }> = {};
  if (patch.shortcut !== undefined) {
    const shortcut = normalizeShortcut(patch.shortcut);
    if (!shortcut) throw new Error('shortcut is required');
    if (shortcut.length > 50) throw new Error('El atajo no puede superar los 50 caracteres.');
    set.shortcut = shortcut;
  }
  if (patch.content !== undefined) {
    const content = normalizeContent(patch.content);
    if (!content.trim()) throw new Error('content is required');
    set.content = content;
  }
  if (!Object.keys(set).length) throw new Error('Nothing to update.');

  const [updated] = await db
    .update(quickReplies)
    .set(set)
    .where(and(eq(quickReplies.id, id), eq(quickReplies.teamId, teamId)))
    .returning();
  if (!updated) throw new Error('Quick reply not found.');
  return serialize(updated);
}

export async function deleteQuickReply(teamId: number, _userId: number, id: number) {
  const deleted = await db
    .delete(quickReplies)
    .where(and(eq(quickReplies.id, id), eq(quickReplies.teamId, teamId)))
    .returning({ id: quickReplies.id });
  return { deleted: deleted.length > 0, id };
}
