import 'server-only';

import { z } from 'zod';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';
import {
  createDeal,
  dealStats,
  deleteDeal,
  getDeal,
  listDeals,
  moveDeal,
  updateDeal,
} from '@/lib/deals/service';
import { closeDealAsLost, closeDealAsWon, convertLeadToDeal } from '@/lib/deals/conversions';
import { convertContactToCustomer } from '@/lib/customers/service';
import { DEAL_STAGES, OPEN_STAGES } from '@/lib/deals/types';

/**
 * Oportunidades por MCP.
 *
 * 🚨 `inputSchema` es JSON Schema puro. Un `z.object(...)` acá hace que la tool
 * desaparezca del listado en silencio, sin error ni log. Zod se usa sólo para
 * validar la entrada DENTRO del handler. Verificar con:
 *   npx tsx scripts/verify-connector-tools.mts
 *
 * El permiso se comprueba en la primera línea de cada handler, antes de tocar la
 * entrada: validar antes de autorizar le filtra la forma de los datos a quien no
 * debería verlos.
 */

// ── Lectura ──────────────────────────────────────────────────────────────────

export const dealsReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_deals_list',
    description:
      'Lista oportunidades de venta del equipo con filtros por etapa, responsable, cliente, ' +
      'monto mínimo, fecha estimada de cierre o falta de movimiento.',
    inputSchema: {
      type: 'object',
      properties: {
        stage: { type: 'string', enum: [...DEAL_STAGES] },
        owner_id: { type: ['integer', 'null'], minimum: 1 },
        customer_id: { type: ['integer', 'null'], minimum: 1 },
        contact_id: { type: ['integer', 'null'], minimum: 1 },
        min_value: { type: 'integer', minimum: 0, description: 'Importe en centavos.' },
        expected_before: { type: ['string', 'null'], description: 'Fecha ISO 8601 o YYYY-MM-DD.' },
        stale: { type: 'boolean', description: 'Sólo las que no se mueven hace 14 días o más.' },
        open: { type: 'boolean', description: 'Sólo las que siguen abiertas.' },
        q: { type: 'string', maxLength: 200 },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_deals_get',
    description: 'Devuelve una oportunidad con su cliente, contacto, responsable y venta enlazada.',
    inputSchema: {
      type: 'object',
      required: ['deal_id'],
      properties: { deal_id: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_deals_pipeline',
    description:
      'Resumen del embudo por etapa: cantidad, monto total y monto ponderado por probabilidad ' +
      '(lo que realmente se espera cerrar).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_deals_forecast',
    description:
      'Proyección de cierre por mes: suma el monto de cada oportunidad abierta ponderado por su ' +
      'probabilidad, agrupado por fecha estimada de cierre.',
    inputSchema: {
      type: 'object',
      properties: { months: { type: 'integer', minimum: 1, maximum: 24 } },
      additionalProperties: false,
    },
  },
];

// ── Escritura ────────────────────────────────────────────────────────────────

export const dealsActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_manage_deal',
    description:
      'Crea, actualiza o elimina una oportunidad de venta. Usa idempotency_key para que los ' +
      'reintentos no dupliquen la oportunidad. Eliminar exige confirm: true y NO borra la venta ' +
      'enlazada.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        deal_id: { type: ['integer', 'null'], minimum: 1 },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        customer_id: { type: ['integer', 'null'], minimum: 1 },
        contact_id: { type: ['integer', 'null'], minimum: 1 },
        stage: { type: 'string', enum: [...DEAL_STAGES] },
        value: { type: 'integer', minimum: 0, description: 'Importe en centavos.' },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        probability: { type: 'integer', minimum: 0, maximum: 100 },
        expected_close_date: { type: ['string', 'null'], description: 'Fecha ISO 8601 o YYYY-MM-DD.' },
        owner_id: { type: ['integer', 'null'], minimum: 1 },
        notes: { type: 'string', maxLength: 10000 },
        confirm: { type: 'boolean', description: 'Obligatorio en action=delete.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_deals_move',
    description:
      'Mueve una oportunidad de etapa y de posición en el tablero. NO registra la venta aunque ' +
      'se mueva a closed_won: para eso está whatspro_deals_close.',
    inputSchema: {
      type: 'object',
      required: ['deal_id', 'stage'],
      properties: {
        deal_id: { type: 'integer', minimum: 1 },
        stage: { type: 'string', enum: [...DEAL_STAGES] },
        position: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_deals_close',
    description:
      'Cierra una oportunidad como ganada o perdida. Al ganarla registra la venta enlazada, en ' +
      'una transacción. idempotency_key es obligatoria al ganar: sin ella un reintento podría ' +
      'facturar dos veces.',
    inputSchema: {
      type: 'object',
      required: ['deal_id', 'result'],
      properties: {
        deal_id: { type: 'integer', minimum: 1 },
        result: { type: 'string', enum: ['won', 'lost'] },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 120 },
        create_sale: { type: 'boolean', description: 'false gana la oportunidad sin emitir venta.' },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        reason: { type: 'string', maxLength: 2000, description: 'Motivo, cuando result=lost.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_convert_lead',
    description:
      'Convierte un prospecto en cliente y, si se pide, le abre una oportunidad. Deduplica el ' +
      'cliente por vínculo previo, email o teléfono. Si el contacto todavía no es cliente y se ' +
      'pide una oportunidad, la ficha de cliente se crea primero.',
    inputSchema: {
      type: 'object',
      required: ['contact_id', 'target', 'idempotency_key'],
      properties: {
        contact_id: { type: 'integer', minimum: 1 },
        target: { type: 'string', enum: ['customer', 'deal', 'customer_and_deal'] },
        customer: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', maxLength: 200 },
            email: { type: ['string', 'null'], maxLength: 255 },
            phone: { type: ['string', 'null'], maxLength: 80 },
          },
        },
        deal: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            value: { type: 'integer', minimum: 0, description: 'Importe en centavos.' },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            stage: { type: 'string', enum: ['qualified', 'proposal', 'negotiation'] },
            probability: { type: 'integer', minimum: 0, maximum: 100 },
            expected_close_date: { type: ['string', 'null'] },
            owner_id: { type: ['integer', 'null'], minimum: 1 },
          },
        },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 120 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_link_deal_contact',
    description: 'Vincula (o desvincula, pasando null) un contacto o un cliente a una oportunidad.',
    inputSchema: {
      type: 'object',
      required: ['deal_id'],
      properties: {
        deal_id: { type: 'integer', minimum: 1 },
        contact_id: { type: ['integer', 'null'], minimum: 1 },
        customer_id: { type: ['integer', 'null'], minimum: 1 },
      },
      additionalProperties: false,
    },
  },
];

// ── Handlers ─────────────────────────────────────────────────────────────────

const dateOrNull = z
  .string()
  .nullable()
  .optional()
  .transform((value) => (value ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : null));

const listSchema = z.object({
  stage: z.enum(DEAL_STAGES).optional(),
  owner_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  min_value: z.number().int().min(0).optional(),
  expected_before: dateOrNull,
  stale: z.boolean().optional(),
  open: z.boolean().optional(),
  q: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const manageSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  deal_id: z.number().int().positive().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  value: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expected_close_date: dateOrNull,
  owner_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(10000).optional(),
  confirm: z.boolean().optional(),
});

const moveSchema = z.object({
  deal_id: z.number().int().positive(),
  stage: z.enum(DEAL_STAGES),
  position: z.number().int().min(0).optional(),
});

const closeSchema = z.object({
  deal_id: z.number().int().positive(),
  result: z.enum(['won', 'lost']),
  idempotency_key: z.string().min(8).max(120).optional(),
  create_sale: z.boolean().optional(),
  currency: z.string().length(3).optional(),
  reason: z.string().max(2000).optional(),
});

const convertSchema = z.object({
  contact_id: z.number().int().positive(),
  target: z.enum(['customer', 'deal', 'customer_and_deal']),
  customer: z
    .object({
      name: z.string().max(200).optional(),
      email: z.string().max(255).nullable().optional(),
      phone: z.string().max(80).nullable().optional(),
    })
    .optional(),
  deal: z
    .object({
      title: z.string().min(1).max(200),
      value: z.number().int().min(0).optional(),
      currency: z.string().length(3).optional(),
      stage: z.enum(['qualified', 'proposal', 'negotiation']).optional(),
      probability: z.number().int().min(0).max(100).optional(),
      expected_close_date: dateOrNull,
      owner_id: z.number().int().positive().nullable().optional(),
    })
    .optional(),
  idempotency_key: z.string().min(8).max(120),
});

const linkSchema = z.object({
  deal_id: z.number().int().positive(),
  contact_id: z.number().int().positive().nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
});

export async function executeDealsAction(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
): Promise<unknown> {
  if (name === 'whatspro_deals_list') {
    await assertPermission(context, 'dealsRead', 'deals');
    const data = parse(listSchema, input);
    const deals = await listDeals(context.teamId, {
      stage: data.stage,
      ownerId: data.owner_id ?? undefined,
      customerId: data.customer_id ?? undefined,
      contactId: data.contact_id ?? undefined,
      minValue: data.min_value,
      expectedBefore: data.expected_before ?? undefined,
      stale: data.stale,
      open: data.open,
      search: data.q,
      limit: data.limit,
    });
    return { deals };
  }

  if (name === 'whatspro_deals_get') {
    await assertPermission(context, 'dealsRead', 'deals');
    const dealId = Number(input.deal_id);
    const deal = await getDeal(context.teamId, dealId);
    if (!deal) throw new Error('La oportunidad no existe en este equipo.');
    return { deal };
  }

  if (name === 'whatspro_deals_pipeline') {
    await assertPermission(context, 'dealsRead', 'deals');
    return dealStats(context.teamId);
  }

  if (name === 'whatspro_deals_forecast') {
    await assertPermission(context, 'dealsRead', 'deals');
    const months = Math.min(Math.max(Number(input.months) || 6, 1), 24);
    const deals = await listDeals(context.teamId, { open: true, limit: 500 });
    const horizon = new Date();
    horizon.setMonth(horizon.getMonth() + months);
    const buckets = new Map<string, { weighted: number; total: number; count: number }>();
    for (const deal of deals) {
      if (!deal.expectedCloseDate) continue;
      const date = new Date(deal.expectedCloseDate);
      if (date > horizon) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key) ?? { weighted: 0, total: 0, count: 0 };
      bucket.weighted += Math.round((deal.value * deal.probability) / 100);
      bucket.total += deal.value;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
    return {
      months: [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, bucket]) => ({ month, ...bucket })),
      // Se dice explícitamente cuántas quedaron fuera por no tener fecha: si no,
      // una proyección incompleta se lee como si fuera todo el embudo.
      without_expected_close_date: deals.filter((deal) => !deal.expectedCloseDate).length,
    };
  }

  if (name === 'whatspro_manage_deal') {
    await assertPermission(context, 'dealsWrite', 'deals');
    const data = parse(manageSchema, input);

    if (data.action === 'delete') {
      if (!data.deal_id) throw new Error('deal_id es obligatorio para eliminar.');
      if (!data.confirm) throw new Error('confirm es obligatorio para eliminar una oportunidad.');
      const done = await deleteDeal(context.teamId, data.deal_id, context.userId);
      if (!done) throw new Error('La oportunidad no existe en este equipo.');
      await audit(context, 'GROK_DEAL_DELETED', data.deal_id);
      // La venta enlazada sobrevive.
      return { success: true, deleted: true, deal_id: data.deal_id };
    }

    if (data.action === 'create') {
      if (!data.title) throw new Error('title es obligatorio para crear una oportunidad.');
      const deal = await createDeal(
        context.teamId,
        {
          title: data.title,
          customerId: data.customer_id ?? null,
          contactId: data.contact_id ?? null,
          stage: data.stage,
          value: data.value,
          currency: data.currency,
          probability: data.probability,
          expectedCloseDate: data.expected_close_date,
          ownerId: data.owner_id ?? null,
          notes: data.notes,
          source: 'connector',
        },
        context.userId,
      );
      await audit(context, 'GROK_DEAL_CREATED', deal.id);
      return { success: true, created: true, deal };
    }

    if (!data.deal_id) throw new Error('deal_id es obligatorio para actualizar.');
    const deal = await updateDeal(
      context.teamId,
      data.deal_id,
      {
        title: data.title,
        customerId: data.customer_id ?? undefined,
        contactId: data.contact_id ?? undefined,
        stage: data.stage,
        value: data.value,
        currency: data.currency,
        probability: data.probability,
        ...(input.expected_close_date !== undefined
          ? { expectedCloseDate: data.expected_close_date }
          : {}),
        ownerId: data.owner_id ?? undefined,
        notes: data.notes,
      },
      context.userId,
    );
    if (!deal) throw new Error('La oportunidad no existe en este equipo.');
    await audit(context, 'GROK_DEAL_UPDATED', deal.id);
    return { success: true, created: false, deal };
  }

  if (name === 'whatspro_deals_move') {
    await assertPermission(context, 'dealsWrite', 'deals');
    const data = parse(moveSchema, input);
    const deal = await moveDeal(
      context.teamId,
      data.deal_id,
      { stage: data.stage, position: data.position ?? 0 },
      context.userId,
    );
    if (!deal) throw new Error('La oportunidad no existe en este equipo.');
    await audit(context, 'GROK_DEAL_MOVED', deal.id);
    return { success: true, deal, billed: false };
  }

  if (name === 'whatspro_deals_close') {
    await assertPermission(context, 'dealsWrite', 'deals');
    const data = parse(closeSchema, input);

    if (data.result === 'lost') {
      const deal = await closeDealAsLost(context.teamId, data.deal_id, data.reason ?? '', context.userId);
      if (!deal) throw new Error('La oportunidad no existe en este equipo.');
      await audit(context, 'GROK_DEAL_LOST', deal.id);
      return { success: true, deal, sale: null };
    }

    // Ganar emite una venta: hace falta también permiso sobre ventas.
    if (data.create_sale !== false) await assertPermission(context, 'salesWrite', 'sales');
    if (!data.idempotency_key) {
      throw new Error('idempotency_key es obligatoria al ganar una oportunidad.');
    }
    const result = await closeDealAsWon(
      context.teamId,
      data.deal_id,
      {
        idempotencyKey: data.idempotency_key,
        createSale: data.create_sale,
        currency: data.currency,
      },
      context.userId,
    );
    if (!result) throw new Error('La oportunidad no existe en este equipo.');
    await audit(context, 'GROK_DEAL_WON', result.deal.id);
    return { success: true, ...result };
  }

  if (name === 'whatspro_convert_lead') {
    const data = parse(convertSchema, input);
    await assertPermission(context, 'customersWrite', 'customers');

    if (data.target === 'customer') {
      const result = await convertContactToCustomer(
        context.teamId,
        data.contact_id,
        data.customer ?? {},
        context.userId,
      );
      await audit(context, 'GROK_LEAD_CONVERTED', result.customer.id);
      return { success: true, ...result, deal: null };
    }

    // Abrir la oportunidad toca dos apps, así que pide los dos permisos.
    await assertPermission(context, 'dealsWrite', 'deals');
    if (!data.deal) throw new Error('Faltan los datos de la oportunidad.');
    const result = await convertLeadToDeal(
      context.teamId,
      {
        contactId: data.contact_id,
        title: data.deal.title,
        value: data.deal.value,
        currency: data.deal.currency,
        stage: data.deal.stage,
        probability: data.deal.probability,
        expectedCloseDate: data.deal.expected_close_date,
        ownerId: data.deal.owner_id ?? null,
      },
      context.userId,
    );
    await audit(context, 'GROK_LEAD_CONVERTED', result.deal.id);
    return { success: true, ...result };
  }

  if (name === 'whatspro_link_deal_contact') {
    await assertPermission(context, 'dealsWrite', 'deals');
    const data = parse(linkSchema, input);
    const deal = await updateDeal(
      context.teamId,
      data.deal_id,
      {
        ...(data.contact_id !== undefined ? { contactId: data.contact_id } : {}),
        ...(data.customer_id !== undefined ? { customerId: data.customer_id } : {}),
      },
      context.userId,
    );
    if (!deal) throw new Error('La oportunidad no existe en este equipo.');
    return { success: true, deal };
  }

  return undefined;
}

export const DEALS_TOOL_NAMES = new Set([
  ...dealsReadTools.map((tool) => tool.name),
  ...dealsActionTools.map((tool) => tool.name),
]);

export { OPEN_STAGES };
