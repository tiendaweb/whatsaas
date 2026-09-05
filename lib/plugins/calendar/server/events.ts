import 'server-only';
import { and, asc, eq, gte, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, teamCustomers, teamEventParticipants, teamEvents, users } from '@/lib/db/schema';
import { claveDia, type EventKind, type EventoRow, type EventStatus, type Recurrence } from '../shared/tipos';

/**
 * Los eventos del equipo, en un solo lugar.
 *
 * Antes cada ruta y cada tool armaba su propia consulta y su propia idea de
 * "se superpone": había tres fórmulas distintas y dos de ellas dejaban pasar
 * el caso de un evento contenido dentro de otro. Acá hay una sola.
 *
 * Las repeticiones NO se materializan en la base: la fila es una y al leer un
 * rango se expanden sus ocurrencias (`ocurrencia`). Editar la serie es editar
 * la fila; no hay copias que puedan quedar desfasadas.
 */

export type RangoInput = { from: Date; to: Date; kinds?: EventKind[]; status?: EventStatus[]; userId?: number; contactId?: number; customerId?: number; q?: string };

const seleccion = {
  id: teamEvents.id,
  title: teamEvents.title,
  startsAt: teamEvents.startsAt,
  endsAt: teamEvents.endsAt,
  allDay: teamEvents.allDay,
  kind: teamEvents.kind,
  subtype: teamEvents.subtype,
  status: teamEvents.status,
  notes: teamEvents.notes,
  location: teamEvents.location,
  color: teamEvents.color,
  recurrence: teamEvents.recurrence,
  recurrenceUntil: teamEvents.recurrenceUntil,
  reminderMinutes: teamEvents.reminderMinutes,
  attendees: teamEvents.attendees,
  contactId: teamEvents.contactId,
  contactName: contacts.name,
  chatId: contacts.chatId,
  customerId: teamEvents.customerId,
  customerName: teamCustomers.name,
  relatedUserId: teamEvents.relatedUserId,
  relatedUserName: users.name,
  outcome: teamEvents.outcome,
  nextAction: teamEvents.nextAction,
  externalSource: teamEvents.externalSource,
} as const;

function aFila(r: Record<string, unknown>): EventoRow {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  return {
    id: Number(r.id),
    title: String(r.title),
    startsAt: iso(r.startsAt),
    endsAt: iso(r.endsAt),
    allDay: Boolean(r.allDay),
    kind: (r.kind as EventKind) ?? 'meeting',
    subtype: (r.subtype as string) ?? null,
    status: (r.status as EventStatus) ?? 'scheduled',
    notes: String(r.notes ?? ''),
    location: (r.location as string) ?? null,
    color: (r.color as string) ?? null,
    recurrence: (r.recurrence as Recurrence) ?? 'none',
    recurrenceUntil: r.recurrenceUntil ? String(r.recurrenceUntil) : null,
    reminderMinutes: Array.isArray(r.reminderMinutes) ? (r.reminderMinutes as number[]) : [],
    attendees: Array.isArray(r.attendees) ? (r.attendees as string[]) : [],
    contactId: (r.contactId as number) ?? null,
    contactName: (r.contactName as string) ?? null,
    chatId: (r.chatId as number) ?? null,
    customerId: (r.customerId as number) ?? null,
    customerName: (r.customerName as string) ?? null,
    relatedUserId: (r.relatedUserId as number) ?? null,
    relatedUserName: (r.relatedUserName as string) ?? null,
    outcome: String(r.outcome ?? ''),
    nextAction: String(r.nextAction ?? ''),
    externalSource: (r.externalSource as string) ?? null,
    participants: [],
  };
}

/** Las fechas en que cae una serie dentro del rango pedido. */
function ocurrencias(row: EventoRow, from: Date, to: Date): string[] {
  const inicio = new Date(row.startsAt);
  if (row.recurrence === 'none') return inicio >= from && inicio <= to ? [inicio.toISOString()] : [];
  const hasta = row.recurrenceUntil ? new Date(`${row.recurrenceUntil}T23:59:59`) : null;
  const salidas: string[] = [];
  const cursor = new Date(inicio);
  // Cotas duras: un rango es como mucho un año y el paso mínimo es un día.
  for (let i = 0; i < 400 && cursor <= to; i++) {
    if (hasta && cursor > hasta) break;
    if (cursor >= from) salidas.push(new Date(cursor).toISOString());
    if (row.recurrence === 'daily') cursor.setDate(cursor.getDate() + 1);
    else if (row.recurrence === 'weekly') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return salidas;
}

/**
 * Eventos que caen en el rango, con las repeticiones ya expandidas.
 *
 * Las series se traen enteras (son pocas) y se expanden en memoria; los eventos
 * sueltos se filtran en SQL, que es donde están los miles.
 */
export async function listEventsInRange(teamId: number, input: RangoInput): Promise<EventoRow[]> {
  const conds = [
    eq(teamEvents.teamId, teamId),
    or(
      // Sueltos: se superponen con el rango.
      and(eq(teamEvents.recurrence, 'none'), lte(teamEvents.startsAt, input.to), gte(teamEvents.endsAt, input.from)),
      // Series: empezaron antes del fin del rango y no terminaron antes de su inicio.
      and(ne(teamEvents.recurrence, 'none'), lte(teamEvents.startsAt, input.to), or(sql`${teamEvents.recurrenceUntil} is null`, gte(teamEvents.recurrenceUntil, claveDia(input.from)))),
    )!,
  ];
  if (input.kinds?.length) conds.push(sql`${teamEvents.kind} in ${input.kinds}`);
  if (input.status?.length) conds.push(sql`${teamEvents.status} in ${input.status}`);
  if (input.userId) conds.push(eq(teamEvents.relatedUserId, input.userId));
  if (input.contactId) conds.push(eq(teamEvents.contactId, input.contactId));
  if (input.customerId) conds.push(eq(teamEvents.customerId, input.customerId));
  if (input.q?.trim()) {
    const q = `%${input.q.trim()}%`;
    conds.push(or(sql`${teamEvents.title} ilike ${q}`, sql`${teamEvents.notes} ilike ${q}`, sql`${contacts.name} ilike ${q}`)!);
  }

  const filas = await db
    .select(seleccion)
    .from(teamEvents)
    .leftJoin(contacts, eq(contacts.id, teamEvents.contactId))
    .leftJoin(teamCustomers, eq(teamCustomers.id, teamEvents.customerId))
    .leftJoin(users, eq(users.id, teamEvents.relatedUserId))
    .where(and(...conds))
    .orderBy(asc(teamEvents.startsAt))
    .limit(2000);

  const salida: EventoRow[] = [];
  for (const f of filas) {
    const row = aFila(f as Record<string, unknown>);
    if (row.recurrence === 'none') {
      salida.push(row);
      continue;
    }
    for (const cuando of ocurrencias(row, input.from, input.to)) salida.push({ ...row, ocurrencia: cuando });
  }
  salida.sort((a, b) => (a.ocurrencia ?? a.startsAt).localeCompare(b.ocurrencia ?? b.startsAt));
  return salida;
}

export async function getEvent(teamId: number, id: number): Promise<EventoRow | null> {
  const [f] = await db
    .select(seleccion)
    .from(teamEvents)
    .leftJoin(contacts, eq(contacts.id, teamEvents.contactId))
    .leftJoin(teamCustomers, eq(teamCustomers.id, teamEvents.customerId))
    .leftJoin(users, eq(users.id, teamEvents.relatedUserId))
    .where(and(eq(teamEvents.teamId, teamId), eq(teamEvents.id, id)))
    .limit(1);
  if (!f) return null;
  const row = aFila(f as Record<string, unknown>);
  row.participants = await db
    .select({ id: teamEventParticipants.id, userId: teamEventParticipants.userId, contactId: teamEventParticipants.contactId, role: teamEventParticipants.role, responseStatus: teamEventParticipants.responseStatus })
    .from(teamEventParticipants)
    .where(and(eq(teamEventParticipants.teamId, teamId), eq(teamEventParticipants.eventId, id)));
  return row;
}

/**
 * Eventos que chocan con un horario. Cubre los tres casos (empieza dentro,
 * termina dentro, y contiene al otro) con la comparación medio-abierta, y no
 * cuenta los cancelados.
 */
export async function overlappingEvents(teamId: number, startsAt: Date, endsAt: Date, exceptId?: number) {
  const conds = [
    eq(teamEvents.teamId, teamId),
    ne(teamEvents.status, 'canceled'),
    // Un `Date` crudo dentro de un template `sql` de drizzle SIEMPRE tira
    // ("The string argument must be of type string... Received an instance of
    // Date"): hay que mandarlo como literal ISO con cast. Esta función fallaba
    // en el 100% de las llamadas, así que la validación de superposición nunca
    // funcionó y encima impedía crear el evento con un 422 incomprensible.
    sql`${teamEvents.startsAt} < ${endsAt.toISOString()}::timestamp`,
    sql`${teamEvents.endsAt} > ${startsAt.toISOString()}::timestamp`,
  ];
  if (exceptId) conds.push(ne(teamEvents.id, exceptId));
  return db
    .select({ id: teamEvents.id, title: teamEvents.title, startsAt: teamEvents.startsAt, endsAt: teamEvents.endsAt })
    .from(teamEvents)
    .where(and(...conds))
    .limit(5);
}

export type EventoInput = {
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay?: boolean;
  kind?: EventKind;
  subtype?: string | null;
  status?: EventStatus;
  notes?: string;
  location?: string | null;
  color?: string | null;
  recurrence?: Recurrence;
  recurrenceUntil?: string | null;
  reminderMinutes?: number[];
  attendees?: string[];
  contactId?: number | null;
  customerId?: number | null;
  relatedUserId?: number | null;
  outcome?: string;
  nextAction?: string;
};

export async function createEvent(teamId: number, userId: number, input: EventoInput): Promise<EventoRow> {
  const [row] = await db
    .insert(teamEvents)
    .values({
      teamId,
      title: input.title.trim().slice(0, 180),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allDay: input.allDay ?? false,
      kind: (input.kind ?? 'meeting') as 'meeting' | 'call',
      subtype: input.subtype ?? null,
      status: input.status ?? 'scheduled',
      notes: input.notes?.slice(0, 4000) ?? '',
      location: input.location?.slice(0, 300) ?? null,
      color: input.color ?? null,
      recurrence: input.recurrence ?? 'none',
      recurrenceUntil: input.recurrenceUntil ?? null,
      reminderMinutes: input.reminderMinutes ?? [],
      attendees: input.attendees ?? [],
      contactId: input.contactId ?? null,
      customerId: input.customerId ?? null,
      relatedUserId: input.relatedUserId ?? null,
      outcome: input.outcome ?? '',
      nextAction: input.nextAction ?? '',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: teamEvents.id });
  const creado = await getEvent(teamId, row.id);
  return creado!;
}

export async function updateEvent(teamId: number, userId: number, id: number, patch: Partial<EventoInput>): Promise<EventoRow | null> {
  const set: Record<string, unknown> = { updatedBy: userId, updatedAt: new Date() };
  const campos: Array<keyof EventoInput> = ['title', 'startsAt', 'endsAt', 'allDay', 'kind', 'subtype', 'status', 'notes', 'location', 'color', 'recurrence', 'recurrenceUntil', 'reminderMinutes', 'attendees', 'contactId', 'customerId', 'relatedUserId', 'outcome', 'nextAction'];
  for (const c of campos) if (patch[c] !== undefined) set[c] = patch[c];
  await db.update(teamEvents).set(set).where(and(eq(teamEvents.teamId, teamId), eq(teamEvents.id, id)));
  return getEvent(teamId, id);
}

export async function deleteEvent(teamId: number, id: number): Promise<boolean> {
  const rows = await db.delete(teamEvents).where(and(eq(teamEvents.teamId, teamId), eq(teamEvents.id, id))).returning({ id: teamEvents.id });
  return rows.length > 0;
}

/** Chats abiertos con contactos, para vincular un evento a alguien. */
export async function listContactosParaEvento(teamId: number, q: string, limit = 20) {
  const filtro = q.trim() ? `%${q.trim()}%` : null;
  return db
    .select({ id: contacts.id, name: contacts.name, chatId: contacts.chatId })
    .from(contacts)
    .leftJoin(chats, eq(chats.id, contacts.chatId))
    .where(filtro ? and(eq(contacts.teamId, teamId), sql`${contacts.name} ilike ${filtro}`) : eq(contacts.teamId, teamId))
    .orderBy(asc(contacts.name))
    .limit(limit);
}
