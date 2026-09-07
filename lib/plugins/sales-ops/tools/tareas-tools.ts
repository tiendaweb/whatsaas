import 'server-only';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, teamCommercialAnalysis } from '@/lib/db/schema';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { createClientProject } from '@/lib/plugins/sales-ops/server/client-projects';
import { DEMO_WORK_KINDS, createDemoTask, demoKindParaNecesidad, esDemoWorkKind } from '@/lib/plugins/sales-ops/server/demos';
import { SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';
import { createProductionOrder, loadProductionOs, updateProductionOrder } from '@/lib/plugins/tasks/server/production-os';
import { HANDOFF_ITEMS, PAYMENT_STATES, WORK_KINDS, WORK_STATUSES, limpiarHandoff } from '@/lib/plugins/tasks/shared/produccion';
import { CATALOGO_KEYS } from '@/lib/plugins/tasks/shared/catalogo';

/**
 * Campos del Protocolo Maestro que viajan iguales en create y update. JSON
 * Schema puro: el enum del handoff sale de HANDOFF_ITEMS para que una clave
 * nueva en shared/ aparezca acá sin tocar nada.
 */
const HANDOFF_SCHEMA = {
  type: 'object',
  description:
    'Ficha de handoff (Protocolo SPACE §06 / BUSINESS etapa 03). Cada ítem: "ok" = está, "falta" = hay que pedirlo, "ia" = autorizado a resolverlo con IA o recursos propios. '
    + 'Lo vendido no pasa de aceptado a en_curso hasta que los 8 estén en ok o ia. Se mergea: mandá sólo lo que cambió.',
  properties: Object.fromEntries(HANDOFF_ITEMS.map((item) => [item.id, { type: 'string', enum: ['ok', 'falta', 'ia'], description: `${item.label}. ${item.ayuda}` }])),
  additionalProperties: false,
} as const;

const CAMPOS_PROTOCOLO = {
  catalog_key: { type: 'string', enum: [...CATALOGO_KEYS], description: 'Ítem del Catálogo Operativo AAPP SPACE 2026 (whatspro_catalog_list). Rellena solo ticket, moneda, rondas incluidas y minutos estimados; lo que pases explícito manda.' },
  ticket_amount: { type: ['integer', 'null'], minimum: 0, description: 'Precio acordado en la UNIDAD MENOR de la moneda (centavos), como Finanzas. ARS 200.000 = 20000000.' },
  ticket_currency: { type: ['string', 'null'], enum: ['ARS', 'USD', null], description: 'Moneda del ticket.' },
  estimated_minutes: { type: ['integer', 'null'], minimum: 0, description: 'Minutos de producción estimados por ventas. Las horas REALES salen de las sesiones (whatspro_production_log_time).' },
  revision_rounds_included: { type: ['integer', 'null'], minimum: 0, maximum: 10, description: 'Rondas de revisión incluidas: 1 express, 2 premium. Superarlas marca el pedido como fuera de alcance → extra = presupuesto.' },
  payment_state: { type: ['string', 'null'], enum: [...PAYMENT_STATES, null], description: 'pendiente | anticipo | total | verificado | excepcion. Sin pago no hay posición en cola: lo vendido no pasa de pedido a aceptado sin anticipo/total/verificado o una excepción con motivo en blocked_reason.' },
  handoff: HANDOFF_SCHEMA,
} as const;

const REGLAS_PROTOCOLO =
  'Tres reglas del Protocolo Maestro que el servidor hace cumplir sobre lo VENDIDO (familia produccion; los demos y los cambios no las tienen): '
  + '(1) sin pago no hay posición en cola: pedido → aceptado exige payment_state anticipo/total/verificado, o excepcion con el motivo y quién la autorizó en blocked_reason; '
  + '(2) si el handoff está incompleto el trabajo no empieza: aceptado → en_curso exige los 8 ítems del handoff en ok o ia, o dejarlo en espera_cliente con lo que falta; '
  + '(3) lo vendido pasa por QA: en_curso → qa → entregado, nunca en_curso → entregado directo. Además: entregado exige delivery_url, y entregado → activado sólo cuando el cliente hizo su primera acción real.';

/**
 * Del chat a Tareas OS, con la misma lógica que usa el servidor cuando ejecuta
 * un lote `request_demo`.
 *
 * 🚨 `inputSchema` es JSON Schema puro (nada de zod adentro).
 */
export const tareasReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_production_list',
    description:
      'Lista la cola real de Producción OS sobre Tareas: demos, trabajo vendido y cambios, con estado, responsable, vencimiento, bloqueo, avance y vínculo. '
      + 'Usala antes de tomar trabajo o prometer una entrega. Requiere tasksRead y la app Tareas activa.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'all', ...WORK_STATUSES] },
        family: { type: 'string', enum: ['demo', 'produccion', 'cambio'] },
        assignee_id: { type: ['integer', 'null'], minimum: 1, description: 'null devuelve sólo pedidos sin responsable.' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
  },
];

export const tareasActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_tareas_from_chat',
    description:
      'Convierte un chat en trabajo dentro de Tareas OS, separado donde corresponde. action="demo": crea (o completa) la tarea ' +
      '"Demo web — {nombre}" en el workspace "Demos" tipada según lo que el cliente necesita (work_kind), con la investigación del chat en las notas y el prompt para generar el ' +
      'sitio en AAPP SPACE en ai_prompt; si pasás research y prompt se usan tal cual (los escribiste vos leyendo el chat), si ' +
      'no, los redacta la IA del equipo sobre el expediente. action="project": crea el proyecto del cliente en el workspace ' +
      '"Clientes" (o el que indiques) con columnas Por hacer / En curso / Hecho y las tareas que pases, vinculado al contacto; ' +
      'si el proyecto ya existe suma las tareas en vez de duplicarlo. Ninguna de las dos envía mensajes ni toca el CRM.',
    inputSchema: {
      type: 'object',
      required: ['action', 'chat_id'],
      properties: {
        action: { type: 'string', enum: ['demo', 'project'] },
        chat_id: { type: 'integer', minimum: 1 },
        brief: { type: 'string', maxLength: 4000, description: 'Indicación breve: qué pidió el cliente o qué hay que hacer.' },
        research: { type: 'string', maxLength: 20000, description: 'demo: investigación del chat ya redactada (va a las notas de la tarea).' },
        prompt: { type: 'string', maxLength: 20000, description: 'demo: prompt listo para generar la web en AAPP SPACE (va a ai_prompt). project: prompt del proyecto.' },
        title: { type: 'string', maxLength: 200, description: 'demo: título de la tarea. project: nombre del proyecto (default: empresa o nombre del contacto).' },
        work_kind: {
          type: 'string',
          enum: [...DEMO_WORK_KINDS],
          description:
            'demo: qué demo es. Si no lo pasás, sale de la necesidad del análisis del chat (sitio_web → demo_sitio_aapp, tienda_online → demo_tienda_aapp, tienda_profesional → demo_tienda_custom, sitio_profesional → demo_prosite, combo_full → demo_tienda_aapp, desarrollo_medida → demo_html). Pasalo sólo cuando el chat diga algo distinto de lo clasificado: los productos de AAPP SPACE no se convierten entre sí.',
        },
        workspace_name: { type: 'string', maxLength: 200, description: 'project: workspace destino. Default "Clientes".' },
        due_date: { type: 'string', maxLength: 10, description: 'demo: vencimiento YYYY-MM-DD.' },
        tasks: {
          type: 'array',
          maxItems: 100,
          description: 'project: tareas iniciales.',
          items: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string', minLength: 1, maxLength: 200 },
              notes: { type: 'string', maxLength: 20000 },
              due_date: { type: 'string', maxLength: 10 },
              column: { type: 'string', maxLength: 200, description: 'Título de la columna destino (default: la primera).' },
            },
            additionalProperties: false,
          },
        },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_production_create',
    description:
      'Crea un pedido tipado en Producción OS dentro de la MISMA Tarea OS: demo, trabajo vendido, AAPP BUSINESS (business_caza/piloto/torre) o cambio. Nace en estado pedido, con checklist y auditoría. '
      + 'Pasá catalog_key para que ticket, moneda, rondas incluidas y minutos estimados salgan del Catálogo Operativo real (whatspro_catalog_list) en vez de inventarlos. '
      + 'Puede vincularlo al chat/contacto/cliente y elegir proyecto; si no, el destino se resuelve por tipo. No envía mensajes ni cambia el CRM. '
      + `Usá idempotency_key para que un reintento no duplique el pedido. ${REGLAS_PROTOCOLO} Requiere tasksWrite y la app Tareas activa.`,
    inputSchema: {
      type: 'object',
      required: ['title', 'work_kind'],
      properties: {
        title: { type: 'string', minLength: 2, maxLength: 500 },
        work_kind: { type: 'string', enum: [...WORK_KINDS] },
        notes: { type: 'string', maxLength: 20000 },
        due_date: { type: ['string', 'null'], description: 'Fecha ISO 8601 o YYYY-MM-DD.' },
        project_id: { type: ['integer', 'null'], minimum: 1 },
        column_id: { type: ['integer', 'null'], minimum: 1 },
        assignee_id: { type: ['integer', 'null'], minimum: 1 },
        chat_id: { type: ['integer', 'null'], minimum: 1 },
        contact_id: { type: ['integer', 'null'], minimum: 1 },
        customer_id: { type: ['integer', 'null'], minimum: 1 },
        ai_prompt: { type: 'string', maxLength: 20000 },
        ...CAMPOS_PROTOCOLO,
        idempotency_key: { type: 'string', minLength: 8, maxLength: 100 },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_production_update',
    description:
      'Avanza o corrige un pedido de Producción OS. Las transiciones están controladas; para espera_cliente exige explicar qué falta y para entregado exige delivery_url. '
      + `${REGLAS_PROTOCOLO} `
      + 'Cada entregado → cambios cuenta una ronda de revisión; si supera las incluidas la respuesta trae fueraDeAlcance: true (extra = presupuesto, ventas cotiza antes de producir). '
      + 'Acepta ticket, pago, rondas, handoff (se mergea) y catalog_key. Sincroniza el estado general de Tareas y registra auditoría. No le avisa al cliente: la comunicación sigue siendo una acción separada. Requiere tasksWrite.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'integer', minimum: 1 },
        work_kind: { type: 'string', enum: [...WORK_KINDS] },
        work_status: { type: 'string', enum: [...WORK_STATUSES] },
        title: { type: 'string', minLength: 2, maxLength: 500 },
        notes: { type: 'string', maxLength: 20000 },
        due_date: { type: ['string', 'null'], description: 'Fecha ISO 8601 o YYYY-MM-DD.' },
        assignee_id: { type: ['integer', 'null'], minimum: 1 },
        delivery_url: { type: ['string', 'null'], maxLength: 2000 },
        blocked_reason: { type: ['string', 'null'], maxLength: 2000 },
        checklist_done: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string', maxLength: 80 },
          description: 'Ids de los ítems del checklist que quedaron cumplidos (los trae whatspro_production_get). Se tildan sin tener que reenviar el checklist entero.',
        },
        summary: { type: 'string', maxLength: 4000, description: 'Qué hiciste, en 1-3 líneas. Queda en el historial del pedido.' },
        ...CAMPOS_PROTOCOLO,
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

/** Los mismos campos, validados con zod para el servidor (el JSON Schema es sólo para el conector). */
const protocoloSchema = {
  catalog_key: z.enum(CATALOGO_KEYS as [string, ...string[]]).optional(),
  ticket_amount: z.number().int().min(0).nullable().optional(),
  ticket_currency: z.enum(['ARS', 'USD']).nullable().optional(),
  estimated_minutes: z.number().int().min(0).nullable().optional(),
  revision_rounds_included: z.number().int().min(0).max(10).nullable().optional(),
  payment_state: z.enum(PAYMENT_STATES).nullable().optional(),
  handoff: z.record(z.string(), z.unknown()).optional(),
};

const schema = z.object({
  action: z.enum(['demo', 'project']),
  chat_id: z.number().int().positive(),
  brief: z.string().max(4000).optional(),
  research: z.string().max(20000).optional(),
  prompt: z.string().max(20000).optional(),
  title: z.string().max(200).optional(),
  work_kind: z.enum(DEMO_WORK_KINDS as unknown as [string, ...string[]]).optional(),
  workspace_name: z.string().max(200).optional(),
  due_date: z.string().max(10).optional(),
  tasks: z.array(z.object({ title: z.string().min(1).max(200), notes: z.string().max(20000).optional(), due_date: z.string().max(10).optional(), column: z.string().max(200).optional() })).max(100).optional(),
  dry_run: z.boolean().optional(),
});

const listSchema = z.object({
  status: z.enum(['open', 'all', ...WORK_STATUSES]).default('open'),
  family: z.enum(['demo', 'produccion', 'cambio']).optional(),
  assignee_id: z.number().int().positive().nullable().optional(),
  limit: z.number().int().min(1).max(200).default(100),
});
const createProductionSchema = z.object({
  title: z.string().trim().min(2).max(500),
  work_kind: z.enum(WORK_KINDS),
  notes: z.string().max(20000).optional(),
  due_date: z.string().max(40).nullable().optional(),
  project_id: z.number().int().positive().nullable().optional(),
  column_id: z.number().int().positive().nullable().optional(),
  assignee_id: z.number().int().positive().nullable().optional(),
  chat_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  ai_prompt: z.string().max(20000).optional(),
  ...protocoloSchema,
  idempotency_key: z.string().min(8).max(100).optional(),
  dry_run: z.boolean().optional(),
});
const updateProductionSchema = z.object({
  task_id: z.number().int().positive(),
  work_kind: z.enum(WORK_KINDS).optional(),
  work_status: z.enum(WORK_STATUSES).optional(),
  title: z.string().trim().min(2).max(500).optional(),
  notes: z.string().max(20000).optional(),
  due_date: z.string().max(40).nullable().optional(),
  assignee_id: z.number().int().positive().nullable().optional(),
  delivery_url: z.string().url().max(2000).nullable().optional(),
  blocked_reason: z.string().max(2000).nullable().optional(),
  checklist_done: z.array(z.string().max(80)).max(50).optional(),
  summary: z.string().max(4000).optional(),
  ...protocoloSchema,
  dry_run: z.boolean().optional(),
});

/** snake_case del conector → camelCase del servidor, sólo lo que vino. */
function camposProtocolo(data: {
  catalog_key?: string; ticket_amount?: number | null; ticket_currency?: 'ARS' | 'USD' | null; estimated_minutes?: number | null;
  revision_rounds_included?: number | null; payment_state?: (typeof PAYMENT_STATES)[number] | null; handoff?: Record<string, unknown>;
}) {
  return {
    ...(data.catalog_key !== undefined && { catalogKey: data.catalog_key }),
    ...(data.ticket_amount !== undefined && { ticketAmount: data.ticket_amount }),
    ...(data.ticket_currency !== undefined && { ticketCurrency: data.ticket_currency }),
    ...(data.estimated_minutes !== undefined && { estimatedMinutes: data.estimated_minutes }),
    ...(data.revision_rounds_included !== undefined && { revisionRoundsIncluded: data.revision_rounds_included }),
    ...(data.payment_state !== undefined && { paymentState: data.payment_state }),
    ...(data.handoff !== undefined && { handoff: limpiarHandoff(data.handoff) }),
  };
}

export async function executeTareasTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_production_list') {
    await assertPermission(context, 'tasksRead', 'tasks');
    const data = parse(listSchema, input);
    const payload = await loadProductionOs(context.teamId);
    const orders = payload.orders.filter((order) => {
      if (data.status === 'open' && !['pedido', 'aceptado', 'en_curso', 'espera_cliente', 'cambios'].includes(order.workStatus)) return false;
      if (data.status !== 'open' && data.status !== 'all' && order.workStatus !== data.status) return false;
      if (data.family && order.family !== data.family) return false;
      if (data.assignee_id === null && order.assigneeId !== null) return false;
      if (typeof data.assignee_id === 'number' && order.assigneeId !== data.assignee_id) return false;
      return true;
    }).slice(0, data.limit);
    return { counts: payload.counts, total: orders.length, orders };
  }

  if (name === 'whatspro_production_create') {
    await assertPermission(context, 'tasksWrite', 'tasks');
    const data = parse(createProductionSchema, input);
    if ((data.chat_id || data.contact_id) != null) await assertPermission(context, 'contacts');
    if (data.dry_run) return { dryRun: true, title: data.title, workKind: data.work_kind, destination: data.project_id ?? 'automatico', status: 'pedido' };
    const result = await createProductionOrder(context.teamId, context.userId, {
      title: data.title,
      workKind: data.work_kind,
      notes: data.notes,
      dueDate: data.due_date,
      projectId: data.project_id,
      columnId: data.column_id,
      assigneeId: data.assignee_id,
      chatId: data.chat_id,
      contactId: data.contact_id,
      customerId: data.customer_id,
      aiPrompt: data.ai_prompt,
      ...camposProtocolo(data),
      idempotencyKey: data.idempotency_key,
      source: 'connector',
    });
    return { success: true, created: result.created, idempotent: result.idempotent, taskId: result.task.id, status: result.task.workStatus, catalogKey: result.task.catalogKey ?? null, paymentState: result.task.paymentState ?? null };
  }

  if (name === 'whatspro_production_update') {
    await assertPermission(context, 'tasksWrite', 'tasks');
    const data = parse(updateProductionSchema, input);
    if (data.dry_run) return { dryRun: true, taskId: data.task_id, changes: Object.keys(data).filter((key) => !['task_id', 'dry_run'].includes(key)) };
    // El checklist se guarda entero, pero el conector manda sólo los ids que
    // cumplió: reenviar el arreglo completo era pedirle que copie de vuelta lo
    // que acabamos de darle, y ahí es donde se pierden ítems.
    let checklist: Array<{ id: string; text: string; completed: boolean }> | undefined;
    if (data.checklist_done?.length) {
      const { orders } = await loadProductionOs(context.teamId);
      const order = orders.find((row) => row.id === data.task_id);
      if (!order) throw new Error(`No existe el pedido de producción ${data.task_id} en este equipo.`);
      const hechos = new Set(data.checklist_done);
      checklist = order.checklist.map((item) => (hechos.has(item.id) ? { ...item, completed: true } : item));
    }
    const result = await updateProductionOrder(context.teamId, context.userId, data.task_id, {
      workKind: data.work_kind,
      workStatus: data.work_status,
      title: data.title,
      notes: data.notes,
      dueDate: data.due_date,
      assigneeId: data.assignee_id,
      deliveryUrl: data.delivery_url,
      blockedReason: data.blocked_reason,
      ...camposProtocolo(data),
      ...(checklist !== undefined && { checklist }),
    }, 'connector');
    const fueraDeAlcance = Boolean((result as { fueraDeAlcance?: boolean }).fueraDeAlcance);
    return {
      success: true,
      taskId: result.id,
      workKind: result.workKind,
      workStatus: result.workStatus,
      deliveryUrl: result.deliveryUrl,
      paymentState: result.paymentState ?? null,
      revisionRounds: { included: result.revisionRoundsIncluded ?? null, used: result.revisionRoundsUsed ?? 0 },
      fueraDeAlcance,
      summary: data.summary ?? null,
      note: fueraDeAlcance
        ? 'Extra = presupuesto: superó las rondas incluidas, ventas cotiza antes de producir. No apliques el cambio hasta que haya presupuesto aprobado.'
        : result.workStatus === 'entregado'
          ? 'Entregado. Quien pidió el trabajo le avisa al cliente desde el Command Center; vos no le escribas. Registrá el tiempo con whatspro_production_log_time.'
          : result.workStatus === 'espera_cliente'
            ? 'Queda esperando al cliente: pasá al siguiente pedido de whatspro_production_work_queue.'
            : result.workStatus === 'qa'
              ? 'En QA: probá en celular y escritorio, enlaces, WhatsApp y textos antes de entregar. HTTP 200 no significa que funciona.'
              : 'Actualizado.',
    };
  }

  if (name !== 'whatspro_sales_tareas_from_chat') throw new Error(`sales-ops tareas: tool desconocida ${name}`);
  await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
  await assertPermission(context, 'tasksWrite', 'tasks');
  await assertPermission(context, 'contacts');
  const data = parse(schema, input);

  const chat = await db.query.chats.findFirst({ where: and(eq(chats.id, data.chat_id), eq(chats.teamId, context.teamId)), columns: { id: true, name: true, pushName: true, remoteJid: true } });
  if (!chat) throw new Error(`No existe el chat ${data.chat_id} en este equipo.`);
  const contact = await db.query.contacts.findFirst({ where: and(eq(contacts.chatId, chat.id), eq(contacts.teamId, context.teamId)), columns: { id: true, name: true } });
  if (!contact) throw new Error('El chat no tiene contacto asociado: guardalo primero con whatspro_save_contact.');
  const nombre = contact.name?.trim() || chat.name || chat.pushName || `…${chat.remoteJid.replace(/\D/g, '').slice(-4)}`;

  if (data.dry_run) return { dryRun: true, action: data.action, chatId: chat.id, contactId: contact.id, name: nombre };

  if (data.action === 'demo') {
    if (!data.prompt?.trim()) await assertPermission(context, 'messagesRead');
    // El tipo de demo lo fija el conector si lo sabe; si no, sale de la
    // necesidad que ya clasificó el análisis. Producción no puede adivinar si
    // "demo" era un sitio o una tienda, y elegir mal obliga a rehacerla.
    const [analisis] = await db
      .select({ need: teamCommercialAnalysis.need })
      .from(teamCommercialAnalysis)
      .where(and(eq(teamCommercialAnalysis.teamId, context.teamId), eq(teamCommercialAnalysis.chatId, chat.id)))
      .limit(1);
    const workKind = esDemoWorkKind(data.work_kind) ? data.work_kind : demoKindParaNecesidad(analisis?.need);
    const result = await createDemoTask({
      teamId: context.teamId,
      userId: context.userId,
      chatId: chat.id,
      contactId: contact.id,
      name: nombre,
      brief: data.brief,
      title: data.title,
      dueDate: data.due_date ?? null,
      research: data.research,
      prompt: data.prompt,
      workKind,
    });
    if ('error' in result) throw new Error(result.error);
    return { ...result, workKind, name: nombre, note: `Tarea creada en el workspace "Demos" como ${workKind}. Siguiente paso: la cadena de tools de ese tipo (whatspro_production_list la trae) y después el link al cliente desde el Command Center.` };
  }

  const result = await createClientProject({
    teamId: context.teamId,
    userId: context.userId,
    contactId: contact.id,
    workspaceName: data.workspace_name,
    projectName: data.title,
    brief: data.brief,
    aiPrompt: data.prompt,
    tasks: data.tasks?.map((t) => ({ title: t.title, notes: t.notes, dueDate: t.due_date ?? null, column: t.column })),
  });
  if ('error' in result) throw new Error(result.error);
  return { ...result, name: nombre, note: result.created ? 'Proyecto creado y vinculado al contacto.' : 'El proyecto ya existía: se sumaron las tareas.' };
}
