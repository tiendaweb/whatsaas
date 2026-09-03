import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCustomerContacts, teamCustomers, teamSales } from '@/lib/db/schema';

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
 * Vive acá y no dentro de la ruta HTTP porque lo consumen dos superficies —
 * el panel de Tareas y la herramienta MCP de cobranzas— y tienen que dar
 * exactamente el mismo resultado.
 */
const PENDING_STATUSES = ['draft', 'confirmed'];

export type ClientePendiente = {
  id: number;
  name: string;
  profileImage: string | null;
  status: string;
  salesCount: number;
  /** Total adeudado por moneda, en la unidad menor. Nunca se suman monedas distintas. */
  totalsByCurrency: Record<string, number>;
  nextDueDate: string | null;
};

export async function listCustomersPendingPayment(teamId: number): Promise<ClientePendiente[]> {
  const pendingSales = await db
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
    .where(and(eq(teamSales.teamId, teamId), inArray(teamSales.status, PENDING_STATUSES)));

  if (!pendingSales.length) return [];

  const byCustomer = new Map<number, Omit<ClientePendiente, 'name' | 'profileImage' | 'status'>>();
  for (const sale of pendingSales) {
    const entry = byCustomer.get(sale.customerId)
      ?? { id: sale.customerId, salesCount: 0, totalsByCurrency: {}, nextDueDate: null };
    entry.salesCount += 1;
    entry.totalsByCurrency[sale.currency] = (entry.totalsByCurrency[sale.currency] ?? 0) + sale.total;
    const due = sale.dueDate ? sale.dueDate.toISOString() : null;
    if (due && (!entry.nextDueDate || due < entry.nextDueDate)) entry.nextDueDate = due;
    byCustomer.set(sale.customerId, entry);
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
