import 'server-only';
import { z } from 'zod';
import { assertPermission, parse, type GrokActionContext, type GrokActionTool } from '@/lib/plugins/grok-connector/server/actions';
import { CobroError, deudaDelContacto, registrarCobro } from '@/lib/plugins/sales-ops/server/cobros';
import { SALES_OPS_PLUGIN_ID } from '@/lib/plugins/sales-ops/shared/taxonomy';

/**
 * Cobros por chat (`whatspro_sales_register_payment` / `_contact_money`).
 *
 * Hasta acá un conector que quería registrar "Juan pagó 50.000 por
 * transferencia" necesitaba cuatro llamadas (registrar cliente, buscar la
 * deuda, asentar, saldar) y ninguna aceptaba `chat_id`; el resultado eran
 * asientos en pesos donde Finanzas espera centavos y chats que seguían en G9
 * "pago pendiente" con la plata ya cobrada. Acá es UNA llamada, con el mismo
 * `registrarCobro` que usa la Cola al aprobar y el Focus.
 *
 * 🚨 `inputSchema` es JSON Schema puro (nada de zod adentro).
 */

const isoDateProperty = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;

export const cobrosReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_contact_money',
    description:
      'Lo que un contacto debe y lo que ya pagó, resuelto desde el chat: ventas pendientes (team_sales), asientos de ingreso pendientes y pagados ' +
      '(Finanzas), con sus ids para cobrar contra algo existente en vez de duplicar. Montos en centavos y en unidades (*Units). ' +
      'Las monedas nunca se suman entre sí. Usala antes de whatspro_sales_register_payment cuando el chat habla de una seña, un saldo o una cuota.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'integer', minimum: 1 },
        contact_id: { type: 'integer', minimum: 1, description: 'Alternativa a chat_id.' },
      },
      additionalProperties: false,
    },
  },
];

export const cobrosActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_sales_register_payment',
    description:
      'Registra un COBRO de un cliente de WhatsApp en una sola llamada: crea la venta pagada (o cobra la venta/asiento pendiente que indiques), ' +
      'el asiento de ingreso y su pago en Finanzas (con medio y cuenta), vincula al contacto como CLIENTE, pasa el chat a G11 · cliente en el ' +
      'Command Center, cancela los recordatorios de pago propuestos y, si pasás receipt_message_id, cuelga el comprobante del chat al asiento. ' +
      'El importe va en UNIDADES de la moneda (50000 son cincuenta mil pesos; 45.5 son cuarenta y cinco con cincuenta), NUNCA en centavos. ' +
      'Idempotente por idempotency_key: repetir la llamada devuelve lo ya registrado. Es plata: usala SOLO desde una fila register_sale aprobada ' +
      '(la idempotency_key del ítem, sales-ops:{actionId}) o cuando una persona te pidió registrar ese cobro explícitamente; si el cliente dice ' +
      '"ya pagué" y nadie lo pidió, proponé la fila con whatspro_sales_queue_propose kind=register_sale y que la aprueben. Con dry_run ves qué haría sin escribir.',
    inputSchema: {
      type: 'object',
      required: ['amount', 'currency', 'idempotency_key', 'confirm'],
      properties: {
        chat_id: { type: 'integer', minimum: 1, description: 'Chat del cliente. Alternativa: contact_id.' },
        contact_id: { type: 'integer', minimum: 1 },
        amount: { type: 'number', exclusiveMinimum: 0, description: 'En UNIDADES de la moneda (decimal). 50000 = $50.000.' },
        currency: { type: 'string', minLength: 3, maxLength: 3, description: 'ARS, USD, PYG…' },
        paid_on: { ...isoDateProperty, description: 'Fecha del cobro. Default: hoy (hora del negocio).' },
        method: { type: 'string', maxLength: 80, description: '"transferencia", "Mercado Pago", "efectivo"…' },
        account_id: { type: 'integer', minimum: 1, description: 'Cuenta de Finanzas por la que entró (whatspro_finance_accounts).' },
        concept: { type: 'string', maxLength: 200, description: 'Qué se cobró: "Seña sitio web", "Saldo tienda". Default "Cobro".' },
        sale_id: { type: 'integer', minimum: 1, description: 'Cobrar contra una venta pendiente (ids en whatspro_sales_contact_money).' },
        entry_id: { type: 'integer', minimum: 1, description: 'Cobrar contra un asiento pendiente (ids en whatspro_sales_contact_money).' },
        receipt_message_id: { type: 'string', maxLength: 255, description: 'id del mensaje del chat con el comprobante (imagen o PDF).' },
        notes: { type: 'string', maxLength: 2000 },
        idempotency_key: { type: 'string', minLength: 6, maxLength: 80, description: 'Clave estable de este cobro. Desde la Cola: la del ítem (sales-ops:{actionId}).' },
        confirm: { type: 'boolean', const: true, description: 'Obligatorio en true: registra dinero.' },
        dry_run: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
];

const moneySchema = z.object({ chat_id: z.number().int().positive().optional(), contact_id: z.number().int().positive().optional() });

const paymentSchema = z.object({
  chat_id: z.number().int().positive().optional(),
  contact_id: z.number().int().positive().optional(),
  amount: z.number().positive(),
  currency: z.string().trim().length(3),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.string().max(80).optional(),
  account_id: z.number().int().positive().optional(),
  concept: z.string().max(200).optional(),
  sale_id: z.number().int().positive().optional(),
  entry_id: z.number().int().positive().optional(),
  receipt_message_id: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
  idempotency_key: z.string().trim().min(6).max(80),
  confirm: z.literal(true),
  dry_run: z.boolean().optional(),
});

export async function executeCobrosTool(name: string, input: Record<string, unknown>, context: GrokActionContext): Promise<unknown> {
  if (name === 'whatspro_sales_contact_money') {
    await assertPermission(context, 'salesOpsRead', SALES_OPS_PLUGIN_ID);
    const data = parse(moneySchema, input);
    if (!data.chat_id && !data.contact_id) throw new Error('Falta chat_id o contact_id.');
    try {
      return await deudaDelContacto(context.teamId, { chatId: data.chat_id ?? null, contactId: data.contact_id ?? null });
    } catch (error) {
      if (error instanceof CobroError) throw new Error(error.message);
      throw error;
    }
  }

  if (name === 'whatspro_sales_register_payment') {
    await assertPermission(context, 'salesOpsWrite', SALES_OPS_PLUGIN_ID);
    // Es plata: además del plugin, hace falta poder escribir Finanzas.
    await assertPermission(context, 'financeWrite');
    const data = parse(paymentSchema, input);
    if (!data.chat_id && !data.contact_id) throw new Error('Falta chat_id o contact_id.');
    try {
      const result = await registrarCobro(context.teamId, context.userId, {
        chatId: data.chat_id ?? null,
        contactId: data.contact_id ?? null,
        amount: data.amount,
        currency: data.currency,
        paidOn: data.paid_on ?? null,
        method: data.method ?? null,
        accountId: data.account_id ?? null,
        concept: data.concept ?? null,
        saleId: data.sale_id ?? null,
        entryId: data.entry_id ?? null,
        receiptMessageId: data.receipt_message_id ?? null,
        notes: data.notes ?? null,
        idempotencyKey: data.idempotency_key,
        via: 'conector',
        dryRun: data.dry_run,
      });
      return {
        success: true,
        ...result,
        note: result.dryRun
          ? 'dry_run: no se escribió nada.'
          : result.idempotent
            ? 'Ya estaba registrado con esa idempotency_key: no se duplicó.'
            : 'Cobro registrado. Si venía de una fila aprobada, cerrala con whatspro_sales_queue_result {status:"executed"}.',
      };
    } catch (error) {
      if (error instanceof CobroError) throw new Error(error.message);
      throw error;
    }
  }

  throw new Error(`cobros: tool desconocida ${name}`);
}
