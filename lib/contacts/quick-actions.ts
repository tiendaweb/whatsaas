import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contactTags, contacts, departments, tags, teamMembers } from '@/lib/db/schema';

/**
 * Las dos escrituras de contacto que el repo no tenía a nivel `lib`.
 *
 * Etiquetar y asignar existían repartidos entre route handlers atados a sesión y
 * handlers privados del conector, cada uno con su propia semántica: uno
 * reemplaza el conjunto entero de etiquetas, otro las suma, un tercero sólo sabe
 * de usuarios y no de departamentos. Poner una cuarta copia dentro del ejecutor
 * del Centro de comandos habría sido repetir la historia.
 *
 * Estas dos reciben `(teamId, …)` y no dependen de sesión, así que las puede
 * llamar por igual una pantalla, un conector o un lote.
 *
 * Lo que NO está acá: mover de etapa, que ya vive en
 * `lib/plugins/sales-ops/server/crm.ts:updateCrm` con la firma correcta y valida
 * que la etapa sea del equipo. Se reusa esa.
 */

export class ContactActionError extends Error {}

async function ownedContact(teamId: number, contactId: number) {
  const [contact] = await db
    .select({ id: contacts.id, chatId: contacts.chatId, name: contacts.name })
    .from(contacts)
    .where(and(eq(contacts.teamId, teamId), eq(contacts.id, contactId)))
    .limit(1);
  if (!contact) throw new ContactActionError('El contacto no existe en este equipo.');
  return contact;
}

/**
 * Suma o quita etiquetas sin tocar las demás.
 *
 * Es incremental a propósito: "agregale la etiqueta Urgente" no puede
 * significar "dejale sólo Urgente". El reemplazo de conjunto ya existe en
 * `updateCrm({ tagIds })` y sirve para el editor de la ficha, donde la persona
 * ve la lista completa antes de guardar.
 */
export async function changeContactTags(
  teamId: number,
  contactId: number,
  patch: { add?: number[]; remove?: number[] },
): Promise<{ contactId: number; added: number[]; removed: number[]; current: number[] }> {
  const contact = await ownedContact(teamId, contactId);

  const wanted = [...new Set([...(patch.add ?? []), ...(patch.remove ?? [])])].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (!wanted.length) throw new ContactActionError('Mandá al menos una etiqueta en add o en remove.');

  // Una etiqueta de otro equipo no se rechaza en silencio: el insert la
  // aceptaría, porque `contact_tags` no tiene por dónde saber de qué equipo es.
  const owned = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.teamId, teamId), inArray(tags.id, wanted)));
  const ownedIds = new Set(owned.map((row) => row.id));
  const ajenas = wanted.filter((id) => !ownedIds.has(id));
  if (ajenas.length) throw new ContactActionError(`Estas etiquetas no son del equipo: ${ajenas.join(', ')}.`);

  const toAdd = (patch.add ?? []).filter((id) => ownedIds.has(id));
  const toRemove = (patch.remove ?? []).filter((id) => ownedIds.has(id));

  if (toRemove.length) {
    await db
      .delete(contactTags)
      .where(and(eq(contactTags.contactId, contact.id), inArray(contactTags.tagId, toRemove)));
  }
  if (toAdd.length) {
    await db
      .insert(contactTags)
      .values(toAdd.map((tagId) => ({ contactId: contact.id, tagId })))
      .onConflictDoNothing();
  }

  const current = await db
    .select({ tagId: contactTags.tagId })
    .from(contactTags)
    .where(eq(contactTags.contactId, contact.id));

  return {
    contactId: contact.id,
    added: toAdd,
    removed: toRemove,
    current: current.map((row) => row.tagId),
  };
}

/**
 * Asigna el contacto a una persona, a un departamento, a las dos cosas o a
 * ninguna.
 *
 * `null` desasigna; omitir el campo lo deja como está. Es la única versión que
 * cubre las dos columnas a la vez: la ruta de "asignar agente" sólo sabe de
 * usuarios y la del editor de contacto mezcla la asignación con el nombre, la
 * etapa y las etiquetas en la misma transacción.
 */
export async function assignContact(
  teamId: number,
  contactId: number,
  patch: { assignedUserId?: number | null; assignedDepartmentId?: number | null },
): Promise<{ contactId: number; assignedUserId: number | null; assignedDepartmentId: number | null }> {
  const contact = await ownedContact(teamId, contactId);

  if (patch.assignedUserId === undefined && patch.assignedDepartmentId === undefined) {
    throw new ContactActionError('Mandá assignedUserId o assignedDepartmentId (usá null para desasignar).');
  }

  if (patch.assignedUserId != null) {
    const [member] = await db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, patch.assignedUserId)))
      .limit(1);
    if (!member) throw new ContactActionError('Esa persona no es miembro del equipo.');
  }

  if (patch.assignedDepartmentId != null) {
    const [department] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(and(eq(departments.teamId, teamId), eq(departments.id, patch.assignedDepartmentId)))
      .limit(1);
    if (!department) throw new ContactActionError('Ese sector no es del equipo.');
  }

  const [updated] = await db
    .update(contacts)
    .set({
      ...(patch.assignedUserId !== undefined ? { assignedUserId: patch.assignedUserId } : {}),
      ...(patch.assignedDepartmentId !== undefined ? { assignedDepartmentId: patch.assignedDepartmentId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.teamId, teamId), eq(contacts.id, contact.id)))
    .returning({
      id: contacts.id,
      assignedUserId: contacts.assignedUserId,
      assignedDepartmentId: contacts.assignedDepartmentId,
    });

  return {
    contactId: updated.id,
    assignedUserId: updated.assignedUserId,
    assignedDepartmentId: updated.assignedDepartmentId,
  };
}
