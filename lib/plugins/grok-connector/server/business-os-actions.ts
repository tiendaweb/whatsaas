import 'server-only';

import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  teamCostCenters,
  teamCustomers,
  teamEventParticipants,
  teamEvents,
  teamFinancialAccounts,
  teamFinancialEntries,
} from '@/lib/db/schema';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';
import { generateTasksFromNoteCommitments } from '@/lib/plugins/notes/server/meeting-notes';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * `isoDate` es un esquema de ZOD, para validar la entrada. Esto es JSON Schema,
 * para DESCRIBIR la tool al modelo. Son dos cosas distintas y no se pueden
 * mezclar: esparcir el objeto de zod dentro de `properties` filtraba sus
 * campos internos, el resultado no validaba contra el meta-esquema de la API
 * ("properties/from/maxLength must be integer") y el conector directamente
 * descartaba `whatspro_finance_summary` al cargar las herramientas. O sea: la
 * tool existía, funcionaba, y ninguna IA podía verla.
 */
const isoDateProperty = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
} as const;

export const businessOsReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_finance_summary',
    description:
      'Responde preguntas como "¿cuánto dinero tenemos?", "¿cuál fue la utilidad de un período?". Devuelve saldo disponible por cuenta/moneda, ingresos y egresos pagados en el rango, utilidad, gasto por categoría, y totales de cuentas por cobrar/pagar.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...isoDateProperty, description: 'Fecha inicial ISO (YYYY-MM-DD) del período a resumir. Por defecto, el primer día del mes actual.' },
        to: { ...isoDateProperty, description: 'Fecha final ISO (YYYY-MM-DD) del período a resumir. Por defecto, hoy.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_finance_receivables_payables',
    description:
      'Responde "¿quién nos debe?" y "¿qué tenemos que pagar esta semana?". Lista obligaciones pendientes o vencidas (cuentas por cobrar: type=income; cuentas por pagar: type=expense), opcionalmente acotadas a los próximos N días por vencimiento.',
    inputSchema: {
      type: 'object',
      required: ['direction'],
      properties: {
        direction: { type: 'string', enum: ['receivable', 'payable'], description: 'receivable = nos deben (income pendiente/vencido); payable = debemos (expense pendiente/vencido).' },
        due_within_days: { type: 'integer', minimum: 1, maximum: 365, description: 'Si se indica, solo obligaciones con vencimiento dentro de estos días desde hoy.' },
        only_overdue: { type: 'boolean', description: 'Si es true, solo obligaciones ya vencidas (status=overdue o dueOn < hoy).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_finance_cashflow_projection',
    description: 'Proyecta el saldo de caja hacia adelante combinando el saldo actual de las cuentas activas con las obligaciones pendientes agrupadas por semana ISO.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 7, maximum: 365, default: 90 },
        currency: { type: 'string', minLength: 3, maxLength: 3, default: 'ARS' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_meeting_agenda',
    description: 'Responde "¿qué reuniones/llamadas tengo?". Lista reuniones y llamadas (team_events con kind meeting/call) en un rango de fechas, con cliente, participantes, resultado y próxima acción.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', format: 'date-time', description: 'Inicio del rango. Por defecto, ahora.' },
        to: { type: 'string', format: 'date-time', description: 'Fin del rango. Por defecto, dentro de 7 días.' },
        kind: { type: 'string', enum: ['meeting', 'call'] },
        user_id: { type: 'integer', minimum: 1, description: 'Filtra reuniones donde este usuario participa.' },
      },
      additionalProperties: false,
    },
  },
];

export const businessOsActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_generate_tasks_from_note',
    description: 'Genera tareas (Task OS) a partir de los compromisos (commitments) de una nota de reunión que todavía no tienen tarea asociada. Es idempotente: los compromisos ya convertidos no se duplican.',
    inputSchema: {
      type: 'object',
      required: ['note_id'],
      properties: { note_id: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
  },
];

async function financeSummary(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeRead', 'finance');
  const data = parse(z.object({ from: isoDate.optional(), to: isoDate.optional() }), input);
  const today = new Date().toISOString().slice(0, 10);
  const from = data.from ?? `${today.slice(0, 7)}-01`;
  const to = data.to ?? today;

  const [accounts, periodEntries, allOpenEntries] = await Promise.all([
    db.select().from(teamFinancialAccounts).where(and(eq(teamFinancialAccounts.teamId, context.teamId), eq(teamFinancialAccounts.isActive, true))),
    db.select({
      type: teamFinancialEntries.type,
      status: teamFinancialEntries.status,
      amount: teamFinancialEntries.amount,
      currency: teamFinancialEntries.currency,
      category: teamFinancialEntries.category,
      occurredOn: teamFinancialEntries.occurredOn,
      accountId: teamFinancialEntries.accountId,
    }).from(teamFinancialEntries)
      .where(and(eq(teamFinancialEntries.teamId, context.teamId), gte(teamFinancialEntries.occurredOn, from), lte(teamFinancialEntries.occurredOn, to))),
    db.select({ type: teamFinancialEntries.type, status: teamFinancialEntries.status, amount: teamFinancialEntries.amount, currency: teamFinancialEntries.currency })
      .from(teamFinancialEntries)
      .where(and(eq(teamFinancialEntries.teamId, context.teamId), inArray(teamFinancialEntries.status, ['pending', 'overdue']))),
  ]);

  const paidAllTime = await db.select({ type: teamFinancialEntries.type, amount: teamFinancialEntries.amount, currency: teamFinancialEntries.currency, accountId: teamFinancialEntries.accountId })
    .from(teamFinancialEntries)
    .where(and(eq(teamFinancialEntries.teamId, context.teamId), eq(teamFinancialEntries.status, 'paid')));

  const availableBalanceByCurrency: Record<string, number> = {};
  for (const account of accounts) {
    const net = paidAllTime.filter((e) => e.accountId === account.id).reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);
    availableBalanceByCurrency[account.currency] = (availableBalanceByCurrency[account.currency] ?? 0) + account.openingBalance + net;
  }

  const paidInPeriod = periodEntries.filter((e) => e.status === 'paid');
  const incomeByCurrency: Record<string, number> = {};
  const expenseByCurrency: Record<string, number> = {};
  const expenseByCategory: Record<string, number> = {};
  for (const e of paidInPeriod) {
    if (e.type === 'income') incomeByCurrency[e.currency] = (incomeByCurrency[e.currency] ?? 0) + e.amount;
    else {
      expenseByCurrency[e.currency] = (expenseByCurrency[e.currency] ?? 0) + e.amount;
      expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + e.amount;
    }
  }
  const profitByCurrency: Record<string, number> = {};
  for (const currency of new Set([...Object.keys(incomeByCurrency), ...Object.keys(expenseByCurrency)])) {
    profitByCurrency[currency] = (incomeByCurrency[currency] ?? 0) - (expenseByCurrency[currency] ?? 0);
  }

  const receivablesByCurrency: Record<string, number> = {};
  const payablesByCurrency: Record<string, number> = {};
  for (const e of allOpenEntries) {
    if (e.type === 'income') receivablesByCurrency[e.currency] = (receivablesByCurrency[e.currency] ?? 0) + e.amount;
    else payablesByCurrency[e.currency] = (payablesByCurrency[e.currency] ?? 0) + e.amount;
  }

  return {
    period: { from, to },
    note: 'Los montos están en la unidad mínima de cada moneda (centavos).',
    availableBalanceByCurrency,
    incomeByCurrency,
    expenseByCurrency,
    profitByCurrency,
    expenseByCategory,
    receivablesByCurrency,
    payablesByCurrency,
  };
}

async function financeReceivablesPayables(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeRead', 'finance');
  const data = parse(z.object({
    direction: z.enum(['receivable', 'payable']),
    due_within_days: z.number().int().min(1).max(365).optional(),
    only_overdue: z.boolean().optional(),
  }), input);

  const today = new Date().toISOString().slice(0, 10);
  const conditions = [
    eq(teamFinancialEntries.teamId, context.teamId),
    eq(teamFinancialEntries.type, data.direction === 'receivable' ? 'income' : 'expense'),
    data.only_overdue
      ? sql`(${teamFinancialEntries.status} = 'overdue' or (${teamFinancialEntries.status} = 'pending' and ${teamFinancialEntries.dueOn} < ${today}))`
      : inArray(teamFinancialEntries.status, ['pending', 'overdue']),
  ];
  if (data.due_within_days) {
    const horizon = new Date(Date.now() + data.due_within_days * 86400000).toISOString().slice(0, 10);
    conditions.push(sql`coalesce(${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn}) <= ${horizon}`);
  }

  const rows = await db.select({
    id: teamFinancialEntries.id,
    title: teamFinancialEntries.title,
    amount: teamFinancialEntries.amount,
    currency: teamFinancialEntries.currency,
    status: teamFinancialEntries.status,
    dueOn: teamFinancialEntries.dueOn,
    occurredOn: teamFinancialEntries.occurredOn,
    counterparty: teamFinancialEntries.counterparty,
    customerId: teamFinancialEntries.customerId,
    customerName: teamCustomers.name,
  }).from(teamFinancialEntries)
    .leftJoin(teamCustomers, eq(teamFinancialEntries.customerId, teamCustomers.id))
    .where(and(...conditions))
    .orderBy(asc(sql`coalesce(${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn})`))
    .limit(200);

  const totalByCurrency: Record<string, number> = {};
  for (const row of rows) totalByCurrency[row.currency] = (totalByCurrency[row.currency] ?? 0) + row.amount;

  return { direction: data.direction, count: rows.length, totalByCurrency, entries: rows };
}

export function isoWeek(dateStr: string) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function financeCashflowProjection(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeRead', 'finance');
  const data = parse(z.object({ days: z.number().int().min(7).max(365).default(90), currency: z.string().length(3).default('ARS') }), input);
  const currency = data.currency.toUpperCase();
  const horizon = new Date(Date.now() + data.days * 86400000).toISOString().slice(0, 10);

  const [accounts, paidEntries, pendingEntries] = await Promise.all([
    db.select({ openingBalance: teamFinancialAccounts.openingBalance })
      .from(teamFinancialAccounts)
      .where(and(eq(teamFinancialAccounts.teamId, context.teamId), eq(teamFinancialAccounts.isActive, true), eq(teamFinancialAccounts.currency, currency))),
    db.select({ type: teamFinancialEntries.type, amount: teamFinancialEntries.amount })
      .from(teamFinancialEntries)
      .where(and(eq(teamFinancialEntries.teamId, context.teamId), eq(teamFinancialEntries.currency, currency), eq(teamFinancialEntries.status, 'paid'))),
    db.select({
      type: teamFinancialEntries.type,
      amount: teamFinancialEntries.amount,
      effectiveDate: sql<string>`coalesce(${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn})`,
    }).from(teamFinancialEntries)
      .where(and(
        eq(teamFinancialEntries.teamId, context.teamId),
        eq(teamFinancialEntries.currency, currency),
        inArray(teamFinancialEntries.status, ['pending', 'overdue']),
        sql`coalesce(${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn}) <= ${horizon}`,
      )),
  ]);

  const currentBalance = accounts.reduce((sum, a) => sum + a.openingBalance, 0)
    + paidEntries.filter((e) => e.type === 'income').reduce((sum, e) => sum + e.amount, 0)
    - paidEntries.filter((e) => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);

  const buckets = new Map<string, { period: string; income: number; expense: number }>();
  for (const entry of pendingEntries) {
    const period = isoWeek(entry.effectiveDate);
    const bucket = buckets.get(period) ?? { period, income: 0, expense: 0 };
    if (entry.type === 'income') bucket.income += entry.amount;
    else bucket.expense += entry.amount;
    buckets.set(period, bucket);
  }
  let running = currentBalance;
  const projection = Array.from(buckets.values())
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((bucket) => {
      running = running + bucket.income - bucket.expense;
      return { ...bucket, projectedBalance: running };
    });

  return { currency, horizon, currentBalance, projection };
}

async function meetingAgenda(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'calendarRead', 'calendar');
  const data = parse(z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    kind: z.enum(['meeting', 'call']).optional(),
    user_id: z.number().int().positive().optional(),
  }), input);

  const from = data.from ? new Date(data.from) : new Date();
  const to = data.to ? new Date(data.to) : new Date(Date.now() + 7 * 86400000);

  const conditions = [
    eq(teamEvents.teamId, context.teamId),
    gte(teamEvents.startsAt, from),
    lte(teamEvents.startsAt, to),
  ];
  if (data.kind) conditions.push(eq(teamEvents.kind, data.kind));

  let eventIds: number[] | null = null;
  if (data.user_id) {
    const participantRows = await db.select({ eventId: teamEventParticipants.eventId })
      .from(teamEventParticipants)
      .where(and(eq(teamEventParticipants.teamId, context.teamId), eq(teamEventParticipants.userId, data.user_id)));
    eventIds = participantRows.map((r) => r.eventId);
    if (eventIds.length === 0) return { count: 0, events: [] };
    conditions.push(inArray(teamEvents.id, eventIds));
  }

  const rows = await db.select({
    id: teamEvents.id,
    title: teamEvents.title,
    kind: teamEvents.kind,
    subtype: teamEvents.subtype,
    startsAt: teamEvents.startsAt,
    endsAt: teamEvents.endsAt,
    status: teamEvents.status,
    outcome: teamEvents.outcome,
    nextAction: teamEvents.nextAction,
    customerId: teamEvents.customerId,
    customerName: teamCustomers.name,
  }).from(teamEvents)
    .leftJoin(teamCustomers, eq(teamEvents.customerId, teamCustomers.id))
    .where(and(...conditions))
    .orderBy(asc(teamEvents.startsAt))
    .limit(200);

  return { count: rows.length, events: rows };
}

async function generateTasksFromNote(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'tasksWrite');
  const data = parse(z.object({ note_id: z.number().int().positive() }), input);
  const note = await generateTasksFromNoteCommitments({ teamId: context.teamId, userId: context.userId, noteId: data.note_id });
  if (!note) throw new Error('Note not found.');
  await audit(context, 'GROK_NOTE_TASKS_GENERATED', data.note_id);
  return { note_id: note.id, commitments: note.commitments };
}

export async function executeBusinessOsReadTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_finance_summary') return financeSummary(input, context);
  if (name === 'whatspro_finance_receivables_payables') return financeReceivablesPayables(input, context);
  if (name === 'whatspro_finance_cashflow_projection') return financeCashflowProjection(input, context);
  if (name === 'whatspro_meeting_agenda') return meetingAgenda(input, context);
  throw new Error(`Unknown business-os read tool: ${name}`);
}

export async function executeBusinessOsAction(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_generate_tasks_from_note') return generateTasksFromNote(input, context);
  throw new Error(`Unknown business-os action: ${name}`);
}
