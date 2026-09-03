import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamFinancialEntries, teamSales } from '@/lib/db/schema';
import { getContactCommercialSnapshot } from '@/lib/contacts/graph';
import { convertContactToCustomer } from '@/lib/customers/service';
import { fromCents, logBotAction, resolveActorUserId, resolveChatContact, toCents, toNumber } from './context';
import { fail, ok, type BuiltinToolDefinition } from './types';

/** Financiero: saldo y aviso de pago. */
export const financeTools: BuiltinToolDefinition[] = [
  {
    name: 'report_payment',
    pluginId: 'finance',
    label: 'Registrar aviso de pago',
    summary: 'Anota un pago que el cliente dice haber hecho como ingreso PENDIENTE de confirmación (nunca lo marca cobrado).',
    risk: 'write',
    description:
      'Registra que la persona informó un pago (transferencia, efectivo, etc.). Se crea un ingreso PENDIENTE DE CONFIRMACIÓN vinculado al cliente; un humano lo confirma al ver el dinero. Nunca le digas al cliente que el pago está acreditado: decile que quedó registrado y será verificado. Si el pago corresponde a una venta concreta, pasá sale_id (ver get_pending_payments).',
    parameters: {
      type: 'object',
      required: ['amount', 'currency'],
      properties: {
        amount: { type: 'number', description: 'Importe informado, en unidades de la moneda' },
        currency: { type: 'string', description: 'Código ISO de 3 letras (ARS, USD, PYG…)' },
        method: { type: 'string', description: 'Medio: transferencia, efectivo, Mercado Pago, tarjeta…' },
        reference: { type: 'string', description: 'Número de operación / comprobante si lo dio' },
        sale_id: { type: 'integer', description: 'Venta a la que corresponde (opcional)' },
      },
    },
    execute: async (args, context) => {
      const amount = toNumber(args.amount);
      if (amount === null || amount <= 0) return fail('amount inválido');
      const currency = typeof args.currency === 'string' && /^[A-Za-z]{3}$/.test(args.currency) ? args.currency.toUpperCase() : '';
      if (!currency) return fail('currency debe ser un código de 3 letras');
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const actorId = await resolveActorUserId(context.teamId, bundle.contact);
      const { customer } = await convertContactToCustomer(context.teamId, bundle.contact.id, {}, actorId);

      let saleId: number | null = null;
      if (args.sale_id) {
        const sale = await db.query.teamSales.findFirst({ where: and(eq(teamSales.id, Number(args.sale_id)), eq(teamSales.teamId, context.teamId)), columns: { id: true, customerId: true, contactId: true } });
        if (sale && (sale.customerId === customer.id || sale.contactId === bundle.contact.id)) saleId = sale.id;
      }
      const method = typeof args.method === 'string' ? args.method.trim().slice(0, 80) : null;
      const reference = typeof args.reference === 'string' ? args.reference.trim().slice(0, 120) : '';
      const today = new Date().toISOString().slice(0, 10);
      const [entry] = await db
        .insert(teamFinancialEntries)
        .values({
          teamId: context.teamId,
          type: 'income',
          title: `Pago informado por ${customer.name}`.slice(0, 200),
          description: ['Informado por el cliente vía WhatsApp (agente IA). Verificar antes de confirmar.', reference ? `Referencia: ${reference}` : ''].filter(Boolean).join(' '),
          category: 'Cobranzas',
          amount: toCents(amount),
          currency,
          status: 'pending',
          occurredOn: today,
          dueOn: today,
          recurrence: 'none',
          paymentMethod: method,
          counterparty: customer.name,
          customerId: customer.id,
          saleId,
          externalSource: 'ai-chat',
          externalId: `chat-${context.chatId}-${Date.now()}`,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: teamFinancialEntries.id });
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ entry_id: entry.id, status: 'pending_confirmation', amount, currency, sale_id: saleId, instruction: 'Informar al cliente que el pago quedó registrado y será verificado por el equipo.' });
    },
  },
  {
    name: 'get_account_balance',
    pluginId: 'finance',
    label: 'Ver saldo del cliente',
    summary: 'Cuánto tiene pendiente y vencido la persona, por moneda, y su próximo vencimiento.',
    risk: 'read',
    description: 'Devuelve el saldo de la persona: total pendiente y vencido por moneda, cantidad de comprobantes y próximo vencimiento. Usala cuando pregunte "cuánto debo" o antes de recordarle un pago.',
    parameters: { type: 'object', properties: {} },
    execute: async (_args, context) => {
      const snapshot = await getContactCommercialSnapshot(context.teamId, { chatId: context.chatId }, { deals: false, agenda: false, subscriptions: false });
      if (!snapshot?.money) return ok({ pending_by_currency: {}, note: 'Sin cliente vinculado o sin movimientos.' });
      const m = snapshot.money;
      const conv = (map: Record<string, number>) => Object.fromEntries(Object.entries(map).map(([c, v]) => [c, fromCents(v)]));
      return ok({ pending_count: m.pendingCount, overdue_count: m.overdueCount, next_due_date: m.nextDueDate, pending_by_currency: conv(m.pendingByCurrency), paid_by_currency: conv(m.paidByCurrency) });
    },
  },
];
