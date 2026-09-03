import 'server-only';

import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ensureCustomFieldsTable } from '@/lib/contacts/custom-fields';
import { db } from '@/lib/db/drizzle';
import {
  contacts,
  customFields,
  departmentMembers,
  messages,
  teamCustomerContacts,
  teamCustomerNotes,
  teamCustomers,
  teamMembers,
  teamNotes,
  teamTaskColumns,
  teamTaskComments,
  teamTaskDependencies,
  teamTaskItemLocations,
  teamTaskItems,
  teamTaskMedia,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskWorkspaces,
  users,
  type TaskChecklistItem,
} from '@/lib/db/schema';
import { canSeeAllChats, getChatVisibility, type MemberPermissions } from '@/lib/permissions';
import {
  assertPermission,
  parse,
  type ActionPermission,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Fichas completas de lectura: notas privadas, campos personalizados y el
 * detalle de UNA tarea.
 *
 * Los tres agujeros que tapa este módulo son de LECTURA, no de escritura:
 *
 * - Las notas privadas se podían escribir (whatspro_add_internal_note,
 *   whatspro_add_contact_note, whatspro_customer_notes) pero no leer: las
 *   notas internas del chat viven en `messages` con isInternal=true y
 *   `messages` no está en el catálogo de solo lectura, así que una IA no podía
 *   releer lo que ella misma había dejado escrito.
 * - Los campos personalizados se podían definir y escribir, pero para leerlos
 *   había que cruzar a mano el catálogo `custom-fields` con el jsonb
 *   `contacts.custom_data`, y los valores huérfanos (claves sin definición)
 *   quedaban invisibles.
 * - De una tarea se podía ver el tablero entero o su grafo de vínculos, pero
 *   no la tarea sola con su checklist, sus comentarios, sus adjuntos y sus
 *   subtareas.
 */

const TASKS_PLUGIN = 'tasks';
const CUSTOMERS_PLUGIN = 'customers';
const NOTES_PLUGIN = 'notes';

const NOTE_SOURCES = ['crm', 'internal', 'customer_log', 'team_notes'] as const;
type NoteSource = (typeof NOTE_SOURCES)[number];

export const detailReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_private_notes',
    description:
      'TODAS las notas privadas de un contacto o de un cliente en una sola llamada, incluidas las que no se pueden leer con ninguna otra herramienta. '
      + 'Junta cuatro orígenes distintos: "crm" = la nota única del contacto (contacts.notes, la que escribe whatspro_add_contact_note); '
      + '"internal" = las notas internas de la conversación de WhatsApp (las que escribe whatspro_add_internal_note, nunca se le envían al contacto y hasta ahora no se podían releer); '
      + '"customer_log" = la bitácora del cliente del CRM con sus partes de trabajo de IA (whatspro_customer_notes); '
      + '"team_notes" = las notas del plugin Notas vinculadas a ese contacto o cliente por el grafo de relaciones. '
      + 'Es lo que responde "¿qué se dijo internamente de este cliente?", "¿qué dejé anotado la última vez?" o "leé las notas privadas antes de contestarle". '
      + 'Aceptá contact_id, chat_id o customer_id. Cada origen se saltea solo si falta el permiso o el plugin (aparece en skipped con el motivo) y ninguno se trunca en silencio: '
      + 'todos informan total y omitted. Las notas internas respetan la visibilidad de chats del usuario del conector: si no puede ver ese chat, la herramienta no lo revela.',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'integer', minimum: 1, description: 'Id del contacto del CRM. Sale de whatspro_list_records(resource="contacts").' },
        chat_id: { type: 'integer', minimum: 1, description: 'Alternativa: el id del chat de WhatsApp.' },
        customer_id: { type: 'integer', minimum: 1, description: 'Alternativa: el id del cliente (resource="customers"). Sirve para los clientes importados que no tienen conversación de WhatsApp.' },
        include: {
          type: 'array',
          maxItems: 4,
          uniqueItems: true,
          items: { type: 'string', enum: [...NOTE_SOURCES] },
          description: 'Qué orígenes traer. Si no lo mandás vienen los cuatro.',
        },
        q: { type: 'string', minLength: 2, maxLength: 120, description: 'Filtra por texto dentro de las notas (no distingue mayúsculas).' },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: 'Tope de notas por origen. Por defecto 50.' },
      },
      anyOf: [{ required: ['contact_id'] }, { required: ['chat_id'] }, { required: ['customer_id'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_custom_fields',
    description:
      'El catálogo de campos personalizados del CRM con sus VALORES ya resueltos. Sin contact_id devuelve la definición de cada campo (id, nombre, clave, tipo, posición) '
      + 'más cuántos contactos del equipo lo tienen cargado, que es la forma de saber qué campo se usa de verdad y cuál quedó muerto. '
      + 'Con contact_id (o chat_id) devuelve, campo por campo, el valor de ese contacto, cuáles están vacíos y cuáles claves guardadas no corresponden a ningún campo definido (huérfanas, '
      + 'normalmente de un campo que se borró o de una clave escrita a mano). Ejemplos: "¿qué campos personalizados tiene este cliente cargados?", "¿qué le falta completar?", "¿el campo cuit lo usa alguien?". '
      + 'Para escribir valores usá whatspro_set_custom_fields; para crear, renombrar o mover un campo, whatspro_manage_custom_field; para borrarlo, whatspro_delete_record(resource="custom_field").',
    inputSchema: {
      type: 'object',
      properties: {
        contact_id: { type: 'integer', minimum: 1, description: 'Contacto del que querés los valores. Sin esto devuelve el catálogo del equipo con su cobertura.' },
        chat_id: { type: 'integer', minimum: 1, description: 'Alternativa a contact_id: el id del chat de WhatsApp.' },
        include_empty: { type: 'boolean', default: true, description: 'Con contact_id: si también devuelve los campos sin valor. Por defecto true, porque saber qué falta suele ser el motivo de la consulta.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_get',
    description:
      'La ficha completa de UNA tarea: título, notas, estado, fechas, color, icono, etiquetas, responsable y autor con nombre resuelto, el tablero y la columna donde está '
      + '(y las demás columnas si la tarea está compartida en varios tableros), el checklist ítem por ítem con su id, los comentarios y partes de trabajo del hilo, los adjuntos, '
      + 'la tarea madre, las subtareas con su estado, las dependencias, y los campos de IA (ai_prompt, próximo paso, pregunta de contexto y su respuesta, si está entregada a la cola). '
      + 'Es lo que hay que leer ANTES de trabajar sobre una tarea concreta: whatspro_tasks_board y whatspro_tasks_search devuelven listas resumidas, y whatspro_get_record devuelve la fila pelada '
      + 'sin comentarios, sin adjuntos, sin subtareas y con ids sin resolver. Para el grafo de vínculos con contactos, clientes y otros tableros usá whatspro_tasks_links.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'integer', minimum: 1, description: 'Id de la tarea. Sale de whatspro_tasks_search, whatspro_tasks_board o whatspro_tasks_today.' },
        include: {
          type: 'array',
          maxItems: 6,
          uniqueItems: true,
          items: { type: 'string', enum: ['comments', 'media', 'subtasks', 'dependencies', 'locations', 'links'] },
          description: 'Qué secciones traer además de la tarea. Si no lo mandás vienen todas.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: 'Tope por sección (comentarios, adjuntos, subtareas). Por defecto 50.' },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function canDo(context: GrokActionContext, permission: ActionPermission, pluginId?: string) {
  try {
    await assertPermission(context, permission, pluginId);
    return true;
  } catch {
    return false;
  }
}

/** Corta una lista al tope pedido informando SIEMPRE cuántas quedaron afuera. */
function cap<T>(items: T[], limit: number) {
  return { items: items.slice(0, limit), total: items.length, omitted: Math.max(0, items.length - limit) };
}

async function memberNames(teamId: number) {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
  return new Map(rows.map((row) => [row.id, row.name || row.email]));
}

/**
 * Las notas internas son contenido privado del equipo: quien no puede ver el
 * chat tampoco puede leer lo que se anotó en él. Sin este chequeo, el conector
 * sería una puerta lateral para saltarse la visibilidad de chats de la app.
 */
async function puedeVerChat(
  context: GrokActionContext,
  target: { assignedUserId: number | null; assignedDepartmentId: number | null },
) {
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, context.teamId), eq(teamMembers.userId, context.userId)),
    columns: { role: true, permissions: true },
  });
  if (!member) return false;
  const permissions = member.permissions as MemberPermissions | null;
  if (canSeeAllChats(member.role, permissions)) return true;
  if (target.assignedUserId === context.userId) return true;
  if (getChatVisibility(member.role, permissions) === 'department' && target.assignedDepartmentId) {
    const membership = await db.query.departmentMembers.findFirst({
      where: and(
        eq(departmentMembers.userId, context.userId),
        eq(departmentMembers.departmentId, target.assignedDepartmentId),
      ),
      columns: { id: true },
    });
    if (membership) return true;
  }
  return false;
}

type ContactoResuelto = {
  id: number;
  name: string;
  chatId: number;
  notes: string | null;
  customData: Record<string, unknown> | null;
  assignedUserId: number | null;
  assignedDepartmentId: number | null;
};

async function resolverContacto(
  context: GrokActionContext,
  reference: { contact_id?: number; chat_id?: number },
): Promise<ContactoResuelto> {
  const found = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.teamId, context.teamId),
      reference.contact_id != null ? eq(contacts.id, reference.contact_id) : eq(contacts.chatId, reference.chat_id!),
    ),
    columns: {
      id: true,
      name: true,
      chatId: true,
      notes: true,
      customData: true,
      assignedUserId: true,
      assignedDepartmentId: true,
    },
  });
  if (!found) {
    throw new Error(
      reference.contact_id != null
        ? `No existe el contacto ${reference.contact_id} en este equipo. Buscalo con whatspro_list_records(resource="contacts").`
        : `El chat ${reference.chat_id} no tiene un contacto guardado en este equipo. Guardalo primero con whatspro_save_contact.`,
    );
  }
  return found as ContactoResuelto;
}

/* ------------------------------------------------------------------ */
/* whatspro_private_notes                                              */
/* ------------------------------------------------------------------ */

const privateNotesSchema = z
  .object({
    contact_id: z.number().int().positive().optional(),
    chat_id: z.number().int().positive().optional(),
    customer_id: z.number().int().positive().optional(),
    include: z.array(z.enum(NOTE_SOURCES)).max(4).optional(),
    q: z.string().trim().min(2).max(120).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .refine(
    (value) => value.contact_id != null || value.chat_id != null || value.customer_id != null,
    'Mandá contact_id, chat_id o customer_id.',
  );

async function privateNotes(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(privateNotesSchema, input);
  const limit = data.limit ?? 50;
  const want = (source: NoteSource) => !data.include || data.include.includes(source);
  const skipped: Array<{ source: NoteSource; reason: string }> = [];
  const needle = data.q?.toLowerCase() ?? null;
  const coincide = (text: string) => (needle ? text.toLowerCase().includes(needle) : true);

  const contact = data.contact_id != null || data.chat_id != null
    ? await resolverContacto(context, { contact_id: data.contact_id, chat_id: data.chat_id })
    : null;

  let customerId: number | null = data.customer_id ?? null;
  if (customerId != null) {
    const customer = await db.query.teamCustomers.findFirst({
      where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, context.teamId)),
      columns: { id: true },
    });
    if (!customer) throw new Error(`No existe el cliente ${customerId} en este equipo. Buscalo con whatspro_list_records(resource="customers").`);
  }

  /* Contactos del cliente: con customer_id hay que bajar a sus contactos para
     poder leer las notas internas de sus chats. */
  let contactIds: number[] = contact ? [contact.id] : [];
  if (customerId != null) {
    const links = await db
      .select({ contactId: teamCustomerContacts.contactId })
      .from(teamCustomerContacts)
      .where(and(eq(teamCustomerContacts.teamId, context.teamId), eq(teamCustomerContacts.customerId, customerId)));
    contactIds = Array.from(new Set([...contactIds, ...links.map((link) => link.contactId)]));
  } else if (contact) {
    const link = await db.query.teamCustomerContacts.findFirst({
      where: and(eq(teamCustomerContacts.teamId, context.teamId), eq(teamCustomerContacts.contactId, contact.id)),
      columns: { customerId: true },
    });
    customerId = link?.customerId ?? null;
  }

  /* --- crm: la nota única del contacto --- */
  let crm: Record<string, unknown> | null = null;
  if (want('crm')) {
    const filas = await db
      .select({ id: contacts.id, name: contacts.name, notes: contacts.notes, updatedAt: contacts.updatedAt })
      .from(contacts)
      .where(and(eq(contacts.teamId, context.teamId), contactIds.length ? inArray(contacts.id, contactIds) : eq(contacts.id, -1)));
    const items = filas
      .filter((fila) => (fila.notes ?? '').trim().length > 0 && coincide(fila.notes ?? ''))
      .map((fila) => ({
        contact_id: fila.id,
        contact: fila.name,
        text: (fila.notes ?? '').slice(0, 8000),
        chars: (fila.notes ?? '').length,
        truncated: (fila.notes ?? '').length > 8000,
        updated_at: fila.updatedAt,
      }));
    const capped = cap(items, limit);
    crm = {
      ...capped,
      source: 'contacts.notes — texto único acumulado por contacto. Se escribe con whatspro_add_contact_note.',
    };
  }

  /* --- internal: las notas internas del chat --- */
  let internal: Record<string, unknown> | null = null;
  if (want('internal')) {
    if (!contactIds.length) {
      skipped.push({ source: 'internal', reason: 'Este cliente no tiene ningún contacto de WhatsApp vinculado, así que no hay conversación donde haya notas internas. Vinculá uno con whatspro_link_customer_contact.' });
    } else {
      const filas = await db
        .select({
          contactId: contacts.id,
          contactName: contacts.name,
          chatId: contacts.chatId,
          assignedUserId: contacts.assignedUserId,
          assignedDepartmentId: contacts.assignedDepartmentId,
        })
        .from(contacts)
        .where(and(eq(contacts.teamId, context.teamId), inArray(contacts.id, contactIds)));

      const visibles: typeof filas = [];
      const ocultos: number[] = [];
      for (const fila of filas) {
        if (await puedeVerChat(context, fila)) visibles.push(fila);
        else ocultos.push(fila.contactId);
      }

      if (!visibles.length) {
        skipped.push({ source: 'internal', reason: 'La visibilidad de chats de este usuario no alcanza para ninguno de los chats de este contacto o cliente.' });
      } else {
        const porChat = new Map(visibles.map((fila) => [fila.chatId, fila]));
        const notas = await db
          .select({
            id: messages.id,
            chatId: messages.chatId,
            text: messages.text,
            timestamp: messages.timestamp,
            isAi: messages.isAi,
          })
          .from(messages)
          .where(and(inArray(messages.chatId, visibles.map((fila) => fila.chatId)), eq(messages.isInternal, true)))
          .orderBy(desc(messages.timestamp))
          .limit(limit + 200);
        const items = notas
          .filter((nota) => (nota.text ?? '').trim().length > 0 && coincide(nota.text ?? ''))
          .map((nota) => {
            const fila = porChat.get(nota.chatId);
            return {
              message_id: nota.id,
              chat_id: nota.chatId,
              contact_id: fila?.contactId ?? null,
              contact: fila?.contactName ?? null,
              text: nota.text ?? '',
              author: nota.isAi ? 'IA' : 'equipo',
              created_at: nota.timestamp,
            };
          });
        const capped = cap(items, limit);
        internal = {
          ...capped,
          hidden_contacts: ocultos.length,
          source: 'messages.isInternal — nunca se envían al contacto. Se escriben con whatspro_add_internal_note.',
        };
      }
    }
  }

  /* --- customer_log: la bitácora del cliente --- */
  let customerLog: Record<string, unknown> | null = null;
  if (want('customer_log')) {
    if (customerId == null) {
      skipped.push({ source: 'customer_log', reason: 'Este contacto no está vinculado a ningún cliente del CRM. Vinculalo con whatspro_link_customer_contact.' });
    } else if (!(await canDo(context, 'customersRead', CUSTOMERS_PLUGIN))) {
      skipped.push({ source: 'customer_log', reason: 'Falta el permiso customersRead o el plugin customers no está activo en este equipo.' });
    } else {
      const filas = await db
        .select({
          id: teamCustomerNotes.id,
          text: teamCustomerNotes.text,
          kind: teamCustomerNotes.kind,
          source: teamCustomerNotes.source,
          createdAt: teamCustomerNotes.createdAt,
        })
        .from(teamCustomerNotes)
        .where(and(eq(teamCustomerNotes.teamId, context.teamId), eq(teamCustomerNotes.customerId, customerId)))
        .orderBy(desc(teamCustomerNotes.createdAt))
        .limit(limit + 200);
      const items = filas
        .filter((fila) => coincide(fila.text))
        .map((fila) => ({
          note_id: fila.id,
          text: fila.text,
          kind: fila.kind,
          author: fila.source === 'connector' ? 'IA' : 'equipo',
          created_at: fila.createdAt,
        }));
      const capped = cap(items, limit);
      customerLog = {
        ...capped,
        customer_id: customerId,
        source: 'team_customer_notes — bitácora del cliente. Se escribe con whatspro_customer_notes(action="add").',
      };
    }
  }

  /* --- team_notes: notas del plugin Notas vinculadas por el grafo --- */
  let teamNotesOut: Record<string, unknown> | null = null;
  if (want('team_notes')) {
    if (!(await canDo(context, 'notesRead', NOTES_PLUGIN))) {
      skipped.push({ source: 'team_notes', reason: 'Falta el permiso notesRead o el plugin notes no está activo en este equipo.' });
    } else {
      const anclas: Array<{ type: string; id: number }> = [
        ...contactIds.map((id) => ({ type: 'contact', id })),
        ...(customerId != null ? [{ type: 'customer', id: customerId }] : []),
      ];
      const relaciones = anclas.length
        ? await db
            .select({
              sourceType: teamTaskRelations.sourceType,
              sourceId: teamTaskRelations.sourceId,
              targetType: teamTaskRelations.targetType,
              targetId: teamTaskRelations.targetId,
            })
            .from(teamTaskRelations)
            .where(
              and(
                eq(teamTaskRelations.teamId, context.teamId),
                or(
                  and(
                    inArray(teamTaskRelations.sourceType, anclas.map((ancla) => ancla.type)),
                    inArray(teamTaskRelations.sourceId, anclas.map((ancla) => ancla.id)),
                    eq(teamTaskRelations.targetType, 'note'),
                  ),
                  and(
                    inArray(teamTaskRelations.targetType, anclas.map((ancla) => ancla.type)),
                    inArray(teamTaskRelations.targetId, anclas.map((ancla) => ancla.id)),
                    eq(teamTaskRelations.sourceType, 'note'),
                  ),
                ),
              ),
            )
        : [];
      const noteIds = Array.from(
        new Set(relaciones.map((fila) => (fila.sourceType === 'note' ? fila.sourceId : fila.targetId))),
      );
      const filas = noteIds.length
        ? await db
            .select({
              id: teamNotes.id,
              title: teamNotes.title,
              content: teamNotes.content,
              status: teamNotes.status,
              pinned: teamNotes.pinned,
              tags: teamNotes.tags,
              updatedAt: teamNotes.updatedAt,
            })
            .from(teamNotes)
            .where(and(eq(teamNotes.teamId, context.teamId), inArray(teamNotes.id, noteIds)))
            .orderBy(desc(teamNotes.updatedAt))
        : [];
      const items = filas
        .filter((fila) => coincide(`${fila.title} ${fila.content}`))
        .map((fila) => ({
          note_id: fila.id,
          title: fila.title,
          text: fila.content.slice(0, 4000),
          truncated: fila.content.length > 4000,
          status: fila.status,
          pinned: fila.pinned,
          tags: fila.tags,
          updated_at: fila.updatedAt,
        }));
      const capped = cap(items, limit);
      teamNotesOut = {
        ...capped,
        source: 'team_notes vinculadas por el grafo de relaciones. Se vinculan con whatspro_manage_task_relation.',
      };
    }
  }

  return {
    contact: contact ? { contact_id: contact.id, name: contact.name, chat_id: contact.chatId } : null,
    customer_id: customerId,
    contact_ids: contactIds,
    crm,
    internal,
    customer_log: customerLog,
    team_notes: teamNotesOut,
    skipped,
    meta: {
      source_limit: limit,
      query: data.q ?? null,
      note: 'Cada origen informa total y omitted: nada se trunca en silencio. Lo que aparece en skipped se salteó por permisos, por plugin apagado o porque no aplica a la puerta de entrada usada.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* whatspro_custom_fields                                              */
/* ------------------------------------------------------------------ */

const customFieldsReadSchema = z.object({
  contact_id: z.number().int().positive().optional(),
  chat_id: z.number().int().positive().optional(),
  include_empty: z.boolean().optional(),
});

async function customFieldsOverview(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  await ensureCustomFieldsTable();
  const data = parse(customFieldsReadSchema, input);

  const definiciones = await db
    .select()
    .from(customFields)
    .where(eq(customFields.teamId, context.teamId))
    .orderBy(asc(customFields.position), asc(customFields.id));

  if (data.contact_id == null && data.chat_id == null) {
    /* Cobertura del equipo: cuántos contactos tienen cargado cada campo. Se
       usa jsonb_exists() y no el operador `?` a propósito: `?` choca con el
       marcador de parámetros del driver y termina rompiendo la consulta. */
    const cobertura = await Promise.all(
      definiciones.map(async (campo) => {
        const [fila] = await db
          .select({ total: sql<number>`count(*)::int` })
          .from(contacts)
          .where(
            and(
              eq(contacts.teamId, context.teamId),
              sql`jsonb_exists(coalesce(${contacts.customData}, '{}'::jsonb), ${campo.key})`,
              sql`coalesce(${contacts.customData} ->> ${campo.key}, '') <> ''`,
            ),
          );
        return { key: campo.key, contacts_with_value: fila?.total ?? 0 };
      }),
    );
    const porClave = new Map(cobertura.map((fila) => [fila.key, fila.contacts_with_value]));
    const [totalContactos] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(contacts)
      .where(eq(contacts.teamId, context.teamId));

    return {
      scope: 'team' as const,
      total_contacts: totalContactos?.total ?? 0,
      fields: definiciones.map((campo) => ({
        field_id: campo.id,
        name: campo.name,
        key: campo.key,
        type: campo.type,
        position: campo.position,
        contacts_with_value: porClave.get(campo.key) ?? 0,
        created_at: campo.createdAt,
      })),
      meta: {
        note: 'Cobertura del equipo. Para ver los valores de un contacto puntual, volvé a llamar con contact_id.',
        next: 'Escribí valores con whatspro_set_custom_fields; creá o renombrá campos con whatspro_manage_custom_field; borralos con whatspro_delete_record(resource="custom_field").',
      },
    };
  }

  const contact = await resolverContacto(context, { contact_id: data.contact_id, chat_id: data.chat_id });
  const valores = (contact.customData ?? {}) as Record<string, unknown>;
  const incluirVacios = data.include_empty ?? true;
  const definidas = new Set(definiciones.map((campo) => campo.key));

  const campos = definiciones
    .map((campo) => ({
      field_id: campo.id,
      name: campo.name,
      key: campo.key,
      type: campo.type,
      position: campo.position,
      value: valores[campo.key] ?? null,
      filled: valores[campo.key] !== undefined && valores[campo.key] !== null && valores[campo.key] !== '',
    }))
    .filter((campo) => incluirVacios || campo.filled);

  const huerfanas = Object.entries(valores)
    .filter(([key]) => !definidas.has(key))
    .map(([key, value]) => ({ key, value }));

  return {
    scope: 'contact' as const,
    contact: { contact_id: contact.id, name: contact.name, chat_id: contact.chatId },
    fields: campos,
    filled_count: campos.filter((campo) => campo.filled).length,
    missing: campos.filter((campo) => !campo.filled).map((campo) => campo.key),
    orphan_values: huerfanas,
    meta: {
      note: huerfanas.length
        ? 'orphan_values son claves guardadas en el contacto que ya no tienen definición en el catálogo (campo borrado o clave escrita a mano). Se pueden limpiar mandándolas en null con whatspro_set_custom_fields.'
        : 'Todos los valores guardados corresponden a un campo del catálogo.',
      next: 'Para escribir: whatspro_set_custom_fields(contact_id, fields={clave: valor}). Mandar null borra la clave.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* whatspro_tasks_get                                                  */
/* ------------------------------------------------------------------ */

const TASK_SECTIONS = ['comments', 'media', 'subtasks', 'dependencies', 'locations', 'links'] as const;
type TaskSection = (typeof TASK_SECTIONS)[number];

const taskGetSchema = z.object({
  task_id: z.number().int().positive(),
  include: z.array(z.enum(TASK_SECTIONS)).max(6).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

async function taskGet(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksRead', TASKS_PLUGIN);
  const data = parse(taskGetSchema, input);
  const limit = data.limit ?? 50;
  const want = (section: TaskSection) => !data.include || data.include.includes(section);

  const tarea = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, data.task_id), eq(teamTaskItems.teamId, context.teamId)),
  });
  if (!tarea) throw new Error(`No existe la tarea ${data.task_id} en este equipo. Buscala con whatspro_tasks_search.`);

  const [proyecto] = await db
    .select({
      projectId: teamTaskProjects.id,
      projectName: teamTaskProjects.name,
      workspaceId: teamTaskProjects.workspaceId,
      workspaceName: teamTaskWorkspaces.name,
    })
    .from(teamTaskProjects)
    .leftJoin(teamTaskWorkspaces, eq(teamTaskWorkspaces.id, teamTaskProjects.workspaceId))
    .where(and(eq(teamTaskProjects.id, tarea.projectId), eq(teamTaskProjects.teamId, context.teamId)));

  const [columna] = await db
    .select({ id: teamTaskColumns.id, name: teamTaskColumns.title })
    .from(teamTaskColumns)
    .where(eq(teamTaskColumns.id, tarea.columnId));

  const nombres = await memberNames(context.teamId);
  const checklist = ((tarea.checklist as TaskChecklistItem[] | null) ?? []);

  let comments: Record<string, unknown> | null = null;
  if (want('comments')) {
    const filas = await db
      .select()
      .from(teamTaskComments)
      .where(and(eq(teamTaskComments.teamId, context.teamId), eq(teamTaskComments.taskId, tarea.id)))
      .orderBy(desc(teamTaskComments.createdAt));
    const capped = cap(filas, limit);
    comments = {
      total: capped.total,
      omitted: capped.omitted,
      items: capped.items.map((fila) => ({
        comment_id: fila.id,
        text: fila.text,
        kind: fila.kind,
        author: fila.source === 'connector' ? 'IA' : (fila.createdBy ? nombres.get(fila.createdBy) ?? null : null),
        created_at: fila.createdAt,
      })),
    };
  }

  let media: Record<string, unknown> | null = null;
  if (want('media')) {
    const filas = await db
      .select()
      .from(teamTaskMedia)
      .where(and(
        eq(teamTaskMedia.teamId, context.teamId),
        eq(teamTaskMedia.ownerType, 'task'),
        eq(teamTaskMedia.ownerId, tarea.id),
      ))
      .orderBy(desc(teamTaskMedia.createdAt));
    const capped = cap(filas, limit);
    media = {
      total: capped.total,
      omitted: capped.omitted,
      items: capped.items.map((fila) => ({
        media_id: fila.id,
        file_name: fila.fileName,
        mime_type: fila.mimeType,
        size: fila.size,
        source: fila.source,
        url: fila.url,
        is_cover: fila.id === tarea.coverMediaId,
        created_at: fila.createdAt,
      })),
    };
  }

  let subtasks: Record<string, unknown> | null = null;
  if (want('subtasks')) {
    const filas = await db
      .select({
        id: teamTaskItems.id,
        title: teamTaskItems.title,
        status: teamTaskItems.status,
        assigneeId: teamTaskItems.assigneeId,
        dueDate: teamTaskItems.dueDate,
        order: teamTaskItems.order,
      })
      .from(teamTaskItems)
      .where(and(eq(teamTaskItems.teamId, context.teamId), eq(teamTaskItems.parentTaskId, tarea.id)))
      .orderBy(asc(teamTaskItems.order), asc(teamTaskItems.id));
    const capped = cap(filas, limit);
    subtasks = {
      total: capped.total,
      omitted: capped.omitted,
      done: filas.filter((fila) => fila.status === 'done').length,
      items: capped.items.map((fila) => ({
        task_id: fila.id,
        title: fila.title,
        status: fila.status,
        assigned_to: fila.assigneeId ? nombres.get(fila.assigneeId) ?? null : null,
        due_date: fila.dueDate,
      })),
    };
  }

  let dependencies: Record<string, unknown> | null = null;
  if (want('dependencies')) {
    const filas = await db
      .select({
        id: teamTaskDependencies.id,
        taskId: teamTaskDependencies.taskId,
        dependsOnTaskId: teamTaskDependencies.dependsOnTaskId,
      })
      .from(teamTaskDependencies)
      .where(and(
        eq(teamTaskDependencies.teamId, context.teamId),
        or(eq(teamTaskDependencies.taskId, tarea.id), eq(teamTaskDependencies.dependsOnTaskId, tarea.id)),
      ));
    const otrosIds = Array.from(new Set(filas.flatMap((fila) => [fila.taskId, fila.dependsOnTaskId]).filter((id) => id !== tarea.id)));
    const otros = otrosIds.length
      ? await db
          .select({ id: teamTaskItems.id, title: teamTaskItems.title, status: teamTaskItems.status })
          .from(teamTaskItems)
          .where(and(eq(teamTaskItems.teamId, context.teamId), inArray(teamTaskItems.id, otrosIds)))
      : [];
    const porId = new Map(otros.map((fila) => [fila.id, fila]));
    dependencies = {
      depends_on: filas
        .filter((fila) => fila.taskId === tarea.id)
        .map((fila) => ({
          task_id: fila.dependsOnTaskId,
          title: porId.get(fila.dependsOnTaskId)?.title ?? null,
          status: porId.get(fila.dependsOnTaskId)?.status ?? null,
        })),
      blocks: filas
        .filter((fila) => fila.dependsOnTaskId === tarea.id)
        .map((fila) => ({
          task_id: fila.taskId,
          title: porId.get(fila.taskId)?.title ?? null,
          status: porId.get(fila.taskId)?.status ?? null,
        })),
    };
  }

  let locations: unknown[] | null = null;
  if (want('locations')) {
    const filas = await db
      .select({
        projectId: teamTaskItemLocations.projectId,
        projectName: teamTaskProjects.name,
        columnId: teamTaskItemLocations.columnId,
        columnName: teamTaskColumns.title,
        isPrimary: teamTaskItemLocations.isPrimary,
        order: teamTaskItemLocations.order,
      })
      .from(teamTaskItemLocations)
      .leftJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskItemLocations.projectId))
      .leftJoin(teamTaskColumns, eq(teamTaskColumns.id, teamTaskItemLocations.columnId))
      .where(and(eq(teamTaskItemLocations.teamId, context.teamId), eq(teamTaskItemLocations.taskId, tarea.id)));
    locations = filas.map((fila) => ({
      project_id: fila.projectId,
      project: fila.projectName,
      column_id: fila.columnId,
      column: fila.columnName,
      is_primary: fila.isPrimary,
      order: fila.order,
    }));
  }

  let links: Record<string, unknown> | null = null;
  if (want('links')) {
    const filas = await db
      .select({
        id: teamTaskRelations.id,
        sourceType: teamTaskRelations.sourceType,
        sourceId: teamTaskRelations.sourceId,
        targetType: teamTaskRelations.targetType,
        targetId: teamTaskRelations.targetId,
        relationType: teamTaskRelations.relationType,
      })
      .from(teamTaskRelations)
      .where(and(
        eq(teamTaskRelations.teamId, context.teamId),
        or(
          and(eq(teamTaskRelations.sourceType, 'task'), eq(teamTaskRelations.sourceId, tarea.id)),
          and(eq(teamTaskRelations.targetType, 'task'), eq(teamTaskRelations.targetId, tarea.id)),
        ),
      ));
    const capped = cap(filas, limit);
    links = {
      total: capped.total,
      omitted: capped.omitted,
      items: capped.items.map((fila) => {
        const esOrigen = fila.sourceType === 'task' && fila.sourceId === tarea.id;
        return {
          relation_id: fila.id,
          other_type: esOrigen ? fila.targetType : fila.sourceType,
          other_id: esOrigen ? fila.targetId : fila.sourceId,
          relation_type: fila.relationType,
        };
      }),
      note: 'Ids sin resolver. Para los nombres y las dos direcciones del grafo usá whatspro_tasks_links(task_id).',
    };
  }

  return {
    task: {
      task_id: tarea.id,
      title: tarea.title,
      notes: tarea.notes,
      status: tarea.status,
      project_id: tarea.projectId,
      project: proyecto?.projectName ?? null,
      workspace_id: proyecto?.workspaceId ?? null,
      workspace: proyecto?.workspaceName ?? null,
      column_id: tarea.columnId,
      column: columna?.name ?? null,
      parent_task_id: tarea.parentTaskId,
      assignee_id: tarea.assigneeId,
      assigned_to: tarea.assigneeId ? nombres.get(tarea.assigneeId) ?? null : null,
      created_by: tarea.createdBy ? nombres.get(tarea.createdBy) ?? null : null,
      label_ids: tarea.labelIds,
      color: tarea.color,
      icon: tarea.icon,
      order: tarea.order,
      due_date: tarea.dueDate,
      start_date: tarea.startDate,
      end_date: tarea.endDate,
      completed_at: tarea.completedAt,
      created_at: tarea.createdAt,
      updated_at: tarea.updatedAt,
    },
    checklist: {
      total: checklist.length,
      done: checklist.filter((item) => item.completed).length,
      items: checklist.map((item, index) => ({ index, id: item.id, text: item.text, completed: item.completed })),
    },
    ai: {
      ai_prompt: tarea.aiPrompt,
      next_step: tarea.aiNextStep,
      context_question: tarea.aiContextQuestion,
      context_answer: tarea.aiContextAnswer,
      ready_at: tarea.aiReadyAt,
      in_queue: Boolean(tarea.aiReadyAt),
    },
    comments,
    media,
    subtasks,
    dependencies,
    locations,
    links,
    meta: {
      section_limit: limit,
      note: 'Cada sección informa total y omitted: nada se trunca en silencio.',
      next: `Para editar: whatspro_manage_task(action="update", task_id=${tarea.id}). Para una casilla del checklist: whatspro_task_checklist_item. Para el grafo con nombres: whatspro_tasks_links(task_id=${tarea.id}).`,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export async function executeDetailTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_private_notes') return privateNotes(input, context);
  if (name === 'whatspro_custom_fields') return customFieldsOverview(input, context);
  if (name === 'whatspro_tasks_get') return taskGet(input, context);
  throw new Error(`Unknown detail tool: ${name}`);
}
