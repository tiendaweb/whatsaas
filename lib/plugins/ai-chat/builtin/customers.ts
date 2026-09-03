import { getContactCommercialSnapshot } from '@/lib/contacts/graph';
import { convertContactToCustomer } from '@/lib/customers/service';
import { fromCents, logBotAction, resolveActorUserId, resolveChatContact } from './context';
import { fail, ok, type BuiltinToolDefinition } from './types';

function moneyMap(map: Record<string, number> | undefined) {
  return Object.fromEntries(Object.entries(map ?? {}).map(([currency, cents]) => [currency, fromCents(cents)]));
}

/** Clientes: cuenta comercial de la persona que escribe. */
export const customersTools: BuiltinToolDefinition[] = [
  {
    name: 'get_customer_account',
    pluginId: 'customers',
    label: 'Ver cuenta del cliente',
    summary: 'Resumen 360: si ya es cliente, compras, saldos, membresías, oportunidades y próxima cita.',
    risk: 'read',
    description:
      'Devuelve el resumen comercial de la persona: si ya está registrada como cliente, cuánto compró, qué tiene pendiente de pago, membresías activas, oportunidades abiertas y próximo turno. Usala cuando el cliente pregunte por "mi cuenta", "qué debo", "mi plan" o antes de registrar una venta para no duplicar.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => {
      const snapshot = await getContactCommercialSnapshot(context.teamId, { chatId: context.chatId });
      if (!snapshot) return ok({ is_customer: false, note: 'La persona todavía no tiene ficha de contacto.' });
      const { scope, money, subscriptions, deals, agenda } = snapshot;
      return ok({
        is_customer: scope.customerId !== null,
        customer_id: scope.customerId,
        customer_name: scope.customerName,
        money: money
          ? { pending_count: money.pendingCount, pending_by_currency: moneyMap(money.pendingByCurrency), paid_by_currency: moneyMap(money.paidByCurrency), overdue_count: money.overdueCount, next_due_date: money.nextDueDate }
          : null,
        memberships: subscriptions
          ? { active: subscriptions.active.map((s) => ({ plan: s.planName, status: s.status, payment_status: s.paymentStatus, ends_on: s.endDate, days_left: s.daysLeft })), unpaid: subscriptions.unpaid.length, next_renewal: subscriptions.nextRenewal }
          : null,
        open_deals: deals ? deals.open.map((d) => ({ deal_id: d.dealId, title: d.title, stage: d.stage, value: fromCents(d.value), currency: d.currency })) : null,
        next_appointment: agenda?.next ? { title: agenda.next.title, starts_at: agenda.next.startsAt } : null,
      });
    },
  },
  {
    name: 'register_customer',
    pluginId: 'customers',
    label: 'Registrar como cliente',
    summary: 'Convierte el contacto en cliente (o lo vincula a uno existente por email/teléfono).',
    risk: 'write',
    description:
      'Registra a la persona como cliente del negocio a partir de su contacto de WhatsApp. Si ya existe un cliente con el mismo email o teléfono, lo vincula en vez de duplicarlo. Llamala cuando el cliente concreta una compra, contrata un servicio o pide ser dado de alta.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre o razón social. Si falta se usa el nombre del contacto.' },
        email: { type: 'string', description: 'Email del cliente' },
        notes: { type: 'string', description: 'Observaciones (qué compró, cómo llegó, etc.)' },
      },
    },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const actorId = await resolveActorUserId(context.teamId, bundle.contact);
      const result = await convertContactToCustomer(
        context.teamId,
        bundle.contact.id,
        {
          name: typeof args.name === 'string' && args.name.trim() ? args.name.trim().slice(0, 200) : undefined,
          email: typeof args.email === 'string' && /\S+@\S+\.\S+/.test(args.email) ? args.email.trim().toLowerCase() : undefined,
          notes: typeof args.notes === 'string' ? args.notes.slice(0, 2000) : undefined,
        },
        actorId,
      );
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ customer_id: result.customer.id, name: result.customer.name, created: result.created, linked_to_existing: result.linkedToExisting });
    },
  },
  {
    name: 'get_pending_payments',
    pluginId: 'customers',
    label: 'Ver pagos pendientes',
    summary: 'Ventas impagas o vencidas de esta persona, con importes y vencimientos.',
    risk: 'read',
    description: 'Lista las ventas pendientes de pago (y vencidas) de la persona, con número, importe, moneda y vencimiento. Usala cuando pregunte cuánto debe o antes de reclamar/confirmar un pago.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => {
      const snapshot = await getContactCommercialSnapshot(context.teamId, { chatId: context.chatId }, { deals: false, agenda: false, subscriptions: false });
      if (!snapshot?.money) return ok({ pending: [], note: 'Sin cliente vinculado o sin ventas registradas.' });
      const money = snapshot.money;
      const pending = money.sales.filter((s) => s.status !== 'paid' && s.status !== 'cancelled');
      return ok({
        pending_count: money.pendingCount,
        overdue_count: money.overdueCount,
        next_due_date: money.nextDueDate,
        pending_by_currency: moneyMap(money.pendingByCurrency),
        sales: pending.slice(0, 10).map((s) => ({ sale_id: s.saleId, number: s.saleNumber, status: s.status, total: fromCents(s.total), currency: s.currency, due_date: s.dueDate, overdue: s.overdue })),
      });
    },
  },
];

