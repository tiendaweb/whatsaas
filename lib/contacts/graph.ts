import 'server-only';

import { and, asc, desc, eq, gte, inArray, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  contacts,
  teamCustomerTransactions,
  teamMembershipSubscriptions,
  teamCustomerContacts,
  teamCustomers,
  teamDeals,
  teamEvents,
  teamFinancialEntries,
  teamSales,
  users,
} from '@/lib/db/schema';
import { CLOSED_STAGES, OPEN_STAGES } from '@/lib/deals/types';

/**
 * Lo comercial de un contacto, en una sola consulta y con firma `(teamId, …)`.
 *
 * Por qué vive acá y no dentro de una ruta HTTP ni del conector: lo consumen
 * dos superficies que TIENEN que decir lo mismo — el panel lateral del chat y
 * las herramientas MCP. `whatspro_contact_graph` ya juntaba cliente, tareas y
 * suscripciones, pero esa lógica estaba encerrada en el código del conector,
 * inalcanzable para la UI; y ninguna de las dos sabía contestar lo único que
 * decide una respuesta mientras hablás con alguien: qué le estás vendiendo,
 * cuánto te debe y cuándo lo ves.
 *
 * Tres reglas que no se aflojan:
 *
 * 1. **Las monedas no se suman entre sí.** Todo total es `Record<moneda, importe>`
 *    y los importes van en la unidad menor (centavos), igual que `team_sales.total`
 *    y `team_deals.value`. Un solo número "total" sería mentira en cuanto haya
 *    dos monedas, y acá las hay.
 * 2. **Un cliente puede tener varios contactos.** Las ventas cuelgan del
 *    contacto, no del cliente, así que la plata se busca sobre TODOS los
 *    contactos del mismo cliente. Mirar sólo el chat abierto deja deuda afuera.
 * 3. **Nada se agrega en SQL con fechas.** Los `FILTER` con `Date` pasan el
 *    build y explotan en runtime; los totales se arman en JS sobre un conjunto
 *    que, por contacto, siempre es chico.
 */

const PENDING_SALE_STATUSES = ['draft', 'confirmed'];

export type ContactScope = {
  contactId: number;
  name: string;
  chatId: number;
  customerId: number | null;
  customerName: string | null;
  /** El contacto abierto MÁS los otros contactos del mismo cliente. */
  contactIds: number[];
  siblings: Array<{ contactId: number; name: string }>;
};

export type ContactDeal = {
  dealId: number;
  title: string;
  stage: string;
  value: number;
  currency: string;
  probability: number;
  expectedCloseDate: string | null;
  ownerName: string | null;
  isOpen: boolean;
  closedAt: string | null;
};

export type ContactMoney = {
  pendingCount: number;
  /** Adeudado por moneda, en la unidad menor. */
  pendingByCurrency: Record<string, number>;
  /** Cobrado histórico por moneda, en la unidad menor. */
  paidByCurrency: Record<string, number>;
  nextDueDate: string | null;
  overdueCount: number;
  sales: Array<{
    saleId: number;
    saleNumber: string;
    status: string;
    total: number;
    currency: string;
    dueDate: string | null;
    overdue: boolean;
  }>;
  /**
   * Asientos de INGRESO de Finanzas del cliente vinculado. Es donde está la
   * plata de verdad: `team_sales` puede estar casi vacía y aun así la persona
   * tener cobros hechos y por hacer cargados como movimientos financieros.
   * Los pendientes ya están sumados en `pendingByCurrency` y los cobrados en
   * `paidByCurrency`, así que esto es el detalle, no un total aparte.
   */
  entries: Array<{
    entryId: number;
    title: string;
    status: string;
    /** Lo facturado. Lo que falta cobrar sale de `pending`. */
    amount: number;
    /** Lo que falta cobrar (monto menos pagos parciales); 0 si ya está cobrado. */
    pending: number;
    currency: string;
    dueDate: string | null;
    overdue: boolean;
  }>;
};

export type ContactSubscription = {
  subscriptionId: number;
  planName: string;
  price: number;
  currency: string;
  billingType: string;
  /** active | pending | expired | cancelled */
  status: string;
  /** paid | pending | overdue — es un eje SEPARADO del anterior. */
  paymentStatus: string;
  startDate: string;
  /** NULL en los planes sin vencimiento (gratis / de por vida). */
  endDate: string | null;
  /** Días hasta el vencimiento. Negativo = ya venció. Null = sin vencimiento. */
  daysLeft: number | null;
};

export type ContactSubscriptions = {
  active: ContactSubscription[];
  /** La que venció más recientemente, para poder ofrecer la renovación. */
  lastExpired: ContactSubscription | null;
  /** Activas cuyo pago no entró: usan el servicio sin haber pagado. */
  unpaid: ContactSubscription[];
  activeByCurrency: Record<string, number>;
  /** El vencimiento más próximo entre las activas. */
  nextRenewal: string | null;
  lastPayment: { amount: string; currency: string | null; gateway: string | null; date: string | null } | null;
};

export type ContactAgenda = {
  next: ContactEvent | null;
  last: ContactEvent | null;
};

export type ContactEvent = {
  eventId: number;
  title: string;
  startsAt: string;
  kind: string;
  subtype: string | null;
  status: string;
  outcome: string;
  nextAction: string;
};

export type SnapshotSection = 'deals' | 'money' | 'agenda' | 'subscriptions';

export type ContactCommercialSnapshot = {
  scope: ContactScope;
  deals: { open: ContactDeal[]; lastClosed: ContactDeal | null; openByCurrency: Record<string, number> } | null;
  money: ContactMoney | null;
  subscriptions: ContactSubscriptions | null;
  agenda: ContactAgenda | null;
  /** Secciones que no se devolvieron, con el motivo. Nunca se omite en silencio. */
  skipped: Array<{ section: SnapshotSection; reason: string }>;
};

/** Qué secciones armar. Lo que no se pide no se consulta. */
export type SnapshotSections = { deals?: boolean; money?: boolean; agenda?: boolean; subscriptions?: boolean };

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

/**
 * Resuelve el contacto y, si está vinculado a un cliente, sus contactos
 * hermanos. Nunca cruza equipos: el `teamId` va en todas las condiciones.
 */
export async function resolveContactScope(
  teamId: number,
  reference: { contactId?: number; chatId?: number },
): Promise<ContactScope | null> {
  if (reference.contactId == null && reference.chatId == null) return null;

  const contact = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.teamId, teamId),
      reference.contactId != null ? eq(contacts.id, reference.contactId) : eq(contacts.chatId, reference.chatId!),
    ),
    columns: { id: true, name: true, chatId: true },
  });
  if (!contact) return null;

  const [link] = await db
    .select({ customerId: teamCustomerContacts.customerId })
    .from(teamCustomerContacts)
    .where(and(
      eq(teamCustomerContacts.teamId, teamId),
      eq(teamCustomerContacts.contactId, contact.id),
    ))
    .limit(1);

  const customerId = link?.customerId ?? null;
  let customerName: string | null = null;
  let siblings: ContactScope['siblings'] = [];

  if (customerId != null) {
    const [customer] = await db
      .select({ name: teamCustomers.name })
      .from(teamCustomers)
      .where(and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, teamId)))
      .limit(1);
    customerName = customer?.name ?? null;

    const otros = await db
      .select({ contactId: teamCustomerContacts.contactId, name: contacts.name })
      .from(teamCustomerContacts)
      .innerJoin(contacts, and(eq(contacts.id, teamCustomerContacts.contactId), eq(contacts.teamId, teamId)))
      .where(and(
        eq(teamCustomerContacts.teamId, teamId),
        eq(teamCustomerContacts.customerId, customerId),
        ne(teamCustomerContacts.contactId, contact.id),
      ));
    siblings = otros;
  }

  return {
    contactId: contact.id,
    name: contact.name,
    chatId: contact.chatId,
    customerId,
    customerName,
    contactIds: [contact.id, ...siblings.map((s) => s.contactId)],
    siblings,
  };
}

/**
 * Oportunidades del contacto o de su cliente. Las abiertas primero, y de las
 * cerradas sólo la última: saber que se ganó (o se perdió) el mes pasado cambia
 * el tono de la conversación, pero el historial completo es ruido en un panel.
 */
export async function getContactDeals(teamId: number, scope: ContactScope) {
  const filas = await db
    .select({
      id: teamDeals.id,
      title: teamDeals.title,
      stage: teamDeals.stage,
      value: teamDeals.value,
      currency: teamDeals.currency,
      probability: teamDeals.probability,
      expectedCloseDate: teamDeals.expectedCloseDate,
      closedAt: teamDeals.closedAt,
      ownerName: users.name,
      ownerEmail: users.email,
      contactId: teamDeals.contactId,
      customerId: teamDeals.customerId,
      updatedAt: teamDeals.updatedAt,
    })
    .from(teamDeals)
    .leftJoin(users, eq(users.id, teamDeals.ownerId))
    .where(and(eq(teamDeals.teamId, teamId), inArray(teamDeals.contactId, scope.contactIds)))
    .orderBy(desc(teamDeals.updatedAt));

  // Una oportunidad puede colgar del cliente y no del contacto. Se buscan aparte
  // para no depender de que quien la creó haya completado los dos campos.
  const porCliente = scope.customerId != null
    ? await db
        .select({
          id: teamDeals.id,
          title: teamDeals.title,
          stage: teamDeals.stage,
          value: teamDeals.value,
          currency: teamDeals.currency,
          probability: teamDeals.probability,
          expectedCloseDate: teamDeals.expectedCloseDate,
          closedAt: teamDeals.closedAt,
          ownerName: users.name,
          ownerEmail: users.email,
          contactId: teamDeals.contactId,
          customerId: teamDeals.customerId,
          updatedAt: teamDeals.updatedAt,
        })
        .from(teamDeals)
        .leftJoin(users, eq(users.id, teamDeals.ownerId))
        .where(and(eq(teamDeals.teamId, teamId), eq(teamDeals.customerId, scope.customerId)))
        .orderBy(desc(teamDeals.updatedAt))
    : [];

  const vistos = new Set<number>();
  const todas = [...filas, ...porCliente].filter((fila) => {
    if (vistos.has(fila.id)) return false;
    vistos.add(fila.id);
    return true;
  });

  const mapear = (fila: (typeof todas)[number]): ContactDeal => ({
    dealId: fila.id,
    title: fila.title,
    stage: fila.stage,
    value: fila.value,
    currency: fila.currency,
    probability: fila.probability,
    expectedCloseDate: iso(fila.expectedCloseDate),
    ownerName: fila.ownerName || fila.ownerEmail || null,
    isOpen: (OPEN_STAGES as readonly string[]).includes(fila.stage),
    closedAt: iso(fila.closedAt),
  });

  const open = todas.filter((fila) => (OPEN_STAGES as readonly string[]).includes(fila.stage)).map(mapear);
  const cerradas = todas.filter((fila) => (CLOSED_STAGES as readonly string[]).includes(fila.stage)).map(mapear);

  const openByCurrency: Record<string, number> = {};
  for (const deal of open) openByCurrency[deal.currency] = (openByCurrency[deal.currency] ?? 0) + deal.value;

  return { open, lastClosed: cerradas[0] ?? null, openByCurrency };
}

/**
 * Plata: lo que falta cobrar y lo que ya se cobró. Mismo criterio de "pendiente"
 * que el panel de Ventas y que la cobranza por MCP (`draft` o `confirmed`), para
 * que las tres pantallas nunca den números distintos.
 *
 * Dos fuentes, no una: las VENTAS del contacto (y de sus hermanos del mismo
 * cliente) y los asientos de INGRESO de Finanzas del cliente vinculado. Mirar
 * sólo `team_sales` mostraba "no debe nada" a gente con cobros cargados en
 * Finanzas, que es como este negocio factura de verdad; y es la misma tabla que
 * `lib/customers/es-cliente` usa para decidir que alguien ya pagó, así que el
 * panel y el motor tienen que leerla igual.
 */
export async function getContactMoney(teamId: number, scope: ContactScope): Promise<ContactMoney> {
  const filas = await db
    .select({
      id: teamSales.id,
      saleNumber: teamSales.saleNumber,
      status: teamSales.status,
      total: teamSales.total,
      currency: teamSales.currency,
      dueDate: teamSales.dueDate,
      paidAt: teamSales.paidAt,
    })
    .from(teamSales)
    .where(and(eq(teamSales.teamId, teamId), inArray(teamSales.contactId, scope.contactIds)))
    .orderBy(asc(teamSales.dueDate));

  // Los asientos cuelgan del CLIENTE, no del contacto: sin ficha vinculada no
  // hay nada que traer y no se consulta.
  const asientos = scope.customerId != null
    ? await db
        .select({
          id: teamFinancialEntries.id,
          title: teamFinancialEntries.title,
          status: teamFinancialEntries.status,
          amount: teamFinancialEntries.amount,
          currency: teamFinancialEntries.currency,
          dueOn: teamFinancialEntries.dueOn,
          pagado: sql<number>`coalesce((select sum(p.amount) from team_financial_entry_payments p where p.entry_id = ${teamFinancialEntries.id}), 0)::int`,
        })
        .from(teamFinancialEntries)
        .where(and(
          eq(teamFinancialEntries.teamId, teamId),
          eq(teamFinancialEntries.type, 'income'),
          eq(teamFinancialEntries.customerId, scope.customerId),
          ne(teamFinancialEntries.status, 'cancelled'),
        ))
        .orderBy(asc(teamFinancialEntries.dueOn))
    : [];

  const ahora = Date.now();
  const pendingByCurrency: Record<string, number> = {};
  const paidByCurrency: Record<string, number> = {};
  const sales: ContactMoney['sales'] = [];
  const entries: ContactMoney['entries'] = [];
  let nextDueDate: string | null = null;
  let overdueCount = 0;

  for (const fila of filas) {
    const pendiente = PENDING_SALE_STATUSES.includes(fila.status);
    if (pendiente) {
      pendingByCurrency[fila.currency] = (pendingByCurrency[fila.currency] ?? 0) + fila.total;
      const vencida = Boolean(fila.dueDate && fila.dueDate.getTime() < ahora);
      if (vencida) overdueCount += 1;
      const due = iso(fila.dueDate);
      if (due && (!nextDueDate || due < nextDueDate)) nextDueDate = due;
      sales.push({
        saleId: fila.id,
        saleNumber: fila.saleNumber,
        status: fila.status,
        total: fila.total,
        currency: fila.currency,
        dueDate: due,
        overdue: vencida,
      });
    } else if (fila.paidAt) {
      paidByCurrency[fila.currency] = (paidByCurrency[fila.currency] ?? 0) + fila.total;
    }
  }

  for (const fila of asientos) {
    // `due_on` es una fecha suelta (`YYYY-MM-DD`): se lee como UTC para que no
    // se corra un día según la zona del servidor.
    const vence = fila.dueOn ? new Date(`${fila.dueOn}T00:00:00.000Z`) : null;
    const dueDate = vence && !Number.isNaN(vence.getTime()) ? vence.toISOString() : null;
    const falta = Math.max(0, fila.amount - Number(fila.pagado));
    const cobrado = fila.status === 'paid' ? fila.amount : Number(fila.pagado);
    if (cobrado > 0) paidByCurrency[fila.currency] = (paidByCurrency[fila.currency] ?? 0) + cobrado;
    if (fila.status === 'paid' || falta === 0) {
      entries.push({ entryId: fila.id, title: fila.title, status: fila.status, amount: fila.amount, pending: 0, currency: fila.currency, dueDate, overdue: false });
      continue;
    }
    const vencido = Boolean(dueDate && new Date(dueDate).getTime() < ahora);
    pendingByCurrency[fila.currency] = (pendingByCurrency[fila.currency] ?? 0) + falta;
    if (vencido) overdueCount += 1;
    if (dueDate && (!nextDueDate || dueDate < nextDueDate)) nextDueDate = dueDate;
    entries.push({ entryId: fila.id, title: fila.title, status: fila.status, amount: fila.amount, pending: falta, currency: fila.currency, dueDate, overdue: vencido });
  }

  return {
    // Cuenta las dos fuentes: una venta sin cobrar y un ingreso sin cobrar son
    // lo mismo para quien va a reclamar la plata.
    pendingCount: sales.length + entries.filter((e) => e.pending > 0).length,
    pendingByCurrency,
    paidByCurrency,
    nextDueDate,
    overdueCount,
    sales,
    entries,
  };
}

/**
 * Suscripciones del contacto o de su cliente. Es el ingreso REAL de este
 * negocio: al escribir esto había 251 suscripciones y CERO ventas, así que un
 * panel comercial que sólo mire `team_sales` está mirando una tabla vacía.
 *
 * Las suscripciones no son ventas y no se manejan igual:
 *
 * - Tienen DOS ejes de estado independientes. `status` dice si el servicio está
 *   vivo y `paymentStatus` si entró la plata. Una fila `active` + `pending` es
 *   alguien usando el servicio sin haber pagado — algo que el modelo de ventas
 *   no puede ni expresar, y que es exactamente lo que hay que ver antes de
 *   contestarle a esa persona.
 * - Cuelgan del CLIENTE (251 de 251) y sólo a veces del contacto (102 de 251),
 *   al revés que las ventas. Por eso se busca por las dos puntas.
 * - Lo que importa no es el total facturado sino CUÁNDO SE CAE el servicio.
 */
export async function getContactSubscriptions(teamId: number, scope: ContactScope): Promise<ContactSubscriptions> {
  const alcance = scope.customerId != null
    ? or(
        inArray(teamMembershipSubscriptions.contactId, scope.contactIds),
        eq(teamMembershipSubscriptions.customerId, scope.customerId),
      )
    : inArray(teamMembershipSubscriptions.contactId, scope.contactIds);

  const filas = await db
    .select({
      id: teamMembershipSubscriptions.id,
      planName: teamMembershipSubscriptions.planNameSnapshot,
      price: teamMembershipSubscriptions.price,
      currency: teamMembershipSubscriptions.currency,
      billingType: teamMembershipSubscriptions.billingType,
      status: teamMembershipSubscriptions.status,
      paymentStatus: teamMembershipSubscriptions.paymentStatus,
      startDate: teamMembershipSubscriptions.startDate,
      endDate: teamMembershipSubscriptions.endDate,
    })
    .from(teamMembershipSubscriptions)
    .where(and(eq(teamMembershipSubscriptions.teamId, teamId), alcance))
    .orderBy(desc(teamMembershipSubscriptions.endDate));

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const mapear = (fila: (typeof filas)[number]): ContactSubscription => ({
    subscriptionId: fila.id,
    planName: fila.planName,
    price: fila.price,
    currency: fila.currency,
    billingType: fila.billingType,
    status: fila.status,
    paymentStatus: fila.paymentStatus,
    startDate: fila.startDate,
    endDate: fila.endDate,
    // `endDate` es un `date` en modo string (YYYY-MM-DD): se compara al mediodía
    // para que ningún corrimiento de zona horaria mueva el resultado un día.
    daysLeft: fila.endDate
      ? Math.round((new Date(`${fila.endDate}T12:00:00`).getTime() - hoy.getTime()) / 86_400_000)
      : null,
  });

  const todas = filas.map(mapear);
  const active = todas.filter((sub) => sub.status === 'active');
  const expiradas = todas.filter((sub) => sub.status === 'expired');

  const activeByCurrency: Record<string, number> = {};
  for (const sub of active) activeByCurrency[sub.currency] = (activeByCurrency[sub.currency] ?? 0) + sub.price;

  let nextRenewal: string | null = null;
  for (const sub of active) {
    if (sub.endDate && (!nextRenewal || sub.endDate < nextRenewal)) nextRenewal = sub.endDate;
  }

  // Último pago real: sirve para saber si el "pendiente" ya se saldó por fuera
  // del sistema antes de reclamarle nada a nadie.
  let lastPayment: ContactSubscriptions['lastPayment'] = null;
  if (scope.customerId != null) {
    const [pago] = await db
      .select({
        amount: teamCustomerTransactions.amount,
        currency: teamCustomerTransactions.currency,
        gateway: teamCustomerTransactions.gateway,
        date: teamCustomerTransactions.transactionDate,
      })
      .from(teamCustomerTransactions)
      .where(and(
        eq(teamCustomerTransactions.teamId, teamId),
        eq(teamCustomerTransactions.customerId, scope.customerId),
      ))
      .orderBy(desc(teamCustomerTransactions.transactionDate))
      .limit(1);
    if (pago) {
      lastPayment = {
        amount: String(pago.amount),
        currency: pago.currency,
        gateway: pago.gateway,
        date: pago.date ? new Date(pago.date).toISOString() : null,
      };
    }
  }

  return {
    active,
    lastExpired: expiradas[0] ?? null,
    unpaid: active.filter((sub) => sub.paymentStatus !== 'paid'),
    activeByCurrency,
    nextRenewal,
    lastPayment,
  };
}

/**
 * La próxima cita y el resultado de la anterior. `nextAction` del evento pasado
 * es, en la práctica, lo que quedó prometido: es lo primero que hay que releer
 * antes de contestar.
 */
export async function getContactAgenda(teamId: number, scope: ContactScope): Promise<ContactAgenda> {
  const columnas = {
    id: teamEvents.id,
    title: teamEvents.title,
    startsAt: teamEvents.startsAt,
    kind: teamEvents.kind,
    subtype: teamEvents.subtype,
    status: teamEvents.status,
    outcome: teamEvents.outcome,
    nextAction: teamEvents.nextAction,
  };
  // Un evento puede colgar del contacto o directamente del cliente: si se mira
  // sólo uno de los dos, la reunión agendada desde la ficha del cliente no
  // aparece en el chat, que es justo donde hace falta verla.
  const alcance = and(
    eq(teamEvents.teamId, teamId),
    ne(teamEvents.status, 'cancelled'),
    scope.customerId != null
      ? or(inArray(teamEvents.contactId, scope.contactIds), eq(teamEvents.customerId, scope.customerId))
      : inArray(teamEvents.contactId, scope.contactIds),
  );

  const ahora = new Date();
  const [proximos, pasados] = await Promise.all([
    db.select(columnas).from(teamEvents).where(and(alcance, gte(teamEvents.startsAt, ahora)))
      .orderBy(asc(teamEvents.startsAt)).limit(1),
    db.select(columnas).from(teamEvents).where(and(alcance, lt(teamEvents.startsAt, ahora)))
      .orderBy(desc(teamEvents.startsAt)).limit(1),
  ]);

  const mapear = (fila: typeof proximos[number]): ContactEvent => ({
    eventId: fila.id,
    title: fila.title,
    startsAt: fila.startsAt.toISOString(),
    kind: fila.kind,
    subtype: fila.subtype,
    status: fila.status,
    outcome: fila.outcome,
    nextAction: fila.nextAction,
  });

  return {
    next: proximos[0] ? mapear(proximos[0]) : null,
    last: pasados[0] ? mapear(pasados[0]) : null,
  };
}

/**
 * Todo junto. `sections` decide qué se consulta: lo que el llamador no puede
 * mostrar (por permiso o por plugin apagado) no se pide, y se informa en
 * `skipped` con el motivo en vez de devolver un hueco sin explicación.
 */
export async function getContactCommercialSnapshot(
  teamId: number,
  reference: { contactId?: number; chatId?: number },
  sections: SnapshotSections & { skippedReasons?: Partial<Record<SnapshotSection, string>> } = {},
): Promise<ContactCommercialSnapshot | null> {
  const scope = await resolveContactScope(teamId, reference);
  if (!scope) return null;

  const quiere = {
    deals: sections.deals !== false,
    money: sections.money !== false,
    agenda: sections.agenda !== false,
    subscriptions: sections.subscriptions !== false,
  };
  const skipped: ContactCommercialSnapshot['skipped'] = [];
  for (const seccion of ['deals', 'money', 'agenda', 'subscriptions'] as const) {
    if (!quiere[seccion]) {
      skipped.push({ section: seccion, reason: sections.skippedReasons?.[seccion] ?? 'No solicitada.' });
    }
  }

  const [deals, money, agenda, subscriptions] = await Promise.all([
    quiere.deals ? getContactDeals(teamId, scope) : Promise.resolve(null),
    quiere.money ? getContactMoney(teamId, scope) : Promise.resolve(null),
    quiere.agenda ? getContactAgenda(teamId, scope) : Promise.resolve(null),
    quiere.subscriptions ? getContactSubscriptions(teamId, scope) : Promise.resolve(null),
  ]);

  return { scope, deals, money, subscriptions, agenda, skipped };
}
