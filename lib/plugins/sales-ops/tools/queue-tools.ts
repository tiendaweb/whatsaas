import 'server-only';
import { z } from 'zod';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { approveBatch, getBatch, listBatches, markResult, proposeBatch, QueueError } from '@/lib/plugins/sales-ops/server/queue';
import { ACTION_KINDS, ACTION_ROLES, ACTION_STATUSES, ANALYSIS_STATUSES, GATES, OWNERS, SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';

/**
 * Cola del Command Center Comercial por MCP (`whatspro_sales_queue_*`).
 *
 * 🚨 `inputSchema` es JSON Schema puro: un `z.object` adentro hace desaparecer
 * la tool en silencio. Zod se usa sólo DENTRO del handler. Verificar con
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts
 *
 * Ninguna de estas tools envía mensajes. Aprobar deja el lote listo para que un
 * humano o el prompt `sales-ops.execute-batch` lo ejecute de a uno con
 * `whatspro_chat_send_message` (idempotency_key `sales-ops:{actionId}`) y
 * reporte con `whatspro_sales_queue_result`.
 */

const KIND_HELP =
  'send_message (mensaje de WhatsApp; requiere payload_template.text), create_task (tarea para el responsable), ' +
  'register_sale (registrar cobro), mark_pre_descarte (pasar a pre-descarte, sin mensaje), mark_descarte (descarte definitivo; ' +
  'sólo lo aprueba una persona), assign_owner (devolver a la cola de un responsable), schedule_call (agendar llamada).';

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
            text: { type: 'string', maxLength: 4000, description: 'Texto (variante A). Variables: {{nombre}}, {{plan}}, {{precio}}.' },
            text_b: { type: 'string', maxLength: 4000, description: 'Texto de la variante B (obligatorio con variant_split).' },
            task_title: { type: 'string', maxLength: 200 },
            due_in_days: { type: 'integer', minimum: 0, maximum: 365 },
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
      'con el chat que lo bloquea (índice único: un envío aprobado por chat a la vez). Aprobar NO envía: la ejecución es por ' +
      'conector (un envío por llamada, con dry_run primero) o manual, y se reporta con whatspro_sales_queue_result. ' +
      'Exige confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['batch_id', 'confirm'],
      properties: {
        batch_id: { type: 'string', minLength: 3, maxLength: 64 },
        exclude_action_ids: { type: 'array', items: { type: 'integer', minimum: 1 }, maxItems: 5000, description: 'Ids de acción (filas) que se sacan del lote antes de aprobar.' },
        confirm: { type: 'boolean', description: 'Debe ser true: un humano revisó la lista.' },
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
    return { batches, note: 'Aprobar no envía. Las filas approved se ejecutan de a una con whatspro_chat_send_message y se reportan con whatspro_sales_queue_result.' };
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
      return { ...result, note: 'Aprobado. La ejecución es por conector (un envío por llamada) o manual hasta la Fase 6.' };
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
