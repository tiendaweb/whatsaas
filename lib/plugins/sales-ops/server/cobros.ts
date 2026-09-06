import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, contacts, messages, teamCommercialAnalysis, teamFinancialEntries, teamFinancialReceipts, teamSales } from '@/lib/db/schema';
import { convertContactToCustomer } from '@/lib/customers/service';
import { FinanceEntryError, findEntryByIdempotencyKey, recordFinancialEntry, settleFinancialEntry } from '@/lib/plugins/finance/server/entries';
import { fechaEnZona } from '@/lib/time/zona';
import { SALES_OPS_ACTIVITY_PREFIX } from '../shared/taxonomy';
import { setManualOverride } from './classifier';
import { cancelProposedForChat } from './queue';

/**
 * Registrar un cobro desde el Command Center: UN solo camino para la Cola
 * (`register_sale` aprobado), el Focus ("Ejecutar ahora" → modo `cobro`), la
 * ficha y el conector (`whatspro_sales_register_payment`).
 *
 * Por qué existe: hasta acá "registrar cobro" era una fila que quedaba
 * `approved` esperando a que alguien la hiciera a mano en Finanzas, y cuando un
 * conector la hacía con `whatspro_finance_record_entry` el Command Center no se
 * enteraba —el expediente sólo mira `team_sales` por contacto, no los asientos
 * por cliente— y el chat seguía en G9 "pago pendiente" con un recordatorio de
 * pago propuesto. Este módulo deja las cinco cosas consistentes en una llamada:
 *
 *  1. El contacto queda vinculado como CLIENTE (`team_customer_contacts`, con la
 *     misma deduplicación por vínculo / email / teléfono que usa el resto).
 *  2. Se crea la VENTA (`team_sales`, pagada, con contacto y cliente) o se cobra
 *     la venta / el asiento pendiente que ya existía.
 *  3. Se crea el ASIENTO de ingreso y su PAGO (`team_financial_entries` +
 *     `team_financial_entry_payments`, con cuenta y medio): así aparece en
 *     Finanzas, en la meta de caja y en el saldo de la cuenta.
 *  4. El análisis pasa a G11 · cliente con una versión `manual_override` firmada
 *     por quien registró: una venta cobrada es un hecho confirmado por una
 *     persona, y ninguna clasificación posterior lo baja.
 *  5. Se cancelan las propuestas abiertas del chat (un "recordale el pago"
 *     después de cobrado es exactamente el mensaje que no hay que mandar) y se
 *     audita `SALES_OPS_COBRO_REGISTRADO` para el Muro y el historial.
 *
 * Los importes entran en UNIDADES (lo que dice la persona: 50000 ARS, 45.5 USD)
 * y se guardan en CENTAVOS, que es la unidad de Finanzas. Es idempotente por
 * `idempotencyKey`: un reintento devuelve lo que ya se registró.
 */

export class CobroError extends Error {}

export type RegistrarCobroInput = {
  chatId?: number | null;
  contactId?: number | null;
  /** En unidades de la moneda, decimal (50000, 45.5). */
  amount: number;
  currency: string;
  /** YYYY-MM-DD, hora del negocio. Default: hoy. */
  paidOn?: string | null;
  /** "transferencia", "Mercado Pago", "efectivo", … */
  method?: string | null;
  /** Cuenta de Finanzas por la que entró. */
  accountId?: number | null;
  /** Qué se cobró: "Seña sitio web", "Saldo tienda". Default: "Cobro". */
  concept?: string | null;
  /** Cobrar contra una venta pendiente que ya existe (`team_sales`). */
  saleId?: number | null;
  /** Cobrar contra un asiento pendiente que ya existe (`team_financial_entries`). */
  entryId?: number | null;
  /** Mensaje del chat con el comprobante (imagen o PDF): queda vinculado al asiento en Finanzas. */
  receiptMessageId?: string | null;
  notes?: string | null;
  idempotencyKey: string;
  /** Por dónde entró, para la auditoría: `cola` · `focus` · `ficha` · `conector`. */
  via?: string;
  dryRun?: boolean;
};

export type RegistrarCobroResult = {
  idempotent: boolean;
  dryRun?: boolean;
  chatId: number | null;
  contactId: number;
  customer: { id: number; created: boolean; linkedToExisting: boolean } | null;
  sale: { id: number; saleNumber: string; status: string; total: number; currency: string } | null;
  entry: { id: number; title: string; status: string; amount: number; pagado: number; pendiente: number; saldado: boolean } | null;
  paymentId: number | null;
  receiptId: number | null;
  amountCents: number;
  currency: string;
  paidOn: string;
  analysis: { gate: 'G11'; status: 'cliente' } | null;
  cancelledProposals: number;
  summary: string;
};

const CURRENCY_RE = /^[A-Za-z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "50.000" / "50,000.50" / "45,5" → número en unidades. Devuelve null si no se entiende. */
export function parsearImporte(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    // El último separador es el decimal; el otro es de miles.
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma > -1) {
    // Una sola coma: decimal si deja 1-2 dígitos, si no es de miles ("50,000").
    s = s.length - coma - 1 <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (punto > -1 && s.length - punto - 1 === 3 && (s.match(/\./g) ?? []).length === 1 && s.length > 4) {
    // "50.000" en castellano es cincuenta mil, no cincuenta con tres decimales.
    s = s.replace('.', '');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const aCentavos = (unidades: number) => Math.round(unidades * 100);

function fmt(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

async function siguienteNumeroDeVenta(teamId: number): Promise<string> {
  const [fila] = await db.select({ total: sql<number>`count(*)::int` }).from(teamSales).where(eq(teamSales.teamId, teamId));
  let n = (Number(fila?.total) || 0) + 1;
  // El número sale del conteo: si alguien borró una venta puede chocar. Se corre hasta uno libre.
  for (let i = 0; i < 50; i += 1, n += 1) {
    const candidato = `V-${String(n).padStart(4, '0')}`;
    const [existe] = await db.select({ id: teamSales.id }).from(teamSales).where(and(eq(teamSales.teamId, teamId), eq(teamSales.saleNumber, candidato))).limit(1);
    if (!existe) return candidato;
  }
  return `V-${Date.now()}`;
}

async function resolverContacto(teamId: number, input: { chatId?: number | null; contactId?: number | null }) {
  if (input.contactId) {
    const [row] = await db
      .select({ id: contacts.id, chatId: contacts.chatId, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.id, input.contactId), eq(contacts.teamId, teamId)))
      .limit(1);
    if (!row) throw new CobroError('El contacto no existe en este equipo.');
    return { contactId: row.id, chatId: row.chatId ?? input.chatId ?? null, name: row.name ?? null };
  }
  if (input.chatId) {
    const [chat] = await db.select({ id: chats.id, name: chats.name, pushName: chats.pushName }).from(chats).where(and(eq(chats.id, input.chatId), eq(chats.teamId, teamId))).limit(1);
    if (!chat) throw new CobroError('El chat no existe en este equipo.');
    const [contacto] = await db.select({ id: contacts.id, name: contacts.name }).from(contacts).where(and(eq(contacts.teamId, teamId), eq(contacts.chatId, chat.id))).limit(1);
    if (!contacto) throw new CobroError('Este chat todavía no tiene ficha de contacto: guardalo como contacto antes de registrar el cobro.');
    return { contactId: contacto.id, chatId: chat.id, name: contacto.name ?? chat.name ?? chat.pushName ?? null };
  }
  throw new CobroError('Falta chatId o contactId.');
}

export async function registrarCobro(teamId: number, userId: number, input: RegistrarCobroInput): Promise<RegistrarCobroResult> {
  const currency = String(input.currency ?? '').trim().toUpperCase();
  if (!CURRENCY_RE.test(currency)) throw new CobroError('La moneda tiene que ser un código de 3 letras (ARS, USD, PYG).');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new CobroError('El importe tiene que ser mayor a cero.');
  const amountCents = aCentavos(input.amount);
  const paidOn = input.paidOn && DATE_RE.test(input.paidOn) ? input.paidOn : fechaEnZona();
  const key = String(input.idempotencyKey ?? '').trim();
  if (key.length < 6) throw new CobroError('Falta la clave de idempotencia (mínimo 6 caracteres).');
  const concept = (input.concept ?? '').trim().slice(0, 200) || 'Cobro';
  const method = input.method?.trim().slice(0, 80) || null;
  const via = input.via ?? 'ficha';

  const { contactId, chatId, name } = await resolverContacto(teamId, input);
  const nombre = name ?? `contacto ${contactId}`;

  // Idempotencia: por la venta (clave propia) o por el asiento (external_id).
  const [ventaPrevia] = await db
    .select({ id: teamSales.id, saleNumber: teamSales.saleNumber, status: teamSales.status, total: teamSales.total, currency: teamSales.currency })
    .from(teamSales)
    .where(and(eq(teamSales.teamId, teamId), eq(teamSales.idempotencyKey, key)))
    .limit(1);
  const asientoPrevio = await findEntryByIdempotencyKey(teamId, key);
  if (ventaPrevia || asientoPrevio) {
    return {
      idempotent: true,
      chatId,
      contactId,
      customer: null,
      sale: ventaPrevia ?? null,
      entry: asientoPrevio ? { id: asientoPrevio.id, title: asientoPrevio.title, status: asientoPrevio.status, amount: asientoPrevio.amount, pagado: asientoPrevio.amount, pendiente: 0, saldado: asientoPrevio.status === 'paid' } : null,
      paymentId: null,
      receiptId: null,
      amountCents,
      currency,
      paidOn,
      analysis: null,
      cancelledProposals: 0,
      summary: `Ya estaba registrado (${key}).`,
    };
  }

  if (input.dryRun) {
    return {
      idempotent: false,
      dryRun: true,
      chatId,
      contactId,
      customer: null,
      sale: null,
      entry: null,
      paymentId: null,
      receiptId: null,
      amountCents,
      currency,
      paidOn,
      analysis: null,
      cancelledProposals: 0,
      summary: `Se registraría ${fmt(amountCents, currency)} (${concept}) de ${nombre}${method ? ` por ${method}` : ''} el ${paidOn}, se lo vincularía como cliente y el chat pasaría a G11.`,
    };
  }

  // 1. Cliente: vínculo deduplicado. Un cobro es la prueba más fuerte de que es cliente.
  const conv = await convertContactToCustomer(teamId, contactId, {}, userId);
  const customerId = conv.customer.id;

  let sale: RegistrarCobroResult['sale'] = null;
  let entryId: number | null = null;
  let entryInfo: RegistrarCobroResult['entry'] = null;
  let paymentId: number | null = null;

  try {
    // 2. Sobre qué se cobra: asiento indicado, venta indicada, o venta nueva.
    if (input.entryId) {
      const asiento = await db.query.teamFinancialEntries.findFirst({
        where: and(eq(teamFinancialEntries.id, input.entryId), eq(teamFinancialEntries.teamId, teamId)),
        columns: { id: true, type: true, currency: true, saleId: true, customerId: true },
      });
      if (!asiento) throw new CobroError('El asiento no existe en este equipo.');
      if (asiento.type !== 'income') throw new CobroError('Ese asiento es un egreso: un cobro se registra contra un ingreso.');
      if (asiento.currency !== currency) throw new CobroError(`El asiento está en ${asiento.currency} y el cobro en ${currency}: las monedas nunca se mezclan.`);
      entryId = asiento.id;
      if (!asiento.customerId) await db.update(teamFinancialEntries).set({ customerId, updatedBy: userId, updatedAt: new Date() }).where(eq(teamFinancialEntries.id, asiento.id));
      if (asiento.saleId) {
        const [v] = await db.select({ id: teamSales.id, saleNumber: teamSales.saleNumber, status: teamSales.status, total: teamSales.total, currency: teamSales.currency }).from(teamSales).where(eq(teamSales.id, asiento.saleId)).limit(1);
        sale = v ?? null;
      }
    } else if (input.saleId) {
      const [venta] = await db
        .select({ id: teamSales.id, saleNumber: teamSales.saleNumber, status: teamSales.status, total: teamSales.total, currency: teamSales.currency, customerId: teamSales.customerId })
        .from(teamSales)
        .where(and(eq(teamSales.id, input.saleId), eq(teamSales.teamId, teamId)))
        .limit(1);
      if (!venta) throw new CobroError('La venta no existe en este equipo.');
      if (venta.currency !== currency) throw new CobroError(`La venta está en ${venta.currency} y el cobro en ${currency}: las monedas nunca se mezclan.`);
      sale = venta;
      if (!venta.customerId) await db.update(teamSales).set({ customerId, updatedBy: userId, updatedAt: new Date() }).where(eq(teamSales.id, venta.id));
      const asiento = await db.query.teamFinancialEntries.findFirst({
        where: and(eq(teamFinancialEntries.teamId, teamId), eq(teamFinancialEntries.saleId, venta.id), eq(teamFinancialEntries.type, 'income')),
        columns: { id: true, status: true },
      });
      if (asiento && asiento.status !== 'cancelled') entryId = asiento.id;
      else {
        const creado = await recordFinancialEntry(teamId, userId, {
          type: 'income',
          title: `Venta ${venta.saleNumber} — ${nombre}`.slice(0, 200),
          description: input.notes ?? '',
          category: 'Ventas',
          amount: venta.total,
          currency,
          status: 'pending',
          occurred_on: paidOn,
          payment_method: method,
          customer_id: customerId,
          sale_id: venta.id,
          account_id: input.accountId ?? null,
          idempotency_key: `${key}:entry`,
        });
        if (!('entry' in creado) || !creado.entry) throw new CobroError('No se pudo crear el asiento de la venta.');
        entryId = creado.entry.id;
      }
    } else {
      const saleNumber = await siguienteNumeroDeVenta(teamId);
      const [venta] = await db
        .insert(teamSales)
        .values({
          teamId,
          contactId,
          customerId,
          idempotencyKey: key,
          saleNumber,
          status: 'paid',
          currency,
          items: [{ articleId: null, name: concept, sku: '', quantity: 1, unitPrice: amountCents, total: amountCents }],
          subtotal: amountCents,
          discountAmount: 0,
          taxAmount: 0,
          total: amountCents,
          notes: (input.notes ?? `Cobro registrado desde el Command Center (${via})`).slice(0, 2000),
          paidAt: new Date(),
          createdBy: userId,
          updatedBy: userId,
        })
        .returning({ id: teamSales.id, saleNumber: teamSales.saleNumber, status: teamSales.status, total: teamSales.total, currency: teamSales.currency });
      sale = venta;
      const creado = await recordFinancialEntry(teamId, userId, {
        type: 'income',
        title: `${concept} — ${nombre}`.slice(0, 200),
        description: input.notes ?? '',
        category: 'Ventas',
        amount: amountCents,
        currency,
        status: 'pending',
        occurred_on: paidOn,
        payment_method: method,
        customer_id: customerId,
        sale_id: venta.id,
        account_id: input.accountId ?? null,
        idempotency_key: key,
      });
      if (!('entry' in creado) || !creado.entry) throw new CobroError('No se pudo crear el asiento del cobro.');
      entryId = creado.entry.id;
    }

    // 3. El pago, con cuenta y medio. Cuando cubre el total, el asiento queda `paid`.
    const pago = await settleFinancialEntry(teamId, userId, {
      entry_id: entryId,
      amount: amountCents,
      paid_on: paidOn,
      account_id: input.accountId ?? null,
      method,
      notes: `${concept} · Command Center (${via})`,
      idempotency_key: key,
    });
    paymentId = pago.payment?.id ?? null;
    const settled = pago.entry
      && 'saldado' in pago.entry
      && typeof pago.entry.saldado === 'boolean'
      && typeof pago.entry.total === 'number'
      && typeof pago.entry.pagado === 'number'
      && typeof pago.entry.pendiente === 'number'
      ? pago.entry
      : null;
    if (settled) {
      entryInfo = { id: settled.id, title: settled.title, status: settled.saldado ? 'paid' : 'pending', amount: settled.total, pagado: settled.pagado, pendiente: settled.pendiente, saldado: settled.saldado };
      // La venta refleja el asiento: cobrada del todo → paid; sigue debiendo → confirmed.
      if (sale && settled.saldado && sale.status !== 'paid') {
        await db.update(teamSales).set({ status: 'paid', paidAt: new Date(), updatedBy: userId, updatedAt: new Date() }).where(eq(teamSales.id, sale.id));
        sale = { ...sale, status: 'paid' };
      }
    }
  } catch (error) {
    if (error instanceof FinanceEntryError) throw new CobroError(error.message);
    throw error;
  }

  // 3b. El comprobante del chat, colgado del asiento (misma validación que Finanzas › comprobantes).
  let receiptId: number | null = null;
  if (input.receiptMessageId && entryId) {
    try {
      const [media] = await db
        .select({ messageId: messages.id, chatId: chats.id, mediaUrl: messages.mediaUrl, mimeType: messages.mediaMimetype, caption: messages.mediaCaption, timestamp: messages.timestamp })
        .from(messages)
        .innerJoin(chats, eq(messages.chatId, chats.id))
        .where(and(eq(messages.id, input.receiptMessageId), eq(chats.teamId, teamId)))
        .limit(1);
      const soportado = media?.mediaUrl && (media.mimeType?.startsWith('image/') || media.mimeType === 'application/pdf' || /\.pdf(?:\?|$)/i.test(media.mediaUrl));
      if (media && soportado) {
        const [previo] = await db.select({ id: teamFinancialReceipts.id }).from(teamFinancialReceipts).where(and(eq(teamFinancialReceipts.teamId, teamId), eq(teamFinancialReceipts.messageId, media.messageId))).limit(1);
        if (previo) {
          await db.update(teamFinancialReceipts).set({ entryId }).where(eq(teamFinancialReceipts.id, previo.id));
          receiptId = previo.id;
        } else {
          const [creado] = await db
            .insert(teamFinancialReceipts)
            .values({ teamId, entryId, messageId: media.messageId, chatId: media.chatId, mediaUrl: media.mediaUrl!, mimeType: media.mimeType, fileName: (media.caption?.trim() || `comprobante-${media.timestamp.toISOString().slice(0, 10)}`).slice(0, 255), paymentDate: paidOn, tags: ['command-center'], notes: `${concept} · ${nombre}`, createdBy: userId })
            .returning({ id: teamFinancialReceipts.id });
          receiptId = creado.id;
        }
      }
    } catch (error) {
      console.error('[sales-ops/cobros] comprobante', error);
    }
  }

  // 4. El análisis: G11 · cliente, firmado. Y los hechos de cliente en la fila.
  let analysis: RegistrarCobroResult['analysis'] = null;
  let cancelledProposals = 0;
  if (chatId) {
    const saldado = entryInfo?.saldado ?? true;
    try {
      if (saldado) {
        await setManualOverride(teamId, chatId, userId, { gate: 'G11', status: 'cliente', reason: `Cobro registrado: ${fmt(amountCents, currency)}${method ? ` por ${method}` : ''} (${concept})`.slice(0, 300) });
        analysis = { gate: 'G11', status: 'cliente' };
      }
      await db
        .update(teamCommercialAnalysis)
        .set({ isExistingCustomer: true, customerEvidence: 'sale_paid', paymentPending: !saldado, updatedAt: new Date() })
        .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)));
    } catch (error) {
      console.error('[sales-ops/cobros] análisis', error);
    }
    // 5. Un recordatorio de pago propuesto después de cobrar es el mensaje que no hay que mandar.
    if (saldado) {
      try {
        cancelledProposals = (await cancelProposedForChat(teamId, chatId, 'cobro_registrado')).cancelled;
      } catch (error) {
        console.error('[sales-ops/cobros] cancelar propuestas', error);
      }
    }
  }

  const summary = `${fmt(amountCents, currency)} de ${nombre} (${concept})${method ? ` por ${method}` : ''}${entryInfo && !entryInfo.saldado ? `; quedan ${fmt(entryInfo.pendiente, currency)} pendientes` : ''}.`;
  try {
    await db.insert(activityLogs).values({
      teamId,
      userId,
      action: `${SALES_OPS_ACTIVITY_PREFIX}COBRO_REGISTRADO`,
      metadata: { chatId, contactId, customerId, saleId: sale?.id ?? null, entryId, paymentId, receiptId, amount: input.amount, currency, method, concept, paidOn, via, summary, cancelledProposals },
      ipAddress: null,
    });
  } catch (error) {
    console.error('[sales-ops/cobros] audit', error);
  }

  return {
    idempotent: false,
    chatId,
    contactId,
    customer: { id: customerId, created: conv.created, linkedToExisting: conv.linkedToExisting },
    sale,
    entry: entryInfo,
    paymentId,
    receiptId,
    amountCents,
    currency,
    paidOn,
    analysis,
    cancelledProposals,
    summary,
  };
}

/** Lo que un contacto debe y cobró, para cobrar contra algo existente en vez de duplicar. */
export async function deudaDelContacto(teamId: number, input: { chatId?: number | null; contactId?: number | null }) {
  const { contactId, chatId, name } = await resolverContacto(teamId, input);
  const ventas = await db
    .select({ id: teamSales.id, saleNumber: teamSales.saleNumber, status: teamSales.status, total: teamSales.total, currency: teamSales.currency, dueDate: teamSales.dueDate, paidAt: teamSales.paidAt })
    .from(teamSales)
    .where(and(eq(teamSales.teamId, teamId), eq(teamSales.contactId, contactId)))
    .orderBy(teamSales.createdAt);
  const asientos = await db
    .select({ id: teamFinancialEntries.id, title: teamFinancialEntries.title, status: teamFinancialEntries.status, amount: teamFinancialEntries.amount, currency: teamFinancialEntries.currency, dueOn: teamFinancialEntries.dueOn, paidOn: teamFinancialEntries.paidOn, saleId: teamFinancialEntries.saleId, customerId: teamFinancialEntries.customerId })
    .from(teamFinancialEntries)
    .where(and(eq(teamFinancialEntries.teamId, teamId), eq(teamFinancialEntries.type, 'income'), sql`(${teamFinancialEntries.saleId} in (select id from team_sales where team_id = ${teamId} and contact_id = ${contactId}) or ${teamFinancialEntries.customerId} in (select customer_id from team_customer_contacts where team_id = ${teamId} and contact_id = ${contactId}))`))
    .orderBy(teamFinancialEntries.occurredOn);
  return {
    contactId,
    chatId,
    name,
    pendingSales: ventas.filter((v) => v.status === 'draft' || v.status === 'confirmed').map((v) => ({ saleId: v.id, saleNumber: v.saleNumber, total: v.total, totalUnits: v.total / 100, currency: v.currency, dueDate: v.dueDate?.toISOString().slice(0, 10) ?? null })),
    pendingEntries: asientos.filter((a) => a.status === 'pending' || a.status === 'overdue').map((a) => ({ entryId: a.id, title: a.title, amount: a.amount, amountUnits: a.amount / 100, currency: a.currency, dueOn: a.dueOn, saleId: a.saleId })),
    paid: asientos.filter((a) => a.status === 'paid').map((a) => ({ entryId: a.id, title: a.title, amount: a.amount, amountUnits: a.amount / 100, currency: a.currency, paidOn: a.paidOn })),
    note: 'Los montos en `amount`/`total` están en centavos; `*Units` en unidades. Las monedas nunca se suman entre sí.',
  };
}
