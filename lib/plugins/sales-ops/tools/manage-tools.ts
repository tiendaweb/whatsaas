import 'server-only';
import { z } from 'zod';
import { assertPermission, audit, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { setVisibility } from '@/lib/plugins/sales-ops/server/accounts';
import { setNuncaTranscribir } from '@/lib/plugins/sales-ops/server/audios';
import { setManualOverride } from '@/lib/plugins/sales-ops/server/classifier';
import { closeExperiment, createExperiment } from '@/lib/plugins/sales-ops/server/experiments';
import { EXCLUSION_KINDS, excludeChats, includeChats } from '@/lib/plugins/sales-ops/server/exclusions';
import { executeApprovedBatch } from '@/lib/plugins/sales-ops/server/execute';
import { snoozeLead, transferLead, unsnoozeLead } from '@/lib/plugins/sales-ops/server/lead';
import { getMetrics } from '@/lib/plugins/sales-ops/server/metrics';
import { getOverview } from '@/lib/plugins/sales-ops/server/overview';
import { cierreSemanal } from '@/lib/plugins/sales-ops/server/cierre';
import { deleteBatch, QueueError, rejectionLessons } from '@/lib/plugins/sales-ops/server/queue';
import { markSignal, markSignals, setRadarMuted } from '@/lib/plugins/sales-ops/server/radar';
import { getSalesOpsSettings, patchSalesOpsSettings } from '@/lib/plugins/sales-ops/server/settings';
import { skipWorkItem, unskipWorkItem, WORK_KINDS } from '@/lib/plugins/sales-ops/server/work-queue';
import { VISIBILITIES, VISIBILITY_TARGETS } from '@/lib/plugins/sales-ops/shared/accounts-types';
import { ACTION_KINDS, ANALYSIS_STATUSES, EXPERIMENT_STATUSES, GATES, OWNERS, SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';

/**
 * Gestión del Command Center Comercial por MCP (`whatspro_sales_*`): panorama,
 * métricas, settings, ejecución de lotes aprobados y las acciones de gestión
 * que hasta ahora sólo estaban en la pantalla (marcar señales, override manual,
 * transferir/posponer leads, visibilidad, exclusiones, experimentos, descartes
 * de la cola de conectores, borrar lotes).
 *
 * 🚨 `inputSchema` es JSON Schema puro: un `z.object` adentro hace desaparecer
 * la tool en silencio. Zod se usa sólo DENTRO del handler. Verificar con
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/verify-connector-tools.mts
 *
 * Toda la lógica vive en `server/*` con firma `(teamId, …)`: nada acá toca la
 * base directamente. Lo destructivo exige `confirm: true`; lo que afecta varios
 * registros acepta `dry_run`.
 */

// ── Schemas (zod, sólo para el handler) ───────────────────────────────────────

const emptySchema = z.object({});
const cierreSchema = z.object({ dias: z.number().int().min(1).max(90).optional() });
const leccionesSchema = z.object({ kind: z.enum(ACTION_KINDS).optional(), dias: z.number().int().min(1).max(180).optional() });

const settingsPatchSchema = z
  .object({
    cashGoalUsd: z.number().positive().optional(),
    missionSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    fx: z.object({ ARS: z.number().positive().optional(), PYG: z.number().positive().optional() }).optional(),
    sendCooldownHours: z.number().int().min(0).max(720).optional(),
  })
  .strict();

const settingsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get') }),
  z.object({ action: z.literal('patch'), patch: settingsPatchSchema }),
]);

const executeBatchSchema = z.object({
  batch_id: z.string().min(3).max(64),
  action_ids: z.array(z.number().int().positive()).max(25).optional(),
  confirm: z.literal(true),
});

const signalMarkSchema = z.object({
  signal_ids: z.array(z.number().int().positive()).min(1).max(200),
  status: z.enum(['seen', 'handled', 'dismissed']),
  dry_run: z.boolean().optional(),
});

const radarMuteSchema = z.object({
  chat_id: z.number().int().positive(),
  muted: z.boolean(),
});

const overrideSchema = z.object({
  chat_id: z.number().int().positive(),
  gate: z.enum(GATES),
  status: z.enum(ANALYSIS_STATUSES),
  reason: z.string().min(3).max(300),
});

const leadManageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('transfer'), chat_id: z.number().int().positive(), owner: z.enum(OWNERS) }),
  z.object({
    action: z.literal('snooze'),
    chat_id: z.number().int().positive(),
    until: z.string().min(8).max(40),
    note: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal('unsnooze'), chat_id: z.number().int().positive() }),
]);

const visibilitySchema = z.object({
  target: z.enum(VISIBILITY_TARGETS),
  id: z.number().int().positive(),
  visibility: z.enum(VISIBILITIES),
});

const audioExcludeSchema = z.object({
  chat_id: z.number().int().positive(),
  nunca: z.boolean(),
});

const experimentSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().min(1).max(160),
    hypothesis: z.string().max(1000).optional(),
    segment_gates: z.array(z.enum(GATES)).optional(),
    message_a: z.string().max(4000).optional(),
    message_b: z.string().max(4000).optional(),
    status: z.enum(EXPERIMENT_STATUSES).optional(),
  }),
  z.object({ action: z.literal('close'), experiment_id: z.number().int().positive() }),
]);

const exclusionsSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('exclude'),
    chat_ids: z.array(z.number().int().positive()).min(1).max(500),
    kind: z.enum(EXCLUSION_KINDS),
    reason: z.string().max(200).optional(),
    dry_run: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('include'),
    chat_ids: z.array(z.number().int().positive()).min(1).max(500),
    dry_run: z.boolean().optional(),
  }),
]);

const workSkipSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('skip'),
    kind: z.enum(WORK_KINDS as [string, ...string[]]),
    key: z.string().min(1).max(255),
    forever: z.boolean().optional(),
    label: z.string().max(120).optional(),
  }),
  z.object({ action: z.literal('unskip'), kind: z.string().min(1).max(64), key: z.string().min(1).max(255) }),
]);

const batchDeleteSchema = z.object({
  batch_id: z.string().min(3).max(64),
  confirm: z.literal(true),
});

// ── Tools ─────────────────────────────────────────────────────────────────────

const CHAT_ID = { type: 'integer', minimum: 1, description: 'Id interno del chat (chat_id de whatspro_sales_dossier / whatspro_sales_pending / listas).' } as const;

export const manageReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_overview',
    description:
      'Panorama completo del Command Center Comercial (la pantalla "Hoy"): meta de caja de la misión con lo cobrado ' +
      'hasta hoy en USD, contadores por frente (dinero ahora, respondieron hoy, oportunidades, barrido, pre-descarte, ' +
      'clientes), auditoría (chats analizados vs total, desactualizados, a revisar, audios en cola, ítems que esperan ' +
      'un conector), las mejores próximas acciones (nextBest: chat, gate, prioridad, motivo y texto sugerido) y la ' +
      'distribución de chats por gate G0-GX. Usala para arrancar una sesión o para responder "¿cómo venimos?". ' +
      'No escribe nada y no devuelve teléfonos. Para el detalle de un chat usá whatspro_sales_dossier; para trabajar, ' +
      'whatspro_sales_work_queue.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_sales_metrics',
    description:
      'Métricas del Command Center Comercial con la conversión de monedas (FX) y la misión ya aplicadas: caja por ' +
      'semana en USD, embudo por gate (total, respondieron, recuperados, propuesta, pagaron, ingresos USD), por ' +
      'antigüedad del silencio, por objeción, por cantidad de seguimientos y por origen del lead, más la auditoría de ' +
      'calidad del análisis (confianza media, % a revisar, % con falta de evidencia, versiones por chat). Usala para ' +
      'reportes y para decidir dónde empujar. No escribe nada. Para el estado de hoy alcanza con whatspro_sales_overview.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_sales_cierre',
    description:
      'Los seis números de CIERRE del equipo en una ventana de días (default 7): decisiones tomadas (aprobadas/rechazadas, ' +
      'cuántas siguen esperando y hace cuántas horas espera la más vieja), lo que de verdad le llegó al cliente (enviados y ' +
      'programados que salieron), respuestas de clientes cerradas contra las que entraron, pedidos de producción entregados ' +
      '—y cuántos con enlace, los únicos que cuentan—, horas de bloque registradas por contexto y plata cobrada por moneda ' +
      '(nunca sumadas entre sí). A diferencia de whatspro_sales_metrics y whatspro_sales_overview, que miden ACTIVIDAD, acá ' +
      'sólo se cuenta trabajo TERMINADO: si un número da cero, esa semana esa parte no produjo nada por más movimiento que ' +
      'haya habido. Usala para el reporte semanal y para saber si el equipo está cerrando o sólo acumulando. No escribe nada.',
    inputSchema: {
      type: 'object',
      properties: { dias: { type: 'integer', minimum: 1, maximum: 90, description: 'Ventana en días. Default 7.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_lecciones',
    description:
      'Por qué este equipo RECHAZÓ propuestas en los últimos 30 días, agrupado por motivo y con ejemplos del texto que se ' +
      'descartó. Leelas antes de redactar cualquier mensaje para un cliente: son los errores concretos que no hay que ' +
      'repetir (tono que no suena al equipo, datos que no son ciertos, momento equivocado, contacto que no correspondía). ' +
      'Con `kind` se filtra por tipo de acción (send_message, schedule_message…). No escribe nada.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...ACTION_KINDS], description: 'Tipo de acción. Default: todas.' },
        dias: { type: 'integer', minimum: 1, maximum: 180, description: 'Ventana en días. Default 30.' },
      },
      additionalProperties: false,
    },
  },
];

export const manageActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_execute_batch',
    description:
      'EJECUTA de verdad las filas en estado approved de un lote de la cola del Command Center: manda los mensajes de ' +
      'WhatsApp reales a los clientes (send_message), crea los programados (schedule_message), las tareas (create_task) ' +
      'y los pedidos de demo (request_demo). Usala sólo cuando una persona ya aprobó el lote (whatspro_sales_queue_approve) ' +
      'y te pidió que salga. Seguros del servidor, que no se aflojan: sólo ejecuta approved (nada salta la aprobación); ' +
      'un envío por acción con clave idempotente sales-ops:{actionId} (repetir la llamada NO duplica mensajes); antes de ' +
      'cada envío revisa si el cliente escribió después de la aprobación y en ese caso lo SALTEA (status skipped, ' +
      'la fila queda failed/customer_replied para que la relean); un timeout no se reintenta (queda failed/send_unknown y ' +
      'lo mira una persona); el destinatario lo resuelve el servidor desde el chat, nunca se pasa un teléfono. Máximo 25 ' +
      'acciones por llamada: si el lote es más grande, volvé a llamarla hasta que executed+skipped+failed sea 0. Ejecuta ' +
      'todo lo de SERVER_EXECUTABLE_KINDS: envío, programado, tarea, demo, cobro (register_sale → venta + asiento + pago en ' +
      'Finanzas, cliente vinculado, chat a G11), pre-descarte, descarte, responsable y llamada. Devuelve por acción: actionId, chatId, nombre, status (executed | skipped | ' +
      'failed), reason y messageId. Exige confirm: true. NO uses whatspro_chat_send_message además de esto para el ' +
      'mismo lote.',
    inputSchema: {
      type: 'object',
      required: ['batch_id', 'confirm'],
      properties: {
        batch_id: { type: 'string', minLength: 3, maxLength: 64, description: 'Id del lote, formato cc-YYYYMMDD-xxxxxx (whatspro_sales_queue_list).' },
        action_ids: {
          type: 'array',
          items: { type: 'integer', minimum: 1 },
          maxItems: 25,
          description: 'Opcional: ejecutar sólo estas acciones del lote (ids de whatspro_sales_queue_get). Vacío = todas las approved, de a 25.',
        },
        confirm: { const: true, description: 'Obligatorio en true: se envían mensajes reales a clientes.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_signal_mark',
    description:
      'Cambia el estado de una o varias señales del radar de respuestas (ids de whatspro_sales_signals_list): seen (la ' +
      'vi, sigue pendiente), handled (atendida: registra quién y cuándo, y cierra el "respondió" del experimento A/B si el ' +
      'chat venía de un lote) o dismissed (descartada, no era una respuesta útil). Usala después de contestarle al ' +
      'cliente o de decidir que la señal no requiere acción. Una sola llamada para todas: el UPDATE es atómico. No manda ' +
      'mensajes ni toca el CRM ni la clasificación. Con dry_run devuelve qué se marcaría sin escribir.',
    inputSchema: {
      type: 'object',
      required: ['signal_ids', 'status'],
      properties: {
        signal_ids: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1, maxItems: 200 },
        status: { type: 'string', enum: ['seen', 'handled', 'dismissed'] },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_radar_mute',
    description:
      'Excluye un chat del radar de respuestas (muted: true) o lo vuelve a incluir (muted: false). Al excluirlo, el radar ' +
      'deja de crearle señales, no aparece en whatspro_sales_signals_list y sus señales abiertas (new/seen) pasan a ' +
      'dismissed. Usala para proveedores, grupos internos o contactos que escriben mucho sin ser leads. No borra ' +
      'mensajes ni el análisis del chat; para sacar el chat de TODO el circuito comercial usá whatspro_sales_exclusions.',
    inputSchema: {
      type: 'object',
      required: ['chat_id', 'muted'],
      properties: {
        chat_id: CHAT_ID,
        muted: { type: 'boolean', description: 'true = excluir del radar; false = volver a incluir.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_classification_override',
    description:
      'Fija a mano el gate (G0-GX) y el estado comercial de un chat, por encima de lo que dijo la IA. Crea una versión ' +
      'manual_override con confianza 100 y analyzedBy=human, recalcula prioridad y guarda el motivo en el historial. ' +
      'Usala cuando una persona te lo indica ("este ya pagó", "este es cliente", "este va a descarte") o cuando la ' +
      'evidencia del chat contradice claramente el análisis. Si el chat nunca fue clasificado, primero se crea la fila ' +
      'base con reglas. NO es la forma normal de clasificar: para eso está whatspro_sales_classification_write. No toca ' +
      'el CRM (etapas/etiquetas) ni manda mensajes. Devuelve chatId, analysisId, version, gate, status y el diff.',
    inputSchema: {
      type: 'object',
      required: ['chat_id', 'gate', 'status', 'reason'],
      properties: {
        chat_id: CHAT_ID,
        gate: { type: 'string', enum: [...GATES] },
        status: { type: 'string', enum: [...ANALYSIS_STATUSES] },
        reason: { type: 'string', minLength: 3, maxLength: 300, description: 'Por qué se fija a mano. Queda en el historial del chat.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_lead_manage',
    description:
      'Acciones rápidas sobre un lead sin tocar su clasificación. transfer: cambia el responsable recomendado (owner) ' +
      'para que aparezca en la cola de otra persona; requiere que el chat ya esté clasificado. snooze: lo saca de las ' +
      'listas hasta una fecha (until, ISO 8601) y vuelve solo; note opcional. unsnooze: lo devuelve a las listas ahora. ' +
      'No cambia gate ni estado (para eso, whatspro_sales_classification_override), no manda mensajes ni toca el CRM.',
    inputSchema: {
      type: 'object',
      required: ['action', 'chat_id'],
      properties: {
        action: { type: 'string', enum: ['transfer', 'snooze', 'unsnooze'] },
        chat_id: CHAT_ID,
        owner: { type: 'string', enum: [...OWNERS], description: 'Sólo para transfer: nuevo responsable.' },
        until: { type: 'string', description: 'Sólo para snooze: fecha/hora ISO 8601 hasta la que se pospone (futura).' },
        note: { type: 'string', maxLength: 200, description: 'Sólo para snooze: motivo corto.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_visibility_set',
    description:
      'Cambia la visibilidad de una membresía (target: subscription, id de team_membership_subscriptions), un cliente ' +
      '(customer) o una empresa (company) en la vista Clientes/Empresas del Command Center: visible (normal), private ' +
      '(sólo en la pestaña Privadas) o hidden (no se ve). Usala cuando una persona pide ocultar o reservar una cuenta. ' +
      'Valida que el objetivo sea de este equipo. No borra ni modifica la cuenta, la membresía ni el cliente: sólo cómo ' +
      'se muestra en el Command Center.',
    inputSchema: {
      type: 'object',
      required: ['target', 'id', 'visibility'],
      properties: {
        target: { type: 'string', enum: [...VISIBILITY_TARGETS] },
        id: { type: 'integer', minimum: 1, description: 'Id del objeto según target (de whatspro_customer_360 / membresías).' },
        visibility: { type: 'string', enum: [...VISIBILITIES] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_settings',
    description:
      'Configuración del Command Center Comercial. action get: devuelve la meta de caja (cashGoalUsd), desde cuándo ' +
      'cuenta la misión (missionSince), el tipo de cambio a USD (fx.ARS, fx.PYG), las horas de enfriamiento entre envíos ' +
      'al mismo chat (sendCooldownHours) y los conteos de listas internas (chats sin transcribir, silenciados del radar, ' +
      'leads pospuestos, visibilidades, descartes de la cola). action patch: modifica SÓLO cashGoalUsd, missionSince, ' +
      'fx y sendCooldownHours (merge superficial; fx se completa con el valor actual). Las listas internas se manejan ' +
      'con sus tools propias (whatspro_sales_audio_exclude, whatspro_sales_radar_mute, whatspro_sales_lead_manage, ' +
      'whatspro_sales_visibility_set, whatspro_sales_work_skip) y no se pueden tocar desde acá. No hay secretos ni tokens ' +
      'en estos settings.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['get', 'patch'] },
        patch: {
          type: 'object',
          description: 'Sólo para patch. Todas las claves opcionales.',
          properties: {
            cashGoalUsd: { type: 'number', exclusiveMinimum: 0, description: 'Meta de caja de la misión en USD.' },
            missionSince: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Desde cuándo cuenta la meta (YYYY-MM-DD).' },
            fx: {
              type: 'object',
              properties: {
                ARS: { type: 'number', exclusiveMinimum: 0, description: 'Pesos argentinos por 1 USD.' },
                PYG: { type: 'number', exclusiveMinimum: 0, description: 'Guaraníes por 1 USD.' },
              },
              additionalProperties: false,
            },
            sendCooldownHours: { type: 'integer', minimum: 0, maximum: 720, description: 'Horas sin proponer un segundo envío al mismo chat.' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_audio_exclude',
    description:
      'Marca un chat para que sus audios NO se transcriban nunca (nunca: true): no entran a la cola de transcripción ni a ' +
      'la vista Audios, y los que estuvieran encolados se sacan. Con nunca: false vuelve a permitirlos. Usala para chats ' +
      'personales o de proveedores donde las notas de voz no aportan al análisis comercial. No borra transcripciones ya ' +
      'hechas ni mensajes. Devuelve la lista completa de chats excluidos y cuántos audios se quitaron de la cola.',
    inputSchema: {
      type: 'object',
      required: ['chat_id', 'nunca'],
      properties: {
        chat_id: CHAT_ID,
        nunca: { type: 'boolean', description: 'true = nunca transcribir; false = volver a permitir.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_experiment_manage',
    description:
      'Experimentos A/B de mensajes del Command Center. action create: crea uno con nombre, hipótesis, gates del ' +
      'segmento, mensaje A y mensaje B (status running por defecto, o draft). action close: lo cierra y devuelve el ' +
      'embudo final por variante (enviados, respondieron, recuperados, propuesta, pagaron, ingresos USD). Los miembros ' +
      'se van sumando solos cuando la cola manda con experiment_id (whatspro_sales_queue_propose) y el radar/ventas ' +
      'marcan los hitos. Esta tool NO manda mensajes ni asigna chats a variantes.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'close'] },
        name: { type: 'string', minLength: 1, maxLength: 160, description: 'create: nombre del experimento.' },
        hypothesis: { type: 'string', maxLength: 1000, description: 'create: qué se espera probar.' },
        segment_gates: { type: 'array', items: { type: 'string', enum: [...GATES] }, description: 'create: gates a los que apunta.' },
        message_a: { type: 'string', maxLength: 4000, description: 'create: texto de la variante A.' },
        message_b: { type: 'string', maxLength: 4000, description: 'create: texto de la variante B.' },
        status: { type: 'string', enum: [...EXPERIMENT_STATUSES], description: 'create: running (default) o draft.' },
        experiment_id: { type: 'integer', minimum: 1, description: 'close: id del experimento.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_exclusions',
    description:
      'Saca chats de TODO el circuito comercial o los devuelve. action exclude: los marca como personal, equipo u ' +
      'otros (kind) con un motivo opcional; el clasificador y las tools dejan de gastar IA en ellos, se borran sus ' +
      'audios pendientes de transcribir y sus señales abiertas del radar. action include: los devuelve al circuito (el ' +
      'análisis que tenían sigue estando). Usala cuando una persona identifica chats que no son leads (familia, ' +
      'compañeros, proveedores). No borra mensajes, contactos ni el análisis ya guardado. Con dry_run devuelve qué se ' +
      'haría sin escribir. Los chats de otro equipo se ignoran.',
    inputSchema: {
      type: 'object',
      required: ['action', 'chat_ids'],
      properties: {
        action: { type: 'string', enum: ['exclude', 'include'] },
        chat_ids: { type: 'array', items: { type: 'integer', minimum: 1 }, minItems: 1, maxItems: 500 },
        kind: { type: 'string', enum: [...EXCLUSION_KINDS], description: 'exclude: personal | equipo | otros.' },
        reason: { type: 'string', maxLength: 200, description: 'exclude: motivo corto opcional.' },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_work_skip',
    description:
      'Descarta un ítem de la cola de trabajo de conectores para que deje de ofrecerse. kind y key son exactamente los ' +
      'que devuelve cada ítem de whatspro_sales_work_queue o whatspro_work_queue (source="sales"). action skip: por ' +
      'esta vez (24 h, después vuelve si sigue pendiente) o para siempre con forever: true; label opcional para ' +
      'reconocerlo. action unskip: lo vuelve a ofrecer. No borra ni cancela nada: lo que tenga estado propio (una fila ' +
      'aprobada, una corrida de prompt) se quita desde su tool (whatspro_sales_queue_remove, whatspro_sales_run_manage). ' +
      'Devuelve la lista vigente de descartes.',
    inputSchema: {
      type: 'object',
      required: ['action', 'kind', 'key'],
      properties: {
        action: { type: 'string', enum: ['skip', 'unskip'] },
        kind: { type: 'string', enum: [...WORK_KINDS], description: 'Tipo del ítem tal como lo devuelve la cola.' },
        key: { type: 'string', minLength: 1, maxLength: 255, description: 'Clave del ítem tal como la devuelve la cola.' },
        forever: { type: 'boolean', description: 'skip: true = para siempre; false/omitido = 24 h.' },
        label: { type: 'string', maxLength: 120, description: 'skip: etiqueta para reconocer el descarte.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_sales_batch_delete',
    description:
      'BORRA un lote ENTERO de la cola del Command Center (todas sus filas). Sólo se puede borrar un lote sin filas ' +
      'vivas (proposed, pending_approval, approved, executing) y sin envíos que ya salieron (executed, resulted): es la ' +
      'salida de "Descartados" cuando el rastro ya no sirve. Si el lote está vivo, primero whatspro_sales_queue_reject. ' +
      'Para sacar UNA acción de un lote sin borrarlo usá whatspro_sales_queue_remove. No manda mensajes ni toca el ' +
      'chat. Exige confirm: true. Es irreversible.',
    inputSchema: {
      type: 'object',
      required: ['batch_id', 'confirm'],
      properties: {
        batch_id: { type: 'string', minLength: 3, maxLength: 64, description: 'Id del lote, formato cc-YYYYMMDD-xxxxxx.' },
        confirm: { const: true, description: 'Obligatorio en true: borra el lote completo y no se puede deshacer.' },
      },
      additionalProperties: false,
    },
  },
];

// ── Handler ───────────────────────────────────────────────────────────────────

function friendly(error: unknown): never {
  if (error instanceof QueueError) throw new Error(error.message);
  throw error;
}

function parseUntil(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('until inválido: usá ISO 8601 (por ejemplo 2026-09-10T09:00:00-03:00).');
  if (date.getTime() <= Date.now()) throw new Error('until tiene que ser una fecha futura.');
  return date;
}

export async function executeManageTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  switch (name) {
    case 'whatspro_sales_overview': {
      await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
      parse(emptySchema, input);
      return getOverview(context.teamId);
    }

    case 'whatspro_sales_metrics': {
      await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
      parse(emptySchema, input);
      return getMetrics(context.teamId);
    }

    case 'whatspro_sales_cierre': {
      await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
      const args = parse(cierreSchema, input);
      return cierreSemanal(context.teamId, args.dias ?? 7);
    }

    case 'whatspro_sales_lecciones': {
      await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
      const args = parse(leccionesSchema, input);
      return rejectionLessons(context.teamId, { kind: args.kind, days: args.dias ?? 30 });
    }

    case 'whatspro_sales_settings': {
      const args = parse(settingsSchema, input);
      if (args.action === 'get') {
        await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
        return publicSettings(await getSalesOpsSettings(context.teamId));
      }
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const current = await getSalesOpsSettings(context.teamId);
      const patch: Parameters<typeof patchSalesOpsSettings>[2] = {};
      if (args.patch.cashGoalUsd !== undefined) patch.cashGoalUsd = args.patch.cashGoalUsd;
      if (args.patch.missionSince !== undefined) patch.missionSince = args.patch.missionSince;
      if (args.patch.sendCooldownHours !== undefined) patch.sendCooldownHours = args.patch.sendCooldownHours;
      if (args.patch.fx) patch.fx = { ARS: args.patch.fx.ARS ?? current.fx.ARS, PYG: args.patch.fx.PYG ?? current.fx.PYG };
      if (!Object.keys(patch).length) throw new Error('patch vacío: indicá al menos una de cashGoalUsd, missionSince, fx, sendCooldownHours.');
      const next = await patchSalesOpsSettings(context.teamId, context.userId, patch);
      await audit(context, 'CONNECTOR_SALES_SETTINGS_PATCHED', Object.keys(patch).join(','));
      return publicSettings(next);
    }

    case 'whatspro_sales_execute_batch': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(executeBatchSchema, input);
      const result = await executeApprovedBatch(context.teamId, context.userId, args.batch_id, { actionIds: args.action_ids });
      await audit(context, 'CONNECTOR_SALES_BATCH_EXECUTED', args.batch_id);
      const remaining = result.executed + result.skipped + result.failed;
      return {
        ...result,
        note:
          remaining === 0
            ? 'No quedaban filas approved en el lote.'
            : 'Se ejecutan hasta 25 por llamada: si el lote tenía más filas approved, volvé a llamar. Las skipped por customer_replied las relee una persona.',
      };
    }

    case 'whatspro_sales_signal_mark': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(signalMarkSchema, input);
      const ids = [...new Set(args.signal_ids)];
      if (args.dry_run) return { dry_run: true, signal_ids: ids, status: args.status, would_update: ids.length };
      let rows: Awaited<ReturnType<typeof markSignals>>;
      if (ids.length === 1) {
        const row = await markSignal(context.teamId, context.userId, ids[0], args.status);
        rows = row ? [row] : [];
      } else {
        rows = await markSignals(context.teamId, context.userId, ids, args.status);
      }
      await audit(context, 'CONNECTOR_SALES_SIGNAL_MARKED', ids.join(','));
      return { status: args.status, updated: rows.length, not_found: ids.length - rows.length, rows };
    }

    case 'whatspro_sales_radar_mute': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(radarMuteSchema, input);
      const result = await setRadarMuted(context.teamId, context.userId, args.chat_id, args.muted);
      await audit(context, args.muted ? 'CONNECTOR_SALES_RADAR_MUTED' : 'CONNECTOR_SALES_RADAR_UNMUTED', args.chat_id);
      return { chat_id: args.chat_id, muted: args.muted, dismissed_signals: result.dismissed, radar_muted_chat_ids: result.radarMutedChatIds };
    }

    case 'whatspro_sales_classification_override': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(overrideSchema, input);
      const result = await setManualOverride(context.teamId, args.chat_id, context.userId, { gate: args.gate, status: args.status, reason: args.reason });
      await audit(context, 'CONNECTOR_SALES_OVERRIDE', args.chat_id);
      return result;
    }

    case 'whatspro_sales_lead_manage': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(leadManageSchema, input);
      if (args.action === 'transfer') {
        const result = await transferLead(context.teamId, context.userId, args.chat_id, args.owner);
        await audit(context, 'CONNECTOR_SALES_LEAD_TRANSFERRED', args.chat_id);
        return { action: 'transfer', ...result };
      }
      if (args.action === 'snooze') {
        const result = await snoozeLead(context.teamId, context.userId, args.chat_id, parseUntil(args.until), args.note);
        await audit(context, 'CONNECTOR_SALES_LEAD_SNOOZED', args.chat_id);
        return { action: 'snooze', ...result };
      }
      const result = await unsnoozeLead(context.teamId, context.userId, args.chat_id);
      await audit(context, 'CONNECTOR_SALES_LEAD_UNSNOOZED', args.chat_id);
      return { action: 'unsnooze', ...result };
    }

    case 'whatspro_sales_visibility_set': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(visibilitySchema, input);
      const result = await setVisibility(context.teamId, context.userId, { target: args.target, id: args.id, visibility: args.visibility });
      await audit(context, 'CONNECTOR_SALES_VISIBILITY_SET', `${args.target}:${args.id}`);
      return result;
    }

    case 'whatspro_sales_audio_exclude': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(audioExcludeSchema, input);
      const result = await setNuncaTranscribir(context.teamId, context.userId, args.chat_id, args.nunca);
      await audit(context, args.nunca ? 'CONNECTOR_SALES_AUDIO_EXCLUDED' : 'CONNECTOR_SALES_AUDIO_INCLUDED', args.chat_id);
      return { chat_id: args.chat_id, nunca: args.nunca, audios_removed_from_queue: result.quitados, audio_never_chat_ids: result.audioNeverChatIds };
    }

    case 'whatspro_sales_experiment_manage': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(experimentSchema, input);
      if (args.action === 'create') {
        const row = await createExperiment(context.teamId, {
          name: args.name,
          hypothesis: args.hypothesis ?? null,
          segmentGates: args.segment_gates,
          messageA: args.message_a ?? null,
          messageB: args.message_b ?? null,
          status: args.status,
          createdBy: context.userId,
        });
        await audit(context, 'CONNECTOR_SALES_EXPERIMENT_CREATED', row.id);
        return { action: 'create', experiment: row };
      }
      const row = await closeExperiment(context.teamId, args.experiment_id, context.userId);
      await audit(context, 'CONNECTOR_SALES_EXPERIMENT_CLOSED', args.experiment_id);
      return { action: 'close', experiment: row };
    }

    case 'whatspro_sales_exclusions': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(exclusionsSchema, input);
      const ids = [...new Set(args.chat_ids)];
      if (args.action === 'exclude') {
        if (args.dry_run) return { dry_run: true, action: 'exclude', kind: args.kind, chat_ids: ids, would_exclude: ids.length };
        const result = await excludeChats(context.teamId, context.userId, ids, args.kind, args.reason ?? null);
        await audit(context, 'CONNECTOR_SALES_CHATS_EXCLUDED', ids.join(','));
        return { action: 'exclude', kind: args.kind, ...result, ignored: ids.length - result.excluded };
      }
      if (args.dry_run) return { dry_run: true, action: 'include', chat_ids: ids, would_include: ids.length };
      const included = await includeChats(context.teamId, context.userId, ids);
      await audit(context, 'CONNECTOR_SALES_CHATS_INCLUDED', ids.join(','));
      return { action: 'include', included, not_excluded: ids.length - included };
    }

    case 'whatspro_sales_work_skip': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(workSkipSchema, input);
      if (args.action === 'skip') {
        const skips = await skipWorkItem(context.teamId, context.userId, { kind: args.kind as never, key: args.key, forever: args.forever === true, label: args.label });
        await audit(context, 'CONNECTOR_SALES_WORK_SKIPPED', `${args.kind}:${args.key}`);
        return { action: 'skip', kind: args.kind, key: args.key, forever: args.forever === true, skips };
      }
      const skips = await unskipWorkItem(context.teamId, context.userId, { kind: args.kind, key: args.key });
      await audit(context, 'CONNECTOR_SALES_WORK_UNSKIPPED', `${args.kind}:${args.key}`);
      return { action: 'unskip', kind: args.kind, key: args.key, skips };
    }

    case 'whatspro_sales_batch_delete': {
      await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
      const args = parse(batchDeleteSchema, input);
      const result = await deleteBatch(context.teamId, context.userId, args.batch_id).catch(friendly);
      await audit(context, 'CONNECTOR_SALES_BATCH_DELETED', args.batch_id);
      return result;
    }

    default:
      throw new Error(`sales-ops manage tools: tool desconocida ${name}`);
  }
}

/** Settings sin las listas internas completas: sólo lo configurable y conteos de lo demás. */
function publicSettings(settings: Awaited<ReturnType<typeof getSalesOpsSettings>>) {
  return {
    cashGoalUsd: settings.cashGoalUsd,
    missionSince: settings.missionSince,
    fx: { ...settings.fx, USD: 1 },
    sendCooldownHours: settings.sendCooldownHours,
    counts: {
      audioNeverChats: settings.audioNeverChatIds.length,
      radarMutedChats: settings.radarMutedChatIds.length,
      leadSnoozes: settings.leadSnoozes.length,
      subscriptionVisibility: Object.keys(settings.subscriptionVisibility).length,
      accountVisibility: Object.keys(settings.accountVisibility).length,
      workQueueSkips: settings.workQueueSkips.length,
    },
    note: 'Las listas internas se gestionan con whatspro_sales_audio_exclude, whatspro_sales_radar_mute, whatspro_sales_lead_manage, whatspro_sales_visibility_set y whatspro_sales_work_skip.',
  };
}
