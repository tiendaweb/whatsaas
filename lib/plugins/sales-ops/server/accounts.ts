import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  chats,
  contacts,
  teamCommercialAnalysis,
  teamCustomerContacts,
  teamCustomerStores,
  teamCustomerTransactions,
  teamCustomers,
  teamDomains,
  teamMembershipCompanies,
  teamMembershipSubscriptions,
  teamSales,
} from '@/lib/db/schema';
import { GATES, type Gate } from '../shared/taxonomy';
import type {
  AccountContact,
  AccountDetail,
  AccountKind,
  AccountRow,
  AccountSubscription,
  AccountTab,
  AccountsListPayload,
  AccountsListQuery,
  SetVisibilityInput,
  SetVisibilityPayload,
  Visibility,
} from '../shared/accounts-types';
import { getSalesOpsSettings, patchSalesOpsSettings } from './settings';

/**
 * Clientes · Empresas del Command Center: quién tiene membresía vigente, qué
 * links (tiendas, sitios, dominios) tiene y con qué contacto se habla.
 *
 * Todo se agrega en JS: el equipo 2 tiene ~300 clientes, ~250 membresías y
 * ~500 tiendas, así que se cargan enteras por equipo y se filtra en memoria.
 * Nada de fechas como parámetro en SQL (regla 7 del brief).
 *
 * Visibilidad: vive en los settings del plugin (`subscriptionVisibility`,
 * `accountVisibility`), nunca en las tablas del CRM ni de Membresías.
 */

const PENDING_SALE_STATUSES = ['draft', 'confirmed'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const ROW_CONTACTS_MAX = 4;

type SubRow = {
  id: number;
  subscriptionNumber: string;
  companyId: number | null;
  customerId: number | null;
  contactId: number | null;
  planNameSnapshot: string;
  price: number;
  currency: string;
  billingType: string;
  status: string;
  paymentStatus: string;
  startDate: string;
  endDate: string | null;
  notes: string;
};

type Ctx = {
  settings: Awaited<ReturnType<typeof getSalesOpsSettings>>;
  subs: SubRow[];
  subsByCustomer: Map<number, SubRow[]>;
  subsByCompany: Map<number, SubRow[]>;
  storesByCustomer: Map<number, number>;
  domainsByCustomer: Map<number, number>;
  contactIdsByCustomer: Map<number, number[]>;
  contactsById: Map<number, AccountContact>;
  lastPaidByCustomer: Map<number, string>;
  customerNames: Map<number, string>;
  companyNames: Map<number, string>;
};

// ── helpers ───────────────────────────────────────────────────────────────

/** Últimos 4 dígitos, nunca el número completo (regla 6). */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `•••• ${digits.slice(-4)}`;
}

/** Misma regla que `lib/aapp/client.ts#storeUrl`: dominio propio o `aapp.space/<slug>`. */
function storeUrl(store: { customDomain: string | null; cardUrl: string | null }): string | null {
  const domain = (store.customDomain ?? '').trim();
  if (domain) return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const slug = (store.cardUrl ?? '').trim().replace(/^\/+/, '');
  if (!slug) return null;
  return /^https?:\/\//i.test(slug) ? slug : `https://aapp.space/${slug}`;
}

/** Un contacto "sin nombre" en WhatsApp queda con el número como nombre: no se muestra entero. */
function safeContactName(name: string | null | undefined, phoneMasked: string | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return phoneMasked ?? 'Sin nombre';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 8 && digits.length >= trimmed.length - 4) return maskPhone(trimmed) ?? 'Sin nombre';
  return trimmed;
}

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Misma fórmula que `lib/contacts/graph.ts`: mediodía para que la zona horaria no mueva un día. */
export function daysLeft(endDate: string | null, hoy = startOfToday()): number | null {
  if (!endDate) return null;
  const ts = new Date(`${endDate}T12:00:00`).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.round((ts - hoy.getTime()) / 86_400_000);
}

function startOfToday(): Date {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy;
}

function asGate(value: string | null | undefined): Gate | null {
  return value && (GATES as readonly string[]).includes(value) ? (value as Gate) : null;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function accountKey(kind: AccountKind, id: number): string {
  return `${kind === 'customers' ? 'customer' : 'company'}:${id}`;
}

function accountVisibility(ctx: Ctx, kind: AccountKind, id: number): Visibility {
  return ctx.settings.accountVisibility[accountKey(kind, id)] ?? 'visible';
}

function subVisibility(ctx: Ctx, subId: number): Visibility {
  return ctx.settings.subscriptionVisibility[String(subId)] ?? 'visible';
}

/** Precio mensual en USD: centavos → unidades, anual /12, vitalicio y custom no suman. */
function monthlyUsd(ctx: Ctx, sub: SubRow): number {
  const units = sub.price / 100;
  const fx: Record<string, number> = { USD: 1, ...ctx.settings.fx };
  const rate = fx[sub.currency];
  if (!rate || rate <= 0) return 0;
  const usd = units / rate;
  if (sub.billingType === 'monthly') return usd;
  if (sub.billingType === 'annual') return usd / 12;
  return 0;
}

// ── carga por equipo ──────────────────────────────────────────────────────

async function loadContext(teamId: number): Promise<Ctx> {
  const [settings, subs, stores, domains, links, sales, transactions, customerNames, companyNames] = await Promise.all([
    getSalesOpsSettings(teamId),
    db
      .select({
        id: teamMembershipSubscriptions.id,
        subscriptionNumber: teamMembershipSubscriptions.subscriptionNumber,
        companyId: teamMembershipSubscriptions.companyId,
        customerId: teamMembershipSubscriptions.customerId,
        contactId: teamMembershipSubscriptions.contactId,
        planNameSnapshot: teamMembershipSubscriptions.planNameSnapshot,
        price: teamMembershipSubscriptions.price,
        currency: teamMembershipSubscriptions.currency,
        billingType: teamMembershipSubscriptions.billingType,
        status: teamMembershipSubscriptions.status,
        paymentStatus: teamMembershipSubscriptions.paymentStatus,
        startDate: teamMembershipSubscriptions.startDate,
        endDate: teamMembershipSubscriptions.endDate,
        notes: teamMembershipSubscriptions.notes,
      })
      .from(teamMembershipSubscriptions)
      .where(eq(teamMembershipSubscriptions.teamId, teamId))
      .orderBy(desc(teamMembershipSubscriptions.endDate)),
    db.select({ customerId: teamCustomerStores.customerId }).from(teamCustomerStores).where(eq(teamCustomerStores.teamId, teamId)),
    db.select({ customerId: teamDomains.customerId }).from(teamDomains).where(eq(teamDomains.teamId, teamId)),
    db
      .select({ customerId: teamCustomerContacts.customerId, contactId: teamCustomerContacts.contactId })
      .from(teamCustomerContacts)
      .where(eq(teamCustomerContacts.teamId, teamId)),
    db
      .select({ customerId: teamSales.customerId, contactId: teamSales.contactId, paidAt: teamSales.paidAt })
      .from(teamSales)
      .where(eq(teamSales.teamId, teamId)),
    db
      .select({ customerId: teamCustomerTransactions.customerId, date: teamCustomerTransactions.transactionDate })
      .from(teamCustomerTransactions)
      .where(eq(teamCustomerTransactions.teamId, teamId)),
    db.select({ id: teamCustomers.id, name: teamCustomers.name }).from(teamCustomers).where(eq(teamCustomers.teamId, teamId)),
    db.select({ id: teamMembershipCompanies.id, name: teamMembershipCompanies.name }).from(teamMembershipCompanies).where(eq(teamMembershipCompanies.teamId, teamId)),
  ]);

  const subsByCustomer = new Map<number, SubRow[]>();
  const subsByCompany = new Map<number, SubRow[]>();
  for (const s of subs) {
    if (s.customerId != null) push(subsByCustomer, s.customerId, s);
    if (s.companyId != null) push(subsByCompany, s.companyId, s);
  }

  const count = (rows: Array<{ customerId: number | null }>) => {
    const m = new Map<number, number>();
    for (const r of rows) if (r.customerId != null) m.set(r.customerId, (m.get(r.customerId) ?? 0) + 1);
    return m;
  };

  const contactIdsByCustomer = new Map<number, number[]>();
  for (const l of links) push(contactIdsByCustomer, l.customerId, l.contactId);

  // Contactos que importan: los vinculados al cliente + los de las membresías.
  const contactIds = new Set<number>();
  for (const l of links) contactIds.add(l.contactId);
  for (const s of subs) if (s.contactId != null) contactIds.add(s.contactId);
  const contactsById = await loadContacts(teamId, [...contactIds]);

  // Último cobro por cliente: ventas pagas (por cliente o por contacto) y transacciones importadas.
  const customerByContact = new Map<number, number>();
  for (const l of links) if (!customerByContact.has(l.contactId)) customerByContact.set(l.contactId, l.customerId);
  const lastPaidByCustomer = new Map<number, string>();
  const bump = (customerId: number | null | undefined, when: Date | null) => {
    if (customerId == null || !when) return;
    const value = iso(when);
    if (!value) return;
    const prev = lastPaidByCustomer.get(customerId);
    if (!prev || value > prev) lastPaidByCustomer.set(customerId, value);
  };
  for (const s of sales) bump(s.customerId ?? (s.contactId != null ? customerByContact.get(s.contactId) : null), s.paidAt);
  for (const t of transactions) bump(t.customerId, t.date);

  return {
    settings,
    subs,
    subsByCustomer,
    subsByCompany,
    storesByCustomer: count(stores),
    domainsByCustomer: count(domains),
    contactIdsByCustomer,
    contactsById,
    lastPaidByCustomer,
    customerNames: new Map(customerNames.map((c) => [c.id, c.name])),
    companyNames: new Map(companyNames.map((c) => [c.id, c.name])),
  };
}

async function loadContacts(teamId: number, ids: number[]): Promise<Map<number, AccountContact>> {
  const out = new Map<number, AccountContact>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: contacts.id, chatId: contacts.chatId, name: contacts.name, phone: contacts.phone, remoteJid: chats.remoteJid })
    .from(contacts)
    .leftJoin(chats, eq(chats.id, contacts.chatId))
    .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, ids)));
  const chatIds = rows.map((r) => r.chatId).filter((id): id is number => id != null);
  const gates = new Map<number, Gate | null>();
  if (chatIds.length > 0) {
    const analyses = await db
      .select({ chatId: teamCommercialAnalysis.chatId, gate: teamCommercialAnalysis.currentGate })
      .from(teamCommercialAnalysis)
      .where(and(eq(teamCommercialAnalysis.teamId, teamId), inArray(teamCommercialAnalysis.chatId, chatIds)));
    for (const a of analyses) gates.set(a.chatId, asGate(a.gate));
  }
  for (const r of rows) {
    const phoneMasked = maskPhone(r.phone ?? r.remoteJid);
    out.set(r.id, {
      contactId: r.id,
      chatId: r.chatId ?? null,
      name: safeContactName(r.name, phoneMasked),
      phoneMasked,
      gate: r.chatId != null ? (gates.get(r.chatId) ?? null) : null,
    });
  }
  return out;
}

// ── agregación por cuenta ─────────────────────────────────────────────────

type AccountBase = {
  id: number;
  name: string;
  avatarUrl: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  industry: string | null;
  status: string;
  since: Date | null;
  notes: string;
};

type Aggregated = { row: AccountRow; subs: SubRow[]; notes: string; customerIds: number[] };

function aggregate(ctx: Ctx, kind: AccountKind, base: AccountBase): Aggregated {
  const subs = (kind === 'customers' ? ctx.subsByCustomer.get(base.id) : ctx.subsByCompany.get(base.id)) ?? [];
  const visibility = accountVisibility(ctx, kind, base.id);

  let active = 0;
  let expired = 0;
  let pending = 0;
  let privateCount = 0;
  let hiddenCount = 0;
  let monthly = 0;
  const customerIds = new Set<number>();
  const contactIds = new Set<number>();
  if (kind === 'customers') {
    customerIds.add(base.id);
    for (const c of ctx.contactIdsByCustomer.get(base.id) ?? []) contactIds.add(c);
  }
  for (const s of subs) {
    const v = subVisibility(ctx, s.id);
    if (s.customerId != null) customerIds.add(s.customerId);
    if (s.contactId != null) contactIds.add(s.contactId);
    if (v === 'private') privateCount += 1;
    if (v === 'hidden') hiddenCount += 1;
    if (v !== 'visible') continue;
    if (s.status === 'active') {
      active += 1;
      if (s.paymentStatus !== 'paid') pending += 1;
      monthly += monthlyUsd(ctx, s);
    } else if (s.status === 'expired') expired += 1;
  }

  let stores = 0;
  let domains = 0;
  let lastPaidAt: string | null = null;
  for (const cid of customerIds) {
    stores += ctx.storesByCustomer.get(cid) ?? 0;
    domains += ctx.domainsByCustomer.get(cid) ?? 0;
    const paid = ctx.lastPaidByCustomer.get(cid);
    if (paid && (!lastPaidAt || paid > lastPaidAt)) lastPaidAt = paid;
  }

  const contactList: AccountContact[] = [];
  for (const cid of contactIds) {
    const c = ctx.contactsById.get(cid);
    if (c) contactList.push(c);
  }

  const row: AccountRow = {
    kind,
    id: base.id,
    name: base.name,
    avatarUrl: base.avatarUrl,
    website: base.website,
    email: base.email,
    phoneMasked: maskPhone(base.phone),
    industry: base.industry,
    status: base.status,
    visibility,
    subscriptions: { active, expired, pending, totalMonthlyUsd: active > 0 ? Math.round(monthly * 100) / 100 : null, privateCount, hiddenCount },
    links: { stores, domains },
    contacts: contactList,
    lastPaidAt,
    since: iso(base.since),
  };
  return { row, subs, notes: base.notes, customerIds: [...customerIds] };
}

/**
 * A qué pestañas pertenece una cuenta. Una cuenta puede estar en varias
 * (p. ej. "vencidas" y "todas"); "ocultas" es excluyente con el resto salvo
 * que la cuenta sea visible y sólo tenga alguna membresía oculta.
 */
function tabsFor(ctx: Ctx, agg: Aggregated): Set<AccountTab> {
  const tabs = new Set<AccountTab>();
  const { row, subs } = agg;
  const vis = row.visibility;
  if (vis === 'hidden') {
    tabs.add('ocultas');
    return tabs;
  }
  tabs.add('todas');
  if (row.subscriptions.hiddenCount > 0) tabs.add('ocultas');

  const activeNotHidden = subs.some((s) => s.status === 'active' && subVisibility(ctx, s.id) !== 'hidden');
  const expiredNotHidden = subs.some((s) => s.status === 'expired' && subVisibility(ctx, s.id) !== 'hidden');

  if (vis === 'private') {
    tabs.add('privadas');
  } else {
    if (row.subscriptions.active > 0) tabs.add('en_venta');
    if (row.subscriptions.privateCount > 0) tabs.add('privadas');
  }
  if (expiredNotHidden && !activeNotHidden) tabs.add('vencidas');
  return tabs;
}

function matches(q: string, row: AccountRow): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const digits = q.replace(/\D/g, '');
  const hay = [row.name, row.email, row.website, row.industry].filter(Boolean).join(' ').toLowerCase();
  if (hay.includes(needle)) return true;
  if (digits.length >= 3 && row.phoneMasked && row.phoneMasked.endsWith(digits.slice(-4))) return true;
  return row.contacts.some((c) => c.name.toLowerCase().includes(needle) || (digits.length >= 3 && c.phoneMasked?.endsWith(digits.slice(-4))));
}

async function loadBases(teamId: number, kind: AccountKind, id?: number): Promise<AccountBase[]> {
  if (kind === 'customers') {
    const rows = await db
      .select({
        id: teamCustomers.id,
        name: teamCustomers.name,
        avatarUrl: teamCustomers.profileImage,
        website: teamCustomers.website,
        email: teamCustomers.email,
        phone: teamCustomers.phone,
        industry: teamCustomers.industry,
        status: teamCustomers.status,
        since: teamCustomers.customerSince,
        createdAt: teamCustomers.createdAt,
        notes: teamCustomers.notes,
      })
      .from(teamCustomers)
      .where(id != null ? and(eq(teamCustomers.teamId, teamId), eq(teamCustomers.id, id)) : eq(teamCustomers.teamId, teamId));
    return rows.map((r) => ({ ...r, since: r.since ?? r.createdAt }));
  }
  const rows = await db
    .select({
      id: teamMembershipCompanies.id,
      name: teamMembershipCompanies.name,
      avatarUrl: teamMembershipCompanies.logoUrl,
      website: teamMembershipCompanies.website,
      email: teamMembershipCompanies.email,
      phone: teamMembershipCompanies.phone,
      status: teamMembershipCompanies.status,
      createdAt: teamMembershipCompanies.createdAt,
      notes: teamMembershipCompanies.notes,
    })
    .from(teamMembershipCompanies)
    .where(id != null ? and(eq(teamMembershipCompanies.teamId, teamId), eq(teamMembershipCompanies.id, id)) : eq(teamMembershipCompanies.teamId, teamId));
  return rows.map((r) => ({ ...r, industry: null, since: r.createdAt }));
}

// ── API pública ───────────────────────────────────────────────────────────

export async function listAccounts(teamId: number, query: AccountsListQuery): Promise<AccountsListPayload> {
  const kind: AccountKind = query.kind === 'companies' ? 'companies' : 'customers';
  const tab: AccountTab = query.tab ?? 'en_venta';
  const limit = Math.min(MAX_LIMIT, Math.max(1, query.limit ?? DEFAULT_LIMIT));
  const offset = Math.max(0, Number.parseInt(query.cursor ?? '0', 10) || 0);
  const q = (query.q ?? '').trim();

  const [ctx, bases] = await Promise.all([loadContext(teamId), loadBases(teamId, kind)]);

  const counts: Record<AccountTab, number> = { en_venta: 0, privadas: 0, vencidas: 0, ocultas: 0, todas: 0 };
  const selected: AccountRow[] = [];
  for (const base of bases) {
    const agg = aggregate(ctx, kind, base);
    if (!matches(q, agg.row)) continue;
    const tabs = tabsFor(ctx, agg);
    for (const t of tabs) counts[t] += 1;
    if (tabs.has(tab)) selected.push(agg.row);
  }

  // Orden: más activas primero, después último cobro, después nombre.
  selected.sort((a, b) => {
    if (b.subscriptions.active !== a.subscriptions.active) return b.subscriptions.active - a.subscriptions.active;
    const pa = a.lastPaidAt ?? '';
    const pb = b.lastPaidAt ?? '';
    if (pa !== pb) return pb.localeCompare(pa);
    return a.name.localeCompare(b.name, 'es');
  });

  const page = selected.slice(offset, offset + limit).map((row) => ({ ...row, contacts: row.contacts.slice(0, ROW_CONTACTS_MAX) }));
  const next = offset + limit;
  return { rows: page, total: selected.length, nextCursor: next < selected.length ? String(next) : null, counts };
}

export async function getAccountDetail(teamId: number, input: { kind: AccountKind; id: number }): Promise<AccountDetail | null> {
  const kind: AccountKind = input.kind === 'companies' ? 'companies' : 'customers';
  const [ctx, bases] = await Promise.all([loadContext(teamId), loadBases(teamId, kind, input.id)]);
  const base = bases[0];
  if (!base) return null;
  const agg = aggregate(ctx, kind, base);
  const hoy = startOfToday();

  const subscriptions: AccountSubscription[] = agg.subs.map((s) => ({
    id: s.id,
    number: s.subscriptionNumber,
    planName: s.planNameSnapshot,
    price: s.price,
    currency: s.currency,
    billingType: s.billingType,
    status: s.status,
    paymentStatus: s.paymentStatus,
    startDate: s.startDate,
    endDate: s.endDate,
    daysLeft: daysLeft(s.endDate, hoy),
    visibility: subVisibility(ctx, s.id),
    contactId: s.contactId,
    contactName: s.contactId != null ? (ctx.contactsById.get(s.contactId)?.name ?? null) : null,
    companyName: s.companyId != null ? (ctx.companyNames.get(s.companyId) ?? null) : null,
    customerName: s.customerId != null ? (ctx.customerNames.get(s.customerId) ?? null) : null,
    notes: s.notes,
  }));
  // Activas primero, después por vencimiento más cercano.
  const rank: Record<string, number> = { active: 0, pending: 1, expired: 2, cancelled: 3 };
  subscriptions.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999'));

  const customerIds = agg.customerIds;
  const contactIds = agg.row.contacts.map((c) => c.contactId);

  const [storeRows, domainRows, saleRows] = await Promise.all([
    customerIds.length
      ? db
          .select({
            id: teamCustomerStores.id,
            cardType: teamCustomerStores.cardType,
            title: teamCustomerStores.title,
            cardUrl: teamCustomerStores.cardUrl,
            customDomain: teamCustomerStores.customDomain,
            status: teamCustomerStores.status,
            profileImage: teamCustomerStores.profileImage,
          })
          .from(teamCustomerStores)
          .where(and(eq(teamCustomerStores.teamId, teamId), inArray(teamCustomerStores.customerId, customerIds)))
      : Promise.resolve([]),
    customerIds.length || contactIds.length
      ? db
          .select({
            id: teamDomains.id,
            name: teamDomains.name,
            status: teamDomains.status,
            expiresAt: teamDomains.expiresAt,
            customerId: teamDomains.customerId,
            contactId: teamDomains.contactId,
          })
          .from(teamDomains)
          .where(eq(teamDomains.teamId, teamId))
      : Promise.resolve([]),
    customerIds.length || contactIds.length
      ? db
          .select({
            id: teamSales.id,
            number: teamSales.saleNumber,
            status: teamSales.status,
            total: teamSales.total,
            currency: teamSales.currency,
            paidAt: teamSales.paidAt,
            customerId: teamSales.customerId,
            contactId: teamSales.contactId,
          })
          .from(teamSales)
          .where(eq(teamSales.teamId, teamId))
      : Promise.resolve([]),
  ]);

  const cset = new Set(customerIds);
  const kset = new Set(contactIds);
  const mine = (r: { customerId: number | null; contactId: number | null }) =>
    (r.customerId != null && cset.has(r.customerId)) || (r.contactId != null && kset.has(r.contactId));

  const stores = storeRows.map((s) => ({
    id: s.id,
    cardType: s.cardType,
    title: s.title,
    url: storeUrl(s),
    customDomain: s.customDomain?.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '') || null,
    status: s.status,
    profileImage: s.profileImage,
  }));

  const domains = domainRows
    .filter(mine)
    .map((d) => ({ id: d.id, name: d.name, status: d.status, expiresAt: iso(d.expiresAt) }))
    .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));

  const paid: Record<string, number> = {};
  const pending: Record<string, number> = {};
  const sales = saleRows
    .filter(mine)
    .map((s) => {
      if (PENDING_SALE_STATUSES.includes(s.status)) pending[s.currency] = (pending[s.currency] ?? 0) + s.total;
      else if (s.paidAt) paid[s.currency] = (paid[s.currency] ?? 0) + s.total;
      return { id: s.id, number: s.number, status: s.status, total: s.total, currency: s.currency, paidAt: iso(s.paidAt) };
    })
    .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''));

  const activeSubscriptions: Record<string, number> = {};
  for (const s of subscriptions) {
    if (s.status === 'active' && s.visibility !== 'hidden') activeSubscriptions[s.currency] = (activeSubscriptions[s.currency] ?? 0) + s.price;
  }

  return {
    account: { ...agg.row, notes: agg.notes },
    subscriptions,
    stores,
    domains,
    contacts: agg.row.contacts,
    sales,
    moneyByCurrency: { paid, pending, activeSubscriptions },
  };
}

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/accounts] audit', error);
  }
}

/** `visible` borra la clave; `private`/`hidden` la escriben. Valida que el objetivo sea del equipo. */
export async function setVisibility(teamId: number, userId: number, input: SetVisibilityInput): Promise<SetVisibilityPayload> {
  const { target, id, visibility } = input;
  if (!Number.isInteger(id) || id <= 0) throw new Error('id inválido');

  let exists = false;
  if (target === 'subscription') {
    const [row] = await db
      .select({ id: teamMembershipSubscriptions.id })
      .from(teamMembershipSubscriptions)
      .where(and(eq(teamMembershipSubscriptions.teamId, teamId), eq(teamMembershipSubscriptions.id, id)))
      .limit(1);
    exists = Boolean(row);
  } else if (target === 'customer') {
    const [row] = await db.select({ id: teamCustomers.id }).from(teamCustomers).where(and(eq(teamCustomers.teamId, teamId), eq(teamCustomers.id, id))).limit(1);
    exists = Boolean(row);
  } else {
    const [row] = await db
      .select({ id: teamMembershipCompanies.id })
      .from(teamMembershipCompanies)
      .where(and(eq(teamMembershipCompanies.teamId, teamId), eq(teamMembershipCompanies.id, id)))
      .limit(1);
    exists = Boolean(row);
  }
  if (!exists) throw new Error('No existe en este equipo');

  const settings = await getSalesOpsSettings(teamId);
  const key = target === 'subscription' ? String(id) : accountKey(target === 'customer' ? 'customers' : 'companies', id);
  const field = target === 'subscription' ? 'subscriptionVisibility' : 'accountVisibility';
  const map = { ...settings[field] };
  const previous: Visibility = map[key] ?? 'visible';
  if (visibility === 'visible') delete map[key];
  else map[key] = visibility;
  await patchSalesOpsSettings(teamId, userId, field === 'subscriptionVisibility' ? { subscriptionVisibility: map } : { accountVisibility: map });
  await audit(teamId, userId, 'SALES_OPS_VISIBILITY', { target, id, from: previous, to: visibility });
  return { ok: true, target, id, visibility };
}
