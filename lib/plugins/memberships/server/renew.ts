import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamMembershipSubscriptions } from '@/lib/db/schema';
import { recordFinancialEntry } from '@/lib/plugins/finance/server/entries';

/**
 * Renovar una suscripción, sin sesión.
 *
 * Estaba adentro de un handler privado del conector. Se extrajo para que la
 * pantalla, el conector y el lote del Centro de comandos renueven con la misma
 * regla: correr la fecha y, opcionalmente, dejar el cobro asentado en el mismo
 * movimiento.
 *
 * Acá NO se chequean permisos ni si el plugin está activo: eso lo decide quien
 * llama. Lo que sí se valida siempre es que la suscripción sea del equipo y que
 * la fecha nueva sea posterior a la vigente.
 */

export class MembershipRenewError extends Error {}

export type RenewSubscriptionInput = {
  subscription_id: number;
  new_end_date: string;
  payment_status?: 'pending' | 'paid' | 'overdue' | 'refunded';
  /** Deja además el asiento de ingreso. Sin esto la cobranza queda a medias. */
  record_payment?: boolean;
  /** Si se omite, se usa el precio de la suscripción. */
  amount?: number;
  account_id?: number | null;
  idempotency_key: string;
  dry_run?: boolean;
};

export async function renewSubscription(teamId: number, userId: number, input: RenewSubscriptionInput) {
  const suscripcion = await db.query.teamMembershipSubscriptions.findFirst({
    where: and(
      eq(teamMembershipSubscriptions.id, input.subscription_id),
      eq(teamMembershipSubscriptions.teamId, teamId),
    ),
  });
  if (!suscripcion) throw new MembershipRenewError('La suscripción no existe en este equipo.');

  if (suscripcion.endDate && input.new_end_date <= suscripcion.endDate) {
    throw new MembershipRenewError(
      `La fecha nueva (${input.new_end_date}) no es posterior a la actual (${suscripcion.endDate}): eso acorta la suscripción, no la renueva.`,
    );
  }

  const monto = input.amount ?? suscripcion.price;

  if (input.dry_run) {
    return {
      dryRun: true as const,
      preview: {
        suscripcion: suscripcion.subscriptionNumber,
        plan: suscripcion.planNameSnapshot,
        vence_ahora: suscripcion.endDate,
        vence_despues: input.new_end_date,
        payment_status: input.payment_status ?? suscripcion.paymentStatus,
        registra_cobro: Boolean(input.record_payment),
        monto: input.record_payment ? monto : null,
        currency: suscripcion.currency,
      },
    };
  }

  const [actualizada] = await db
    .update(teamMembershipSubscriptions)
    .set({
      endDate: input.new_end_date,
      status: 'active',
      ...(input.payment_status ? { paymentStatus: input.payment_status } : {}),
      // Correr la fecha reabre la ventana de avisos: los ya enviados
      // corresponden al vencimiento viejo.
      remindersSent: [],
      updatedAt: new Date(),
    })
    .where(and(
      eq(teamMembershipSubscriptions.id, input.subscription_id),
      eq(teamMembershipSubscriptions.teamId, teamId),
    ))
    .returning();

  let entry: unknown = null;
  if (input.record_payment) {
    const hoy = new Date().toISOString().slice(0, 10);
    const resultado = await recordFinancialEntry(teamId, userId, {
      type: 'income',
      title: `Renovación ${suscripcion.planNameSnapshot || suscripcion.subscriptionNumber}`,
      category: 'Membresías',
      amount: monto,
      currency: suscripcion.currency,
      status: input.payment_status === 'paid' ? 'paid' : 'pending',
      occurred_on: hoy,
      paid_on: input.payment_status === 'paid' ? hoy : undefined,
      due_on: input.new_end_date,
      subscription_id: input.subscription_id,
      account_id: input.account_id ?? undefined,
      // Derivada de la clave de la renovación: reintentar la renovación entera
      // no crea un segundo ingreso por el mismo cobro.
      idempotency_key: `${input.idempotency_key}-cobro`,
    });
    entry = 'entry' in resultado ? resultado.entry : null;
  }

  return {
    dryRun: false as const,
    subscription: actualizada,
    entry,
    nota: input.record_payment
      ? 'Fecha y cobro quedaron registrados juntos.'
      : 'Se corrió la fecha SIN registrar cobro: si entró plata, cargala con whatspro_finance_record_entry o la cobranza queda incompleta.',
  };
}

export type CancelSubscriptionInput = {
  subscription_id: number;
  /** Por qué se da de baja. Queda en las notas de la suscripción con la fecha. */
  reason: string;
  dry_run?: boolean;
};

/**
 * Baja de una suscripción, de la forma NO destructiva: status → "cancelled"
 * con el motivo anotado. El DELETE de la ruta borra la fila y con ella el
 * historial de cobros vinculados; esto en cambio deja la suscripción visible
 * como cancelada (así la ve la pantalla, Finanzas OS y los reportes).
 *
 * La fecha de vencimiento no se toca: la baja no es una renovación.
 */
export async function cancelSubscription(teamId: number, userId: number, input: CancelSubscriptionInput) {
  const suscripcion = await db.query.teamMembershipSubscriptions.findFirst({
    where: and(
      eq(teamMembershipSubscriptions.id, input.subscription_id),
      eq(teamMembershipSubscriptions.teamId, teamId),
    ),
  });
  if (!suscripcion) throw new MembershipRenewError('La suscripción no existe en este equipo.');

  if (suscripcion.status === 'cancelled') {
    return { dryRun: false as const, idempotent: true as const, subscription: suscripcion };
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const motivo = `[Baja ${hoy}] ${input.reason.trim()}`;
  const notas = suscripcion.notes.trim() ? `${suscripcion.notes.trim()}\n${motivo}` : motivo;

  if (input.dry_run) {
    return {
      dryRun: true as const,
      idempotent: false as const,
      preview: {
        suscripcion: suscripcion.subscriptionNumber,
        plan: suscripcion.planNameSnapshot,
        status_actual: suscripcion.status,
        status_despues: 'cancelled',
        payment_status: suscripcion.paymentStatus,
        vence: suscripcion.endDate,
        notas_despues: notas.slice(0, 2000),
      },
    };
  }

  const [actualizada] = await db
    .update(teamMembershipSubscriptions)
    .set({
      status: 'cancelled',
      notes: notas.slice(0, 2000),
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(and(
      eq(teamMembershipSubscriptions.id, input.subscription_id),
      eq(teamMembershipSubscriptions.teamId, teamId),
    ))
    .returning();

  return { dryRun: false as const, idempotent: false as const, subscription: actualizada };
}
