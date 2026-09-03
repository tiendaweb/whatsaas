import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamArticles, teamFinancialEntries, teamSales } from '@/lib/db/schema';
import { convertContactToCustomer, customerForContact } from '@/lib/customers/service';
import { fromCents, logBotAction, resolveActorUserId, resolveBotActivePluginIds, resolveChatContact, toCents, toNumber } from './context';
import { fail, ok, type BuiltinToolDefinition } from './types';

/** Ventas y catálogo. */
export const salesTools: BuiltinToolDefinition[] = [
  {
    name: 'search_catalog',
    pluginId: 'articles',
    label: 'Buscar en el catálogo',
    summary: 'Busca productos/servicios activos por nombre, SKU o categoría, con precio y stock.',
    risk: 'read',
    description: 'Busca en el catálogo de artículos del negocio (productos y servicios) por nombre, SKU, categoría o etiqueta. Devuelve precio, moneda, unidad y stock. Usala antes de cotizar o de registrar una venta para usar los precios reales.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar. Vacío devuelve los primeros artículos.' },
        limit: { type: 'integer', description: 'Máximo de resultados (1-15). Por defecto 8.' },
      },
    },
    execute: async (args, context) => {
      const q = typeof args.query === 'string' ? args.query.trim() : '';
      const limit = Math.min(Math.max(Number(args.limit) || 8, 1), 15);
      const where = [eq(teamArticles.teamId, context.teamId), eq(teamArticles.status, 'active')];
      if (q) where.push(or(ilike(teamArticles.name, `%${q}%`), ilike(teamArticles.sku, `%${q}%`), ilike(teamArticles.category, `%${q}%`), ilike(teamArticles.description, `%${q}%`))!);
      const rows = await db.select().from(teamArticles).where(and(...where)).orderBy(teamArticles.name).limit(limit);
      return ok({
        total: rows.length,
        articles: rows.map((a) => ({ article_id: a.id, name: a.name, sku: a.sku, category: a.category, price: fromCents(a.price), currency: a.currency, unit: a.unit, stock: a.stock, description: a.description.slice(0, 200) })),
      });
    },
  },
  {
    name: 'register_sale',
    pluginId: 'sales',
    label: 'Registrar venta',
    summary: 'Crea una venta confirmada (pendiente de pago) para el cliente con sus ítems; si Financiero está activo genera el ingreso a cobrar.',
    risk: 'write',
    description:
      'Registra una venta para la persona con los ítems acordados (nombre, cantidad, precio unitario en la moneda indicada). Queda CONFIRMADA y PENDIENTE DE PAGO hasta que el equipo registre el cobro. Si la persona no era cliente, se la registra. Confirmá ítems y total con el cliente antes de llamarla. Podés indicar article_id para tomar el precio del catálogo.',
    parameters: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          description: 'Ítems vendidos',
          items: {
            type: 'object',
            required: ['name', 'quantity'],
            properties: {
              name: { type: 'string', description: 'Nombre del producto/servicio' },
              quantity: { type: 'number', description: 'Cantidad' },
              unit_price: { type: 'number', description: 'Precio unitario en unidades de la moneda (ej. 1500.50). Obligatorio si no hay article_id.' },
              article_id: { type: 'integer', description: 'id del artículo del catálogo (opcional)' },
            },
          },
        },
        currency: { type: 'string', description: 'Código ISO de 3 letras (ARS, USD, PYG…). Por defecto la del primer artículo o USD.' },
        notes: { type: 'string', description: 'Observaciones: forma de entrega, pago acordado, etc.' },
        due_date: { type: 'string', description: 'Vencimiento de pago YYYY-MM-DD (opcional)' },
      },
    },
    execute: async (args, context) => {
      if (!Array.isArray(args.items) || args.items.length === 0) return fail('items es obligatorio');
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');

      let currency = typeof args.currency === 'string' && /^[A-Za-z]{3}$/.test(args.currency) ? args.currency.toUpperCase() : '';
      const items: Array<{ articleId: number | null; name: string; sku: string; quantity: number; unitPrice: number; total: number }> = [];
      for (const raw of args.items.slice(0, 30)) {
        const quantity = toNumber(raw?.quantity) ?? 0;
        if (quantity <= 0) return fail(`Cantidad inválida para "${raw?.name ?? '?'}"`);
        let article: typeof teamArticles.$inferSelect | undefined;
        if (raw?.article_id) {
          article = await db.query.teamArticles.findFirst({ where: and(eq(teamArticles.id, Number(raw.article_id)), eq(teamArticles.teamId, context.teamId)) });
        }
        const unitPriceUnits = toNumber(raw?.unit_price);
        const unitPrice = unitPriceUnits !== null ? toCents(unitPriceUnits) : article?.price;
        if (unitPrice === undefined || unitPrice < 0) return fail(`Falta unit_price para "${raw?.name ?? article?.name ?? '?'}"`);
        if (!currency) currency = article?.currency ?? 'USD';
        const name = String(raw?.name ?? article?.name ?? '').trim().slice(0, 200);
        if (!name) return fail('Cada ítem necesita un nombre');
        items.push({ articleId: article?.id ?? null, name, sku: article?.sku ?? '', quantity, unitPrice, total: Math.round(quantity * unitPrice) });
      }
      const subtotal = items.reduce((sum, i) => sum + i.total, 0);

      const [actorId, active] = await Promise.all([resolveActorUserId(context.teamId, bundle.contact), resolveBotActivePluginIds(context.teamId)]);
      const { customer } = await convertContactToCustomer(context.teamId, bundle.contact.id, {}, actorId);
      const [{ total: count }] = await db.select({ total: sql<number>`count(*)` }).from(teamSales).where(eq(teamSales.teamId, context.teamId));
      const saleNumber = `V-${String((Number(count) || 0) + 1).padStart(4, '0')}`;
      const dueDate = typeof args.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.due_date) ? args.due_date : null;
      const notes = typeof args.notes === 'string' ? args.notes.slice(0, 2000) : '';

      const [sale] = await db
        .insert(teamSales)
        .values({
          teamId: context.teamId,
          contactId: bundle.contact.id,
          customerId: customer.id,
          idempotencyKey: `ai-chat-${context.chatId}-${Date.now()}`,
          saleNumber,
          status: 'confirmed',
          currency,
          items,
          subtotal,
          total: subtotal,
          notes: notes || 'Venta registrada por el agente IA de WhatsApp',
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00Z`) : null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning();

      let entryId: number | null = null;
      if (active.has('finance')) {
        const [entry] = await db
          .insert(teamFinancialEntries)
          .values({
            teamId: context.teamId,
            type: 'income',
            title: `Venta ${saleNumber}`,
            description: notes,
            category: 'Ventas',
            amount: subtotal,
            currency,
            status: 'pending',
            occurredOn: new Date().toISOString().slice(0, 10),
            dueOn: dueDate,
            recurrence: 'none',
            counterparty: customer.name,
            customerId: customer.id,
            saleId: sale.id,
            externalSource: 'ai-chat',
            externalId: sale.idempotencyKey,
            createdBy: actorId,
            updatedBy: actorId,
          })
          .returning({ id: teamFinancialEntries.id });
        entryId = entry.id;
      }
      await logBotAction(context, bundle, `@@syslog_ai_added_note`);
      return ok({ sale_id: sale.id, number: saleNumber, status: 'confirmed', payment_status: 'pending', currency, total: fromCents(subtotal), items: items.map((i) => ({ name: i.name, quantity: i.quantity, unit_price: fromCents(i.unitPrice), total: fromCents(i.total) })), finance_entry_id: entryId });
    },
  },
  {
    name: 'list_contact_purchases',
    pluginId: 'sales',
    label: 'Ver compras del contacto',
    summary: 'Últimas ventas de la persona con estado, ítems y total.',
    risk: 'read',
    description: 'Lista las últimas compras (ventas) de la persona: número, fecha, estado, ítems y total. Usala cuando pregunte por un pedido, quiera repetir una compra o reclame algo de una venta anterior.',
    parameters: { type: 'object', properties: { limit: { type: 'integer', description: 'Máximo (1-10). Por defecto 5.' } } },
    execute: async (args, context) => {
      const bundle = await resolveChatContact(context);
      if (!bundle) return fail('Chat no encontrado');
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
      const customer = await customerForContact(context.teamId, bundle.contact.id);
      const where = customer
        ? or(eq(teamSales.contactId, bundle.contact.id), eq(teamSales.customerId, customer.id))!
        : eq(teamSales.contactId, bundle.contact.id);
      const rows = await db.select().from(teamSales).where(and(eq(teamSales.teamId, context.teamId), where)).orderBy(desc(teamSales.createdAt)).limit(limit);
      return ok({
        sales: rows.map((s) => ({ sale_id: s.id, number: s.saleNumber, date: s.createdAt.toISOString().slice(0, 10), status: s.status, paid_at: s.paidAt?.toISOString() ?? null, due_date: s.dueDate?.toISOString().slice(0, 10) ?? null, currency: s.currency, total: fromCents(s.total), items: (s.items ?? []).map((i) => ({ name: i.name, quantity: i.quantity, unit_price: fromCents(i.unitPrice) })) })),
      });
    },
  },
];
