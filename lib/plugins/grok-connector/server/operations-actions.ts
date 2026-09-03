import 'server-only';

import { and, asc, count, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, lte, ne, notExists, notInArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { daysUntil, serviceLabel, serviceUrgency } from '@/lib/aapp/subscription';
import { syncTeamAapp } from '@/lib/aapp/sync';
import { syncAdAccount } from '@/lib/ads/sync';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contactTags,
  contacts,
  departments,
  funnelStages,
  hostingerAccounts,
  metaAdAccounts,
  tags,
  teamAappConnections,
  teamCustomerContacts,
  teamCustomers,
  teamDeals,
  teamMembershipSubscriptions,
  teamTaskItems,
  teamTaskProjects,
  users,
} from '@/lib/db/schema';
import { buildAdsOverview } from '@/lib/ads/overview';
import { importHostingerDomains } from '@/lib/hostinger/import';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Herramientas de operación diaria que el conector no tenía y que obligaban a
 * reconstruir la respuesta con cinco o seis llamadas de catálogo cruzadas a
 * mano. Todas se apoyan en lógica que ya existía con firma `(teamId, …)`.
 */

// ─── Lectura ─────────────────────────────────────────────────────────────────

export const operationsReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_crm_followup_queue',
    description:
      'La cola de seguimiento: contactos cuya última conversación quedó sin respuesta nuestra, o a los que no les escribimos hace días. '
      + 'Responde "¿a quién le debo una respuesta?" y "¿a quién estoy dejando enfriar?" sin paginar chats a mano. '
      + 'Ordena por lo más urgente primero (mensajes del cliente sin contestar) y trae etapa del CRM, responsable y días de silencio. '
      + 'Incluye además las OPORTUNIDADES ESTANCADAS: las abiertas que no se movieron en el mismo plazo, con su etapa, monto y responsable. '
      + 'Un chat callado y una oportunidad parada son la misma pregunta —a quién hay que empujar— y se contestan juntas.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['awaiting_reply', 'going_cold', 'all'],
          description: 'awaiting_reply: el último mensaje es del cliente. going_cold: contestamos nosotros pero hace más de min_days_silent que no hay movimiento. Por defecto "all".',
        },
        min_days_silent: { type: 'integer', minimum: 0, maximum: 365, description: 'Días mínimos sin actividad. Por defecto 2.' },
        funnel_stage_id: { type: ['integer', 'null'], minimum: 1 },
        assigned_user_id: { type: ['integer', 'null'], minimum: 1 },
        only_unassigned: { type: 'boolean', description: 'Sólo contactos sin responsable.' },
        include_deals: { type: 'boolean', description: 'Incluir las oportunidades abiertas sin movimiento (por defecto true). Si el plugin Oportunidades está apagado o falta el permiso, la sección viene vacía con el motivo, nunca da error.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Por defecto 50.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_tasks_today',
    description:
      'Las tareas que hay que mirar hoy: vencidas, con vencimiento hoy y las de los próximos días, con proyecto y responsable. '
      + 'Reemplaza cruzar whatspro_list_records de tasks/projects/columns a mano.',
    inputSchema: {
      type: 'object',
      properties: {
        horizon_days: { type: 'integer', minimum: 0, maximum: 60, description: 'Cuántos días hacia adelante mirar además de lo vencido. Por defecto 7.' },
        assignee_id: { type: ['integer', 'null'], minimum: 1 },
        include_overdue: { type: 'boolean', description: 'Por defecto true.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Por defecto 100.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_memberships_expiring',
    description:
      'Suscripciones que vencen (o ya vencieron) en una ventana de días, con cliente, contacto de WhatsApp, plan, precio y urgencia. '
      + 'Es la lista sobre la que se arma el trabajo de renovación. Para ver la cola de avisos ya materializada usá whatspro_memberships_renewal_queue.',
    inputSchema: {
      type: 'object',
      properties: {
        within_days: { type: 'integer', minimum: 0, maximum: 365, description: 'Ventana hacia adelante. Por defecto 30.' },
        include_expired: { type: 'boolean', description: 'Incluir las ya vencidas. Por defecto true.' },
        expired_within_days: { type: 'integer', minimum: 0, maximum: 720, description: 'Cuánto hacia atrás mirar entre las vencidas. Por defecto 60.' },
        status: { type: 'string', enum: ['active', 'pending', 'expired', 'cancelled'] },
        limit: { type: 'integer', minimum: 1, maximum: 300, description: 'Por defecto 100.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_crm_search_contacts',
    description:
      'Búsqueda COMBINADA de contactos del CRM, la que whatspro_list_records no puede hacer: texto libre (nombre y notas) + etapas del embudo + etiquetas + campo personalizado (por valor o por existencia) + responsable + con/sin cliente vinculado + rango de fechas de alta, todo en una sola llamada y paginado. Devuelve cada contacto con su etapa, etiquetas, responsable, cliente vinculado y el estado de su conversación (última actividad y quién habló último). Ejemplos: "contactos en Seguimiento etiquetados VIP sin cliente creado" (stage_ids + tag_ids + has_customer=false); "los que tienen el campo rubro=gastronomía" (custom_field={key:"rubro", value:"gastronomía"}). Para la pregunta "¿a quién le debo respuesta?" usá whatspro_crm_followup_queue, que ya ordena por urgencia.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', maxLength: 120, description: 'Texto libre sobre nombre y notas del contacto.' },
        stage_ids: { type: 'array', maxItems: 20, items: { type: 'integer', minimum: 1 }, description: 'Etapas del embudo (cualquiera de ellas). Las etapas se listan con resource="funnel-stages".' },
        no_stage: { type: 'boolean', description: 'true = solo contactos SIN etapa asignada. Incompatible con stage_ids.' },
        tag_ids: { type: 'array', maxItems: 20, items: { type: 'integer', minimum: 1 }, description: 'Etiquetas (el contacto debe tener al menos una). Se listan con resource="tags".' },
        custom_field: {
          type: 'object',
          required: ['key'],
          properties: {
            key: { type: 'string', minLength: 1, maxLength: 80, description: 'Clave del campo personalizado (whatspro_custom_fields).' },
            value: { type: 'string', maxLength: 300, description: 'Valor exacto que debe tener. Omitilo junto con exists para filtrar por existencia.' },
            exists: { type: 'boolean', description: 'true = el campo debe estar cargado (con cualquier valor); false = debe estar vacío.' },
          },
          additionalProperties: false,
        },
        assigned_user_id: { type: ['integer', 'null'], minimum: 1, description: 'Responsable. null = solo contactos sin responsable.' },
        has_customer: { type: 'boolean', description: 'true = solo con cliente del CRM vinculado; false = solo sin cliente.' },
        created_from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Alta desde (YYYY-MM-DD).' },
        created_to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Alta hasta (YYYY-MM-DD).' },
        page: { type: 'integer', minimum: 1, default: 1 },
        per_page: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_integrations_status',
    description: 'Qué integraciones externas tiene conectadas el equipo (AAPP SPACE, Hostinger, Meta Ads), con su último sync y su estado. Miralo antes de llamar a whatspro_integrations_sync.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_metaads_report',
    description:
      'Reporte de Meta Ads (Facebook/Instagram) de un rango de fechas, con los IMPUESTOS del país ya aplicados al gasto: KPIs del período (gasto, resultados, costo por resultado, impresiones, alcance, clicks, CTR, CPC, CPM) comparados contra el período anterior de igual duración, la serie temporal (día/semana/mes según el rango) y la tabla de campañas ordenada por gasto con el tipo de resultado de cada una resuelto en texto. Es la tool para "¿cuánto gastamos en publicidad este mes y qué campaña rindió?". Los datos salen de la última sincronización: si el rango pedido es muy reciente, corré antes whatspro_integrations_sync(integration="meta_ads"). Si el equipo tiene una sola cuenta publicitaria, no hace falta account_id.',
    inputSchema: {
      type: 'object',
      properties: {
        account_id: { type: 'integer', minimum: 1, description: 'ID interno de la cuenta (resource="meta-ad-accounts"). Con una sola cuenta, se resuelve solo.' },
        since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Desde (YYYY-MM-DD). Por defecto, hace 30 días.' },
        until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Hasta (YYYY-MM-DD). Por defecto, hoy.' },
        granularity: { type: 'string', enum: ['day', 'week', 'month'], description: 'Granularidad de la serie. Por defecto se elige según el largo del rango.' },
        include_series: { type: 'boolean', default: true, description: 'false omite la serie temporal (respuesta más chica).' },
        max_campaigns: { type: 'integer', minimum: 1, maximum: 100, default: 30, description: 'Cuántas campañas devolver (ordenadas por gasto).' },
      },
      additionalProperties: false,
    },
  },
];

// ─── Escritura ───────────────────────────────────────────────────────────────

export const operationsActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_integrations_sync',
    description:
      'Dispara la sincronización de una integración externa y devuelve el resumen de lo que trajo. '
      + 'Usalo cuando el usuario pide "traeme lo último de AAPP" o antes de armar un informe que dependa de datos externos. '
      + 'Puede tardar: trae páginas completas de la API remota. No borra histórico.',
    inputSchema: {
      type: 'object',
      required: ['integration'],
      properties: {
        integration: {
          type: 'string',
          enum: ['aapp_space', 'hostinger', 'meta_ads'],
          description: 'aapp_space: clientes, planes, suscripciones y transacciones. hostinger: dominios. meta_ads: campañas e inversión.',
        },
        account_id: { type: 'integer', minimum: 1, description: 'Obligatorio para hostinger y meta_ads cuando hay más de una cuenta. Sacalo de whatspro_integrations_status.' },
        since: { type: 'string', description: 'Sólo meta_ads. Fecha YYYY-MM-DD de inicio del rango.' },
        until: { type: 'string', description: 'Sólo meta_ads. Fecha YYYY-MM-DD de fin del rango.' },
      },
      additionalProperties: false,
    },
  },
];

// ─── Schemas ─────────────────────────────────────────────────────────────────

const followupSchema = z.object({
  mode: z.enum(['awaiting_reply', 'going_cold', 'all']).default('all'),
  min_days_silent: z.number().int().min(0).max(365).default(2),
  funnel_stage_id: z.number().int().positive().nullable().optional(),
  assigned_user_id: z.number().int().positive().nullable().optional(),
  only_unassigned: z.boolean().optional(),
  include_deals: z.boolean().default(true),
  limit: z.number().int().min(1).max(200).default(50),
});

const tasksTodaySchema = z.object({
  horizon_days: z.number().int().min(0).max(60).default(7),
  assignee_id: z.number().int().positive().nullable().optional(),
  include_overdue: z.boolean().default(true),
  limit: z.number().int().min(1).max(200).default(100),
});

const expiringSchema = z.object({
  within_days: z.number().int().min(0).max(365).default(30),
  include_expired: z.boolean().default(true),
  expired_within_days: z.number().int().min(0).max(720).default(60),
  status: z.enum(['active', 'pending', 'expired', 'cancelled']).optional(),
  limit: z.number().int().min(1).max(300).default(100),
});

const syncSchema = z.object({
  integration: z.enum(['aapp_space', 'hostinger', 'meta_ads']),
  account_id: z.number().int().positive().optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ─── Implementación ──────────────────────────────────────────────────────────

function daysSince(date: Date | null) {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

async function followupQueue(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'messagesRead');
  const data = parse(followupSchema, input);

  const cutoff = new Date(Date.now() - data.min_days_silent * 86_400_000);

  const conditions = [
    eq(chats.teamId, context.teamId),
    isNotNull(chats.lastMessageTimestamp),
    lte(chats.lastMessageTimestamp, cutoff),
  ];

  // "Esperando respuesta" es el último mensaje entrante; "enfriándose" es que
  // contestamos y del otro lado no volvió nada en varios días.
  if (data.mode === 'awaiting_reply') conditions.push(eq(chats.lastMessageFromMe, false));
  if (data.mode === 'going_cold') conditions.push(eq(chats.lastMessageFromMe, true));
  if (data.funnel_stage_id) conditions.push(eq(contacts.funnelStageId, data.funnel_stage_id));
  if (data.assigned_user_id) conditions.push(eq(contacts.assignedUserId, data.assigned_user_id));
  if (data.only_unassigned) conditions.push(isNull(contacts.assignedUserId));

  const rows = await db
    .select({
      contactId: contacts.id,
      contactName: contacts.name,
      chatId: chats.id,
      remoteJid: chats.remoteJid,
      lastMessageText: chats.lastMessageText,
      lastMessageTimestamp: chats.lastMessageTimestamp,
      lastMessageFromMe: chats.lastMessageFromMe,
      unreadCount: chats.unreadCount,
      stageId: funnelStages.id,
      stageName: funnelStages.name,
      assignedUserId: contacts.assignedUserId,
      assignedUserName: users.name,
      departmentName: departments.name,
    })
    .from(contacts)
    .innerJoin(chats, eq(contacts.chatId, chats.id))
    .leftJoin(funnelStages, eq(contacts.funnelStageId, funnelStages.id))
    .leftJoin(users, eq(contacts.assignedUserId, users.id))
    .leftJoin(departments, eq(contacts.assignedDepartmentId, departments.id))
    .where(and(...conditions))
    // Lo que el cliente mandó y nadie contestó va primero, después lo más viejo.
    .orderBy(asc(chats.lastMessageFromMe), asc(chats.lastMessageTimestamp))
    .limit(data.limit);

  const items = rows.map((row) => ({
    contact_id: row.contactId,
    chat_id: row.chatId,
    name: row.contactName,
    phone: row.remoteJid.split('@')[0],
    days_silent: daysSince(row.lastMessageTimestamp),
    awaiting_our_reply: row.lastMessageFromMe === false,
    unread_count: row.unreadCount ?? 0,
    last_message_from_me: row.lastMessageFromMe,
    last_message_text: row.lastMessageText?.slice(0, 240) ?? null,
    last_message_at: row.lastMessageTimestamp?.toISOString() ?? null,
    funnel_stage: row.stageId ? { id: row.stageId, name: row.stageName } : null,
    assigned_to: row.assignedUserId ? { id: row.assignedUserId, name: row.assignedUserName } : null,
    department: row.departmentName,
  }));

  // Las oportunidades van aparte y NUNCA hacen fallar la cola de chats: si el
  // plugin está apagado o falta el permiso, la sección viene vacía con el
  // motivo. Una cola de seguimiento que devuelve 403 porque el equipo no usa
  // Oportunidades sería inservible para todos los demás.
  let stalledDeals: Array<Record<string, unknown>> = [];
  let dealsSkipped: string | null = null;
  if (data.include_deals) {
    try {
      await assertPermission(context, 'dealsRead', 'deals');
      const dealRows = await db
        .select({
          id: teamDeals.id,
          title: teamDeals.title,
          stage: teamDeals.stage,
          value: teamDeals.value,
          currency: teamDeals.currency,
          probability: teamDeals.probability,
          expectedCloseDate: teamDeals.expectedCloseDate,
          updatedAt: teamDeals.updatedAt,
          contactId: teamDeals.contactId,
          customerId: teamDeals.customerId,
          ownerId: teamDeals.ownerId,
          ownerName: users.name,
        })
        .from(teamDeals)
        .leftJoin(users, eq(teamDeals.ownerId, users.id))
        .where(and(
          eq(teamDeals.teamId, context.teamId),
          notInArray(teamDeals.stage, ['closed_won', 'closed_lost']),
          lte(teamDeals.updatedAt, cutoff),
          ...(data.assigned_user_id ? [eq(teamDeals.ownerId, data.assigned_user_id)] : []),
        ))
        .orderBy(asc(teamDeals.updatedAt))
        .limit(data.limit);
      stalledDeals = dealRows.map((row) => ({
        deal_id: row.id,
        title: row.title,
        stage: row.stage,
        // Los montos no se suman entre monedas: cada uno viaja con la suya.
        value: row.value,
        currency: row.currency,
        probability: row.probability,
        expected_close_date: row.expectedCloseDate ?? null,
        days_without_movement: daysSince(row.updatedAt),
        contact_id: row.contactId,
        customer_id: row.customerId,
        owner: row.ownerId ? { id: row.ownerId, name: row.ownerName } : null,
      }));
    } catch (error) {
      dealsSkipped = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    object: 'followup_queue',
    mode: data.mode,
    min_days_silent: data.min_days_silent,
    count: items.length,
    truncated: items.length === data.limit,
    awaiting_reply: items.filter((item) => item.awaiting_our_reply).length,
    data: items,
    stalled_deals: stalledDeals,
    stalled_deals_count: stalledDeals.length,
    stalled_deals_skipped: dealsSkipped,
  };
}

async function tasksToday(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksRead', 'tasks');
  const data = parse(tasksTodaySchema, input);

  const endOfHorizon = new Date();
  endOfHorizon.setHours(23, 59, 59, 999);
  endOfHorizon.setDate(endOfHorizon.getDate() + data.horizon_days);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const conditions = [
    eq(teamTaskItems.teamId, context.teamId),
    ne(teamTaskItems.status, 'done'),
    isNotNull(teamTaskItems.dueDate),
    lte(teamTaskItems.dueDate, endOfHorizon),
  ];
  if (!data.include_overdue) conditions.push(gte(teamTaskItems.dueDate, startOfToday));
  if (data.assignee_id) conditions.push(eq(teamTaskItems.assigneeId, data.assignee_id));

  const rows = await db
    .select({
      id: teamTaskItems.id,
      title: teamTaskItems.title,
      status: teamTaskItems.status,
      dueDate: teamTaskItems.dueDate,
      projectId: teamTaskProjects.id,
      projectName: teamTaskProjects.name,
      assigneeId: teamTaskItems.assigneeId,
      assigneeName: users.name,
    })
    .from(teamTaskItems)
    .innerJoin(teamTaskProjects, eq(teamTaskItems.projectId, teamTaskProjects.id))
    .leftJoin(users, eq(teamTaskItems.assigneeId, users.id))
    .where(and(...conditions))
    .orderBy(asc(teamTaskItems.dueDate))
    .limit(data.limit);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const items = rows.map((row) => {
    const due = row.dueDate!;
    const bucket = due < startOfToday ? 'overdue' : (due <= endOfToday ? 'today' : 'upcoming');
    return {
      task_id: row.id,
      title: row.title,
      status: row.status,
      bucket,
      due_at: due.toISOString(),
      days_overdue: bucket === 'overdue' ? daysSince(due) : 0,
      project: { id: row.projectId, name: row.projectName },
      assignee: row.assigneeId ? { id: row.assigneeId, name: row.assigneeName } : null,
    };
  });

  return {
    object: 'tasks_today',
    count: items.length,
    truncated: items.length === data.limit,
    overdue: items.filter((item) => item.bucket === 'overdue').length,
    today: items.filter((item) => item.bucket === 'today').length,
    upcoming: items.filter((item) => item.bucket === 'upcoming').length,
    data: items,
  };
}

async function membershipsExpiring(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'membershipsRead', 'memberships');
  const data = parse(expiringSchema, input);

  const toIsoDate = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().slice(0, 10);
  };

  const from = data.include_expired ? toIsoDate(-data.expired_within_days) : toIsoDate(0);
  const to = toIsoDate(data.within_days);

  const conditions = [
    eq(teamMembershipSubscriptions.teamId, context.teamId),
    isNotNull(teamMembershipSubscriptions.endDate),
    gte(teamMembershipSubscriptions.endDate, from),
    lte(teamMembershipSubscriptions.endDate, to),
  ];
  if (data.status) conditions.push(eq(teamMembershipSubscriptions.status, data.status));
  else conditions.push(inArray(teamMembershipSubscriptions.status, ['active', 'pending', 'expired']));

  const rows = await db
    .select({
      id: teamMembershipSubscriptions.id,
      number: teamMembershipSubscriptions.subscriptionNumber,
      planName: teamMembershipSubscriptions.planNameSnapshot,
      price: teamMembershipSubscriptions.price,
      currency: teamMembershipSubscriptions.currency,
      billingType: teamMembershipSubscriptions.billingType,
      status: teamMembershipSubscriptions.status,
      paymentStatus: teamMembershipSubscriptions.paymentStatus,
      endDate: teamMembershipSubscriptions.endDate,
      customerId: teamCustomers.id,
      customerName: teamCustomers.name,
      contactId: contacts.id,
      contactName: contacts.name,
      remoteJid: chats.remoteJid,
    })
    .from(teamMembershipSubscriptions)
    .leftJoin(teamCustomers, eq(teamMembershipSubscriptions.customerId, teamCustomers.id))
    .leftJoin(contacts, eq(teamMembershipSubscriptions.contactId, contacts.id))
    .leftJoin(chats, eq(contacts.chatId, chats.id))
    .where(and(...conditions))
    .orderBy(asc(teamMembershipSubscriptions.endDate))
    .limit(data.limit);

  const items = rows.map((row) => {
    const days = daysUntil(row.endDate);
    return {
      subscription_id: row.id,
      subscription_number: row.number,
      plan: row.planName,
      price: row.price,
      currency: row.currency,
      billing_type: row.billingType,
      status: row.status,
      payment_status: row.paymentStatus,
      end_date: row.endDate,
      days_until: days,
      urgency: serviceUrgency(days),
      urgency_label: serviceLabel(days),
      customer: row.customerId ? { id: row.customerId, name: row.customerName } : null,
      // Sin contacto de WhatsApp no hay a quién escribirle: el aviso de
      // renovación de esta suscripción no se puede mandar.
      contact: row.contactId
        ? { id: row.contactId, name: row.contactName, phone: row.remoteJid?.split('@')[0] ?? null }
        : null,
    };
  });

  return {
    object: 'memberships_expiring',
    window: { from, to },
    count: items.length,
    truncated: items.length === data.limit,
    expired: items.filter((item) => (item.days_until ?? 0) < 0).length,
    without_contact: items.filter((item) => !item.contact).length,
    data: items,
  };
}

async function integrationsStatus(_input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'settings');

  const [aapp, hostinger, metaAds] = await Promise.all([
    db.query.teamAappConnections.findFirst({
      where: eq(teamAappConnections.teamId, context.teamId),
      columns: { id: true, status: true, lastSyncedAt: true, lastSyncStatus: true, lastSyncError: true },
    }),
    db.select({
      id: hostingerAccounts.id,
      label: hostingerAccounts.label,
      status: hostingerAccounts.status,
      lastSyncedAt: hostingerAccounts.lastSyncedAt,
      domainsCount: hostingerAccounts.domainsCount,
      lastError: hostingerAccounts.lastError,
    }).from(hostingerAccounts).where(eq(hostingerAccounts.teamId, context.teamId)),
    db.select({
      id: metaAdAccounts.id,
      name: metaAdAccounts.name,
      accountId: metaAdAccounts.accountId,
      currency: metaAdAccounts.currency,
    }).from(metaAdAccounts).where(eq(metaAdAccounts.teamId, context.teamId)),
  ]);

  return {
    object: 'integrations_status',
    aapp_space: aapp
      ? {
          connected: aapp.status === 'connected',
          status: aapp.status,
          last_synced_at: aapp.lastSyncedAt?.toISOString() ?? null,
          last_sync_status: aapp.lastSyncStatus,
          last_sync_error: aapp.lastSyncError,
        }
      : null,
    hostinger: hostinger.map((account) => ({
      account_id: account.id,
      label: account.label,
      status: account.status,
      domains_count: account.domainsCount,
      last_synced_at: account.lastSyncedAt?.toISOString() ?? null,
      last_error: account.lastError,
    })),
    meta_ads: metaAds.map((account) => ({
      account_id: account.id,
      name: account.name,
      external_account_id: account.accountId,
      currency: account.currency,
    })),
  };
}

/** Cuando hay una sola cuenta, no obligar al modelo a adivinar el id. */
function pickAccount<T extends { id: number }>(accounts: T[], requestedId: number | undefined, label: string): T {
  if (requestedId) {
    const found = accounts.find((account) => account.id === requestedId);
    if (!found) throw new Error(`No existe una cuenta de ${label} con id ${requestedId} en este equipo.`);
    return found;
  }
  if (accounts.length === 0) throw new Error(`El equipo no tiene ninguna cuenta de ${label} conectada.`);
  if (accounts.length > 1) {
    throw new Error(
      `Hay ${accounts.length} cuentas de ${label}: pasá account_id. Listalas con whatspro_integrations_status.`,
    );
  }
  return accounts[0];
}

async function integrationsSync(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'settings');
  const data = parse(syncSchema, input);

  if (data.integration === 'aapp_space') {
    const connection = await db.query.teamAappConnections.findFirst({
      where: eq(teamAappConnections.teamId, context.teamId),
      columns: { apiKey: true },
    });
    if (!connection) throw new Error('El equipo no tiene conectada la integración de AAPP SPACE.');
    const summary = await syncTeamAapp(context.teamId, connection.apiKey);
    await audit(context, 'GROK_INTEGRATION_SYNCED', 'aapp_space');
    return { success: true, integration: 'aapp_space', summary };
  }

  if (data.integration === 'hostinger') {
    const accounts = await db.select({ id: hostingerAccounts.id, label: hostingerAccounts.label })
      .from(hostingerAccounts).where(eq(hostingerAccounts.teamId, context.teamId));
    const account = pickAccount(accounts, data.account_id, 'Hostinger');
    const summary = await importHostingerDomains(context.teamId, account.id, context.userId);
    await audit(context, 'GROK_INTEGRATION_SYNCED', `hostinger:${account.id}`);
    return { success: true, integration: 'hostinger', account: account.label, summary };
  }

  const accounts = await db.select({ id: metaAdAccounts.id, name: metaAdAccounts.name })
    .from(metaAdAccounts).where(eq(metaAdAccounts.teamId, context.teamId));
  const account = pickAccount(accounts, data.account_id, 'Meta Ads');
  const summary = await syncAdAccount({
    teamId: context.teamId,
    adAccountRowId: account.id,
    trigger: 'manual',
    since: data.since,
    until: data.until,
    startedBy: context.userId,
  });
  await audit(context, 'GROK_INTEGRATION_SYNCED', `meta_ads:${account.id}`);
  return { success: true, integration: 'meta_ads', account: account.name, summary };
}

const searchContactsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  stage_ids: z.array(z.number().int().positive()).max(20).optional(),
  no_stage: z.boolean().optional(),
  tag_ids: z.array(z.number().int().positive()).max(20).optional(),
  custom_field: z.object({
    key: z.string().trim().min(1).max(80),
    value: z.string().trim().max(300).optional(),
    exists: z.boolean().optional(),
  }).optional(),
  assigned_user_id: z.number().int().positive().nullable().optional(),
  has_customer: z.boolean().optional(),
  created_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  created_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(50),
});

async function searchContacts(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(searchContactsSchema, input);
  if (data.no_stage && data.stage_ids?.length) {
    throw new Error('no_stage y stage_ids son incompatibles: elegí uno.');
  }

  const conditions = [eq(contacts.teamId, context.teamId)];

  if (data.q) {
    const pattern = `%${data.q.replace(/([\\%_])/g, '\\$1')}%`;
    conditions.push(or(ilike(contacts.name, pattern), ilike(contacts.notes, pattern))!);
  }
  if (data.stage_ids?.length) conditions.push(inArray(contacts.funnelStageId, data.stage_ids));
  if (data.no_stage) conditions.push(isNull(contacts.funnelStageId));
  if (data.assigned_user_id !== undefined) {
    conditions.push(data.assigned_user_id === null
      ? isNull(contacts.assignedUserId)
      : eq(contacts.assignedUserId, data.assigned_user_id));
  }
  if (data.tag_ids?.length) {
    // Subquery de drizzle y no SQL crudo con `= any(${array})`: el array como
    // parámetro crudo revienta en runtime con el driver (y el build no lo ve).
    conditions.push(exists(
      db.select({ one: sql`1` }).from(contactTags)
        .where(and(eq(contactTags.contactId, contacts.id), inArray(contactTags.tagId, data.tag_ids))),
    ));
  }
  if (data.has_customer !== undefined) {
    const customerLink = db.select({ one: sql`1` }).from(teamCustomerContacts)
      .where(and(eq(teamCustomerContacts.teamId, context.teamId), eq(teamCustomerContacts.contactId, contacts.id)));
    conditions.push(data.has_customer ? exists(customerLink) : notExists(customerLink));
  }
  if (data.custom_field) {
    const { key, value, exists: mustExist } = data.custom_field;
    if (value !== undefined) {
      conditions.push(sql`${contacts.customData}->>${key} = ${value}`);
    } else if (mustExist === false) {
      // jsonb_exists y no el operador `?`: `?` choca con los parámetros del driver.
      conditions.push(sql`not jsonb_exists(coalesce(${contacts.customData}, '{}'::jsonb), ${key})`);
    } else {
      conditions.push(sql`jsonb_exists(coalesce(${contacts.customData}, '{}'::jsonb), ${key})`);
    }
  }
  if (data.created_from) conditions.push(gte(contacts.createdAt, new Date(`${data.created_from}T00:00:00Z`)));
  if (data.created_to) conditions.push(lte(contacts.createdAt, new Date(`${data.created_to}T23:59:59Z`)));

  const where = and(...conditions);
  const offset = (data.page - 1) * data.per_page;

  const [rows, [totals]] = await Promise.all([
    db.select({
      id: contacts.id,
      name: contacts.name,
      chatId: contacts.chatId,
      funnelStageId: contacts.funnelStageId,
      stageName: funnelStages.name,
      assignedUserId: contacts.assignedUserId,
      assignedUserName: users.name,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
      lastMessageTimestamp: chats.lastMessageTimestamp,
      lastMessageFromMe: chats.lastMessageFromMe,
      remoteJid: chats.remoteJid,
    })
      .from(contacts)
      .leftJoin(funnelStages, eq(contacts.funnelStageId, funnelStages.id))
      .leftJoin(users, eq(contacts.assignedUserId, users.id))
      .leftJoin(chats, eq(contacts.chatId, chats.id))
      .where(where)
      .orderBy(desc(contacts.updatedAt))
      .limit(data.per_page)
      .offset(offset),
    db.select({ value: count() }).from(contacts).where(where),
  ]);

  // Etiquetas y cliente vinculado sólo de la página devuelta: dos queries chicas.
  const pageIds = rows.map((row) => row.id);
  const [tagRows, customerRows] = pageIds.length
    ? await Promise.all([
      db.select({ contactId: contactTags.contactId, tagId: tags.id, tagName: tags.name })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(inArray(contactTags.contactId, pageIds)),
      db.select({ contactId: teamCustomerContacts.contactId, customerId: teamCustomers.id, customerName: teamCustomers.name })
        .from(teamCustomerContacts)
        .innerJoin(teamCustomers, eq(teamCustomerContacts.customerId, teamCustomers.id))
        .where(and(eq(teamCustomerContacts.teamId, context.teamId), inArray(teamCustomerContacts.contactId, pageIds))),
    ])
    : [[], []];

  const tagsByContact = new Map<number, Array<{ id: number; name: string }>>();
  for (const row of tagRows) {
    const list = tagsByContact.get(row.contactId) ?? [];
    list.push({ id: row.tagId, name: row.tagName });
    tagsByContact.set(row.contactId, list);
  }
  const customersByContact = new Map<number, Array<{ id: number; name: string }>>();
  for (const row of customerRows) {
    const list = customersByContact.get(row.contactId) ?? [];
    list.push({ id: row.customerId, name: row.customerName });
    customersByContact.set(row.contactId, list);
  }

  const total = Number(totals?.value ?? rows.length);
  return {
    object: 'contact_search',
    data: rows.map((row) => ({
      id: row.id,
      name: row.name,
      chat_id: row.chatId,
      remote_jid: row.remoteJid,
      stage: row.funnelStageId ? { id: row.funnelStageId, name: row.stageName } : null,
      assigned: row.assignedUserId ? { id: row.assignedUserId, name: row.assignedUserName } : null,
      tags: tagsByContact.get(row.id) ?? [],
      customers: customersByContact.get(row.id) ?? [],
      last_message_at: row.lastMessageTimestamp,
      last_message_from_me: row.lastMessageFromMe,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    })),
    meta: {
      page: data.page,
      perPage: data.per_page,
      total,
      hasMore: offset + rows.length < total,
      nextPage: offset + rows.length < total ? data.page + 1 : null,
    },
  };
}

const metaadsReportSchema = z.object({
  account_id: z.number().int().positive().optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  granularity: z.enum(['day', 'week', 'month']).optional(),
  include_series: z.boolean().default(true),
  max_campaigns: z.number().int().min(1).max(100).default(30),
});

async function metaadsReport(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'metaAdsRead', 'meta-ads');
  const data = parse(metaadsReportSchema, input);

  const accounts = await db.select().from(metaAdAccounts).where(eq(metaAdAccounts.teamId, context.teamId));
  let account = data.account_id ? accounts.find((row) => row.id === data.account_id) : undefined;
  if (data.account_id && !account) {
    throw new Error(`La cuenta ${data.account_id} no existe en este equipo. Listalas con whatspro_list_records(resource="meta-ad-accounts").`);
  }
  if (!account) {
    if (!accounts.length) throw new Error('El equipo no tiene ninguna cuenta de Meta Ads conectada.');
    if (accounts.length > 1) {
      throw new Error(`El equipo tiene ${accounts.length} cuentas de Meta Ads: elegí una con account_id. Candidatas: ${accounts.map((row) => `${row.id} (${row.name})`).join(', ')}.`);
    }
    account = accounts[0];
  }

  const overview = await buildAdsOverview(context.teamId, account, {
    since: data.since ?? null,
    until: data.until ?? null,
    granularity: data.granularity ?? null,
  });

  return {
    object: 'metaads_report',
    account: overview.account,
    range: overview.range,
    granularity: overview.granularity,
    kpis: overview.kpis,
    previousKpis: overview.previousKpis,
    resultLabel: overview.resultLabel,
    ...(data.include_series ? { series: overview.series } : {}),
    campaigns: overview.campaigns.slice(0, data.max_campaigns),
    campaigns_total: overview.campaigns.length,
    campaigns_omitted: Math.max(0, overview.campaigns.length - data.max_campaigns),
    note: 'El gasto (spend) ya incluye los impuestos configurados en la cuenta; spendNet es el neto que reporta Meta. reach es el pico del período, no una suma.',
  };
}

export async function executeOperationsTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_crm_search_contacts') return searchContacts(input, context);
  if (name === 'whatspro_metaads_report') return metaadsReport(input, context);
  if (name === 'whatspro_crm_followup_queue') return followupQueue(input, context);
  if (name === 'whatspro_tasks_today') return tasksToday(input, context);
  if (name === 'whatspro_memberships_expiring') return membershipsExpiring(input, context);
  if (name === 'whatspro_integrations_status') return integrationsStatus(input, context);
  if (name === 'whatspro_integrations_sync') return integrationsSync(input, context);
  throw new Error(`Unknown operations tool: ${name}`);
}
