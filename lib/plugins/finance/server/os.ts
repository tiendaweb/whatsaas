import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  contacts,
  teamCustomerContacts,
  teamCustomers,
  teamCustomerTransactions,
  teamFinancialEntries,
  teamMembershipCompanies,
  teamMembershipPlans,
  teamMembershipSubscriptions,
  teamSales,
} from '@/lib/db/schema';

/**
 * Capa de datos de Finanzas OS (la app a pantalla completa del plugin
 * Financiero). Todo se agrega POR MONEDA y en centavos: las monedas nunca se
 * suman entre sí (regla de la casa, ver lib/contacts/graph.ts).
 *
 * El volumen por equipo es chico (decenas/cientos de filas), así que las
 * agregaciones se hacen en JS después de un select simple: evita la trampa de
 * date_trunc con parámetro en el GROUP BY de drizzle y deja una sola fuente de
 * verdad para los redondeos.
 */

export type MoneyMap = Record<string, number>;

/** Monedas basura (la tabla de transacciones de pasarela trae strings sucios). */
export function sanitizeCurrency(raw: string | null | undefined): string {
  const value = (raw ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : 'OTR';
}

function add(map: MoneyMap, currency: string | null | undefined, cents: number) {
  const key = sanitizeCurrency(currency);
  map[key] = (map[key] ?? 0) + cents;
}

const monthOf = (day: string) => day.slice(0, 7);

function monthsBack(count: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function isOverdue(entry: { status: string; dueOn: string | null }) {
  return entry.status === 'overdue' || (entry.status === 'pending' && !!entry.dueOn && entry.dueOn < todayIso());
}

async function allEntries(teamId: number) {
  return db
    .select({
      id: teamFinancialEntries.id,
      type: teamFinancialEntries.type,
      title: teamFinancialEntries.title,
      category: teamFinancialEntries.category,
      amount: teamFinancialEntries.amount,
      currency: teamFinancialEntries.currency,
      status: teamFinancialEntries.status,
      occurredOn: teamFinancialEntries.occurredOn,
      dueOn: teamFinancialEntries.dueOn,
      paidOn: teamFinancialEntries.paidOn,
      paymentMethod: teamFinancialEntries.paymentMethod,
      counterparty: teamFinancialEntries.counterparty,
      customerId: teamFinancialEntries.customerId,
      customerName: teamCustomers.name,
      subscriptionId: teamFinancialEntries.subscriptionId,
      saleId: teamFinancialEntries.saleId,
      description: teamFinancialEntries.description,
      createdAt: teamFinancialEntries.createdAt,
    })
    .from(teamFinancialEntries)
    .leftJoin(teamCustomers, eq(teamFinancialEntries.customerId, teamCustomers.id))
    .where(eq(teamFinancialEntries.teamId, teamId))
    .orderBy(desc(teamFinancialEntries.occurredOn), desc(teamFinancialEntries.id));
}

export type FinanceOsEntry = Awaited<ReturnType<typeof allEntries>>[number];

async function allSubs(teamId: number) {
  return db
    .select({
      id: teamMembershipSubscriptions.id,
      number: teamMembershipSubscriptions.subscriptionNumber,
      planId: teamMembershipSubscriptions.planId,
      planName: teamMembershipSubscriptions.planNameSnapshot,
      companyId: teamMembershipSubscriptions.companyId,
      customerId: teamMembershipSubscriptions.customerId,
      customerName: teamCustomers.name,
      price: teamMembershipSubscriptions.price,
      currency: teamMembershipSubscriptions.currency,
      billingType: teamMembershipSubscriptions.billingType,
      status: teamMembershipSubscriptions.status,
      paymentStatus: teamMembershipSubscriptions.paymentStatus,
      startDate: teamMembershipSubscriptions.startDate,
      endDate: teamMembershipSubscriptions.endDate,
    })
    .from(teamMembershipSubscriptions)
    .leftJoin(teamCustomers, eq(teamMembershipSubscriptions.customerId, teamCustomers.id))
    .where(eq(teamMembershipSubscriptions.teamId, teamId))
    .orderBy(desc(teamMembershipSubscriptions.id));
}

export type FinanceOsSub = Awaited<ReturnType<typeof allSubs>>[number];

function daysLeft(endDate: string | null): number | null {
  if (!endDate) return null;
  return Math.ceil((new Date(`${endDate}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
}

// ---------------------------------------------------------------- RESUMEN

export async function financeOsResumen(teamId: number) {
  const [entries, subs] = await Promise.all([allEntries(teamId), allSubs(teamId)]);
  const months = monthsBack(12);
  const currentMonth = months[months.length - 1];

  const mes = { income: {} as MoneyMap, expense: {} as MoneyMap, pendingIncome: {} as MoneyMap };
  const porCobrar: MoneyMap = {};
  const porPagar: MoneyMap = {};
  let vencidas = 0;
  const gastosPorCategoria = new Map<string, MoneyMap>();
  const serie = new Map<string, { income: MoneyMap; expense: MoneyMap }>(months.map((m) => [m, { income: {}, expense: {} }]));

  for (const e of entries) {
    if (e.status === 'cancelled') continue;
    const m = monthOf(e.occurredOn);
    if (serie.has(m) && e.status === 'paid') add(serie.get(m)![e.type], e.currency, e.amount);
    if (m === currentMonth) {
      if (e.status === 'paid') add(mes[e.type === 'income' ? 'income' : 'expense'], e.currency, e.amount);
      else if (e.type === 'income') add(mes.pendingIncome, e.currency, e.amount);
      if (e.type === 'expense') {
        const key = e.category || 'Sin categoría';
        if (!gastosPorCategoria.has(key)) gastosPorCategoria.set(key, {});
        add(gastosPorCategoria.get(key)!, e.currency, e.amount);
      }
    }
    if (e.status === 'pending' || e.status === 'overdue') {
      add(e.type === 'income' ? porCobrar : porPagar, e.currency, e.amount);
      if (isOverdue(e)) vencidas += 1;
    }
  }

  const membresias = {
    activas: { count: 0, byCurrency: {} as MoneyMap },
    pagoPendiente: { count: 0, byCurrency: {} as MoneyMap },
    porVencer30: 0,
  };
  for (const s of subs) {
    if (s.status !== 'active') continue;
    membresias.activas.count += 1;
    add(membresias.activas.byCurrency, s.currency, s.price);
    if (s.paymentStatus === 'pending') {
      membresias.pagoPendiente.count += 1;
      add(membresias.pagoPendiente.byCurrency, s.currency, s.price);
    }
    const left = daysLeft(s.endDate);
    if (left !== null && left >= 0 && left <= 30) membresias.porVencer30 += 1;
  }

  const resultado: MoneyMap = {};
  for (const [cur, v] of Object.entries(mes.income)) resultado[cur] = (resultado[cur] ?? 0) + v;
  for (const [cur, v] of Object.entries(mes.expense)) resultado[cur] = (resultado[cur] ?? 0) - v;

  return {
    month: currentMonth,
    mes: { ...mes, resultado },
    porCobrar,
    porPagar,
    vencidas,
    membresias,
    gastosPorCategoria: [...gastosPorCategoria.entries()]
      .map(([categoria, byCurrency]) => ({ categoria, byCurrency }))
      .sort((a, b) => Math.max(...Object.values(b.byCurrency), 0) - Math.max(...Object.values(a.byCurrency), 0)),
    serie: months.map((m) => ({ month: m, ...serie.get(m)! })),
    ultimos: entries.slice(0, 8),
  };
}

// ------------------------------------------------------------ MOVIMIENTOS

export type MovimientosFilters = {
  type?: 'income' | 'expense';
  status?: string;
  currency?: string;
  category?: string;
  q?: string;
  month?: string;
  page?: number;
  perPage?: number;
};

export async function financeOsMovimientos(teamId: number, filters: MovimientosFilters) {
  const entries = await allEntries(teamId);
  const q = filters.q?.trim().toLowerCase();
  const filtered = entries.filter((e) => {
    if (filters.type && e.type !== filters.type) return false;
    if (filters.status === 'overdue' ? !isOverdue(e) : filters.status && e.status !== filters.status) return false;
    if (filters.currency && sanitizeCurrency(e.currency) !== filters.currency.toUpperCase()) return false;
    if (filters.category && e.category !== filters.category) return false;
    if (filters.month && monthOf(e.occurredOn) !== filters.month) return false;
    if (q && !`${e.title} ${e.description} ${e.counterparty ?? ''} ${e.customerName ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const perPage = Math.min(Math.max(filters.perPage ?? 40, 10), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const totals = { income: {} as MoneyMap, expense: {} as MoneyMap };
  for (const e of filtered) {
    if (e.status === 'cancelled') continue;
    add(totals[e.type], e.currency, e.amount);
  }

  return {
    total: filtered.length,
    page,
    perPage,
    totals,
    rows: filtered.slice((page - 1) * perPage, page * perPage).map((e) => ({ ...e, overdue: isOverdue(e) })),
    facets: {
      categories: [...new Set(entries.map((e) => e.category).filter(Boolean))].sort(),
      currencies: [...new Set(entries.map((e) => sanitizeCurrency(e.currency)))].sort(),
      months: [...new Set(entries.map((e) => monthOf(e.occurredOn)))].sort().reverse(),
    },
  };
}

// ------------------------------------------------------------- MEMBRESÍAS

export async function financeOsMembresias(teamId: number) {
  const [subs, companies, plans] = await Promise.all([
    allSubs(teamId),
    db.select().from(teamMembershipCompanies).where(eq(teamMembershipCompanies.teamId, teamId)),
    db.select().from(teamMembershipPlans).where(eq(teamMembershipPlans.teamId, teamId)),
  ]);

  const byCompany = new Map<number | null, FinanceOsSub[]>();
  for (const s of subs) {
    const key = s.companyId ?? null;
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(s);
  }

  const activePerPlan = new Map<number, number>();
  for (const s of subs) {
    if (s.status === 'active' && s.planId) activePerPlan.set(s.planId, (activePerPlan.get(s.planId) ?? 0) + 1);
  }

  const buildCompany = (id: number | null, name: string) => {
    const rows = byCompany.get(id) ?? [];
    const activas = { count: 0, byCurrency: {} as MoneyMap };
    const pagoPendiente = { count: 0, byCurrency: {} as MoneyMap };
    let vencidas = 0;
    let porVencer30 = 0;
    for (const s of rows) {
      if (s.status === 'active') {
        activas.count += 1;
        add(activas.byCurrency, s.currency, s.price);
        if (s.paymentStatus === 'pending') {
          pagoPendiente.count += 1;
          add(pagoPendiente.byCurrency, s.currency, s.price);
        }
        const left = daysLeft(s.endDate);
        if (left !== null && left >= 0 && left <= 30) porVencer30 += 1;
      } else if (s.status === 'expired') vencidas += 1;
    }
    return {
      companyId: id,
      name,
      activas,
      pagoPendiente,
      vencidas,
      porVencer30,
      plans: plans
        .filter((p) => (p.companyId ?? null) === id)
        .map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, billingType: p.billingType, status: p.status, activeSubs: activePerPlan.get(p.id) ?? 0 }))
        .sort((a, b) => b.activeSubs - a.activeSubs),
    };
  };

  const result = companies.map((c) => buildCompany(c.id, c.name));
  if (byCompany.has(null) || plans.some((p) => p.companyId === null)) result.push(buildCompany(null, 'Sin empresa'));
  return { companies: result.sort((a, b) => b.activas.count - a.activas.count) };
}

export type SuscripcionesFilters = {
  companyId?: number | null;
  status?: string;
  paymentStatus?: string;
  q?: string;
  expiringDays?: number;
  page?: number;
  perPage?: number;
};

export async function financeOsSuscripciones(teamId: number, filters: SuscripcionesFilters) {
  const subs = await allSubs(teamId);
  const q = filters.q?.trim().toLowerCase();
  const filtered = subs.filter((s) => {
    if (filters.companyId !== undefined && (s.companyId ?? null) !== filters.companyId) return false;
    if (filters.status && s.status !== filters.status) return false;
    if (filters.paymentStatus && s.paymentStatus !== filters.paymentStatus) return false;
    if (filters.expiringDays !== undefined) {
      const left = daysLeft(s.endDate);
      if (s.status !== 'active' || left === null || left < 0 || left > filters.expiringDays) return false;
    }
    if (q && !`${s.customerName ?? ''} ${s.planName} ${s.number}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const perPage = Math.min(Math.max(filters.perPage ?? 40, 10), 100);
  const page = Math.max(filters.page ?? 1, 1);
  return {
    total: filtered.length,
    page,
    perPage,
    rows: filtered.slice((page - 1) * perPage, page * perPage).map((s) => ({ ...s, daysLeft: daysLeft(s.endDate) })),
  };
}

// --------------------------------------------------------------- CLIENTES

export type ClientesFilters = { q?: string; conDeuda?: boolean; conMembresia?: boolean; page?: number; perPage?: number };

export async function financeOsClientes(teamId: number, filters: ClientesFilters) {
  const [customers, entries, subs] = await Promise.all([
    db
      .select({ id: teamCustomers.id, name: teamCustomers.name, email: teamCustomers.email, phone: teamCustomers.phone, status: teamCustomers.status, source: teamCustomers.source, createdAt: teamCustomers.createdAt })
      .from(teamCustomers)
      .where(eq(teamCustomers.teamId, teamId)),
    allEntries(teamId),
    allSubs(teamId),
  ]);

  const money = new Map<number, { pending: MoneyMap; paid: MoneyMap }>();
  for (const e of entries) {
    if (!e.customerId || e.type !== 'income' || e.status === 'cancelled') continue;
    if (!money.has(e.customerId)) money.set(e.customerId, { pending: {}, paid: {} });
    add(money.get(e.customerId)![e.status === 'paid' ? 'paid' : 'pending'], e.currency, e.amount);
  }
  const subsPerCustomer = new Map<number, { active: number; pendingPay: number; membershipPending: MoneyMap; nextEnd: string | null }>();
  for (const s of subs) {
    if (!s.customerId) continue;
    if (!subsPerCustomer.has(s.customerId)) subsPerCustomer.set(s.customerId, { active: 0, pendingPay: 0, membershipPending: {}, nextEnd: null });
    const agg = subsPerCustomer.get(s.customerId)!;
    if (s.status === 'active') {
      agg.active += 1;
      if (s.paymentStatus === 'pending') {
        agg.pendingPay += 1;
        add(agg.membershipPending, s.currency, s.price);
      }
      if (s.endDate && (!agg.nextEnd || s.endDate < agg.nextEnd)) agg.nextEnd = s.endDate;
    }
  }

  const q = filters.q?.trim().toLowerCase();
  const rows = customers
    .map((c) => {
      const m = money.get(c.id) ?? { pending: {}, paid: {} };
      const s = subsPerCustomer.get(c.id) ?? { active: 0, pendingPay: 0, membershipPending: {}, nextEnd: null };
      const hasDebt = Object.keys(m.pending).length > 0 || s.pendingPay > 0;
      return { ...c, pendingByCurrency: m.pending, paidByCurrency: m.paid, membershipPendingByCurrency: s.membershipPending, activeMemberships: s.active, nextExpiration: s.nextEnd, hasDebt };
    })
    .filter((c) => {
      if (q && !`${c.name} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(q)) return false;
      if (filters.conDeuda && !c.hasDebt) return false;
      if (filters.conMembresia && c.activeMemberships === 0) return false;
      return true;
    })
    .sort((a, b) => Number(b.hasDebt) - Number(a.hasDebt) || b.activeMemberships - a.activeMemberships || a.name.localeCompare(b.name));

  const perPage = Math.min(Math.max(filters.perPage ?? 40, 10), 100);
  const page = Math.max(filters.page ?? 1, 1);
  return { total: rows.length, page, perPage, rows: rows.slice((page - 1) * perPage, page * perPage) };
}

export async function financeOsClienteFicha(teamId: number, customerId: number) {
  const [customer] = await db
    .select()
    .from(teamCustomers)
    .where(and(eq(teamCustomers.teamId, teamId), eq(teamCustomers.id, customerId)))
    .limit(1);
  if (!customer) return null;

  const [linkedContacts, entries, subs, sales, transactions] = await Promise.all([
    db
      .select({ contactId: contacts.id, name: contacts.name, email: contacts.email, chatId: contacts.chatId })
      .from(teamCustomerContacts)
      .innerJoin(contacts, eq(teamCustomerContacts.contactId, contacts.id))
      .where(and(eq(teamCustomerContacts.teamId, teamId), eq(teamCustomerContacts.customerId, customerId))),
    db
      .select()
      .from(teamFinancialEntries)
      .where(and(eq(teamFinancialEntries.teamId, teamId), eq(teamFinancialEntries.customerId, customerId)))
      .orderBy(desc(teamFinancialEntries.occurredOn))
      .limit(25),
    db
      .select()
      .from(teamMembershipSubscriptions)
      .where(and(eq(teamMembershipSubscriptions.teamId, teamId), eq(teamMembershipSubscriptions.customerId, customerId)))
      .orderBy(desc(teamMembershipSubscriptions.id)),
    db
      .select({ id: teamSales.id, saleNumber: teamSales.saleNumber, status: teamSales.status, currency: teamSales.currency, total: teamSales.total, createdAt: teamSales.createdAt })
      .from(teamSales)
      .where(and(eq(teamSales.teamId, teamId), eq(teamSales.customerId, customerId)))
      .orderBy(desc(teamSales.createdAt))
      .limit(10),
    db
      .select()
      .from(teamCustomerTransactions)
      .where(and(eq(teamCustomerTransactions.teamId, teamId), eq(teamCustomerTransactions.customerId, customerId)))
      .orderBy(desc(teamCustomerTransactions.transactionDate))
      .limit(15),
  ]);

  const pendingByCurrency: MoneyMap = {};
  const paidByCurrency: MoneyMap = {};
  for (const e of entries) {
    if (e.type !== 'income' || e.status === 'cancelled') continue;
    add(e.status === 'paid' ? paidByCurrency : pendingByCurrency, e.currency, e.amount);
  }

  return {
    customer,
    contacts: linkedContacts,
    pendingByCurrency,
    paidByCurrency,
    entries: entries.map((e) => ({ ...e, overdue: isOverdue(e) })),
    subscriptions: subs.map((s) => ({ ...s, daysLeft: daysLeft(s.endDate) })),
    sales,
    // Ojo: `amount` de la pasarela viene como texto EN UNIDADES (no centavos)
    // y `currency` a veces trae basura. Se sanea y se marca aparte.
    transactions: transactions.map((t) => ({
      id: t.id,
      gateway: t.gateway,
      paymentStatus: t.paymentStatus,
      currency: sanitizeCurrency(t.currency),
      amountUnits: Number.parseFloat(String(t.amount)) || 0,
      date: t.transactionDate,
    })),
  };
}

// ----------------------------------------------------------------- COBROS

export async function financeOsCobros(teamId: number) {
  const [entries, subs, gateway] = await Promise.all([
    allEntries(teamId),
    allSubs(teamId),
    db
      .select({
        id: teamCustomerTransactions.id,
        customerId: teamCustomerTransactions.customerId,
        customerName: teamCustomers.name,
        gateway: teamCustomerTransactions.gateway,
        paymentStatus: teamCustomerTransactions.paymentStatus,
        currency: teamCustomerTransactions.currency,
        amount: teamCustomerTransactions.amount,
        date: teamCustomerTransactions.transactionDate,
      })
      .from(teamCustomerTransactions)
      .leftJoin(teamCustomers, eq(teamCustomerTransactions.customerId, teamCustomers.id))
      .where(eq(teamCustomerTransactions.teamId, teamId))
      .orderBy(desc(teamCustomerTransactions.transactionDate))
      .limit(40),
  ]);

  const dueKey = (e: FinanceOsEntry) => e.dueOn ?? e.occurredOn;
  const receivables = entries
    .filter((e) => e.type === 'income' && (e.status === 'pending' || e.status === 'overdue'))
    .map((e) => ({ ...e, overdue: isOverdue(e) }))
    .sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
  const payables = entries
    .filter((e) => e.type === 'expense' && (e.status === 'pending' || e.status === 'overdue'))
    .map((e) => ({ ...e, overdue: isOverdue(e) }))
    .sort((a, b) => dueKey(a).localeCompare(dueKey(b)));

  const renovaciones = subs
    .filter((s) => s.status === 'active' && (s.paymentStatus === 'pending' || (daysLeft(s.endDate) ?? 99) <= 30))
    .map((s) => ({ ...s, daysLeft: daysLeft(s.endDate) }))
    .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999));

  const totalByCurrency = (rows: Array<{ currency: string; amount: number }>) => {
    const map: MoneyMap = {};
    rows.forEach((r) => add(map, r.currency, r.amount));
    return map;
  };

  return {
    receivables: { totalByCurrency: totalByCurrency(receivables), rows: receivables.slice(0, 60) },
    payables: { totalByCurrency: totalByCurrency(payables), rows: payables.slice(0, 60) },
    renovaciones: { count: renovaciones.length, rows: renovaciones.slice(0, 60) },
    pasarela: gateway.map((t) => ({
      id: t.id,
      customerId: t.customerId,
      customerName: t.customerName,
      gateway: t.gateway,
      paymentStatus: t.paymentStatus,
      currency: sanitizeCurrency(t.currency),
      amountUnits: Number.parseFloat(String(t.amount)) || 0,
      date: t.date,
    })),
  };
}
