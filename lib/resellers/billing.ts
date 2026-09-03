import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  plans,
  resellerPlanPrices,
  resellerWallets,
  resellers,
  teams,
} from '@/lib/db/schema';
import { resolveWholesaleAmount } from '@/lib/resellers/pricing';
import { debitWallet } from '@/lib/resellers/wallet';

export type ChargeResult =
  | { charged: false; reason: 'no_reseller' | 'free_plan' | 'plan_not_found' }
  | { charged: false; reason: 'insufficient_funds'; wholesale: number }
  | { charged: true; deduped: boolean; wholesale: number; pendingDebt: boolean };

/**
 * Cobra al reseller el precio mayorista del plan que acaba de activar uno de sus
 * clientes. Se llama desde TODOS los sitios que escriben teams.planId.
 *
 * El importe se recalcula aquí, en el servidor: nunca se acepta un mayorista que
 * venga del checkout o del formulario.
 */
export async function chargePlanActivation(input: {
  teamId: number;
  planId: number;
  idempotencyKey: string;
  /** true cuando el cliente final YA pagó: entonces no se puede rechazar el cobro. */
  allowDebt?: boolean;
  provider?: string | null;
  providerRef?: string | null;
}): Promise<ChargeResult> {
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, input.teamId),
  });

  // Los clientes directos de la plataforma no generan débito.
  if (!team?.resellerId) {
    return { charged: false, reason: 'no_reseller' };
  }

  const [reseller, plan, planPrice] = await Promise.all([
    db.query.resellers.findFirst({ where: eq(resellers.id, team.resellerId) }),
    db.query.plans.findFirst({ where: eq(plans.id, input.planId) }),
    db.query.resellerPlanPrices.findFirst({
      where: and(
        eq(resellerPlanPrices.resellerId, team.resellerId),
        eq(resellerPlanPrices.planId, input.planId),
      ),
    }),
  ]);

  if (!reseller || !plan) {
    return { charged: false, reason: 'plan_not_found' };
  }

  const wholesale = resolveWholesaleAmount(reseller, plan, planPrice);

  // Un plan gratis (o con mayorista 0) no cobra nada.
  if (wholesale <= 0) {
    return { charged: false, reason: 'free_plan' };
  }

  const result = await debitWallet({
    resellerId: reseller.id,
    amount: wholesale,
    type: 'debit_plan',
    idempotencyKey: input.idempotencyKey,
    teamId: team.id,
    planId: plan.id,
    provider: input.provider,
    providerRef: input.providerRef,
    description: `Plan ${plan.name} · equipo ${team.name}`,
    allowDebt: input.allowDebt,
  });

  if (!result.ok) {
    return { charged: false, reason: 'insufficient_funds', wholesale };
  }

  // Quedar en deuda bloquea altas nuevas, pero no toca a los clientes existentes.
  if (result.pendingDebt && reseller.status === 'active') {
    await db
      .update(resellers)
      .set({ status: 'past_due', updatedAt: new Date() })
      .where(eq(resellers.id, reseller.id));
  }

  return {
    charged: true,
    deduped: result.deduped,
    wholesale,
    pendingDebt: Boolean(result.pendingDebt),
  };
}

export type ActivationCheck =
  | { allowed: true }
  | { allowed: false; reason: 'suspended' | 'past_due' | 'insufficient_funds' };

/**
 * Guard previo al checkout. Se ejecuta ANTES de cobrarle al cliente final, para no
 * cobrarle por un plan que después no se va a poder activar.
 *
 * El motivo real (saldo del reseller) no debe llegarle al cliente final: es
 * información del negocio de su proveedor.
 */
export async function assertResellerCanActivate(
  teamId: number,
  planId: number,
): Promise<ActivationCheck> {
  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (!team?.resellerId) return { allowed: true };

  const [reseller, plan, planPrice, wallet] = await Promise.all([
    db.query.resellers.findFirst({ where: eq(resellers.id, team.resellerId) }),
    db.query.plans.findFirst({ where: eq(plans.id, planId) }),
    db.query.resellerPlanPrices.findFirst({
      where: and(
        eq(resellerPlanPrices.resellerId, team.resellerId),
        eq(resellerPlanPrices.planId, planId),
      ),
    }),
    db.query.resellerWallets.findFirst({
      where: eq(resellerWallets.resellerId, team.resellerId),
    }),
  ]);

  if (!reseller || !plan) return { allowed: true };

  if (reseller.status === 'suspended') {
    return { allowed: false, reason: 'suspended' };
  }
  if (reseller.status === 'past_due') {
    return { allowed: false, reason: 'past_due' };
  }

  const wholesale = resolveWholesaleAmount(reseller, plan, planPrice);
  if (wholesale <= 0) return { allowed: true };

  const balance = wallet?.balance ?? 0;
  const floor = -(wallet?.creditLimit ?? 0);

  if (balance - wholesale < floor) {
    return { allowed: false, reason: 'insufficient_funds' };
  }

  return { allowed: true };
}

/** Mensaje genérico para el cliente final: no revela el saldo de su proveedor. */
export const ACTIVATION_BLOCKED_MESSAGE =
  'Este plan no está disponible en este momento. Contacta con soporte.';
