import { and, desc, eq, gte, ilike, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  funnelStages,
  messages,
  teamCustomerContacts,
  teamCustomers,
  teamSales,
  users,
} from '@/lib/db/schema';

/**
 * Listados del CRM para las vistas del Escritorio.
 *
 * Existen aparte de `/api/contacts/list` porque esa ruta trae el árbol completo
 * de relaciones de cada contacto (chat, instancia, departamento, etiquetas) para
 * la bandeja. Estas vistas son tablas: necesitan pocas columnas de muchas filas,
 * más unos contadores. Traer el árbol entero para pintar una tabla es lo que
 * después obliga a paginar de urgencia.
 */

export type LeadRow = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  leadScore: number;
  temperature: string;
  isVip: boolean;
  stageName: string | null;
  stageEmoji: string | null;
  ownerName: string | null;
  lastContactAt: string | null;
  href: string;
};

export type LeadStats = {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  withStage: number;
  vip: number;
  newThisMonth: number;
  companies: number;
};

function startOfMonth(): Date {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function listLeads(
  teamId: number,
  options: { search?: string; temperature?: string; limit?: number; onlyStaged?: boolean } = {},
): Promise<LeadRow[]> {
  const where = [eq(contacts.teamId, teamId)];
  if (options.temperature) where.push(eq(contacts.temperature, options.temperature));
  if (options.onlyStaged) where.push(isNotNull(contacts.funnelStageId));
  if (options.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    where.push(
      or(
        ilike(contacts.name, term),
        ilike(contacts.company, term),
        ilike(contacts.email, term),
        ilike(contacts.phone, term),
      )!,
    );
  }

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      company: contacts.company,
      email: contacts.email,
      phone: contacts.phone,
      leadScore: contacts.leadScore,
      temperature: contacts.temperature,
      isVip: contacts.isVip,
      jobTitle: contacts.jobTitle,
      stageName: funnelStages.name,
      stageEmoji: funnelStages.emoji,
      ownerName: users.name,
      remoteJid: chats.remoteJid,
      lastMessageAt: chats.lastMessageTimestamp,
    })
    .from(contacts)
    .leftJoin(funnelStages, eq(contacts.funnelStageId, funnelStages.id))
    .leftJoin(users, eq(contacts.assignedUserId, users.id))
    .leftJoin(chats, eq(contacts.chatId, chats.id))
    .where(and(...where))
    // Por puntaje y después por actividad: un prospecto caliente sin movimiento
    // reciente sigue siendo lo primero que hay que mirar.
    .orderBy(desc(contacts.leadScore), desc(chats.lastMessageTimestamp))
    .limit(Math.min(options.limit ?? 100, 300));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    leadScore: row.leadScore,
    temperature: row.temperature,
    isVip: row.isVip,
    jobTitle: row.jobTitle,
    stageName: row.stageName,
    stageEmoji: row.stageEmoji,
    ownerName: row.ownerName,
    lastContactAt: row.lastMessageAt ? new Date(row.lastMessageAt).toISOString() : null,
    href: row.remoteJid ? `/dashboard/chat/${encodeURIComponent(row.remoteJid)}` : '/dashboard',
  })) as LeadRow[];
}

export async function leadStats(teamId: number): Promise<LeadStats> {
  const [row] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      hot: sql<number>`COUNT(*) FILTER (WHERE ${contacts.temperature} = 'hot')`,
      warm: sql<number>`COUNT(*) FILTER (WHERE ${contacts.temperature} = 'warm')`,
      cold: sql<number>`COUNT(*) FILTER (WHERE ${contacts.temperature} = 'cold')`,
      withStage: sql<number>`COUNT(*) FILTER (WHERE ${contacts.funnelStageId} IS NOT NULL)`,
      vip: sql<number>`COUNT(*) FILTER (WHERE ${contacts.isVip})`,
      newThisMonth: sql<number>`COUNT(*) FILTER (WHERE ${contacts.createdAt} >= ${startOfMonth().toISOString()}::timestamp)`,
      companies: sql<number>`COUNT(DISTINCT ${contacts.company}) FILTER (WHERE ${contacts.company} IS NOT NULL AND ${contacts.company} <> '')`,
    })
    .from(contacts)
    .where(eq(contacts.teamId, teamId));

  const num = (value: unknown) => Number(value ?? 0) || 0;
  return {
    total: num(row?.total),
    hot: num(row?.hot),
    warm: num(row?.warm),
    cold: num(row?.cold),
    withStage: num(row?.withStage),
    vip: num(row?.vip),
    newThisMonth: num(row?.newThisMonth),
    companies: num(row?.companies),
  };
}

export type AccountRow = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  industry: string | null;
  website: string | null;
  employees: number | null;
  annualRevenue: number | null;
  location: string | null;
  customerSince: string | null;
  contactsCount: number;
  href: string;
};

export async function listAccounts(
  teamId: number,
  options: { search?: string; status?: string; limit?: number } = {},
): Promise<AccountRow[]> {
  const where = [eq(teamCustomers.teamId, teamId)];
  if (options.status) where.push(eq(teamCustomers.status, options.status));
  if (options.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    where.push(or(ilike(teamCustomers.name, term), ilike(teamCustomers.email, term))!);
  }

  const rows = await db
    .select({
      id: teamCustomers.id,
      name: teamCustomers.name,
      email: teamCustomers.email,
      phone: teamCustomers.phone,
      status: teamCustomers.status,
      industry: teamCustomers.industry,
      website: teamCustomers.website,
      employees: teamCustomers.employees,
      annualRevenue: teamCustomers.annualRevenue,
      location: teamCustomers.location,
      customerSince: teamCustomers.customerSince,
      contactsCount: sql<number>`(SELECT COUNT(*) FROM ${teamCustomerContacts} cc WHERE cc.customer_id = ${teamCustomers.id})`,
    })
    .from(teamCustomers)
    .where(and(...where))
    .orderBy(desc(teamCustomers.updatedAt))
    .limit(Math.min(options.limit ?? 100, 300));

  return rows.map((row) => ({
    ...row,
    customerSince: row.customerSince ? new Date(row.customerSince).toISOString() : null,
    contactsCount: Number(row.contactsCount) || 0,
    href: `/plugins/customers/${row.id}`,
  }));
}

export type AccountStats = {
  total: number;
  active: number;
  prospects: number;
  enterprise: number;
  totalRevenue: number;
  /**
   * Moneda del equipo, sacada de sus ventas — no fijada en USD. Un equipo que
   * factura en pesos veía sus ingresos anuales rotulados en dólares, que es
   * peor que no mostrarlos.
   */
  currency: string;
};

export async function accountStats(teamId: number): Promise<AccountStats> {
  const [[row], [sale]] = await Promise.all([
    db
    .select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`COUNT(*) FILTER (WHERE ${teamCustomers.status} = 'active')`,
      prospects: sql<number>`COUNT(*) FILTER (WHERE ${teamCustomers.status} = 'prospect')`,
      // "Corporativo" = 50 empleados o más. Es un corte de producto, no un dato
      // que el cliente declare.
      enterprise: sql<number>`COUNT(*) FILTER (WHERE ${teamCustomers.employees} >= 50)`,
      totalRevenue: sql<number>`COALESCE(SUM(${teamCustomers.annualRevenue}), 0)`,
    })
      .from(teamCustomers)
      .where(eq(teamCustomers.teamId, teamId)),
    // La misma fuente que usa el Escritorio para la moneda de los KPIs
    // (lib/desktop/service.ts): la venta más reciente del equipo.
    db
      .select({ currency: teamSales.currency })
      .from(teamSales)
      .where(eq(teamSales.teamId, teamId))
      .orderBy(desc(teamSales.createdAt))
      .limit(1),
  ]);

  const num = (value: unknown) => Number(value ?? 0) || 0;
  return {
    total: num(row?.total),
    active: num(row?.active),
    prospects: num(row?.prospects),
    enterprise: num(row?.enterprise),
    totalRevenue: num(row?.totalRevenue),
    currency: sale?.currency ?? 'USD',
  };
}

export type TaskRow = {
  id: number;
  title: string;
  status: string;
  dueAt: string | null;
  overdue: boolean;
  project: string;
  column: string;
  assignee: string | null;
};

/**
 * Tareas agrupadas en las tres columnas de la vista.
 *
 * El estado real de una tarea en WhatsPro es su columna dentro del proyecto, que
 * cada equipo nombra como quiere. Para mostrar las tres columnas fijas del
 * diseño se usa `team_task_items.status`, que sí es un enum estable
 * (`todo` | `in_progress` | `done`), y el nombre de la columna se muestra aparte
 * como contexto en vez de perderlo.
 */
export async function listTasks(teamId: number, limit = 200): Promise<TaskRow[]> {
  const { teamTaskColumns, teamTaskItems, teamTaskProjects } = await import('@/lib/db/schema');
  const now = new Date();

  const rows = await db
    .select({
      id: teamTaskItems.id,
      title: teamTaskItems.title,
      status: teamTaskItems.status,
      dueDate: teamTaskItems.dueDate,
      column: teamTaskColumns.title,
      project: teamTaskProjects.name,
      assignee: users.name,
    })
    .from(teamTaskItems)
    .innerJoin(teamTaskColumns, eq(teamTaskItems.columnId, teamTaskColumns.id))
    .innerJoin(teamTaskProjects, eq(teamTaskColumns.projectId, teamTaskProjects.id))
    .leftJoin(users, eq(teamTaskItems.assigneeId, users.id))
    .where(eq(teamTaskProjects.teamId, teamId))
    .orderBy(desc(teamTaskItems.updatedAt))
    .limit(Math.min(limit, 400));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    // El enum real de la base es `open | in_progress | done`; la vista muestra
    // "Por hacer" para `open`. Se normaliza acá y no en el componente para que
    // haya un solo lugar donde se traduzca el estado.
    status: row.status === 'open' ? 'todo' : (row.status ?? 'todo'),
    dueAt: row.dueDate ? new Date(row.dueDate).toISOString() : null,
    overdue: Boolean(row.dueDate && new Date(row.dueDate) < now && row.status !== 'done'),
    project: row.project ?? '',
    column: row.column ?? '',
    assignee: row.assignee,
  }));
}

export type EventRow = {
  id: number;
  title: string;
  kind: string;
  subtype: string | null;
  startsAt: string;
  endsAt: string;
  attendees: string[];
  contactName: string | null;
  customerName: string | null;
  notes: string;
};

/** Próximos eventos de agenda, desde hoy hacia adelante. */
export async function listEvents(teamId: number, days = 30): Promise<EventRow[]> {
  const { teamEvents } = await import('@/lib/db/schema');
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + days * 86400000);

  const rows = await db
    .select({
      id: teamEvents.id,
      title: teamEvents.title,
      kind: teamEvents.kind,
      subtype: teamEvents.subtype,
      startsAt: teamEvents.startsAt,
      endsAt: teamEvents.endsAt,
      attendees: teamEvents.attendees,
      notes: teamEvents.notes,
      contactName: contacts.name,
      customerName: teamCustomers.name,
    })
    .from(teamEvents)
    .leftJoin(contacts, eq(teamEvents.contactId, contacts.id))
    .leftJoin(teamCustomers, eq(teamEvents.customerId, teamCustomers.id))
    .where(
      and(
        eq(teamEvents.teamId, teamId),
        gte(teamEvents.startsAt, from),
        sql`${teamEvents.startsAt} <= ${to.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(teamEvents.startsAt)
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: row.kind,
    subtype: row.subtype,
    startsAt: new Date(row.startsAt).toISOString(),
    endsAt: new Date(row.endsAt).toISOString(),
    attendees: row.attendees ?? [],
    contactName: row.contactName,
    customerName: row.customerName,
    notes: row.notes ?? '',
  }));
}
