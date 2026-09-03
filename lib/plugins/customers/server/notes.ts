import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCustomerNotes, teamCustomers } from '@/lib/db/schema';

/**
 * Bitácora de cliente. Ver el comentario de `teamCustomerNotes` en el schema
 * para por qué existe: un cliente importado de AAPP Space puede no tener
 * conversación, y las notas internas del CRM viven dentro de un chat.
 *
 * Vive acá y no en la ruta HTTP porque lo consumen la ficha y las
 * herramientas MCP, y tienen que comportarse igual.
 */

export type NuevaNotaCliente = {
  teamId: number;
  customerId: number;
  userId?: number | null;
  text: string;
  kind?: 'note' | 'report';
  source?: 'user' | 'connector';
};

async function clienteDelEquipo(teamId: number, customerId: number) {
  return db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, teamId)),
    columns: { id: true, name: true },
  });
}

export async function listCustomerNotes(teamId: number, customerId: number, limit = 100) {
  return db.query.teamCustomerNotes.findMany({
    where: and(eq(teamCustomerNotes.teamId, teamId), eq(teamCustomerNotes.customerId, customerId)),
    orderBy: [desc(teamCustomerNotes.createdAt)],
    limit,
  });
}

export async function addCustomerNote(input: NuevaNotaCliente) {
  const cliente = await clienteDelEquipo(input.teamId, input.customerId);
  if (!cliente) return null;

  const [nota] = await db
    .insert(teamCustomerNotes)
    .values({
      teamId: input.teamId,
      customerId: input.customerId,
      text: input.text.trim(),
      kind: input.kind ?? 'note',
      source: input.source ?? 'user',
      createdBy: input.userId ?? null,
    })
    .returning();
  return nota;
}

export async function deleteCustomerNote(teamId: number, noteId: number) {
  const filas = await db
    .delete(teamCustomerNotes)
    .where(and(eq(teamCustomerNotes.id, noteId), eq(teamCustomerNotes.teamId, teamId)))
    .returning({ id: teamCustomerNotes.id });
  return filas.length > 0;
}
