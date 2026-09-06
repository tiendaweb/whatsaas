import 'server-only';

import { and, asc, count, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  FINANCE_EXTERNAL_SOURCE,
  FinanceEntryError,
  findEntryByIdempotencyKey,
  recordFinancialEntry,
  settleFinancialEntry,
  updateFinancialEntry,
} from '@/lib/plugins/finance/server/entries';
import {
  createBudget,
  deleteBudget,
  FinanceBudgetError,
  getBudget,
  listBudgetsWithExecution,
  updateBudget,
} from '@/lib/plugins/finance/server/budgets';
import {
  createCostCenter,
  deleteCostCenter,
  FinanceCostCenterError,
  getCostCenter,
  listCostCenters,
  updateCostCenter,
} from '@/lib/plugins/finance/server/cost-centers';
import { financeOsResumen } from '@/lib/plugins/finance/server/os';
import { customerForContact } from '@/lib/customers/service';
import { db } from '@/lib/db/drizzle';
import {
  contacts,
  teamBudgets,
  teamCustomers,
  teamExchangeRates,
  teamFinancialAccounts,
  teamFinancialEntries,
  teamFinancialEntryPayments,
  teamSales,
} from '@/lib/db/schema';
import {
  budgetSchema,
  costCenterSchema,
  exchangeRateSchema,
  financialAccountSchema,
  FINANCIAL_STATUSES,
} from '@/lib/plugins/finance/server/schema';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Escrituras financieras del conector.
 *
 * Hasta ahora el conector podía PREGUNTAR por la plata y no registrarla: las
 * únicas escrituras eran `whatspro_register_membership` y el `payment_status`
 * de una suscripción. Consecuencia práctica: un cobro en tres pagos sólo se
 * podía anotar como "pagado", sin monto por pago ni cuenta de destino, y
 * `whatspro_customers_pending_payment` —que lee de lo cargado— nunca podía
 * estar completo.
 *
 * Estas tres tools son las primeras del conector que registran dinero. Por eso
 * nacen con las dos protecciones juntas, no agregadas después:
 * `idempotency_key` obligatoria (un reintento no duplica un cobro) y `confirm`
 * (un asiento mal cargado ensucia la contabilidad del equipo).
 */

const IDEMPOTENCIA = 'Clave estable e irrepetible de este registro (ej. "focuson-seña-2026-08-25"). '
  + 'Repetir la llamada con la misma clave devuelve el registro original en vez de duplicarlo.';

const FUENTE = FINANCE_EXTERNAL_SOURCE;

const isoDateProperty = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;

export const financeActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_finance_record_entry',
    description:
      'Registra un movimiento financiero: un ingreso (una venta cobrada o por cobrar) o un egreso (un gasto). '
      + 'Es la puerta para que la plata quede DENTRO del sistema en vez de en una nota. '
      + 'Los montos van en CENTAVOS (unidad mínima) y como entero: $200.000 ARS son 20000000; USD 45,50 son 4550. Para un cobro de un cliente de WhatsApp preferí whatspro_sales_register_payment, que recibe unidades y hace todo (venta, asiento, pago, cliente, G11). '
      + 'Si el movimiento ya se cobró, podés mandarlo con status "paid" y paid_on; si se cobra en partes, dejalo "pending" '
      + 'y después registrá cada pago con whatspro_finance_settle_entry.',
    inputSchema: {
      type: 'object',
      required: ['type', 'title', 'category', 'amount', 'currency', 'occurred_on', 'idempotency_key', 'confirm'],
      properties: {
        type: { type: 'string', enum: ['income', 'expense'], description: 'income = entra plata; expense = sale plata.' },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 5000 },
        category: { type: 'string', minLength: 1, maxLength: 60, description: 'Ej. "Servicios", "Sitios web", "Impuestos".' },
        amount: { type: 'integer', minimum: 0, description: 'Entero en la unidad mínima de la moneda.' },
        currency: { type: 'string', minLength: 3, maxLength: 3, description: 'ISO 4217: ARS, USD…' },
        status: { type: 'string', enum: ['pending', 'paid', 'overdue', 'cancelled'], description: 'Por defecto "pending".' },
        occurred_on: { ...isoDateProperty, description: 'Fecha del hecho económico.' },
        due_on: { ...isoDateProperty, description: 'Vencimiento, si aplica.' },
        paid_on: { ...isoDateProperty, description: 'Fecha de cobro/pago. Obligatoria si status es "paid".' },
        recurrence: { type: 'string', enum: ['none', 'monthly', 'annual'], description: 'Por defecto "none". OJO: se guarda y se calcula el siguiente vencimiento, pero NADIE materializa el asiento del mes que viene todavía.' },
        payment_method: { type: ['string', 'null'], maxLength: 80 },
        counterparty: { type: ['string', 'null'], maxLength: 200, description: 'A quién se le cobró o pagó, si no hay cliente cargado.' },
        customer_id: { type: ['integer', 'null'], minimum: 1 },
        subscription_id: { type: ['integer', 'null'], minimum: 1 },
        sale_id: { type: ['integer', 'null'], minimum: 1 },
        project_id: { type: ['integer', 'null'], minimum: 1 },
        account_id: { type: ['integer', 'null'], minimum: 1, description: 'Cuenta de destino/origen. Listalas con whatspro_finance_accounts.' },
        cost_center_id: { type: ['integer', 'null'], minimum: 1 },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80, description: IDEMPOTENCIA },
        confirm: { type: 'boolean', const: true, description: 'Obligatorio en true: esto entra en la contabilidad del equipo.' },
        dry_run: { type: 'boolean', description: 'Devuelve el asiento resuelto (relaciones incluidas) sin escribir nada.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_finance_settle_entry',
    description:
      'Registra un PAGO contra un movimiento financiero ya cargado. Sirve para cobros en partes: cada llamada suma un pago '
      + 'con su monto, su fecha y la cuenta por la que entró. Cuando la suma de los pagos alcanza el total del movimiento, '
      + 'éste pasa solo a "paid". Para el movimiento en sí usá whatspro_finance_record_entry.',
    inputSchema: {
      type: 'object',
      required: ['entry_id', 'amount', 'paid_on', 'idempotency_key', 'confirm'],
      properties: {
        entry_id: { type: 'integer', minimum: 1 },
        amount: { type: 'integer', minimum: 1, description: 'Entero en la unidad mínima de la moneda.' },
        paid_on: { ...isoDateProperty },
        account_id: { type: ['integer', 'null'], minimum: 1, description: 'Por qué cuenta entró o salió.' },
        method: { type: ['string', 'null'], maxLength: 80, description: 'Ej. "transferencia", "efectivo", "Mercado Pago".' },
        notes: { type: 'string', maxLength: 2000 },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80, description: IDEMPOTENCIA },
        confirm: { type: 'boolean', const: true, description: 'Obligatorio en true: esto registra plata.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_register_sale',
    description:
      'Carga una venta con sus ítems. Usala cuando hay un detalle de qué se vendió; si sólo hay un monto, alcanza con '
      + 'whatspro_finance_record_entry. Con create_entry: true además crea el movimiento financiero de ingreso asociado, '
      + 'que es lo que hace que la venta aparezca en los reportes de cobranza.',
    inputSchema: {
      type: 'object',
      required: ['items', 'currency', 'idempotency_key', 'confirm'],
      properties: {
        contact_id: { type: ['integer', 'null'], minimum: 1, description: 'Contacto del CRM al que se le vendió.' },
        sale_number: { type: 'string', maxLength: 50, description: 'Si no se manda, se numera solo (V-0001, V-0002…).' },
        status: { type: 'string', enum: ['draft', 'confirmed', 'paid', 'cancelled', 'refunded'], description: 'Por defecto "confirmed".' },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        items: {
          type: 'array', minItems: 1, maxItems: 200,
          items: {
            type: 'object',
            required: ['name', 'quantity', 'unit_price'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 300 },
              sku: { type: 'string', maxLength: 100 },
              quantity: { type: 'number', minimum: 0.001 },
              unit_price: { type: 'integer', minimum: 0, description: 'Entero en la unidad mínima de la moneda.' },
            },
            additionalProperties: false,
          },
        },
        discount_amount: { type: 'integer', minimum: 0 },
        tax_amount: { type: 'integer', minimum: 0 },
        notes: { type: 'string', maxLength: 5000 },
        due_date: { ...isoDateProperty },
        create_entry: { type: 'boolean', description: 'Crear también el movimiento de ingreso en Financiero. Recomendado.' },
        category: { type: 'string', maxLength: 60, description: 'Categoría del movimiento cuando create_entry es true. Por defecto "Ventas".' },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80, description: IDEMPOTENCIA },
        confirm: { type: 'boolean', const: true, description: 'Obligatorio en true: esto registra dinero.' },
        dry_run: { type: 'boolean', description: 'Devuelve la venta calculada (subtotal, total, numeración) sin escribir.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_finance_manage_account',
    description:
      'Crea o edita una CUENTA financiera del equipo (efectivo, banco, Mercado Pago, Stripe, PayPal u otra): nombre, tipo, moneda, saldo inicial, activa/inactiva y notas. Las cuentas son a dónde entran y de dónde salen los pagos (whatspro_finance_settle_entry pide account_id). OJO con opening_balance: mueve el saldo reportado de la cuenta — cambiarlo en una cuenta con movimientos redefine todo su historial contable, por eso editar opening_balance exige confirm=true. Las cuentas no se borran (los pagos las referencian): se desactivan con is_active=false.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update'], description: 'create = cuenta nueva; update = editar una existente (requiere account_id).' },
        account_id: { type: 'integer', minimum: 1, description: 'Obligatorio para update. Se listan con whatspro_finance_accounts.' },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        type: { type: 'string', enum: ['cash', 'bank', 'mercadopago', 'stripe', 'paypal', 'other'] },
        currency: { type: 'string', minLength: 3, maxLength: 3, description: 'Código ISO: ARS, USD, PYG…' },
        opening_balance: { type: 'integer', description: 'Saldo inicial, entero en la unidad mínima de la moneda. Cambiarlo en update exige confirm=true.' },
        is_active: { type: 'boolean' },
        notes: { type: 'string', maxLength: 2000 },
        confirm: { type: 'boolean', description: 'Obligatorio en true cuando update cambia opening_balance: redefine el saldo reportado.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_finance_manage_exchange_rate',
    description:
      'Carga la cotización manual entre dos monedas (ej. USD→ARS) para una fecha. Los reportes financieros multi-moneda usan estas cotizaciones: una cotización mal cargada DISTORSIONA todos los reportes, por eso exige confirm=true. Es un upsert por (par de monedas + fecha): recargar la misma fecha pisa el valor anterior. Las cotizaciones existentes se listan con whatspro_list_records(resource="exchange-rates").',
    inputSchema: {
      type: 'object',
      required: ['base_currency', 'quote_currency', 'rate', 'rate_date', 'confirm'],
      properties: {
        base_currency: { type: 'string', minLength: 3, maxLength: 3, description: 'Moneda base, ej. USD.' },
        quote_currency: { type: 'string', minLength: 3, maxLength: 3, description: 'Moneda cotizada, ej. ARS.' },
        rate: { type: 'number', exclusiveMinimum: 0, description: 'Cuántas unidades de quote_currency vale 1 de base_currency.' },
        rate_date: { ...isoDateProperty, description: 'Fecha de la cotización (YYYY-MM-DD).' },
        source: { type: 'string', maxLength: 60, description: 'Origen del dato (por defecto "manual").' },
        confirm: { type: 'boolean', const: true, description: 'Obligatorio en true: la cotización afecta todos los reportes multi-moneda.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_finance_update_entry',
    description:
      'Edita un movimiento financiero ya cargado: título, descripción, categoría, monto, moneda, fechas (occurred_on, due_on, paid_on), estado, recurrencia, contraparte, medio de pago y relaciones (cliente, suscripción, venta, proyecto, cuenta, centro de costo). Es un update parcial: lo que no mandás no se toca. '
      + 'Para pasar a "paid" es obligatorio paid_on. Para anular un movimiento cargado mal usá status "cancelled" (queda en el historial pero no cuenta en ningún reporte): NO existe borrado desde el conector. '
      + 'El monto no puede bajar de lo ya cobrado en pagos parciales (whatspro_finance_entry_payments los muestra). Con dry_run ves el asiento resultante sin escribir. '
      + 'Para registrar un pago contra el movimiento usá whatspro_finance_settle_entry, no cambies el estado a mano.',
    inputSchema: {
      type: 'object',
      required: ['entry_id'],
      properties: {
        entry_id: { type: 'integer', minimum: 1, description: 'Se obtiene con whatspro_finance_list_entries.' },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        description: { type: 'string', maxLength: 5000 },
        category: { type: 'string', minLength: 1, maxLength: 60 },
        amount: { type: 'integer', minimum: 0, description: 'Entero en la unidad mínima de la moneda.' },
        currency: { type: 'string', minLength: 3, maxLength: 3, description: 'ISO 4217. Cambiar la moneda NO convierte el monto.' },
        status: { type: 'string', enum: ['pending', 'paid', 'overdue', 'cancelled'] },
        occurred_on: { ...isoDateProperty },
        due_on: { anyOf: [{ ...isoDateProperty }, { type: 'null' }] },
        paid_on: { anyOf: [{ ...isoDateProperty }, { type: 'null' }], description: 'Obligatoria si status pasa a "paid".' },
        recurrence: { type: 'string', enum: ['none', 'monthly', 'annual'] },
        payment_method: { type: ['string', 'null'], maxLength: 80 },
        counterparty: { type: ['string', 'null'], maxLength: 200 },
        customer_id: { type: ['integer', 'null'], minimum: 1 },
        subscription_id: { type: ['integer', 'null'], minimum: 1 },
        sale_id: { type: ['integer', 'null'], minimum: 1 },
        project_id: { type: ['integer', 'null'], minimum: 1 },
        account_id: { type: ['integer', 'null'], minimum: 1 },
        cost_center_id: { type: ['integer', 'null'], minimum: 1 },
        dry_run: { type: 'boolean', description: 'Devuelve el asiento como quedaría, sin escribir.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_budget',
    description:
      'Crea, edita o borra un PRESUPUESTO de gastos del equipo: un tope (amount, en una moneda) para un período, opcionalmente acotado a un centro de costo y/o a una categoría de gasto. Su ejecución (cuánto se gastó) se ve con whatspro_finance_budgets_list y se calcula sólo con gastos de la MISMA moneda del presupuesto. '
      + 'create exige idempotency_key (un reintento devuelve el presupuesto original); delete exige confirm=true. dry_run muestra el resultado sin escribir. Los montos son enteros en la unidad mínima.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        budget_id: { type: 'integer', minimum: 1, description: 'Obligatorio para update y delete. Se lista con whatspro_finance_budgets_list.' },
        name: { type: 'string', minLength: 1, maxLength: 120, description: 'Obligatorio en create. Ej. "Marketing Q4 2026".' },
        cost_center_id: { type: ['integer', 'null'], minimum: 1, description: 'Acota el presupuesto a un centro de costo. null = todos.' },
        category: { type: ['string', 'null'], maxLength: 60, description: 'Acota a una categoría de gasto (coincidencia exacta). null = todas.' },
        period_start: { ...isoDateProperty, description: 'Obligatorio en create.' },
        period_end: { ...isoDateProperty, description: 'Obligatorio en create. No puede ser anterior a period_start.' },
        amount: { type: 'integer', minimum: 0, description: 'Tope del presupuesto. Obligatorio en create.' },
        currency: { type: 'string', minLength: 3, maxLength: 3, description: 'Obligatorio en create. ISO 4217.' },
        notes: { type: 'string', maxLength: 2000 },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80, description: `Obligatoria en create. ${IDEMPOTENCIA}` },
        confirm: { type: 'boolean', description: 'Obligatorio en true para delete.' },
        dry_run: { type: 'boolean', description: 'Devuelve lo que se escribiría o borraría, sin hacerlo.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_manage_cost_center',
    description:
      'Crea, edita o borra un CENTRO DE COSTO (unidad a la que se imputan gastos: "Sucursal Norte", "Producto X", "Administración"). Los movimientos financieros y los presupuestos lo referencian por cost_center_id. '
      + 'El código (code) es único por equipo. Un centro con movimientos NO se borra: desactivalo con is_active=false. delete exige confirm=true. '
      + 'create es idempotente por código (o por nombre si no hay código): repetirlo devuelve el existente.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        cost_center_id: { type: 'integer', minimum: 1, description: 'Obligatorio para update y delete. Se lista con whatspro_finance_budgets_list.' },
        name: { type: 'string', minLength: 1, maxLength: 120, description: 'Obligatorio en create.' },
        code: { type: ['string', 'null'], maxLength: 30, description: 'Código corto único por equipo, ej. "ADM", "SUC-N".' },
        description: { type: 'string', maxLength: 2000 },
        is_active: { type: 'boolean' },
        confirm: { type: 'boolean', description: 'Obligatorio en true para delete.' },
        dry_run: { type: 'boolean', description: 'Devuelve lo que se escribiría o borraría, sin hacerlo.' },
      },
      additionalProperties: false,
    },
  },
];

export const financeReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_finance_list_entries',
    description:
      'Lista paginada de movimientos financieros con los filtros que whatspro_list_records no sabe hacer y el cliente ya resuelto: tipo (ingreso/gasto), estado, rango de fechas, texto sobre título/descripción, contraparte, categoría, cliente, cuenta y centro de costo. Cada fila trae el nombre del cliente vinculado y cuánto se pagó hasta ahora. Es la tool para "todo lo que le pagamos a Martín este año" (type="expense", counterparty="Martín", from=…) o "los ingresos pendientes de agosto". Para agregados (saldos, utilidad, por categoría) usá whatspro_finance_summary.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['income', 'expense'] },
        status: { type: 'string', enum: ['pending', 'paid', 'overdue', 'cancelled'] },
        from: { ...isoDateProperty, description: 'occurred_on desde.' },
        to: { ...isoDateProperty, description: 'occurred_on hasta.' },
        q: { type: 'string', maxLength: 120, description: 'Texto sobre título y descripción.' },
        counterparty: { type: 'string', maxLength: 200, description: 'Contraparte (coincidencia parcial).' },
        category: { type: 'string', maxLength: 60, description: 'Categoría (coincidencia parcial).' },
        customer_id: { type: 'integer', minimum: 1 },
        account_id: { type: 'integer', minimum: 1 },
        cost_center_id: { type: 'integer', minimum: 1 },
        page: { type: 'integer', minimum: 1, default: 1 },
        per_page: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_finance_accounts',
    description: 'Lista las cuentas financieras del equipo (caja, banco, Mercado Pago…) con su saldo. Consultala antes de registrar un pago, para mandar el account_id correcto.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_finance_entry_payments',
    description: 'Muestra un movimiento financiero con todos sus pagos: cuánto se pagó, cuándo, por qué cuenta y cuánto falta.',
    inputSchema: {
      type: 'object',
      required: ['entry_id'],
      properties: { entry_id: { type: 'integer', minimum: 1 } },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_finance_os_resumen',
    description:
      'El resumen de Finanzas OS (la app a pantalla completa del plugin Financiero), tal cual lo ve el equipo: mes en curso (ingresos y gastos cobrados/pagados, ingresos pendientes y resultado), por cobrar y por pagar acumulados, cantidad de movimientos vencidos, gastos del mes por categoría, la serie de los últimos 12 meses (cobrado vs pagado, mes a mes), el estado de las MEMBRESÍAS (activas, con pago pendiente, por vencer en 30 días) y los últimos 8 movimientos. '
      + 'Diferencia con whatspro_finance_summary: aquélla es un informe contable de un RANGO que vos elegís (saldo por cuenta, utilidad del período, cuentas por cobrar/pagar) y no sabe nada de membresías; ésta es la foto fija del panel: sin parámetros, mes actual + tendencia de 12 meses + suscripciones. Usá ésta para "¿cómo venimos?" y aquélla para "¿cuánto ganamos entre tal y tal fecha?". '
      + 'Todo viene POR MONEDA (byCurrency): los importes de distintas monedas nunca se suman entre sí.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_finance_budgets_list',
    description:
      'Lista los presupuestos del equipo con su ejecución (tope, gastado, restante y porcentaje) y los centros de costo con lo imputado a cada uno. Todo agrupado por moneda: un presupuesto en ARS sólo se consume con gastos en ARS, y los totales de un centro de costo vienen separados por moneda. '
      + 'from/to acotan la ejecución de los centros de costo (los presupuestos siempre se miden en su propio período). Es la tool para "¿cuánto llevamos gastado de marketing?" o "¿qué centro de costo se pasó?".',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...isoDateProperty, description: 'Gastos desde (sólo afecta la ejecución por centro de costo).' },
        to: { ...isoDateProperty, description: 'Gastos hasta (sólo afecta la ejecución por centro de costo).' },
        include_inactive: { type: 'boolean', description: 'Incluir centros de costo desactivados. Por defecto false.' },
      },
      additionalProperties: false,
    },
  },
];

// ─── Schemas ─────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entrySchema = z.object({
  type: z.enum(['income', 'expense']),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  category: z.string().trim().min(1).max(60),
  amount: z.number().int().min(0),
  currency: z.string().trim().length(3),
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional(),
  occurred_on: isoDate,
  due_on: isoDate.nullable().optional(),
  paid_on: isoDate.nullable().optional(),
  recurrence: z.enum(['none', 'monthly', 'annual']).optional(),
  payment_method: z.string().max(80).nullable().optional(),
  counterparty: z.string().max(200).nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  subscription_id: z.number().int().positive().nullable().optional(),
  sale_id: z.number().int().positive().nullable().optional(),
  project_id: z.number().int().positive().nullable().optional(),
  account_id: z.number().int().positive().nullable().optional(),
  cost_center_id: z.number().int().positive().nullable().optional(),
  idempotency_key: z.string().trim().min(8).max(80),
  confirm: z.literal(true),
  dry_run: z.boolean().optional(),
});

const settleSchema = z.object({
  entry_id: z.number().int().positive(),
  amount: z.number().int().positive(),
  paid_on: isoDate,
  account_id: z.number().int().positive().nullable().optional(),
  method: z.string().max(80).nullable().optional(),
  notes: z.string().max(2000).optional(),
  idempotency_key: z.string().trim().min(8).max(80),
  confirm: z.literal(true),
});

const saleSchema = z.object({
  contact_id: z.number().int().positive().nullable().optional(),
  sale_number: z.string().max(50).optional(),
  status: z.enum(['draft', 'confirmed', 'paid', 'cancelled', 'refunded']).optional(),
  currency: z.string().trim().length(3),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    sku: z.string().max(100).optional(),
    quantity: z.number().min(0.001),
    unit_price: z.number().int().min(0),
  })).min(1).max(200),
  discount_amount: z.number().int().min(0).optional(),
  tax_amount: z.number().int().min(0).optional(),
  notes: z.string().max(5000).optional(),
  due_date: isoDate.optional(),
  create_entry: z.boolean().optional(),
  category: z.string().max(60).optional(),
  idempotency_key: z.string().trim().min(8).max(80),
  confirm: z.literal(true),
  dry_run: z.boolean().optional(),
});

const paymentsSchema = z.object({ entry_id: z.number().int().positive() });

const listEntriesSchema = z.object({
  type: z.enum(['income', 'expense']).optional(),
  status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(120).optional(),
  counterparty: z.string().trim().max(200).optional(),
  category: z.string().trim().max(60).optional(),
  customer_id: z.number().int().positive().optional(),
  account_id: z.number().int().positive().optional(),
  cost_center_id: z.number().int().positive().optional(),
  page: z.number().int().min(1).default(1),
  per_page: z.number().int().min(1).max(100).default(50),
});

const manageAccountSchema = z.object({
  action: z.enum(['create', 'update']),
  account_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  type: z.enum(['cash', 'bank', 'mercadopago', 'stripe', 'paypal', 'other']).optional(),
  currency: z.string().trim().length(3).optional(),
  opening_balance: z.number().int().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  confirm: z.boolean().optional(),
});

const manageExchangeRateSchema = z.object({
  base_currency: z.string().trim().length(3),
  quote_currency: z.string().trim().length(3),
  rate: z.number().positive(),
  rate_date: isoDate,
  source: z.string().trim().max(60).optional(),
  confirm: z.literal(true),
});

const updateEntrySchema = z.object({
  entry_id: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  amount: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  status: z.enum(FINANCIAL_STATUSES).optional(),
  occurred_on: isoDate.optional(),
  due_on: isoDate.nullable().optional(),
  paid_on: isoDate.nullable().optional(),
  recurrence: z.enum(['none', 'monthly', 'annual']).optional(),
  payment_method: z.string().max(80).nullable().optional(),
  counterparty: z.string().max(200).nullable().optional(),
  customer_id: z.number().int().positive().nullable().optional(),
  subscription_id: z.number().int().positive().nullable().optional(),
  sale_id: z.number().int().positive().nullable().optional(),
  project_id: z.number().int().positive().nullable().optional(),
  account_id: z.number().int().positive().nullable().optional(),
  cost_center_id: z.number().int().positive().nullable().optional(),
  dry_run: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).some((key) => key !== 'entry_id' && key !== 'dry_run' && data[key as keyof typeof data] !== undefined),
  { message: 'No hay nada para cambiar: mandá al menos un campo además de entry_id.' },
);

const manageBudgetSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  budget_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  cost_center_id: z.number().int().positive().nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  period_start: isoDate.optional(),
  period_end: isoDate.optional(),
  amount: z.number().int().min(0).optional(),
  currency: z.string().trim().length(3).optional(),
  notes: z.string().max(2000).optional(),
  idempotency_key: z.string().trim().min(8).max(80).optional(),
  confirm: z.boolean().optional(),
  dry_run: z.boolean().optional(),
});

const manageCostCenterSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  cost_center_id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().max(30).nullable().optional(),
  description: z.string().max(2000).optional(),
  is_active: z.boolean().optional(),
  confirm: z.boolean().optional(),
  dry_run: z.boolean().optional(),
});

const budgetsListSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  include_inactive: z.boolean().optional(),
});

// ─── Implementación ──────────────────────────────────────────────────────────

async function registrarAsiento(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeWrite', 'finance');
  const data = parse(entrySchema, input);
  try {
    const resultado = await recordFinancialEntry(context.teamId, context.userId, data);
    if ('dryRun' in resultado) return { success: true, dry_run: true, created: false, preview: resultado.preview };
    if (resultado.idempotent) return { success: true, idempotent: true, created: false, entry: resultado.entry };
    await audit(context, 'GROK_FINANCE_ENTRY_CREATED', resultado.entry.id);
    return { success: true, idempotent: false, created: true, entry: resultado.entry };
  } catch (error) {
    if (error instanceof FinanceEntryError) throw new Error(error.message);
    throw error;
  }
}

async function saldarAsiento(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeWrite', 'finance');
  const data = parse(settleSchema, input);
  try {
    const resultado = await settleFinancialEntry(context.teamId, context.userId, data);
    if ('dryRun' in resultado) return { success: true, dry_run: true, created: false, entry: resultado.entry };
    if (resultado.idempotent) return { success: true, idempotent: true, created: false, payment: resultado.payment };
    await audit(context, 'GROK_FINANCE_PAYMENT_CREATED', resultado.payment.id);
    return { success: true, idempotent: false, created: true, payment: resultado.payment, entry: resultado.entry };
  } catch (error) {
    if (error instanceof FinanceEntryError) throw new Error(error.message);
    throw error;
  }
}
async function siguienteNumeroDeVenta(teamId: number) {
  const [fila] = await db
    .select({ total: sql<number>`count(*)` })
    .from(teamSales)
    .where(eq(teamSales.teamId, teamId));
  return `V-${String((Number(fila?.total) || 0) + 1).padStart(4, '0')}`;
}

async function registrarVenta(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'salesWrite', 'sales');
  const data = parse(saleSchema, input);

  const previo = await findEntryByIdempotencyKey(context.teamId, data.idempotency_key);
  if (previo?.saleId) {
    const venta = await db.query.teamSales.findFirst({ where: eq(teamSales.id, previo.saleId) });
    if (venta) return { success: true, idempotent: true, created: false, sale: venta, entry: previo };
  }
  // Sin create_entry la clave sólo vivía en el asiento: un reintento duplicaba la venta.
  const ventaPrevia = await db.query.teamSales.findFirst({ where: and(eq(teamSales.teamId, context.teamId), eq(teamSales.idempotencyKey, data.idempotency_key)) });
  if (ventaPrevia) return { success: true, idempotent: true, created: false, sale: ventaPrevia, entry: null };

  if (data.contact_id) {
    const contacto = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, data.contact_id), eq(contacts.teamId, context.teamId)),
      columns: { id: true },
    });
    if (!contacto) throw new Error('El contacto no existe en este equipo.');
  }

  const items = data.items.map((item) => ({
    articleId: null,
    name: item.name,
    sku: item.sku ?? '',
    quantity: item.quantity,
    unitPrice: item.unit_price,
    total: Math.round(item.quantity * item.unit_price),
  }));
  const subtotal = items.reduce((suma, item) => suma + item.total, 0);
  const total = Math.max(0, subtotal - (data.discount_amount ?? 0) + (data.tax_amount ?? 0));
  const saleNumber = data.sale_number?.trim() || await siguienteNumeroDeVenta(context.teamId);

  if (data.dry_run) {
    return {
      success: true,
      dry_run: true,
      created: false,
      preview: { saleNumber, items, subtotal, total, currency: data.currency.toUpperCase() },
    };
  }

  // El cliente vinculado al contacto, para que la venta cuente en el 360 y en cobranzas.
  const clienteVinculado = data.contact_id ? await customerForContact(context.teamId, data.contact_id) : null;
  const [venta] = await db.insert(teamSales).values({
    teamId: context.teamId,
    contactId: data.contact_id ?? null,
    customerId: clienteVinculado?.id ?? null,
    idempotencyKey: data.idempotency_key,
    paidAt: data.status === 'paid' ? new Date() : null,
    saleNumber,
    status: data.status ?? 'confirmed',
    currency: data.currency.toUpperCase(),
    items,
    subtotal,
    discountAmount: data.discount_amount ?? 0,
    taxAmount: data.tax_amount ?? 0,
    total,
    notes: data.notes ?? '',
    dueDate: data.due_date ? new Date(`${data.due_date}T12:00:00Z`) : null,
    createdBy: context.userId,
    updatedBy: context.userId,
  }).returning();

  await audit(context, 'GROK_SALE_CREATED', venta.id);

  let entry = null;
  if (data.create_entry) {
    [entry] = await db.insert(teamFinancialEntries).values({
      teamId: context.teamId,
      type: 'income',
      title: `Venta ${saleNumber}`,
      description: data.notes ?? '',
      category: data.category ?? 'Ventas',
      amount: total,
      currency: data.currency.toUpperCase(),
      status: data.status === 'paid' ? 'paid' : 'pending',
      occurredOn: new Date().toISOString().slice(0, 10),
      dueOn: data.due_date ?? null,
      paidOn: data.status === 'paid' ? new Date().toISOString().slice(0, 10) : null,
      recurrence: 'none',
      saleId: venta.id,
      customerId: clienteVinculado?.id ?? null,
      externalSource: FUENTE,
      externalId: data.idempotency_key,
      createdBy: context.userId,
      updatedBy: context.userId,
    }).returning();
    await audit(context, 'GROK_FINANCE_ENTRY_CREATED', entry.id);
  }

  return { success: true, idempotent: false, created: true, sale: venta, entry };
}

async function listarCuentas(_input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeRead', 'finance');
  const cuentas = await db.select().from(teamFinancialAccounts)
    .where(eq(teamFinancialAccounts.teamId, context.teamId))
    .orderBy(asc(teamFinancialAccounts.id));

  // El saldo no es una columna: es el saldo inicial más lo que entró y menos lo
  // que salió por esa cuenta. Se calcula acá para no devolver un número que
  // parezca el saldo real y no lo sea.
  const movimientos = await db
    .select({
      accountId: teamFinancialEntryPayments.accountId,
      type: teamFinancialEntries.type,
      total: sql<string>`sum(${teamFinancialEntryPayments.amount})`,
    })
    .from(teamFinancialEntryPayments)
    .innerJoin(teamFinancialEntries, eq(teamFinancialEntryPayments.entryId, teamFinancialEntries.id))
    .where(eq(teamFinancialEntryPayments.teamId, context.teamId))
    .groupBy(teamFinancialEntryPayments.accountId, teamFinancialEntries.type);

  const neto = new Map<number, number>();
  for (const fila of movimientos) {
    if (fila.accountId == null) continue;
    const signo = fila.type === 'income' ? 1 : -1;
    neto.set(fila.accountId, (neto.get(fila.accountId) ?? 0) + signo * Number(fila.total));
  }

  return {
    object: 'finance_accounts',
    count: cuentas.length,
    data: cuentas.map((cuenta) => ({
      id: cuenta.id,
      name: cuenta.name,
      type: cuenta.type,
      currency: cuenta.currency,
      opening_balance: cuenta.openingBalance,
      balance: cuenta.openingBalance + (neto.get(cuenta.id) ?? 0),
      is_active: cuenta.isActive,
    })),
  };
}

async function listarPagos(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeRead', 'finance');
  const data = parse(paymentsSchema, input);

  const entry = await db.query.teamFinancialEntries.findFirst({
    where: and(eq(teamFinancialEntries.id, data.entry_id), eq(teamFinancialEntries.teamId, context.teamId)),
  });
  if (!entry) throw new Error('El movimiento financiero no existe en este equipo.');

  const pagos = await db.select().from(teamFinancialEntryPayments)
    .where(and(
      eq(teamFinancialEntryPayments.teamId, context.teamId),
      eq(teamFinancialEntryPayments.entryId, data.entry_id),
    ))
    .orderBy(desc(teamFinancialEntryPayments.paidOn));

  const pagado = pagos.reduce((suma, pago) => suma + pago.amount, 0);
  return {
    object: 'finance_entry_payments',
    entry: {
      id: entry.id,
      title: entry.title,
      type: entry.type,
      status: entry.status,
      total: entry.amount,
      currency: entry.currency,
      pagado,
      pendiente: Math.max(0, entry.amount - pagado),
    },
    count: pagos.length,
    data: pagos.map((pago) => ({
      id: pago.id,
      amount: pago.amount,
      paid_on: pago.paidOn,
      account_id: pago.accountId,
      method: pago.method,
      notes: pago.notes,
    })),
  };
}

async function listarAsientos(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeRead', 'finance');
  const data = parse(listEntriesSchema, input);

  const conditions = [eq(teamFinancialEntries.teamId, context.teamId)];
  if (data.type) conditions.push(eq(teamFinancialEntries.type, data.type));
  if (data.status) conditions.push(eq(teamFinancialEntries.status, data.status));
  if (data.from) conditions.push(gte(teamFinancialEntries.occurredOn, data.from));
  if (data.to) conditions.push(lte(teamFinancialEntries.occurredOn, data.to));
  if (data.q) {
    const pattern = `%${data.q.replace(/([\\%_])/g, '\\$1')}%`;
    conditions.push(or(ilike(teamFinancialEntries.title, pattern), ilike(teamFinancialEntries.description, pattern))!);
  }
  if (data.counterparty) conditions.push(ilike(teamFinancialEntries.counterparty, `%${data.counterparty.replace(/([\\%_])/g, '\\$1')}%`));
  if (data.category) conditions.push(ilike(teamFinancialEntries.category, `%${data.category.replace(/([\\%_])/g, '\\$1')}%`));
  if (data.customer_id) conditions.push(eq(teamFinancialEntries.customerId, data.customer_id));
  if (data.account_id) conditions.push(eq(teamFinancialEntries.accountId, data.account_id));
  if (data.cost_center_id) conditions.push(eq(teamFinancialEntries.costCenterId, data.cost_center_id));

  const where = and(...conditions);
  const offset = (data.page - 1) * data.per_page;

  const [rows, [totals]] = await Promise.all([
    db.select({
      entry: teamFinancialEntries,
      customerName: teamCustomers.name,
      pagado: sql<string>`coalesce((select sum(p.amount) from team_financial_entry_payments p where p.entry_id = ${teamFinancialEntries.id}), 0)`,
    })
      .from(teamFinancialEntries)
      .leftJoin(teamCustomers, eq(teamFinancialEntries.customerId, teamCustomers.id))
      .where(where)
      .orderBy(desc(teamFinancialEntries.occurredOn), desc(teamFinancialEntries.id))
      .limit(data.per_page)
      .offset(offset),
    db.select({ value: count() }).from(teamFinancialEntries).where(where),
  ]);

  const total = Number(totals?.value ?? rows.length);
  return {
    object: 'finance_entries',
    data: rows.map(({ entry, customerName, pagado }) => ({
      id: entry.id,
      type: entry.type,
      title: entry.title,
      category: entry.category,
      amount: entry.amount,
      currency: entry.currency,
      status: entry.status,
      occurred_on: entry.occurredOn,
      due_on: entry.dueOn,
      paid_on: entry.paidOn,
      paid_amount: Number(pagado),
      pending_amount: Math.max(0, entry.amount - Number(pagado)),
      counterparty: entry.counterparty,
      payment_method: entry.paymentMethod,
      customer: entry.customerId ? { id: entry.customerId, name: customerName } : null,
      account_id: entry.accountId,
      cost_center_id: entry.costCenterId,
      recurrence: entry.recurrence,
    })),
    meta: {
      page: data.page,
      perPage: data.per_page,
      total,
      hasMore: offset + rows.length < total,
      nextPage: offset + rows.length < total ? data.page + 1 : null,
    },
    note: 'Los montos son enteros en la unidad mínima de cada moneda, y las monedas nunca se suman entre sí.',
  };
}

async function administrarCuenta(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeWrite', 'finance');
  const data = parse(manageAccountSchema, input);

  if (data.action === 'create') {
    const parsed = financialAccountSchema.safeParse({
      name: data.name,
      ...(data.type !== undefined ? { type: data.type } : {}),
      currency: data.currency,
      ...(data.opening_balance !== undefined ? { openingBalance: data.opening_balance } : {}),
      ...(data.is_active !== undefined ? { isActive: data.is_active } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    });
    if (!parsed.success) {
      throw new Error(`Datos inválidos para la cuenta: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
    }
    const [account] = await db.insert(teamFinancialAccounts).values({
      teamId: context.teamId,
      ...parsed.data,
      createdBy: context.userId,
      updatedBy: context.userId,
    }).returning();
    await audit(context, 'GROK_FINANCE_ACCOUNT_CREATED', account.id);
    return { success: true, action: 'create', account };
  }

  if (!data.account_id) throw new Error('account_id es obligatorio con action="update".');
  const existing = await db.query.teamFinancialAccounts.findFirst({
    where: and(eq(teamFinancialAccounts.id, data.account_id), eq(teamFinancialAccounts.teamId, context.teamId)),
  });
  if (!existing) throw new Error('La cuenta no existe en este equipo. Listalas con whatspro_finance_accounts.');
  if (data.opening_balance !== undefined && data.opening_balance !== existing.openingBalance && data.confirm !== true) {
    throw new Error(
      `Cambiar opening_balance de ${existing.openingBalance} a ${data.opening_balance} redefine el saldo reportado de "${existing.name}". Si es lo que querés, repetí la llamada con confirm=true.`,
    );
  }

  const [account] = await db.update(teamFinancialAccounts).set({
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.type !== undefined ? { type: data.type } : {}),
    ...(data.currency !== undefined ? { currency: data.currency.toUpperCase() } : {}),
    ...(data.opening_balance !== undefined ? { openingBalance: data.opening_balance } : {}),
    ...(data.is_active !== undefined ? { isActive: data.is_active } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    updatedBy: context.userId,
    updatedAt: new Date(),
  }).where(and(eq(teamFinancialAccounts.id, data.account_id), eq(teamFinancialAccounts.teamId, context.teamId))).returning();
  await audit(context, 'GROK_FINANCE_ACCOUNT_UPDATED', account.id);
  return { success: true, action: 'update', account };
}

async function administrarCotizacion(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeWrite', 'finance');
  const data = parse(manageExchangeRateSchema, input);
  const parsed = exchangeRateSchema.safeParse({
    baseCurrency: data.base_currency,
    quoteCurrency: data.quote_currency,
    rate: data.rate,
    rateDate: data.rate_date,
    ...(data.source !== undefined ? { source: data.source } : {}),
  });
  if (!parsed.success) {
    throw new Error(`Cotización inválida: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  if (parsed.data.baseCurrency === parsed.data.quoteCurrency) {
    throw new Error('base_currency y quote_currency no pueden ser la misma moneda.');
  }

  // Upsert por la constraint única (team, par, fecha): recargar el día pisa el valor.
  const [row] = await db.insert(teamExchangeRates).values({
    teamId: context.teamId,
    baseCurrency: parsed.data.baseCurrency,
    quoteCurrency: parsed.data.quoteCurrency,
    rate: String(parsed.data.rate),
    rateDate: parsed.data.rateDate,
    source: parsed.data.source,
    createdBy: context.userId,
  }).onConflictDoUpdate({
    target: [teamExchangeRates.teamId, teamExchangeRates.baseCurrency, teamExchangeRates.quoteCurrency, teamExchangeRates.rateDate],
    set: { rate: String(parsed.data.rate), source: parsed.data.source, createdBy: context.userId },
  }).returning();
  await audit(context, 'GROK_FINANCE_EXCHANGE_RATE_SET', row.id);
  return {
    success: true,
    rate: row,
    note: `1 ${row.baseCurrency} = ${row.rate} ${row.quoteCurrency} al ${row.rateDate}. Esta cotización afecta los reportes multi-moneda desde esa fecha.`,
  };
}

async function editarAsiento(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeWrite', 'finance');
  const { entry_id, ...patch } = parse(updateEntrySchema, input);
  try {
    const resultado = await updateFinancialEntry(context.teamId, context.userId, entry_id, patch);
    if (resultado.dryRun) return { success: true, dry_run: true, updated: false, preview: resultado.preview };
    await audit(context, 'GROK_FINANCE_ENTRY_UPDATED', entry_id);
    return {
      success: true,
      dry_run: false,
      updated: true,
      entry: resultado.entry,
      ...(patch.status === 'cancelled' ? { note: 'El movimiento quedó cancelado: sigue en el historial pero no cuenta en ningún reporte.' } : {}),
    };
  } catch (error) {
    if (error instanceof FinanceEntryError) throw new Error(error.message);
    throw error;
  }
}

const zodIssues = (error: z.ZodError) => error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');

async function administrarPresupuesto(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeWrite', 'finance');
  const data = parse(manageBudgetSchema, input);

  try {
    if (data.action === 'create') {
      if (!data.idempotency_key) throw new Error('idempotency_key es obligatoria con action="create".');
      // La tabla no tiene columna de idempotencia: la clave viaja en las notas,
      // igual que los pagos parciales (ver settleFinancialEntry).
      const marca = `[mcp:${data.idempotency_key}]`;
      const previo = await db.query.teamBudgets.findFirst({
        where: and(eq(teamBudgets.teamId, context.teamId), ilike(teamBudgets.notes, `%${marca.replace(/([\\%_])/g, '\\$1')}%`)),
      });
      if (previo) return { success: true, action: 'create', idempotent: true, created: false, budget: previo };

      const parsed = budgetSchema.safeParse({
        name: data.name,
        costCenterId: data.cost_center_id ?? null,
        category: data.category ?? null,
        periodStart: data.period_start,
        periodEnd: data.period_end,
        amount: data.amount,
        currency: data.currency,
        notes: `${data.notes ?? ''} ${marca}`.trim(),
      });
      if (!parsed.success) throw new Error(`Datos inválidos para el presupuesto: ${zodIssues(parsed.error)}`);
      if (data.dry_run) return { success: true, action: 'create', dry_run: true, created: false, preview: parsed.data };

      const resultado = await createBudget(context.teamId, context.userId, parsed.data);
      if (resultado.idempotent) return { success: true, action: 'create', idempotent: true, created: false, budget: resultado.budget, note: 'Ya había un presupuesto con ese nombre y período: se devuelve ése.' };
      await audit(context, 'GROK_FINANCE_BUDGET_CREATED', resultado.budget.id);
      return { success: true, action: 'create', idempotent: false, created: true, budget: resultado.budget };
    }

    if (!data.budget_id) throw new Error(`budget_id es obligatorio con action="${data.action}".`);
    const existing = await getBudget(context.teamId, data.budget_id);
    if (!existing) throw new Error('El presupuesto no existe en este equipo. Listalos con whatspro_finance_budgets_list.');

    if (data.action === 'delete') {
      if (data.confirm !== true) throw new Error(`Borrar el presupuesto "${existing.name}" (${existing.amount} ${existing.currency}, ${existing.periodStart} → ${existing.periodEnd}) exige confirm=true.`);
      if (data.dry_run) return { success: true, action: 'delete', dry_run: true, deleted: false, budget: existing };
      await deleteBudget(context.teamId, context.userId, data.budget_id);
      await audit(context, 'GROK_FINANCE_BUDGET_DELETED', data.budget_id);
      return { success: true, action: 'delete', deleted: true, budget_id: data.budget_id };
    }

    const parsed = budgetSchema.partial().safeParse({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.cost_center_id !== undefined ? { costCenterId: data.cost_center_id } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.period_start !== undefined ? { periodStart: data.period_start } : {}),
      ...(data.period_end !== undefined ? { periodEnd: data.period_end } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    });
    if (!parsed.success) throw new Error(`Datos inválidos para el presupuesto: ${zodIssues(parsed.error)}`);
    if (Object.keys(parsed.data).length === 0) throw new Error('No hay nada para cambiar: mandá al menos un campo además de budget_id.');
    if (data.dry_run) return { success: true, action: 'update', dry_run: true, updated: false, preview: { ...existing, ...parsed.data } };

    const budget = await updateBudget(context.teamId, context.userId, data.budget_id, parsed.data);
    await audit(context, 'GROK_FINANCE_BUDGET_UPDATED', data.budget_id);
    return { success: true, action: 'update', updated: true, budget };
  } catch (error) {
    if (error instanceof FinanceBudgetError) throw new Error(error.message);
    throw error;
  }
}

async function administrarCentroDeCosto(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeWrite', 'finance');
  const data = parse(manageCostCenterSchema, input);

  try {
    if (data.action === 'create') {
      const parsed = costCenterSchema.safeParse({
        name: data.name,
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.is_active !== undefined ? { isActive: data.is_active } : {}),
      });
      if (!parsed.success) throw new Error(`Datos inválidos para el centro de costo: ${zodIssues(parsed.error)}`);
      if (data.dry_run) return { success: true, action: 'create', dry_run: true, created: false, preview: parsed.data };

      const resultado = await createCostCenter(context.teamId, context.userId, parsed.data);
      if (resultado.idempotent) return { success: true, action: 'create', idempotent: true, created: false, cost_center: resultado.costCenter, note: 'Ya existía un centro de costo con ese código/nombre: se devuelve ése.' };
      await audit(context, 'GROK_FINANCE_COST_CENTER_CREATED', resultado.costCenter.id);
      return { success: true, action: 'create', idempotent: false, created: true, cost_center: resultado.costCenter };
    }

    if (!data.cost_center_id) throw new Error(`cost_center_id es obligatorio con action="${data.action}".`);
    const existing = await getCostCenter(context.teamId, data.cost_center_id);
    if (!existing) throw new Error('El centro de costo no existe en este equipo. Listalos con whatspro_finance_budgets_list.');

    if (data.action === 'delete') {
      if (data.confirm !== true) throw new Error(`Borrar el centro de costo "${existing.name}" exige confirm=true. Si tiene movimientos, no se puede: desactivalo con is_active=false.`);
      if (data.dry_run) return { success: true, action: 'delete', dry_run: true, deleted: false, cost_center: existing };
      await deleteCostCenter(context.teamId, context.userId, data.cost_center_id);
      await audit(context, 'GROK_FINANCE_COST_CENTER_DELETED', data.cost_center_id);
      return { success: true, action: 'delete', deleted: true, cost_center_id: data.cost_center_id };
    }

    const parsed = costCenterSchema.partial().safeParse({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.is_active !== undefined ? { isActive: data.is_active } : {}),
    });
    if (!parsed.success) throw new Error(`Datos inválidos para el centro de costo: ${zodIssues(parsed.error)}`);
    if (Object.keys(parsed.data).length === 0) throw new Error('No hay nada para cambiar: mandá al menos un campo además de cost_center_id.');
    if (data.dry_run) return { success: true, action: 'update', dry_run: true, updated: false, preview: { ...existing, ...parsed.data } };

    const costCenter = await updateCostCenter(context.teamId, context.userId, data.cost_center_id, parsed.data);
    await audit(context, 'GROK_FINANCE_COST_CENTER_UPDATED', data.cost_center_id);
    return { success: true, action: 'update', updated: true, cost_center: costCenter };
  } catch (error) {
    if (error instanceof FinanceCostCenterError) throw new Error(error.message);
    throw error;
  }
}

async function resumenFinanzasOs(_input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeRead', 'finance');
  const resumen = await financeOsResumen(context.teamId);
  return {
    object: 'finance_os_resumen',
    ...resumen,
    note: 'Importes enteros en la unidad mínima de cada moneda, agrupados por moneda (byCurrency): nunca se suman monedas distintas. Para un rango de fechas a elección usá whatspro_finance_summary.',
  };
}

async function listarPresupuestos(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'financeRead', 'finance');
  const data = parse(budgetsListSchema, input);

  const [budgets, costCenters] = await Promise.all([
    listBudgetsWithExecution(context.teamId),
    listCostCenters(context.teamId),
  ]);

  // Ejecución por centro de costo, separada por moneda (gastos no cancelados).
  const condiciones = [
    eq(teamFinancialEntries.teamId, context.teamId),
    eq(teamFinancialEntries.type, 'expense'),
    sql`${teamFinancialEntries.status} <> 'cancelled'`,
    sql`${teamFinancialEntries.costCenterId} is not null`,
  ];
  if (data.from) condiciones.push(gte(teamFinancialEntries.occurredOn, data.from));
  if (data.to) condiciones.push(lte(teamFinancialEntries.occurredOn, data.to));
  const ejecucion = await db
    .select({
      costCenterId: teamFinancialEntries.costCenterId,
      currency: teamFinancialEntries.currency,
      total: sql<string>`sum(${teamFinancialEntries.amount})`,
      movimientos: count(),
    })
    .from(teamFinancialEntries)
    .where(and(...condiciones))
    .groupBy(teamFinancialEntries.costCenterId, teamFinancialEntries.currency);

  const porCentro = new Map<number, { byCurrency: Record<string, number>; movimientos: number }>();
  for (const fila of ejecucion) {
    if (fila.costCenterId == null) continue;
    const agg = porCentro.get(fila.costCenterId) ?? { byCurrency: {}, movimientos: 0 };
    agg.byCurrency[fila.currency] = (agg.byCurrency[fila.currency] ?? 0) + Number(fila.total);
    agg.movimientos += Number(fila.movimientos);
    porCentro.set(fila.costCenterId, agg);
  }

  const nombreCentro = new Map(costCenters.map((cc) => [cc.id, cc.name]));
  const presupuestosPorMoneda: Record<string, Array<Record<string, unknown>>> = {};
  for (const budget of budgets) {
    const restante = budget.amount - budget.spent;
    (presupuestosPorMoneda[budget.currency] ??= []).push({
      id: budget.id,
      name: budget.name,
      period_start: budget.periodStart,
      period_end: budget.periodEnd,
      cost_center: budget.costCenterId ? { id: budget.costCenterId, name: nombreCentro.get(budget.costCenterId) ?? null } : null,
      category: budget.category,
      amount: budget.amount,
      spent: budget.spent,
      remaining: restante,
      pct: budget.amount > 0 ? Math.round((budget.spent / budget.amount) * 100) : null,
      exceeded: restante < 0,
      notes: budget.notes,
    });
  }

  return {
    object: 'finance_budgets',
    budgets_by_currency: presupuestosPorMoneda,
    budgets_count: budgets.length,
    cost_centers: costCenters
      .filter((cc) => data.include_inactive || cc.isActive)
      .map((cc) => ({
        id: cc.id,
        name: cc.name,
        code: cc.code,
        description: cc.description,
        is_active: cc.isActive,
        spent_by_currency: porCentro.get(cc.id)?.byCurrency ?? {},
        entries: porCentro.get(cc.id)?.movimientos ?? 0,
      })),
    period: { from: data.from ?? null, to: data.to ?? null, applies_to: 'cost_centers' },
    note: 'Importes enteros en la unidad mínima de cada moneda. Un presupuesto sólo se consume con gastos de su misma moneda; las monedas nunca se suman entre sí.',
  };
}

export async function executeFinanceTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_finance_list_entries') return listarAsientos(input, context);
  if (name === 'whatspro_finance_manage_account') return administrarCuenta(input, context);
  if (name === 'whatspro_finance_manage_exchange_rate') return administrarCotizacion(input, context);
  if (name === 'whatspro_finance_record_entry') return registrarAsiento(input, context);
  if (name === 'whatspro_finance_settle_entry') return saldarAsiento(input, context);
  if (name === 'whatspro_register_sale') return registrarVenta(input, context);
  if (name === 'whatspro_finance_accounts') return listarCuentas(input, context);
  if (name === 'whatspro_finance_entry_payments') return listarPagos(input, context);
  if (name === 'whatspro_finance_update_entry') return editarAsiento(input, context);
  if (name === 'whatspro_manage_budget') return administrarPresupuesto(input, context);
  if (name === 'whatspro_manage_cost_center') return administrarCentroDeCosto(input, context);
  if (name === 'whatspro_finance_os_resumen') return resumenFinanzasOs(input, context);
  if (name === 'whatspro_finance_budgets_list') return listarPresupuestos(input, context);
  throw new Error(`Unknown finance tool: ${name}`);
}
