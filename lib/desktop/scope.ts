import { and, eq, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, departmentMembers } from '@/lib/db/schema';
import type { PermissionContext } from '@/lib/auth/permissions-guard';

/**
 * Qué chats puede ver este usuario.
 *
 * Se usa SIEMPRE sobre `chats leftJoin contacts`: el predicado referencia
 * `contacts.assignedUserId`, así que no sirve en un `UPDATE chats ... WHERE` sin
 * FROM (Postgres tira "missing FROM-clause entry"). Para escribir, primero se
 * resuelven los ids con `resolveScopedChatIds` y después se actualiza por id.
 *
 * En el repo había tres definiciones distintas de esto y la del Escritorio era
 * la más restrictiva: con visibilidad 'department' ignoraba los chats asignados
 * al propio usuario si además tenía departamentos. Un permiso que depende de por
 * qué pantalla pasaste es un bug de soporte eterno, así que acá queda la
 * variante permisiva —asignado a mí O de mi departamento—, que es la que ya
 * aplicaban `improve-reply` y `ai-summary`.
 */
export async function chatScope(ctx: PermissionContext): Promise<SQL | undefined> {
  if (ctx.chatVisibility === 'all') return eq(chats.teamId, ctx.teamId);
  if (ctx.chatVisibility === 'assigned') {
    return and(eq(chats.teamId, ctx.teamId), eq(contacts.assignedUserId, ctx.userId));
  }
  const departments = await db
    .select({ id: departmentMembers.departmentId })
    .from(departmentMembers)
    .where(eq(departmentMembers.userId, ctx.userId));
  const ids = departments.map((item) => item.id);
  return ids.length
    ? and(
        eq(chats.teamId, ctx.teamId),
        or(eq(contacts.assignedUserId, ctx.userId), inArray(contacts.assignedDepartmentId, ids)),
      )
    : and(eq(chats.teamId, ctx.teamId), eq(contacts.assignedUserId, ctx.userId));
}

/**
 * Los ids de chat, de entre los pedidos, que este usuario puede tocar. Devuelve
 * también el `remoteJid` de la base: ningún destinatario se toma del cliente.
 */
export async function resolveScopedChats(
  ctx: PermissionContext,
  chatIds: number[],
): Promise<Map<number, { remoteJid: string; contactName: string | null }>> {
  const unique = [...new Set(chatIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!unique.length) return new Map();
  const scope = await chatScope(ctx);
  const rows = await db
    .select({
      id: chats.id,
      remoteJid: chats.remoteJid,
      contactName: contacts.name,
      chatName: chats.name,
    })
    .from(chats)
    .leftJoin(contacts, eq(contacts.chatId, chats.id))
    .where(and(scope, inArray(chats.id, unique)));
  return new Map(
    rows.map((row) => [row.id, { remoteJid: row.remoteJid, contactName: row.contactName ?? row.chatName }]),
  );
}
