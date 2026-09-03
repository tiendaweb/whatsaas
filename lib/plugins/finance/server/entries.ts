import 'server-only';

import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamFinancialAccounts,
  teamFinancialEntries,
  teamFinancialEntryPayments,
} from '@/lib/db/schema';
import { nextRecurrenceDate, resolveFinancialRelations } from '@/lib/plugins/finance/server/schema';

/**
 * Crear un asiento y registrarle un cobro, sin sesión.
 *
 * Las dos operaciones vivían adentro de handlers privados del conector. Eso
 * alcanzaba mientras el único que movía plata por fuera de la app era el
 * conector; en el momento en que el Centro de comandos también necesita
 * cobrar, copiarlas habría dejado dos reglas distintas para "cuándo un
 * movimiento queda saldado" — y esa es exactamente la clase de divergencia que
 * después aparece como plata que figura cobrada en una pantalla y pendiente en
 * la otra.
 *
 * Acá NO se chequean permisos: eso es responsabilidad de quien llama, que es el
 * que sabe si viene de un token de conector, de una sesión o de un lote. Lo que
 * sí se valida siempre es que todo lo referenciado sea del equipo.
 */

/** Marca de origen de los asientos creados por fuera de la app. */
export const FINANCE_EXTERNAL_SOURCE = 'mcp';

export class FinanceEntryError extends Error {}

export type RecordEntryInput = {
  type: 'income' | 'expense';
  title: string;
  description?: string;
  category: string;
  /** En unidad mínima entera. Las monedas NUNCA se suman entre sí. */
  amount: number;
  currency: string;
  status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
  occurred_on: string;
  due_on?: string | null;
  paid_on?: string | null;
  recurrence?: 'none' | 'monthly' | 'annual';
  payment_method?: string | null;
  counterparty?: string | null;
  customer_id?: number | null;
  subscription_id?: number | null;
  sale_id?: number | null;
  project_id?: number | null;
  account_id?: number | null;
  cost_center_id?: number | null;
  idempotency_key: string;
  dry_run?: boolean;
};

/** Un asiento ya creado con esta clave se devuelve tal cual, sin duplicar. */
export async function findEntryByIdempotencyKey(teamId: number, key: string) {
  return db.query.teamFinancialEntries.findFirst({
    where: and(
      eq(teamFinancialEntries.teamId, teamId),
      eq(teamFinancialEntries.externalSource, FINANCE_EXTERNAL_SOURCE),
      eq(teamFinancialEntries.externalId, key),
    ),
  });
}

export async function recordFinancialEntry(teamId: number, userId: number, input: RecordEntryInput) {
  const previo = await findEntryByIdempotencyKey(teamId, input.idempotency_key);
  if (previo) return { idempotent: true as const, created: false as const, entry: previo };

  if (input.status === 'paid' && !input.paid_on) {
    throw new FinanceEntryError('Un movimiento con status "paid" necesita paid_on: sin fecha de cobro no se puede conciliar.');
  }

  // Valida que cliente, suscripción, venta, cuenta y centro de costo sean del
  // equipo, y completa lo que se deduzca (una suscripción ya trae su cliente).
  let relaciones;
  try {
    relaciones = await resolveFinancialRelations(teamId, {
      customerId: input.customer_id ?? null,
      companyId: null,
      planId: null,
      subscriptionId: input.subscription_id ?? null,
      saleId: input.sale_id ?? null,
      projectId: input.project_id ?? null,
      accountId: input.account_id ?? null,
      costCenterId: input.cost_center_id ?? null,
    });
  } catch (error) {
    const codigo = error instanceof Error ? error.message : String(error);
    throw new FinanceEntryError(`No se pudo resolver una relación del asiento (${codigo}): revisá que el id sea de este equipo.`);
  }

  const recurrence = input.recurrence ?? 'none';
  const valores = {
    teamId,
    type: input.type,
    title: input.title,
    description: input.description ?? '',
    category: input.category,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    status: input.status ?? 'pending',
    occurredOn: input.occurred_on,
    dueOn: input.due_on ?? null,
    paidOn: input.paid_on ?? null,
    recurrence,
    nextDueOn: recurrence === 'none' ? null : nextRecurrenceDate(input.occurred_on, recurrence),
    paymentMethod: input.payment_method ?? null,
    counterparty: input.counterparty ?? null,
    ...relaciones,
    externalSource: FINANCE_EXTERNAL_SOURCE,
    externalId: input.idempotency_key,
    createdBy: userId,
    updatedBy: userId,
  };

  if (input.dry_run) {
    return { idempotent: false as const, created: false as const, dryRun: true as const, preview: valores };
  }

  const [entry] = await db.insert(teamFinancialEntries).values(valores).returning();
  return { idempotent: false as const, created: true as const, entry };
}

export type SettleEntryInput = {
  entry_id: number;
  amount: number;
  paid_on: string;
  account_id?: number | null;
  method?: string | null;
  notes?: string | null;
  idempotency_key: string;
  dry_run?: boolean;
};

export async function settleFinancialEntry(teamId: number, userId: number, input: SettleEntryInput) {
  const entry = await db.query.teamFinancialEntries.findFirst({
    where: and(eq(teamFinancialEntries.id, input.entry_id), eq(teamFinancialEntries.teamId, teamId)),
    columns: { id: true, amount: true, status: true, title: true, currency: true },
  });
  if (!entry) throw new FinanceEntryError('El movimiento financiero no existe en este equipo.');

  // La clave de idempotencia del pago se guarda en las notas porque la tabla de
  // pagos no tiene columnas externas. Es feo, pero evita el cobro duplicado sin
  // pedir una migración.
  const marca = `[mcp:${input.idempotency_key}]`;
  const pagos = await db
    .select()
    .from(teamFinancialEntryPayments)
    .where(and(
      eq(teamFinancialEntryPayments.teamId, teamId),
      eq(teamFinancialEntryPayments.entryId, input.entry_id),
    ))
    .orderBy(asc(teamFinancialEntryPayments.paidOn));

  const yaRegistrado = pagos.find((pago) => pago.notes.includes(marca));
  if (yaRegistrado) {
    return { idempotent: true as const, created: false as const, payment: yaRegistrado, entry: null };
  }

  if (input.account_id) {
    const cuenta = await db.query.teamFinancialAccounts.findFirst({
      where: and(eq(teamFinancialAccounts.id, input.account_id), eq(teamFinancialAccounts.teamId, teamId)),
      columns: { id: true },
    });
    if (!cuenta) throw new FinanceEntryError('La cuenta financiera no existe en este equipo.');
  }

  const yaPagado = pagos.reduce((total, pago) => total + pago.amount, 0);

  if (input.dry_run) {
    const proyectado = yaPagado + input.amount;
    return {
      idempotent: false as const,
      created: false as const,
      dryRun: true as const,
      payment: null,
      entry: {
        id: entry.id,
        title: entry.title,
        currency: entry.currency,
        total: entry.amount,
        pagado: yaPagado,
        pagado_despues: proyectado,
        pendiente_despues: Math.max(0, entry.amount - proyectado),
        quedaria_saldado: proyectado >= entry.amount,
      },
    };
  }

  const resultado = await db.transaction(async (tx) => {
    const [pago] = await tx
      .insert(teamFinancialEntryPayments)
      .values({
        teamId,
        entryId: input.entry_id,
        accountId: input.account_id ?? null,
        amount: input.amount,
        paidOn: input.paid_on,
        method: input.method ?? null,
        notes: `${input.notes ?? ''} ${marca}`.trim(),
        createdBy: userId,
      })
      .returning();

    const [{ total }] = await tx
      .select({ total: sql<string>`coalesce(sum(${teamFinancialEntryPayments.amount}), 0)` })
      .from(teamFinancialEntryPayments)
      .where(eq(teamFinancialEntryPayments.entryId, input.entry_id));

    const pagado = Number(total);
    // Misma regla que la app: cuando los pagos cubren el total, el movimiento
    // queda saldado. Sin esto quedaría "pendiente" con la plata ya cobrada.
    if (pagado >= entry.amount && entry.status !== 'paid') {
      await tx
        .update(teamFinancialEntries)
        .set({ status: 'paid', paidOn: input.paid_on, updatedBy: userId, updatedAt: new Date() })
        .where(eq(teamFinancialEntries.id, input.entry_id));
    }

    return { pago, pagado };
  });

  return {
    idempotent: false as const,
    created: true as const,
    payment: resultado.pago,
    entry: {
      id: entry.id,
      title: entry.title,
      currency: entry.currency,
      total: entry.amount,
      pagado: resultado.pagado,
      pendiente: Math.max(0, entry.amount - resultado.pagado),
      saldado: resultado.pagado >= entry.amount,
    },
  };
}

export type UpdateEntryInput = {
  title?: string;
  description?: string;
  category?: string;
  /** En unidad mínima entera. No puede quedar por debajo de lo ya pagado. */
  amount?: number;
  currency?: string;
  status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
  occurred_on?: string;
  due_on?: string | null;
  paid_on?: string | null;
  recurrence?: 'none' | 'monthly' | 'annual';
  payment_method?: string | null;
  counterparty?: string | null;
  customer_id?: number | null;
  subscription_id?: number | null;
  sale_id?: number | null;
  project_id?: number | null;
  account_id?: number | null;
  cost_center_id?: number | null;
  dry_run?: boolean;
};

const CLAVES_DE_RELACION: Array<keyof UpdateEntryInput> = [
  'customer_id', 'subscription_id', 'sale_id', 'project_id', 'account_id', 'cost_center_id',
];

/**
 * Edita un asiento existente: título, categoría, monto, fechas, estado,
 * contraparte y relaciones. Es la única regla de "cómo se edita un
 * movimiento" para la pantalla (PATCH de la ruta) y para el conector.
 *
 * Dos invariantes que la pantalla vieja no tenía:
 * - pasar a "paid" exige paid_on (sin fecha no se concilia), y
 * - el monto no puede bajar de lo que ya se cobró con pagos parciales,
 *   porque dejaría un asiento "pendiente" con más plata cobrada que total.
 */
export async function updateFinancialEntry(teamId: number, userId: number, entryId: number, patch: UpdateEntryInput) {
  const existing = await db.query.teamFinancialEntries.findFirst({
    where: and(eq(teamFinancialEntries.id, entryId), eq(teamFinancialEntries.teamId, teamId)),
  });
  if (!existing) throw new FinanceEntryError('El movimiento financiero no existe en este equipo.');

  const status = patch.status ?? existing.status;
  let paidOn = patch.paid_on !== undefined ? patch.paid_on : existing.paidOn;
  if (patch.status !== undefined && patch.status !== 'paid' && patch.paid_on === undefined) {
    // Un movimiento que deja de estar pagado no conserva fecha de pago.
    paidOn = null;
  }
  if (status === 'paid' && !paidOn) {
    throw new FinanceEntryError('Pasar un movimiento a "paid" exige paid_on: sin fecha de cobro no se puede conciliar.');
  }

  if (patch.amount !== undefined) {
    const [{ pagado }] = await db
      .select({ pagado: sql<string>`coalesce(sum(${teamFinancialEntryPayments.amount}), 0)` })
      .from(teamFinancialEntryPayments)
      .where(and(eq(teamFinancialEntryPayments.teamId, teamId), eq(teamFinancialEntryPayments.entryId, entryId)));
    if (Number(pagado) > patch.amount) {
      throw new FinanceEntryError(
        `El movimiento ya tiene ${pagado} ${existing.currency} cobrados en pagos parciales: el monto nuevo (${patch.amount}) no puede ser menor.`,
      );
    }
  }

  let relaciones: Partial<Awaited<ReturnType<typeof resolveFinancialRelations>>> = {};
  if (CLAVES_DE_RELACION.some((clave) => patch[clave] !== undefined)) {
    try {
      relaciones = await resolveFinancialRelations(teamId, {
        customerId: patch.customer_id !== undefined ? patch.customer_id : existing.customerId,
        companyId: existing.companyId,
        planId: existing.planId,
        subscriptionId: patch.subscription_id !== undefined ? patch.subscription_id : existing.subscriptionId,
        saleId: patch.sale_id !== undefined ? patch.sale_id : existing.saleId,
        projectId: patch.project_id !== undefined ? patch.project_id : existing.projectId,
        accountId: patch.account_id !== undefined ? patch.account_id : existing.accountId,
        costCenterId: patch.cost_center_id !== undefined ? patch.cost_center_id : existing.costCenterId,
      });
    } catch (error) {
      const codigo = error instanceof Error ? error.message : String(error);
      throw new FinanceEntryError(`No se pudo resolver una relación del asiento (${codigo}): revisá que el id sea de este equipo.`);
    }
  }

  const occurredOn = patch.occurred_on ?? existing.occurredOn;
  const recurrence = patch.recurrence ?? existing.recurrence;
  const cambiaRecurrencia = patch.recurrence !== undefined || patch.occurred_on !== undefined;

  const set = {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
    ...(patch.currency !== undefined ? { currency: patch.currency.toUpperCase() } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.occurred_on !== undefined ? { occurredOn: patch.occurred_on } : {}),
    ...(patch.due_on !== undefined ? { dueOn: patch.due_on } : {}),
    ...(paidOn !== existing.paidOn ? { paidOn } : {}),
    ...(cambiaRecurrencia
      ? { recurrence, nextDueOn: recurrence === 'none' ? null : nextRecurrenceDate(occurredOn, recurrence as 'monthly' | 'annual') }
      : {}),
    ...(patch.payment_method !== undefined ? { paymentMethod: patch.payment_method } : {}),
    ...(patch.counterparty !== undefined ? { counterparty: patch.counterparty } : {}),
    ...relaciones,
    updatedBy: userId,
    updatedAt: new Date(),
  };

  if (patch.dry_run) {
    return { dryRun: true as const, entry: null, preview: { ...existing, ...set } };
  }

  const [entry] = await db
    .update(teamFinancialEntries)
    .set(set)
    .where(and(eq(teamFinancialEntries.id, entryId), eq(teamFinancialEntries.teamId, teamId)))
    .returning();
  return { dryRun: false as const, entry, preview: null };
}
