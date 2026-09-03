import 'server-only';

import { randomUUID } from 'crypto';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamSales } from '@/lib/db/schema';
import { buildPermissionContext, type PermissionContext } from '@/lib/auth/permissions-guard';
import { getDesktopOverview, searchDesktop } from '@/lib/desktop/service';
import { listActivity } from '@/lib/desktop/activity';
import { revenueTrend } from '@/lib/desktop/trend';
import { accountStats, leadStats } from '@/lib/desktop/crm';
import { sendOperationsAiMessage } from '@/lib/operations-ai/service';
import { getDesktopLayout, saveDesktopLayout } from '@/lib/desktop/preferences';
import { computeKpis, type DesktopPeriod } from '@/lib/desktop/kpis';
import {
  DESKTOP_PERIOD_IDS,
  DESKTOP_WIDGET_IDS,
  HEADER_POSITIONS,
  type DesktopLayout,
} from '@/lib/desktop/types';
import { getCommandCenter } from '@/lib/desktop/command-center/service';
import { getSuggestionsForItems } from '@/lib/desktop/command-center/suggestions';
import { executeCommandBatch } from '@/lib/desktop/command-center/execute';
import { COMMAND_ITEM_KINDS, BATCH_DEAL_STAGES, type PlannedAction } from '@/lib/desktop/command-center/types';
import { executeBodySchema } from '@/lib/desktop/command-center/schema';
import { listUnifiedWorkQueue } from '@/lib/work-queue/service';
import { WORK_APPROVALS, WORK_SOURCES } from '@/lib/work-queue/types';
import { assertPermission, audit, parse, type GrokActionContext, type GrokActionTool } from './actions';

/**
 * Escritorio y Centro de Comandos por MCP.
 *
 * Todo lo que hay acá abajo ya estaba escrito en `lib/desktop/**` con firma
 * `(ctx: PermissionContext, …)`; lo único que faltaba era poder construir ese
 * contexto sin sesión. Eso lo resuelve `buildPermissionContext(teamId, userId)`.
 * No se duplica una sola regla de negocio ni un solo chequeo de permiso: el
 * conector ve exactamente lo que vería ese usuario abriendo la pantalla.
 */
async function ctxOf(context: GrokActionContext): Promise<PermissionContext> {
  const ctx = await buildPermissionContext(context.teamId, context.userId);
  if (!ctx) throw new Error('No hay membresía activa para este usuario en este equipo.');
  return ctx;
}

const enumOf = (values: readonly string[]) => [...values];

export const desktopReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_desktop_overview',
    description:
      'El Escritorio completo tal como lo vería este usuario: apps activas, bloque "ahora" (tareas vencidas, chats sin leer, dominios por vencer, programados), KPIs del período con variación contra el período anterior, tendencia de facturación, embudo de oportunidades, oportunidades destacadas, actividad reciente y próximos vencimientos. Cada bloque se apaga solo si el usuario no tiene el permiso o el plugin está desactivado: nunca devuelve error por eso, devuelve el bloque vacío. Es la foto de un saque del estado del negocio; usala antes de preguntar cosas sueltas.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_desktop_kpis',
    description:
      'Sólo los KPIs del Escritorio (facturación cobrada, oportunidades ganadas, oportunidades perdidas y contactos nuevos), cada uno con el valor del período, el del período anterior y la variación. Más barato que whatspro_desktop_overview cuando lo único que se necesita son los números. El período por defecto es el que el usuario tiene guardado en su layout.',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: enumOf(DESKTOP_PERIOD_IDS),
          description: 'Ventana de cálculo. Si se omite se usa la del layout guardado del usuario.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_desktop_layout_get',
    description:
      'El layout del Escritorio de este usuario: orden de los widgets, cuáles están fijados, cuáles ocultos, posición del encabezado y período por defecto. Devuelve además el catálogo de widgets disponibles con su categoría, para no adivinar ids al escribir con whatspro_desktop_layout_set.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_desktop_search',
    description:
      'La búsqueda global del Escritorio: un solo texto contra tareas, conversaciones de WhatsApp, contactos, clientes, documentos, notas, dominios y la agenda de Business Woman, hasta 5 resultados por tipo (24 en total). Cada resultado trae type, id, título, subtítulo y href. Respeta la visibilidad de chats y los permisos del usuario del conector: lo que no puede ver no aparece, sin error. Es la forma de resolver "¿dónde tengo algo de GoldPampa?" antes de saber si es un contacto, un cliente o una tarea. Mínimo 2 caracteres.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 2, maxLength: 80, description: 'Texto a buscar. Coincidencia parcial, sin distinguir mayúsculas.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_desktop_activity',
    description:
      'La actividad reciente del equipo tal como la muestra el Escritorio: oportunidades creadas, cambios de etapa, ganadas y perdidas, clientes nuevos y vinculaciones, con quién lo hizo y cuándo. Sale del registro de auditoría del equipo (lo que no tiene traducción se muestra con su acción cruda). Sólo requiere ser miembro del equipo. Para "¿qué pasó hoy?" o "¿qué movió Carlos esta semana?".',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Cuántos eventos traer, los más recientes primero. Por defecto 20, tope 50.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_revenue_trend',
    description:
      'Facturación COBRADA mes a mes (ventas en estado paid, por fecha de pago) de los últimos N meses, con un objetivo por mes. Emite todos los meses aunque estén en cero, así la serie no salta. El objetivo es la media móvil de los tres meses anteriores: un sustituto explícito mientras no haya presupuesto cargado, no una proyección. Los importes se suman tal cual están en la tabla de ventas, sin convertir monedas: si el equipo vende en más de una moneda, leelo con cuidado. Requiere el permiso salesRead.',
    inputSchema: {
      type: 'object',
      properties: {
        months: { type: 'integer', minimum: 1, maximum: 24, description: 'Ventana en meses, incluido el actual. Por defecto 6, tope 24.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_crm_stats',
    description:
      'Los contadores del CRM que muestra el Escritorio en una sola llamada. leads: total de contactos, cuántos calientes/tibios/fríos, cuántos con etapa de embudo, VIP, nuevos este mes y empresas distintas. accounts (clientes de la app Clientes): total, activos, prospectos, corporativos (50+ empleados) y la suma de facturación anual declarada en la moneda del equipo. Requiere el permiso contacts; la parte de accounts además customersRead: si falta, viene en skipped con el motivo y leads igual se devuelve.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

export const desktopActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_operations_ai_send',
    description:
      'Deja un mensaje en la BURBUJA DE IA DE OPERACIONES: el chat interno compartido que ven Tareas y el Centro de comandos, donde el equipo le pide cosas al asistente y los conectores contestan (whatspro_operations_ai_reply). NO es un mensaje a un cliente ni a un chat de WhatsApp: nadie de afuera lo recibe. El mensaje queda con estado "pending" y una foto de la cola de prompts (cuántos hay en prepare, execute y bloqueados) hasta que un conector lo responda. surface indica desde qué pantalla se lo muestra como escrito: "tasks" o "command-center". Requiere tasksWrite y la app Tareas activa.',
    inputSchema: {
      type: 'object',
      required: ['content'],
      properties: {
        content: { type: 'string', minLength: 1, maxLength: 8000, description: 'Texto del mensaje. Se recorta a 8.000 caracteres.' },
        surface: { type: 'string', enum: ['tasks', 'command-center'], description: 'Pantalla desde la que se registra. Por defecto "command-center".' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_desktop_layout_set',
    description:
      'Reordena, muestra u oculta widgets del Escritorio del usuario, y cambia la posición del encabezado y el período por defecto. Es un reemplazo parcial: lo que no se manda se conserva del layout actual. Los ids que no existen se descartan en silencio (así un layout viejo nunca rompe la pantalla), y los widgets que falten en "order" se agregan al final. Leé primero con whatspro_desktop_layout_get.',
    inputSchema: {
      type: 'object',
      properties: {
        order: {
          type: 'array',
          maxItems: 32,
          uniqueItems: true,
          items: { type: 'string', enum: enumOf(DESKTOP_WIDGET_IDS) },
          description: 'Orden de arriba hacia abajo. Los widgets que falten se agregan al final en el orden por defecto.',
        },
        pinned: {
          type: 'array',
          maxItems: 32,
          uniqueItems: true,
          items: { type: 'string', enum: enumOf(DESKTOP_WIDGET_IDS) },
          description: 'Widgets fijados arriba de todo.',
        },
        hidden: {
          type: 'array',
          maxItems: 32,
          uniqueItems: true,
          items: { type: 'string', enum: enumOf(DESKTOP_WIDGET_IDS) },
          description: 'Widgets ocultos. Reemplaza la lista entera de ocultos, no suma.',
        },
        header_position: { type: 'string', enum: enumOf(HEADER_POSITIONS) },
        period: { type: 'string', enum: enumOf(DESKTOP_PERIOD_IDS) },
      },
      additionalProperties: false,
    },
  },
];

export const commandCenterReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_work_queue',
    description:
      'TODO lo que hay para hacer, de las tres colas del sistema, en una sola lista ordenada por prioridad. Es la herramienta con la que conviene empezar cada sesión de trabajo. Federa: (1) source="sales", la cola del Command Center Comercial —clasificar chats, clasificar respuestas, transcribir audios, y acciones comerciales YA APROBADAS por una persona—; (2) source="tasks", los prompts anotados en Tareas que una persona entregó a la cola, en fase prepare o execute; (3) source="inbox", la bandeja del Centro de comandos —chats sin responder, tareas vencidas, membresías por vencer, oportunidades paradas, agenda—. CADA ÍTEM TRAE approval: "ready" significa que ya lo aprobó una persona (o que no le escribe a nadie de afuera) y podés ejecutarlo siguiendo sus steps; "needs_human" significa que necesita criterio, así que proponé y esperá confirmación explícita. También trae tools y steps: la cadena exacta de herramientas para resolverlo y reportar. Si una fuente no está disponible (permiso, app apagada) viene vacía con el motivo en sources[].skipped, nunca un error que tape a las otras. No escribe nada.',
    inputSchema: {
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          maxItems: 3,
          uniqueItems: true,
          items: { type: 'string', enum: enumOf(WORK_SOURCES) },
          description: 'Acotá a una o dos fuentes. Vacío = las tres.',
        },
        approval: {
          type: 'string',
          enum: enumOf(WORK_APPROVALS),
          description: 'Filtrá por tipo de aprobación. "ready" es lo que podés ejecutar sin volver a preguntar; "needs_human" es lo que hay que consultar.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Máximo de ítems (por defecto 40).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_command_center_inbox',
    description:
      'La bandeja del Centro de Comandos: lo que hay que atender hoy, ya priorizado y mezclado entre chats sin responder, tareas vencidas, membresías por vencer, oportunidades estancadas y eventos próximos. Cada ítem trae las acciones que ese usuario puede ejecutar sobre él (responder, marcar leído, completar tarea, posponer, mover etapa) listas para pasarle a whatspro_command_center_execute, más el conteo real por tipo antes de la cuota. El teléfono del contacto NO viaja: para responder alcanza el chatId que viene en el ítem.',
    inputSchema: {
      type: 'object',
      properties: {
        kinds: {
          type: 'array',
          maxItems: 5,
          uniqueItems: true,
          items: { type: 'string', enum: enumOf(COMMAND_ITEM_KINDS) },
          description: 'Filtra por tipo de ítem. Si se omite trae los cinco.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Tope global de ítems (por defecto 30).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_command_center_suggest',
    description:
      'Borradores de respuesta y de próximo paso para ítems concretos de la bandeja. CONSUME CUOTA DE IA del equipo: pedí sólo los ítems que vas a trabajar. Devuelve siempre un bundle por ítem —un equipo sin IA configurada recibe estado "unavailable" con el motivo, nunca un error—, y cada borrador puede venir con warning (afirma importes o fechas que no están en el contexto) o needsEdit (todavía tiene [[variables]] sin resolver). Un borrador NO se envía solo: para enviarlo hay que pasarlo por whatspro_command_center_execute.',
    inputSchema: {
      type: 'object',
      required: ['item_ids'],
      properties: {
        item_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          uniqueItems: true,
          items: { type: 'string', pattern: '^(chat|task|membership|deal|event):[0-9]+$' },
          description: 'Ids de ítem tal como los devuelve whatspro_command_center_inbox (por ejemplo "chat:412").',
        },
      },
      additionalProperties: false,
    },
  },
];

export const commandCenterActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_command_center_execute',
    description:
      'Ejecuta un lote de acciones de la bandeja. Trece acciones: enviar un mensaje de WhatsApp, marcar un chat leído, completar o posponer una tarea, escribir un campo de IA de una tarea, mover una oportunidad de etapa, mover un contacto de etapa del CRM, agregarle o quitarle etiquetas, asignarlo a una persona o a un sector, dejarle una nota interna (que NO se le envía al cliente), crear una tarea ligada a él, RENOVAR UNA MEMBRESÍA (corriendo la fecha y, si se pide, dejando el asiento de ingreso) y REGISTRAR UN COBRO O UN PAGO sobre un movimiento financiero pendiente. Las dos últimas mueven plata: la clave idempotente la deriva el servidor del batch_id, así que reintentar un lote cortado no cobra dos veces. REGLAS QUE NO SE AFLOJAN: (1) el destinatario lo resuelve el servidor contra la base dentro de la visibilidad de chats del usuario, por eso las acciones llevan chatId y nunca un número de teléfono; (2) como máximo UN envío de mensaje por llamada, para que un lote se pueda frenar a la mitad; (3) sin confirm:"EJECUTAR" no se manda nada. Empezá SIEMPRE con dry_run:true: valida permisos, resuelve el destinatario real y devuelve el teléfono enmascarado por ítem sin enviar ni tocar nada. La clave idempotente la deriva el servidor del batch_id, así que reintentar el mismo batch_id no duplica el envío.',
    inputSchema: {
      type: 'object',
      required: ['actions'],
      properties: {
        actions: {
          type: 'array',
          minItems: 1,
          maxItems: 25,
          description: 'Acciones planificadas. El item_id es el del ítem de la bandeja del que salió la acción.',
          items: {
            type: 'object',
            required: ['item_id', 'action'],
            properties: {
              item_id: { type: 'string', pattern: '^(chat|task|membership|deal|event):[0-9]+$' },
              action: {
                type: 'object',
                required: ['type'],
                description:
                  'Una de: {type:"send-message", chatId, text, source}; {type:"mark-chat-read", chatId}; {type:"complete-task", taskId}; {type:"snooze-task", taskId, days}; {type:"set-task-ai-detail", taskId, field, text, source}; {type:"move-deal-stage", dealId, stage}; {type:"set-crm-stage", chatId, funnelStageId}; {type:"change-contact-tags", chatId, add, remove}; {type:"assign-contact", chatId, assignedUserId, assignedDepartmentId}; {type:"add-internal-note", chatId, text, source}; {type:"create-task", chatId, title, notes, dueDate}. Las acciones sobre el contacto llevan chatId y NO contactId: el contacto lo resuelve el servidor. Las de plata: {type:"renew-membership", subscriptionId, newEndDate, paymentStatus, recordPayment, amount, accountId}; {type:"settle-entry", entryId, amount, paidOn, accountId, method, notes}.',
                properties: {
                  type: {
                    type: 'string',
                    enum: [
                      'send-message', 'mark-chat-read', 'complete-task', 'snooze-task', 'set-task-ai-detail', 'move-deal-stage',
                      'set-crm-stage', 'change-contact-tags', 'assign-contact', 'add-internal-note', 'create-task',
                      'renew-membership', 'settle-entry',
                    ],
                  },
                  chatId: { type: 'integer', minimum: 1 },
                  taskId: { type: 'integer', minimum: 1 },
                  dealId: { type: 'integer', minimum: 1 },
                  text: { type: 'string', minLength: 1, maxLength: 20000 },
                  source: { type: 'string', enum: ['ai', 'template', 'custom'], description: 'De dónde salió el texto. Queda en la auditoría.' },
                  suggestionId: { type: ['string', 'null'], maxLength: 120 },
                  field: { type: 'string', enum: ['next-step', 'context-question', 'context-answer'] },
                  days: { type: 'integer', minimum: 1, maximum: 90 },
                  stage: { type: 'string', enum: enumOf(BATCH_DEAL_STAGES), description: 'Sólo etapas abiertas: cerrar una oportunidad emite venta y va por whatspro_deals_close.' },
                  funnelStageId: { type: ['integer', 'null'], minimum: 1, description: 'Etapa del CRM. null saca al contacto del embudo. Los ids salen de whatspro_list_records(resource="funnel-stages").' },
                  add: { type: 'array', maxItems: 30, items: { type: 'integer', minimum: 1 }, description: 'Ids de etiqueta a agregar. Es incremental: no toca las demás.' },
                  remove: { type: 'array', maxItems: 30, items: { type: 'integer', minimum: 1 }, description: 'Ids de etiqueta a quitar.' },
                  assignedUserId: { type: ['integer', 'null'], minimum: 1, description: 'Responsable. null desasigna. Tiene que ser miembro del equipo.' },
                  assignedDepartmentId: { type: ['integer', 'null'], minimum: 1, description: 'Sector (departamento). null desasigna.' },
                  title: { type: 'string', minLength: 1, maxLength: 300, description: 'Título de la tarea nueva.' },
                  notes: { type: 'string', maxLength: 10000 },
                  amount: { type: 'integer', minimum: 0, description: 'Importe en unidad mínima ENTERA, en la moneda del movimiento o de la suscripción. Las monedas nunca se suman entre sí.' },
                  dueDate: { type: ['string', 'null'], description: 'Vencimiento en formato YYYY-MM-DD.' },
                  subscriptionId: { type: 'integer', minimum: 1, description: 'Suscripción a renovar. Sale del ítem membership:<id> de la bandeja.' },
                  newEndDate: { type: 'string', description: 'Nueva fecha de vencimiento, YYYY-MM-DD. Tiene que ser POSTERIOR a la actual: una fecha anterior acorta la suscripción, no la renueva, y se rechaza.' },
                  paymentStatus: { type: 'string', enum: ['pending', 'paid', 'overdue', 'refunded'], description: 'Estado de pago tras renovar.' },
                  recordPayment: { type: 'boolean', description: 'true deja además el asiento de ingreso por el mismo importe. Exige el permiso financeWrite y la app Finanzas activa. Sin esto la fecha se corre pero la cobranza queda incompleta.' },
                  entryId: { type: 'integer', minimum: 1, description: 'Movimiento financiero a saldar. Sale del ítem finance:<id> de la bandeja.' },
                  paidOn: { type: 'string', description: 'Fecha del cobro o del pago, YYYY-MM-DD.' },
                  accountId: { type: ['integer', 'null'], minimum: 1, description: 'Cuenta financiera. Los ids salen de whatspro_finance_accounts.' },
                  method: { type: ['string', 'null'], maxLength: 80, description: 'Medio de pago (transferencia, efectivo…).' },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        },
        batch_id: {
          type: 'string',
          minLength: 8,
          maxLength: 64,
          description: 'Identificador del lote. Reusalo al reintentar: la clave idempotente de los envíos se deriva de él. Si se omite, el servidor genera uno (y entonces el reintento SÍ podría duplicar).',
        },
        dry_run: {
          type: 'boolean',
          description: 'true = valida y resuelve destinatarios sin ejecutar nada. Es el modo por defecto: sin confirm no se ejecuta.',
        },
        confirm: {
          type: 'string',
          enum: ['EJECUTAR'],
          description: 'Obligatorio para ejecutar de verdad. Es literal y no booleano a propósito: perder un campo nunca puede significar "mandá".',
        },
      },
      additionalProperties: false,
    },
  },
];

const desktopSearchSchema = z.object({ query: z.string().trim().min(2).max(80) });
const desktopActivitySchema = z.object({ limit: z.number().int().min(1).max(50).default(20) });
const revenueTrendSchema = z.object({ months: z.number().int().min(1).max(24).default(6) });
const operationsAiSendSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  surface: z.enum(['tasks', 'command-center']).default('command-center'),
});

function pickWidgets(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

export async function executeDesktopTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
): Promise<unknown> {
  const ctx = await ctxOf(context);

  if (name === 'whatspro_desktop_overview') {
    return getDesktopOverview(ctx);
  }

  if (name === 'whatspro_desktop_kpis') {
    const layout = await getDesktopLayout(ctx.teamId, ctx.userId);
    const period = (typeof input.period === 'string' && (DESKTOP_PERIOD_IDS as readonly string[]).includes(input.period)
      ? input.period
      : layout.period) as DesktopPeriod;
    const isOwner = ctx.role === 'owner' || ctx.role === 'admin';
    const flags = {
      sales: isOwner || ctx.permissions.salesRead === true,
      deals: isOwner || ctx.permissions.dealsRead === true,
      contacts: isOwner || ctx.permissions.contacts === true,
    };
    if (!flags.sales && !flags.deals && !flags.contacts) {
      throw new Error('Permission denied: se necesita al menos uno de salesRead, dealsRead o contacts.');
    }
    // Misma moneda que muestra el Escritorio: la de la venta más reciente.
    const [sale] = await db
      .select({ currency: teamSales.currency })
      .from(teamSales)
      .where(eq(teamSales.teamId, ctx.teamId))
      .orderBy(desc(teamSales.createdAt))
      .limit(1);
    const kpis = await computeKpis(ctx.teamId, period, flags, sale?.currency ?? 'USD');
    return { period, currency: sale?.currency ?? 'USD', ...kpis, omitted: Object.entries(flags).filter(([, on]) => !on).map(([key]) => key) };
  }

  if (name === 'whatspro_desktop_layout_get') {
    const layout = await getDesktopLayout(ctx.teamId, ctx.userId);
    return {
      layout,
      catalog: DESKTOP_WIDGET_IDS.map((id) => ({
        id,
        visible: !layout.hidden.includes(id),
        pinned: layout.pinned.includes(id),
      })),
    };
  }

  if (name === 'whatspro_desktop_layout_set') {
    const current = await getDesktopLayout(ctx.teamId, ctx.userId);
    // Reemplazo parcial: `normalizeDesktopLayout` (dentro de saveDesktopLayout)
    // descarta ids desconocidos y completa el orden, así que acá sólo hace falta
    // decidir qué campo viene del input y cuál se conserva.
    const next: DesktopLayout = {
      ...current,
      order: (pickWidgets(input.order) ?? current.order) as DesktopLayout['order'],
      pinned: (pickWidgets(input.pinned) ?? current.pinned) as DesktopLayout['pinned'],
      hidden: (pickWidgets(input.hidden) ?? current.hidden) as DesktopLayout['hidden'],
      headerPosition: (typeof input.header_position === 'string' && (HEADER_POSITIONS as readonly string[]).includes(input.header_position)
        ? input.header_position
        : current.headerPosition) as DesktopLayout['headerPosition'],
      period: (typeof input.period === 'string' && (DESKTOP_PERIOD_IDS as readonly string[]).includes(input.period)
        ? input.period
        : current.period) as DesktopLayout['period'],
    };
    const saved = await saveDesktopLayout(ctx.teamId, ctx.userId, next);
    await audit(context, 'CONNECTOR_DESKTOP_LAYOUT_SET', ctx.userId);
    return { success: true, layout: saved };
  }

  if (name === 'whatspro_desktop_search') {
    const data = parse(desktopSearchSchema, input);
    const results = await searchDesktop(ctx, data.query);
    return { query: data.query, total: results.length, results };
  }

  if (name === 'whatspro_desktop_activity') {
    const data = parse(desktopActivitySchema, input);
    const items = await listActivity(ctx.teamId, data.limit);
    return { total: items.length, items };
  }

  if (name === 'whatspro_revenue_trend') {
    await assertPermission(context, 'salesRead');
    const data = parse(revenueTrendSchema, input);
    const series = await revenueTrend(ctx.teamId, data.months);
    return {
      months: data.months,
      series,
      note: 'Importes sumados tal cual están en ventas, sin conversión de moneda. El objetivo es la media móvil de los 3 meses previos, no un presupuesto.',
    };
  }

  if (name === 'whatspro_crm_stats') {
    await assertPermission(context, 'contacts');
    const skipped: Array<{ section: string; reason: string }> = [];
    const leads = await leadStats(ctx.teamId);
    let accounts: Awaited<ReturnType<typeof accountStats>> | null = null;
    if (ctx.permissions.customersRead) {
      accounts = await accountStats(ctx.teamId);
    } else {
      skipped.push({ section: 'accounts', reason: 'Permission denied: customersRead' });
    }
    return { leads, accounts, skipped };
  }

  if (name === 'whatspro_operations_ai_send') {
    await assertPermission(context, 'tasksWrite', 'tasks');
    const data = parse(operationsAiSendSchema, input);
    const result = await sendOperationsAiMessage({
      teamId: ctx.teamId,
      userId: ctx.userId,
      content: data.content,
      surface: data.surface,
    });
    await audit(context, 'CONNECTOR_OPERATIONS_AI_SENT', result.user.id);
    return {
      success: true,
      sent_to_customer: false,
      message: { id: result.user.id, content: result.user.content, created_at: result.user.createdAt },
      pending: result.pending,
      queue: result.queue,
      note: 'Quedó en la burbuja interna de operaciones, esperando respuesta de un conector. Ningún cliente lo recibe.',
    };
  }

  if (name === 'whatspro_work_queue') {
    const sources = Array.isArray(input.sources)
      ? input.sources.filter((item): item is (typeof WORK_SOURCES)[number] =>
          typeof item === 'string' && (WORK_SOURCES as readonly string[]).includes(item))
      : undefined;
    const approval = typeof input.approval === 'string' && (WORK_APPROVALS as readonly string[]).includes(input.approval)
      ? (input.approval as (typeof WORK_APPROVALS)[number])
      : undefined;
    const limit = typeof input.limit === 'number' && Number.isInteger(input.limit) ? input.limit : undefined;
    return listUnifiedWorkQueue(ctx, { sources, approval, limit });
  }

  if (name === 'whatspro_command_center_inbox') {
    const kinds = Array.isArray(input.kinds)
      ? input.kinds.filter((item): item is (typeof COMMAND_ITEM_KINDS)[number] =>
          typeof item === 'string' && (COMMAND_ITEM_KINDS as readonly string[]).includes(item))
      : undefined;
    const limit = typeof input.limit === 'number' && Number.isInteger(input.limit) ? input.limit : undefined;
    return getCommandCenter(ctx, { kinds, limit });
  }

  if (name === 'whatspro_command_center_suggest') {
    const ids = Array.isArray(input.item_ids)
      ? input.item_ids.filter((item): item is string => typeof item === 'string')
      : [];
    if (!ids.length) throw new Error('item_ids es obligatorio.');
    return { suggestions: await getSuggestionsForItems(ctx, ids) };
  }

  if (name === 'whatspro_command_center_execute') {
    const batchId = typeof input.batch_id === 'string' && input.batch_id.length >= 8 ? input.batch_id : randomUUID();
    const actions = Array.isArray(input.actions)
      ? input.actions.map((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          return { itemId: row.item_id, action: row.action };
        })
      : [];
    // El mismo esquema que usa la pantalla, incluido el tope de un envío por
    // lote: si el conector tuviera su propia validación, el día que cambie una
    // regla quedaría una puerta más floja que la de la UI.
    const parsed = executeBodySchema.safeParse({
      teamId: ctx.teamId,
      batchId,
      actions,
      confirm: input.confirm ?? 'EJECUTAR',
    });
    if (!parsed.success) {
      throw new Error(`Invalid arguments: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}`);
    }
    // Sin `confirm:"EJECUTAR"` explícito nunca se ejecuta, aunque manden dry_run:false.
    const validation = input.confirm !== 'EJECUTAR' || input.dry_run === true;
    // Mismo cast que la route de la pantalla: `BATCH_DEAL_STAGES` es un
    // `readonly DealStage[]`, y el `z.enum` que sale de ahí ensancha `stage` a
    // string. El valor ya está validado contra esa lista.
    const result = await executeCommandBatch(ctx, {
      batchId,
      actions: parsed.data.actions as PlannedAction[],
      validation,
    });
    if (!validation) await audit(context, 'CONNECTOR_COMMAND_BATCH_EXECUTED', batchId);
    return { ...result, batch_id: batchId, dry_run: validation };
  }

  throw new Error(`Unknown desktop tool: ${name}`);
}
