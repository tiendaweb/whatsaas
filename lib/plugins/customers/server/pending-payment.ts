import 'server-only';

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamCustomerContacts,
  teamCustomers,
  teamFinancialEntries,
  teamMembershipSubscriptions,
  teamSales,
} from '@/lib/db/schema';

/**
 * Clientes esperando pago o seña.
 *
 * Una venta en `draft` o `confirmed` es una venta que existe y todavía no se
 * cobró — el mismo criterio que usa el panel de Ventas para su contador de
 * pendientes.
 *
 * Las ventas cuelgan de un CONTACTO y un cliente puede tener varios contactos
 * vinculados, así que el camino es venta → contacto → cliente. Las ventas
 * cuyo contacto no está vinculado a ningún cliente quedan afuera a propósito:
 * no hay a quién atribuirlas.
 *
 * PERO `team_sales` no es donde vive la plata de este negocio: al escribir esto
 * el equipo tenía UNA venta y cientos de suscripciones y de asientos de ingreso.
 * Una lista de cobranzas que sólo mire ventas está vacía y hace creer que no hay
 * nada por cobrar. Así que se suman tres fuentes, todas colgadas del CLIENTE:
 *
 *   1. Ventas `draft`/`confirmed` (por el contacto vinculado).
 *   2. Asientos de INGRESO de Finanzas en `pending` u `overdue`, por lo que
 *      falta cobrar (monto menos lo ya pagado), que es la cuenta real cuando
 *      hubo pagos parciales.
 *   3. Suscripciones con el pago distinto de `paid`.
 *
 * Las suscripciones `cancelled` sin cobrar son un cuarto grupo APARTE, y no
 * entran en el total: un servicio dado de baja y nunca cobrado no es plata que
 * vaya a entrar, y sumarla infla lo que el equipo cree que va a cobrar. Pero
 * tampoco se tiran, que era lo que pasaba antes: quedan como «canceladas
 * pendientes de proceso» en `cancelledByCurrency` / `cancelledCount`, porque
 * alguien tiene que cerrarlas (darlas de baja de verdad, condonarlas o
 * reclamarlas) y si no se ven, nadie lo hace.
 *
 * Las monedas NUNCA se suman entre sí: `totalsByCurrency` agrupa por moneda y
 * cada superficie decide cómo mostrarlas.
 *
 * Vive acá y no dentro de la ruta HTTP porque lo consumen dos superficies —
 * el panel de Tareas y la herramienta MCP de cobranzas— y tienen que dar
 * exactamente el mismo resultado.
 */
const PENDING_STATUSES = ['draft', 'confirmed'];
// Tipado literal porque la columna es un enum de drizzle: un `string[]` suelto no compila.
const PENDING_ENTRY_STATUSES: Array<'pending' | 'overdue'> = ['pending', 'overdue'];

export type ClientePendiente = {
  id: number;
  name: string;
  profileImage: string | null;
  status: string;
  /** Cantidad de cosas por cobrar: ventas + asientos de ingreso + suscripciones activas. */
  salesCount: number;
  /** Total adeudado por moneda, en la unidad menor. Nunca se suman monedas distintas. */
  totalsByCurrency: Record<string, number>;
  /** De dónde sale ese total, para que se pueda auditar sin abrir la base. */
  sources: { sales: number; entries: number; subscriptions: number; subscriptionsCancelled: number };
  /** Suscripciones canceladas sin cobrar: hay que procesarlas, pero no son plata que vaya a entrar. */
  cancelledCount: number;
  /** Lo que suman esas canceladas, por moneda. Aparte del total, nunca dentro. */
  cancelledByCurrency: Record<string, number>;
  nextDueDate: string | null;
};

type Pendiente = {
  customerId: number;
  amount: number;
  currency: string;
  /** ISO completo o `YYYY-MM-DD`; se normaliza antes de comparar. */
  dueDate: string | null;
  source: keyof ClientePendiente['sources'];
};

/**
 * Las tres fuentes traen la fecha en formatos distintos (`timestamp` en ventas,
 * `date` en Finanzas y en membresías). Se normaliza a ISO para que "la próxima
 * que vence" se compare como texto sin mezclar formatos, y una fecha sucia se
 * ignora en vez de tumbar la pantalla.
 */
function isoDeVencimiento(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function listCustomersPendingPayment(teamId: number): Promise<ClientePendiente[]> {
  const [ventas, asientos, suscripciones] = await Promise.all([
    db
      .select({
        customerId: teamCustomerContacts.customerId,
        total: teamSales.total,
        currency: teamSales.currency,
        dueDate: teamSales.dueDate,
      })
      .from(teamSales)
      .innerJoin(teamCustomerContacts, and(
        eq(teamCustomerContacts.contactId, teamSales.contactId),
        eq(teamCustomerContacts.teamId, teamId),
      ))
      .where(and(eq(teamSales.teamId, teamId), inArray(teamSales.status, PENDING_STATUSES))),
    db
      .select({
        customerId: teamFinancialEntries.customerId,
        // Lo que falta, no lo facturado: un asiento con pagos parciales no se
        // reclama entero.
        falta: sql<number>`greatest(0, ${teamFinancialEntries.amount} - coalesce((select sum(p.amount) from team_financial_entry_payments p where p.entry_id = ${teamFinancialEntries.id}), 0))::int`,
        currency: teamFinancialEntries.currency,
        dueOn: teamFinancialEntries.dueOn,
      })
      .from(teamFinancialEntries)
      .where(and(
        eq(teamFinancialEntries.teamId, teamId),
        eq(teamFinancialEntries.type, 'income'),
        inArray(teamFinancialEntries.status, PENDING_ENTRY_STATUSES),
      )),
    db
      .select({
        customerId: teamMembershipSubscriptions.customerId,
        price: teamMembershipSubscriptions.price,
        currency: teamMembershipSubscriptions.currency,
        endDate: teamMembershipSubscriptions.endDate,
        // Las canceladas vienen en la misma consulta y se separan al armar la
        // lista: son otra categoría, no otra fuente de plata.
        status: teamMembershipSubscriptions.status,
      })
      .from(teamMembershipSubscriptions)
      .where(and(
        eq(teamMembershipSubscriptions.teamId, teamId),
        ne(teamMembershipSubscriptions.paymentStatus, 'paid'),
      )),
  ]);

  const pendientes: Pendiente[] = [
    ...ventas.map((v) => ({ customerId: v.customerId, amount: v.total, currency: v.currency, dueDate: isoDeVencimiento(v.dueDate), source: 'sales' as const })),
    ...asientos
      .filter((a) => a.customerId != null && Number(a.falta) > 0)
      .map((a) => ({ customerId: a.customerId!, amount: Number(a.falta), currency: a.currency, dueDate: isoDeVencimiento(a.dueOn), source: 'entries' as const })),
    ...suscripciones
      .filter((s) => s.customerId != null && s.price > 0)
      .map((s) => ({
        customerId: s.customerId!,
        amount: s.price,
        currency: s.currency,
        dueDate: isoDeVencimiento(s.endDate),
        source: s.status === 'cancelled' ? ('subscriptionsCancelled' as const) : ('subscriptions' as const),
      })),
  ];

  if (!pendientes.length) return [];

  const byCustomer = new Map<number, Omit<ClientePendiente, 'name' | 'profileImage' | 'status'>>();
  for (const item of pendientes) {
    const entry = byCustomer.get(item.customerId)
      ?? {
        id: item.customerId,
        salesCount: 0,
        totalsByCurrency: {},
        sources: { sales: 0, entries: 0, subscriptions: 0, subscriptionsCancelled: 0 },
        cancelledCount: 0,
        cancelledByCurrency: {},
        nextDueDate: null,
      };
    entry.sources[item.source] += 1;
    if (item.source === 'subscriptionsCancelled') {
      // Se cuenta y se muestra, pero fuera del total y sin fecha de
      // vencimiento: nadie "vence" una baja, hay que procesarla.
      entry.cancelledCount += 1;
      entry.cancelledByCurrency[item.currency] = (entry.cancelledByCurrency[item.currency] ?? 0) + item.amount;
    } else {
      entry.salesCount += 1;
      entry.totalsByCurrency[item.currency] = (entry.totalsByCurrency[item.currency] ?? 0) + item.amount;
      if (item.dueDate && (!entry.nextDueDate || item.dueDate < entry.nextDueDate)) entry.nextDueDate = item.dueDate;
    }
    byCustomer.set(item.customerId, entry);
  }

  const customers = await db
    .select({
      id: teamCustomers.id,
      name: teamCustomers.name,
      profileImage: teamCustomers.profileImage,
      status: teamCustomers.status,
    })
    .from(teamCustomers)
    .where(and(eq(teamCustomers.teamId, teamId), inArray(teamCustomers.id, [...byCustomer.keys()])));

  return customers
    .map((customer) => ({ ...customer, ...byCustomer.get(customer.id)! }))
    .sort((a, b) => {
      // Primero lo que vence antes; lo que no tiene fecha, al final.
      if (a.nextDueDate && b.nextDueDate) return a.nextDueDate.localeCompare(b.nextDueDate);
      if (a.nextDueDate) return -1;
      if (b.nextDueDate) return 1;
      return b.salesCount - a.salesCount;
    });
}
