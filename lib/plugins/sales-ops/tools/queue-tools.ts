import 'server-only';
import { z } from 'zod';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { approveBatch, editAction, getBatch, listBatches, markResult, proposeBatch, QueueError, rejectBatch, removeFromBatch } from '@/lib/plugins/sales-ops/server/queue';
import { executeApprovedBatch } from '@/lib/plugins/sales-ops/server/execute';
import { asegurarParrafos } from '@/lib/messaging/parrafos';
import { ACTION_KINDS, ACTION_ROLES, ACTION_STATUSES, ANALYSIS_STATUSES, GATES, OWNERS, REJECT_REASONS, REJECT_REASON_LABELS, SALES_OPS_PLUGIN_ID, SERVER_EXECUTABLE_KINDS, esEjecutableEnServidor } from '@/lib/plugins/sales-ops/shared/taxonomy';

/**
 * Cola del Command Center Comercial por MCP (`whatspro_sales_queue_*`).
 *
 * 🚨 `inputSchema` es JSON Schema puro: un `z.object` adentro hace desaparecer
 * la tool en silencio. Zod se usa sólo DENTRO del handler. Verificar con
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts
 *
 * Aprobar EJECUTA (desde el 2026-09-05): `whatspro_sales_queue_approve` con
 * `execute` (default true) corre `executeApprovedBatch` sobre lo aprobado si el
 * tipo está en `SERVER_EXECUTABLE_KINDS` (envío, programado, tarea, demo, cobro,
 * pre-descarte, descarte, responsable, llamada). Con `execute:false` las filas
 * quedan `approved` y las ejecuta el conector de a una (idempotency_key
 * `sales-ops:{actionId}`) reportando con `whatspro_sales_queue_result`.
 */

const KIND_HELP =
  'send_message (mensaje de WhatsApp; requiere payload_template.text), schedule_message (mensaje programado: requiere ' +
  'payload_template.text y send_at; al ejecutar se crea un programado por contacto y sale solo a esa hora), create_task ' +
  '(tarea para el responsable), request_demo (al ejecutar, una tarea por contacto en el workspace "Demos" de Tareas OS con la ' +
  'investigación del chat y el prompt para generar la web en AAPP SPACE; payload_template.text es la indicación opcional), ' +
  'register_sale (registrar cobro: payload_template.extra {amount en UNIDADES, currency, method, paid_on, concept, receiptMessageId}; al aprobar el ' +
  'servidor crea venta + asiento + pago en Finanzas, vincula al contacto como cliente y pasa el chat a G11), mark_pre_descarte (pasar a ' +
  'pre-descarte, sin mensaje), mark_descarte (descarte definitivo; sólo lo aprueba una persona), assign_owner (devolver a la cola de un ' +
  'responsable; extra {owner}), schedule_call (agendar llamada; extra {at: ISO}).';

export const queueReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_queue_list',
    description:
      'Lista los lotes de la cola del Command Center Comercial con su conteo por estado (proposed, pending_approval, approved, ' +
      'executing, executed, resulted, rejected, expired, failed), cuántos contactos respondieron (señales del radar atadas al lote) ' +
      'y cuántos se recuperaron. Filtrá por status para ver, por ejemplo, sólo los lotes con filas approved listas para ejecutar. ' +
      'No devuelve teléfonos.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...ACTION_STATUSES], description: 'Sólo lotes que tengan al menos una fila en este estado.' },
        limit: { type: 'integer', minimum: 1, maximum: 500 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_queue_get',
    description:
      'Devuelve un lote completo: una fila por contacto con nombre, gate, estado, texto final con las variables ya resueltas ' +
      '(payload.text), quién aprobó y advertencias calculadas contra el estado vivo del chat (automatización activa, ' +
      'respuestas automáticas, ya es cliente, recibió un envío hace menos de 72 h, respondió después de propuesto). ' +
      'Antes de ejecutar una fila approved, releé sus advertencias: si respondió después, saltala.',
    inputSchema: {
      type: 'object',
      required: ['batch_id'],
      properties: { batch_id: { type: 'string', minLength: 3, maxLength: 64, description: 'Id del lote, formato cc-YYYYMMDD-xxxxxx.' } },
      additionalProperties: false,
    },
  },
];

export const queueActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_queue_propose',
    description:
      'Propone un lote de acciones en la cola del Command Center Comercial (una fila proposed por chat). NO envía nada ni ' +
      'modifica el CRM: alguien con el rol indicado tiene que aprobarlo. Selecciona chats desde el análisis comercial vigente ' +
      'por gates, chat_ids explícitos o filtros, y EXCLUYE siempre: automatización activa, clientes existentes, gate GX, ' +
      'contactos con respuestas automáticas (en lotes de más de un chat), status descarte_definitivo/cliente, y chats que ' +
      'recibieron un envío nuestro dentro de las últimas 72 h o ya tienen otro envío aprobado. Resuelve {{nombre}}, {{plan}} ' +
      'y {{precio}} por contacto en el texto. Con variant_split=true alterna A/B (text y text_b) y crea el experimento. ' +
      'Usá dry_run=true primero: devuelve quiénes entrarían y quiénes quedan afuera con el motivo, sin escribir. Tipos: ' +
      KIND_HELP,
    inputSchema: {
      type: 'object',
      required: ['label', 'kind'],
      properties: {
        label: { type: 'string', minLength: 1, maxLength: 120, description: 'Nombre del lote, p. ej. "Último intento G0 — semana 35".' },
        kind: { type: 'string', enum: [...ACTION_KINDS] },
        requires_role: { type: 'string', enum: [...ACTION_ROLES], description: 'Quién puede aprobarlo. Default any. Owners aprueban siempre.' },
        gates: { type: 'array', items: { type: 'string', enum: [...GATES] }, maxItems: 13, description: 'Gates del análisis vigente a incluir.' },
        chat_ids: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 2000, description: 'Chats explícitos (deben tener análisis y pertenecer al equipo).' },
        filters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'array', items: { type: 'string', enum: [...ANALYSIS_STATUSES] } },
            owner: { type: 'string', enum: [...OWNERS], description: 'recommended_owner del análisis.' },
            max_followups: { type: 'integer', minimum: 0, description: 'Excluye chats con más impactos sin respuesta que este número.' },
            min_days_silent: { type: 'integer', minimum: 0, description: 'Excluye chats cuyo último mensaje del cliente es más reciente.' },
            limit: { type: 'integer', minimum: 1, maximum: 2000, description: 'Tope de candidatos, ordenados por prioridad. Default 500.' },
          },
        },
        payload_template: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string', maxLength: 4000, description: 'Texto (variante A). Variables: {{nombre}}, {{plan}}, {{precio}}. Con párrafos separados por una línea en blanco: un bloque largo sin saltos se lee como un muro en WhatsApp (si viene así, el servidor lo parte por oración).' },
            text_b: { type: 'string', maxLength: 4000, description: 'Texto de la variante B (obligatorio con variant_split).' },
            task_title: { type: 'string', maxLength: 200 },
            due_in_days: { type: 'integer', minimum: 0, maximum: 365 },
            send_at: { type: 'string', maxLength: 40, description: 'schedule_message: fecha y hora de salida ISO 8601 (al menos 5 min en el futuro).' },
            extra: { type: 'object', additionalProperties: true, description: 'Datos libres que acompañan la acción (p. ej. { owner: "carlos" } en assign_owner).' },
          },
        },
        experiment_id: { type: ['integer', 'null'], minimum: 1, description: 'Sumar las filas a un experimento existente.' },
        variant_split: { type: 'boolean', description: 'Alternar A/B y crear el experimento si no se pasó experiment_id.' },
        dry_run: { type: 'boolean', description: 'true = sólo simula: devuelve incluidos y excluidos con motivo.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_queue_approve',
    description:
      'Aprueba un lote propuesto: las filas proposed/pending_approval pasan a approved con approved_by; las que se listan en ' +
      'exclude_action_ids pasan a rejected. Valida el rol (requires_role del lote: noelia/carlos por nombre de usuario; owner ' +
      'siempre puede). Si un chat del lote ya tiene otro envío aprobado en otro lote, NO aprueba nada y devuelve blockedChats ' +
      'con el chat que lo bloquea (índice único: un envío aprobado por chat a la vez). Con execute=true el servidor ejecuta ' +
      'ahí mismo lo aprobado si el tipo se puede hacer solo (' + SERVER_EXECUTABLE_KINDS.join(', ') + '): es lo que hace ' +
      'la Cola de la UI al aprobar. Sin execute las filas quedan approved y la ejecución es por conector (un envío por ' +
      'llamada, con dry_run primero) o manual, reportada con whatspro_sales_queue_result. Exige confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['batch_id', 'confirm'],
      properties: {
        batch_id: { type: 'string', minLength: 3, maxLength: 64 },
        exclude_action_ids: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 5000, description: 'Ids de acción (filas) que se sacan del lote antes de aprobar.' },
        confirm: { type: 'boolean', description: 'Debe ser true: un humano revisó la lista.' },
        execute: { type: 'boolean', description: 'Default true: ejecuta ahí mismo lo aprobado si el tipo se puede hacer desde el servidor (envíos, programados, tareas, demos, cobros, pre-descarte, descarte, responsable, llamadas). Pasá false sólo si la persona quiere revisar la ejecución aparte o ejecutarla vos de a una.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_queue_edit',
    description:
      'Corrige el texto (payload.text) o el título de tarea (task_title) de UNA fila propuesta del lote, sin sacar al contacto ' +
      'ni armar otro lote. Sólo funciona mientras la fila está proposed/pending_approval: después de aprobar el texto es lo ' +
      'que se firmó y no se toca. El texto se guarda tal cual (las variables {{nombre}} ya venían resueltas al proponer). ' +
      'Releé la fila con whatspro_sales_queue_get antes de escribir. No envía nada ni toca el CRM.',
    inputSchema: {
      type: 'object',
      required: ['action_id'],
      properties: {
        action_id: { type: 'integer', minimum: 1 },
        text: { type: 'string', maxLength: 4000, description: 'Texto final del mensaje (send_message).' },
        task_title: { type: 'string', maxLength: 200, description: 'Título de la tarea (create_task).' },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_queue_remove',
    description:
      'Quita uno o más contactos de un lote: cada fila pasa a rejected en el momento (queda el rastro, no se borra). ' +
      'Sirve para filas proposed, pending_approval o approved que todavía no salieron; lo executed no se toca. Es distinto de ' +
      'exclude_action_ids en approve (que sólo aplica al aprobar): esto es inmediato y también funciona en lotes ya aprobados. ' +
      'Quitar una fila approved exige el rol del lote. Exige confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['action_ids', 'confirm'],
      properties: {
        action_ids: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1, maxItems: 500, description: 'Ids de fila (action.id en whatspro_sales_queue_get).' },
        code: {
          type: 'string',
          enum: [...REJECT_REASONS],
          description: 'Por qué se lo quita. Default no_corresponde. ' + Object.entries(REJECT_REASON_LABELS).map(([k, v]) => `${k} = ${v}`).join('; '),
        },
        reason: { type: 'string', maxLength: 300 },
        confirm: { type: 'boolean', description: 'Debe ser true.' },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_queue_reject',
    description:
      'Rechaza un lote entero: todas sus filas proposed, pending_approval y approved pasan a rejected con el motivo. Lo ya ' +
      'executed/resulted no cambia. Usalo cuando el lote no debe salir (texto equivocado, segmento mal elegido); para sacar a ' +
      'algunos contactos nomás usá whatspro_sales_queue_remove. Pasá `code` con el motivo: es lo que se cuenta y lo que vuelve al ' +
      'expediente para que la próxima redacción no repita el error (' + REJECT_REASONS.join(' | ') + '). Exige confirm=true. No envía nada ni toca el CRM.',
    inputSchema: {
      type: 'object',
      required: ['batch_id', 'confirm'],
      properties: {
        batch_id: { type: 'string', minLength: 3, maxLength: 64 },
        reason: { type: 'string', maxLength: 300 },
        code: {
          type: 'string',
          enum: [...REJECT_REASONS],
          description: Object.entries(REJECT_REASON_LABELS).map(([k, v]) => `${k} = ${v}`).join('; '),
        },
        confirm: { type: 'boolean', description: 'Debe ser true.' },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_queue_result',
    description:
      'Reporta el resultado de una acción aprobada, después de ejecutarla por fuera de la cola. status=executed: el envío ' +
      'salió (pasá result_message_id con el id del mensaje de WhatsApp que devolvió whatspro_chat_send_message); ' +
      'status=failed: no salió (result.error con el motivo; un timeout se reporta como failed con error "desconocido", nunca ' +
      'se reintenta el envío); status=resulted: ya hay desenlace (result.respondedAt, result.saleId, result.taskId, ' +
      'result.recoveredAt). Marca executed_via=connector y alimenta el experimento si la fila pertenece a uno. ' +
      'Nunca reportes executed sin haber enviado de verdad.',
    inputSchema: {
      type: 'object',
      required: ['action_id', 'status'],
      properties: {
        action_id: { type: 'integer', minimum: 1 },
        status: { type: 'string', enum: ['executed', 'failed', 'resulted'] },
        result_message_id: { type: ['string', 'null'], maxLength: 255 },
        result: { type: ['object', 'null'], additionalProperties: true, description: '{ error, respondedAt, recoveredAt, signalId, saleId, taskId }' },
      },
      additionalProperties: false,
    },
  },
];

// ── Handlers ─────────────────────────────────────────────────────────────────

const listSchema = z.object({
  status: z.enum(ACTION_STATUSES).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

const getSchema = z.object({ batch_id: z.string().min(3).max(64) });

const proposeSchema = z.object({
  label: z.string().trim().min(1).max(120),
  kind: z.enum(ACTION_KINDS),
  requires_role: z.enum(ACTION_ROLES).optional(),
  gates: z.array(z.enum(GATES)).max(13).optional(),
  chat_ids: z.array(z.number().int().positive()).max(2000).optional(),
  filters: z
    .object({
      status: z.array(z.enum(ANALYSIS_STATUSES)).optional(),
      owner: z.enum(OWNERS).optional(),
      max_followups: z.number().int().min(0).optional(),
      min_days_silent: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(2000).optional(),
    })
    .optional(),
  payload_template: z
    .object({
      text: z.string().max(4000).optional(),
      text_b: z.string().max(4000).optional(),
      task_title: z.string().max(200).optional(),
      due_in_days: z.number().int().min(0).max(365).optional(),
      send_at: z.string().max(40).optional(),
      extra: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  experiment_id: z.number().int().positive().nullable().optional(),
  variant_split: z.boolean().optional(),
  dry_run: z.boolean().optional(),
});

const approveSchema = z.object({
  batch_id: z.string().min(3).max(64),
  exclude_action_ids: z.array(z.number().int().positive()).max(5000).optional(),
  confirm: z.boolean(),
  execute: z.boolean().optional(),
});

const editSchema = z.object({
  action_id: z.number().int().positive(),
  text: z.string().max(4000).optional(),
  task_title: z.string().max(200).optional(),
  dry_run: z.boolean().optional(),
});

const removeSchema = z.object({
  action_ids: z.array(z.number().int().positive()).min(1).max(500),
  code: z.enum(REJECT_REASONS).optional(),
  reason: z.string().max(300).optional(),
  confirm: z.boolean(),
  dry_run: z.boolean().optional(),
});

const rejectSchema = z.object({
  batch_id: z.string().min(3).max(64),
  reason: z.string().max(300).optional(),
  code: z.enum(REJECT_REASONS).optional(),
  confirm: z.boolean(),
  dry_run: z.boolean().optional(),
});

const resultSchema = z.object({
  action_id: z.number().int().positive(),
  status: z.enum(['executed', 'failed', 'resulted']),
  result_message_id: z.string().max(255).nullable().optional(),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
});

function friendly(error: unknown): never {
  if (error instanceof QueueError) {
    const blocked = error.details?.blockedChats;
    throw new Error(blocked ? `${error.message} blockedChats=${JSON.stringify(blocked)}` : error.message);
  }
  throw error;
}

export async function executeQueueTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_sales_queue_list') {
    await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
    const data = parse(listSchema, input);
    const batches = await listBatches(context.teamId, { status: data.status, limit: data.limit });
    return { batches, note: 'Aprobar ejecuta (execute default true). Lo que quede approved sin ejecutar se hace de a uno con la tool del kind y se reporta con whatspro_sales_queue_result.' };
  }

  if (name === 'whatspro_sales_queue_get') {
    await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
    const data = parse(getSchema, input);
    try {
      return await getBatch(context.teamId, data.batch_id);
    } catch (error) {
      friendly(error);
    }
  }

  if (name === 'whatspro_sales_queue_propose') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    const data = parse(proposeSchema, input);
    try {
      if (data.payload_template?.text) data.payload_template.text = asegurarParrafos(data.payload_template.text);
      if (data.payload_template?.text_b) data.payload_template.text_b = asegurarParrafos(data.payload_template.text_b);
      const result = await proposeBatch(context.teamId, {
        label: data.label,
        kind: data.kind,
        requiresRole: data.requires_role ?? 'any',
        gates: data.gates,
        chatIds: data.chat_ids,
        filters: data.filters
          ? {
              status: data.filters.status,
              owner: data.filters.owner,
              maxFollowups: data.filters.max_followups,
              minDaysSilent: data.filters.min_days_silent,
              limit: data.filters.limit,
            }
          : undefined,
        payloadTemplate: data.payload_template
          ? {
              text: data.payload_template.text,
              textB: data.payload_template.text_b,
              taskTitle: data.payload_template.task_title,
              dueInDays: data.payload_template.due_in_days,
              sendAt: data.payload_template.send_at,
              extra: data.payload_template.extra,
            }
          : undefined,
        experimentId: data.experiment_id ?? null,
        variantSplit: data.variant_split,
        proposedBy: context.userId,
        dryRun: data.dry_run,
      });
      return {
        ...result,
        summary: result.dryRun
          ? `Simulación: entrarían ${result.included.length} chats, ${result.excluded.length} excluidos.`
          : result.batchId
            ? `Lote ${result.batchId} propuesto con ${result.included.length} filas (${result.excluded.length} excluidos). Falta aprobarlo.`
            : `No quedó ningún chat elegible (${result.excluded.length} excluidos).`,
      };
    } catch (error) {
      friendly(error);
    }
  }

  if (name === 'whatspro_sales_queue_approve') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    const data = parse(approveSchema, input);
    if (!data.confirm) throw new Error('confirm debe ser true: un humano tiene que revisar la lista antes de aprobar.');
    try {
      const result = await approveBatch(context.teamId, context.userId, data.batch_id, { excludeActionIds: data.exclude_action_ids });
      // Default true: confirm=true ya dice que una persona revisó la lista, y
      // aprobar es querer que salga. `execute:false` deja las filas para el conector.
      if (data.execute !== false && result.approved > 0 && esEjecutableEnServidor(result.kind)) {
        const execution = await executeApprovedBatch(context.teamId, context.userId, data.batch_id, { actionIds: result.approvedIds, max: 200 });
        return { ...result, execution, note: `Aprobado y ejecutado desde el servidor: ${execution.executed} hechos · ${execution.skipped} salteados · ${execution.failed} fallidos.` };
      }
      return {
        ...result,
        note: esEjecutableEnServidor(result.kind)
          ? 'Aprobado con execute=false. Quedó en approved: ejecutalo vos (un envío por llamada, con dry_run) o volvé a llamar con execute=true para que lo haga el servidor.'
          : 'Aprobado. Este tipo lo ejecuta una persona o un conector y se reporta con whatspro_sales_queue_result.',
      };
    } catch (error) {
      friendly(error);
    }
  }

  if (name === 'whatspro_sales_queue_edit') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    const data = parse(editSchema, input);
    if (data.dry_run) return { dryRun: true, actionId: data.action_id, changes: { text: data.text, taskTitle: data.task_title } };
    try {
      const result = await editAction(context.teamId, context.userId, data.action_id, { text: data.text, taskTitle: data.task_title });
      return { ...result, note: 'Texto corregido. El lote sigue pendiente de aprobación.' };
    } catch (error) {
      friendly(error);
    }
  }

  if (name === 'whatspro_sales_queue_remove') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    const data = parse(removeSchema, input);
    if (!data.confirm) throw new Error('confirm debe ser true: quitar del lote es definitivo para esa fila.');
    if (data.dry_run) return { dryRun: true, actionIds: data.action_ids };
    const removed: Array<{ actionId: number; batchId: string; chatId: number }> = [];
    const errors: Array<{ actionId: number; error: string }> = [];
    for (const actionId of data.action_ids) {
      try {
        removed.push(await removeFromBatch(context.teamId, context.userId, actionId, { code: data.code, reason: data.reason }));
      } catch (error) {
        errors.push({ actionId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { removed, errors, summary: `${removed.length} fuera del lote${errors.length ? `, ${errors.length} no se pudieron quitar` : ''}.` };
  }

  if (name === 'whatspro_sales_queue_reject') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    const data = parse(rejectSchema, input);
    if (!data.confirm) throw new Error('confirm debe ser true: rechazar el lote saca a todos sus contactos.');
    if (data.dry_run) return { dryRun: true, batchId: data.batch_id };
    try {
      return await rejectBatch(context.teamId, context.userId, data.batch_id, data.reason ?? 'rechazado por conector', data.code);
    } catch (error) {
      friendly(error);
    }
  }

  if (name === 'whatspro_sales_queue_result') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    const data = parse(resultSchema, input);
    try {
      const action = await markResult(context.teamId, data.action_id, {
        status: data.status,
        resultMessageId: data.result_message_id ?? null,
        result: data.result ?? null,
        executedVia: 'connector',
        userId: context.userId,
      });
      return { action };
    } catch (error) {
      friendly(error);
    }
  }

  throw new Error(`sales-ops queue: tool desconocida ${name}`);
}
