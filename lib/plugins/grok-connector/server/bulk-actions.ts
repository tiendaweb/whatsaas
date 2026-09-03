import 'server-only';

import { MembershipRenewError, renewSubscription } from '@/lib/plugins/memberships/server/renew';

import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lte, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contactTags,
  contacts,
  funnelStages,
  tags,
  teamMembershipSubscriptions,
  teamTaskColumns,
  teamTaskItems,
  teamTaskProjects,
  users,
} from '@/lib/db/schema';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Búsqueda y operaciones en lote.
 *
 * El conector no tenía ninguna operación de lote: mover 30 contactos de etapa
 * eran 30 llamadas, y buscar una tarea por texto obligaba a bajar el tablero
 * completo (516 tareas, ~300.000 caracteres) para filtrar en memoria. Con ese
 * costo, cualquier limpieza del embudo era inviable en la práctica.
 *
 * Todo lo que toca más de un registro acepta `dry_run` y devuelve resultado
 * ítem por ítem: un lote que falla a la mitad tiene que decir exactamente
 * cuáles pasaron.
 */

const isoDateProperty = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;

export const bulkReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_tasks_search',
    description:
      'Busca tareas por texto, responsable, vencimiento, estado, etiqueta o proyecto, sin bajar el tablero entero. '
      + 'El texto busca en título, notas y prompt de IA. Con has_ai_prompt: true trae sólo las que tienen instrucciones para la IA, '
      + 'que es la forma de encontrar el trabajo que quedó encargado.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', maxLength: 200, description: 'Texto libre. Busca en título, notas y prompt.' },
        status: { type: 'string', enum: ['open', 'in_progress', 'done'] },
        assignee_id: { type: ['integer', 'null'], minimum: 1 },
        project_id: { type: 'integer', minimum: 1 },
        label_id: { type: 'string', maxLength: 100 },
        due_from: { ...isoDateProperty },
        due_to: { ...isoDateProperty },
        has_ai_prompt: { type: 'boolean' },
        overdue: { type: 'boolean', description: 'Sólo vencidas y sin terminar.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Por defecto 50.' },
      },
      additionalProperties: false,
    },
  },
];

export const bulkActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_crm_bulk_stage',
    description:
      'Mueve varios contactos a una etapa del embudo de una sola llamada. Con dry_run: true muestra qué contactos se moverían '
      + 'y desde qué etapa, sin tocar nada. Usalo para limpiezas del embudo: uno por uno son decenas de llamadas.',
    inputSchema: {
      type: 'object',
      required: ['contact_ids', 'funnel_stage_id'],
      properties: {
        contact_ids: { type: 'array', minItems: 1, maxItems: 300, items: { type: 'integer', minimum: 1 } },
        funnel_stage_id: { type: ['integer', 'null'], minimum: 1, description: 'null saca al contacto del embudo.' },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_crm_bulk_tags',
    description:
      'Agrega o quita etiquetas en varios contactos a la vez. mode "add" suma sin tocar las existentes; "remove" saca sólo las indicadas. '
      + 'No hay modo "replace" a propósito: borrar todas las etiquetas de decenas de contactos es irreversible y silencioso.',
    inputSchema: {
      type: 'object',
      required: ['contact_ids', 'tag_ids', 'mode'],
      properties: {
        contact_ids: { type: 'array', minItems: 1, maxItems: 300, items: { type: 'integer', minimum: 1 } },
        tag_ids: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'integer', minimum: 1 } },
        mode: { type: 'string', enum: ['add', 'remove'] },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_memberships_renew',
    description:
      'Renueva una suscripción: corre la fecha de fin y, opcionalmente, registra el cobro en Financiero — las dos cosas juntas. '
      + 'Hacer sólo una de las dos deja la cola de avisos mintiendo: la suscripción figura vigente y la plata no está registrada, o al revés. '
      + 'Toca dinero: exige confirm e idempotency_key.',
    inputSchema: {
      type: 'object',
      required: ['subscription_id', 'new_end_date', 'idempotency_key', 'confirm'],
      properties: {
        subscription_id: { type: 'integer', minimum: 1 },
        new_end_date: { ...isoDateProperty, description: 'Nueva fecha de vencimiento.' },
        payment_status: { type: 'string', enum: ['paid', 'pending', 'overdue'], description: 'Estado de cobro tras la renovación.' },
        record_payment: { type: 'boolean', description: 'Crear el movimiento de ingreso en Financiero por el precio de la suscripción.' },
        amount: { type: 'integer', minimum: 0, description: 'Monto del cobro. Por defecto, el precio de la suscripción.' },
        account_id: { type: ['integer', 'null'], minimum: 1 },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80 },
        confirm: { type: 'boolean', const: true },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_task_ai_prompt_status',
    description:
      'Marca el prompt de IA de una tarea como pendiente, hecho o no aplica, con la fecha. '
      + 'Sin esto el campo es texto libre y no se distingue lo que falta ejecutar de lo ya ejecutado: la única forma era escribir '
      + '"EJECUTADO" dentro del propio texto. Con el estado, el tablero se vuelve una cola de trabajo consultable con whatspro_tasks_search.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'status'],
      properties: {
        task_id: { type: 'integer', minimum: 1 },
        status: { type: 'string', enum: ['pending', 'done', 'not_applicable'] },
        note: { type: 'string', maxLength: 500, description: 'Qué se hizo, para que quede el rastro.' },
      },
      additionalProperties: false,
    },
  },
];

// ─── Schemas ─────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const searchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
  assignee_id: z.number().int().positive().nullable().optional(),
  project_id: z.number().int().positive().optional(),
  label_id: z.string().max(100).optional(),
  due_from: isoDate.optional(),
  due_to: isoDate.optional(),
  has_ai_prompt: z.boolean().optional(),
  overdue: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

const bulkStageSchema = z.object({
  contact_ids: z.array(z.number().int().positive()).min(1).max(300),
  funnel_stage_id: z.number().int().positive().nullable(),
  dry_run: z.boolean().optional(),
});

const bulkTagsSchema = z.object({
  contact_ids: z.array(z.number().int().positive()).min(1).max(300),
  tag_ids: z.array(z.number().int().positive()).min(1).max(30),
  mode: z.enum(['add', 'remove']),
  dry_run: z.boolean().optional(),
});

const renewSchema = z.object({
  subscription_id: z.number().int().positive(),
  new_end_date: isoDate,
  payment_status: z.enum(['paid', 'pending', 'overdue']).optional(),
  record_payment: z.boolean().optional(),
  amount: z.number().int().min(0).optional(),
  account_id: z.number().int().positive().nullable().optional(),
  idempotency_key: z.string().trim().min(8).max(80),
  confirm: z.literal(true),
  dry_run: z.boolean().optional(),
});

const promptStatusSchema = z.object({
  task_id: z.number().int().positive(),
  status: z.enum(['pending', 'done', 'not_applicable']),
  note: z.string().max(500).optional(),
});

// ─── Implementación ──────────────────────────────────────────────────────────

async function buscarTareas(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksRead', 'tasks');
  const data = parse(searchSchema, input);

  const condiciones = [eq(teamTaskItems.teamId, context.teamId)];

  if (data.q) {
    const patron = `%${data.q}%`;
    condiciones.push(or(
      ilike(teamTaskItems.title, patron),
      ilike(teamTaskItems.notes, patron),
      ilike(teamTaskItems.aiPrompt, patron),
    )!);
  }
  if (data.status) condiciones.push(eq(teamTaskItems.status, data.status));
  if (data.assignee_id !== undefined && data.assignee_id !== null) {
    condiciones.push(eq(teamTaskItems.assigneeId, data.assignee_id));
  }
  if (data.project_id) condiciones.push(eq(teamTaskItems.projectId, data.project_id));
  if (data.due_from) condiciones.push(gte(teamTaskItems.dueDate, new Date(`${data.due_from}T00:00:00`)));
  if (data.due_to) condiciones.push(lte(teamTaskItems.dueDate, new Date(`${data.due_to}T23:59:59`)));
  if (data.has_ai_prompt) condiciones.push(ne(teamTaskItems.aiPrompt, ''));
  if (data.label_id) {
    // `labelIds` es un jsonb array de strings.
    condiciones.push(sql`${teamTaskItems.labelIds} @> ${JSON.stringify([data.label_id])}::jsonb`);
  }
  if (data.overdue) {
    condiciones.push(isNotNull(teamTaskItems.dueDate));
    condiciones.push(lte(teamTaskItems.dueDate, new Date()));
    condiciones.push(ne(teamTaskItems.status, 'done'));
  }

  const filas = await db
    .select({
      id: teamTaskItems.id,
      title: teamTaskItems.title,
      status: teamTaskItems.status,
      dueDate: teamTaskItems.dueDate,
      aiPrompt: teamTaskItems.aiPrompt,
      labelIds: teamTaskItems.labelIds,
      projectId: teamTaskProjects.id,
      projectName: teamTaskProjects.name,
      assigneeId: teamTaskItems.assigneeId,
      assigneeName: users.name,
    })
    .from(teamTaskItems)
    .innerJoin(teamTaskProjects, eq(teamTaskItems.projectId, teamTaskProjects.id))
    .leftJoin(users, eq(teamTaskItems.assigneeId, users.id))
    .where(and(...condiciones))
    .orderBy(asc(teamTaskItems.dueDate), desc(teamTaskItems.updatedAt))
    .limit(data.limit);

  return {
    object: 'tasks_search',
    count: filas.length,
    truncated: filas.length === data.limit,
    data: filas.map((fila) => ({
      task_id: fila.id,
      title: fila.title,
      status: fila.status,
      due_at: fila.dueDate?.toISOString() ?? null,
      // El prompt entero puede ser larguísimo: acá va el recorte, y la tarea
      // completa se lee con whatspro_get_record si hace falta.
      ai_prompt: fila.aiPrompt ? `${fila.aiPrompt.slice(0, 200)}${fila.aiPrompt.length > 200 ? '…' : ''}` : null,
      labels: fila.labelIds,
      project: { id: fila.projectId, name: fila.projectName },
      assignee: fila.assigneeId ? { id: fila.assigneeId, name: fila.assigneeName } : null,
    })),
  };
}

async function moverEtapaEnLote(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(bulkStageSchema, input);

  if (data.funnel_stage_id) {
    const etapa = await db.query.funnelStages.findFirst({
      where: and(eq(funnelStages.id, data.funnel_stage_id), eq(funnelStages.teamId, context.teamId)),
      columns: { id: true, name: true },
    });
    if (!etapa) throw new Error('La etapa no existe en este equipo.');
  }

  const actuales = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      stageId: contacts.funnelStageId,
      stageName: funnelStages.name,
    })
    .from(contacts)
    .leftJoin(funnelStages, eq(contacts.funnelStageId, funnelStages.id))
    .where(and(eq(contacts.teamId, context.teamId), inArray(contacts.id, data.contact_ids)));

  const encontrados = new Set(actuales.map((fila) => fila.id));
  const faltantes = data.contact_ids.filter((id) => !encontrados.has(id));

  const detalle = actuales.map((fila) => ({
    contact_id: fila.id,
    name: fila.name,
    desde: fila.stageName ?? 'sin etapa',
    ok: true,
  }));
  for (const id of faltantes) {
    detalle.push({ contact_id: id, name: '—', desde: '—', ok: false });
  }

  if (!data.dry_run && actuales.length) {
    await db.update(contacts)
      .set({ funnelStageId: data.funnel_stage_id, updatedAt: new Date() })
      .where(and(eq(contacts.teamId, context.teamId), inArray(contacts.id, [...encontrados])));
    await audit(context, 'GROK_CRM_BULK_STAGE', actuales.length);
  }

  return {
    success: faltantes.length === 0,
    dry_run: data.dry_run ?? false,
    movidos: data.dry_run ? 0 : actuales.length,
    no_encontrados: faltantes.length,
    data: detalle,
  };
}

async function etiquetarEnLote(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(bulkTagsSchema, input);

  const etiquetas = await db.select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.teamId, context.teamId), inArray(tags.id, data.tag_ids)));
  if (etiquetas.length !== data.tag_ids.length) {
    throw new Error('Alguna etiqueta no existe en este equipo: revisá los tag_ids.');
  }

  const encontrados = await db.select({ id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(and(eq(contacts.teamId, context.teamId), inArray(contacts.id, data.contact_ids)));
  const ids = encontrados.map((fila) => fila.id);
  const faltantes = data.contact_ids.filter((id) => !ids.includes(id));

  if (!data.dry_run && ids.length) {
    if (data.mode === 'add') {
      const filas = ids.flatMap((contactId) => data.tag_ids.map((tagId) => ({ contactId, tagId })));
      await db.insert(contactTags).values(filas).onConflictDoNothing();
    } else {
      await db.delete(contactTags).where(and(
        inArray(contactTags.contactId, ids),
        inArray(contactTags.tagId, data.tag_ids),
      ));
    }
    await audit(context, 'GROK_CRM_BULK_TAGS', ids.length);
  }

  return {
    success: faltantes.length === 0,
    dry_run: data.dry_run ?? false,
    mode: data.mode,
    etiquetas: etiquetas.map((etiqueta) => etiqueta.name),
    contactos: encontrados.length,
    no_encontrados: faltantes,
  };
}

async function renovar(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'membershipsWrite', 'memberships');
  const data = parse(renewSchema, input);
  try {
    const resultado = await renewSubscription(context.teamId, context.userId, data);
    if (resultado.dryRun) return { success: true, dry_run: true, preview: resultado.preview };
    await audit(context, 'GROK_MEMBERSHIP_RENEWED', data.subscription_id);
    return {
      success: true,
      subscription: resultado.subscription,
      entry: resultado.entry,
      nota: resultado.nota,
    };
  } catch (error) {
    if (error instanceof MembershipRenewError) throw new Error(error.message);
    throw error;
  }
}
const MARCA_ESTADO = /^\[ia:(pending|done|not_applicable)(?:\s+([^\]]*))?\]\s*/;

export function leerEstadoPrompt(aiPrompt: string) {
  const match = aiPrompt.match(MARCA_ESTADO);
  if (!match) return { status: 'pending' as const, note: null as string | null, prompt: aiPrompt };
  return {
    status: match[1] as 'pending' | 'done' | 'not_applicable',
    note: match[2]?.trim() || null,
    prompt: aiPrompt.replace(MARCA_ESTADO, ''),
  };
}

async function marcarPrompt(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite', 'tasks');
  const data = parse(promptStatusSchema, input);

  const tarea = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, data.task_id), eq(teamTaskItems.teamId, context.teamId)),
    columns: { id: true, title: true, aiPrompt: true },
  });
  if (!tarea) throw new Error('La tarea no existe en este equipo.');
  if (!tarea.aiPrompt.trim()) throw new Error('Esa tarea no tiene prompt de IA: no hay nada que marcar.');

  const actual = leerEstadoPrompt(tarea.aiPrompt);
  const fecha = new Date().toISOString().slice(0, 10);
  const nota = [fecha, data.note].filter(Boolean).join(' · ');
  const nuevo = `[ia:${data.status} ${nota}]\n${actual.prompt}`;

  await db.update(teamTaskItems)
    .set({ aiPrompt: nuevo, updatedAt: new Date() })
    .where(and(eq(teamTaskItems.id, data.task_id), eq(teamTaskItems.teamId, context.teamId)));

  await audit(context, 'GROK_TASK_AI_PROMPT_STATUS', data.task_id);
  return {
    success: true,
    task_id: data.task_id,
    task_title: tarea.title,
    desde: actual.status,
    hacia: data.status,
    nota: nota || null,
  };
}

export async function executeBulkTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_tasks_search') return buscarTareas(input, context);
  if (name === 'whatspro_crm_bulk_stage') return moverEtapaEnLote(input, context);
  if (name === 'whatspro_crm_bulk_tags') return etiquetarEnLote(input, context);
  if (name === 'whatspro_memberships_renew') return renovar(input, context);
  if (name === 'whatspro_task_ai_prompt_status') return marcarPrompt(input, context);
  throw new Error(`Unknown bulk tool: ${name}`);
}
