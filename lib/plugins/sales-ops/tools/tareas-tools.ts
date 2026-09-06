import 'server-only';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { chats, contacts } from '@/lib/db/schema';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { createClientProject } from '@/lib/plugins/sales-ops/server/client-projects';
import { createDemoTask } from '@/lib/plugins/sales-ops/server/demos';
import { SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';
import { createProductionOrder, loadProductionOs, updateProductionOrder } from '@/lib/plugins/tasks/server/production-os';
import { WORK_KINDS, WORK_STATUSES } from '@/lib/plugins/tasks/shared/produccion';

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
      '"Demo web — {nombre}" en el workspace "Demos", con la investigación del chat en las notas y el prompt para generar el ' +
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
      'Crea un pedido tipado en Producción OS dentro de la MISMA Tarea OS: demo, trabajo vendido o cambio. Nace en estado pedido, con checklist y auditoría. '
      + 'Puede vincularlo al chat/contacto/cliente y elegir proyecto; si no, el destino se resuelve por tipo. No envía mensajes ni cambia el CRM. '
      + 'Usá idempotency_key para que un reintento no duplique el pedido. Requiere tasksWrite y la app Tareas activa.',
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
      + 'Sincroniza el estado general de Tareas y registra auditoría. No le avisa al cliente: la comunicación sigue siendo una acción separada. Requiere tasksWrite.',
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
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

const schema = z.object({
  action: z.enum(['demo', 'project']),
  chat_id: z.number().int().positive(),
  brief: z.string().max(4000).optional(),
  research: z.string().max(20000).optional(),
  prompt: z.string().max(20000).optional(),
  title: z.string().max(200).optional(),
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
  dry_run: z.boolean().optional(),
});

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
      idempotencyKey: data.idempotency_key,
      source: 'connector',
    });
    return { success: true, created: result.created, idempotent: result.idempotent, taskId: result.task.id, status: result.task.workStatus };
  }

  if (name === 'whatspro_production_update') {
    await assertPermission(context, 'tasksWrite', 'tasks');
    const data = parse(updateProductionSchema, input);
    if (data.dry_run) return { dryRun: true, taskId: data.task_id, changes: Object.keys(data).filter((key) => !['task_id', 'dry_run'].includes(key)) };
    const result = await updateProductionOrder(context.teamId, context.userId, data.task_id, {
      workKind: data.work_kind,
      workStatus: data.work_status,
      title: data.title,
      notes: data.notes,
      dueDate: data.due_date,
      assigneeId: data.assignee_id,
      deliveryUrl: data.delivery_url,
      blockedReason: data.blocked_reason,
    }, 'connector');
    return { success: true, taskId: result.id, workKind: result.workKind, workStatus: result.workStatus, deliveryUrl: result.deliveryUrl };
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
    });
    if ('error' in result) throw new Error(result.error);
    return { ...result, name: nombre, note: 'Tarea creada en el workspace "Demos". Siguiente paso: generar el sitio en AAPP SPACE con el prompt (gobiz_sites_create) y mandarle el link al cliente.' };
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
