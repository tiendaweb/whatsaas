type PlanLike = { amount: number };
type ResellerLike = { wholesaleDiscountBps: number };
type PlanPriceLike = { wholesaleAmount: number | null };

/** Los importes viven en centavos en toda la app (plans.amount ya lo hacía). */
export function formatMoney(amountInCents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountInCents / 100);
}

/**
 * Precio que la plataforma le cobra al reseller por un plan.
 *
 * Se recalcula SIEMPRE en el servidor en el momento del cobro. No se confía en un
 * importe que venga del formulario ni en un snapshot guardado en el checkout: si no,
 * un reseller podría fijarse a sí mismo un mayorista de 0.
 */
export function resolveWholesaleAmount(
  reseller: ResellerLike,
  plan: PlanLike,
  planPrice?: PlanPriceLike | null,
): number {
  // Un mayorista negociado a mano por el admin gana al porcentaje general.
  if (planPrice?.wholesaleAmount != null) {
    return Math.max(0, planPrice.wholesaleAmount);
  }

  const bps = Math.min(10000, Math.max(0, reseller.wholesaleDiscountBps));
  return Math.max(0, Math.round((plan.amount * (10000 - bps)) / 10000));
}

/** Lo que el reseller le gana a cada venta de este plan. */
export function resolveMargin(retailAmount: number, wholesaleAmount: number): number {
  return retailAmount - wholesaleAmount;
}
