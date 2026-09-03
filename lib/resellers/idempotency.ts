import type Stripe from 'stripe';

/**
 * Clave de cobro para una suscripción de Stripe.
 *
 * CRÍTICO: el alta de un plan escribe teams.planId desde DOS sitios que se disparan
 * en el mismo checkout — /api/stripe/checkout (el redirect de vuelta) y
 * handleSubscriptionChange() (el webhook). Ambos llaman a chargePlanActivation, así
 * que si no compartieran esta clave el reseller pagaría el plan dos veces.
 *
 * Incluye el inicio del periodo para que la renovación mensual sí genere un cobro
 * nuevo: cambia el periodo, cambia la clave.
 */
export function stripeSubscriptionChargeKey(subscription: Stripe.Subscription): string {
  const item = subscription.items?.data?.[0];

  // En la API basil el periodo vive en el item; se cae a la suscripción por si
  // acaso, y a 'na' antes que generar una clave con undefined (que rompería el dedupe).
  const periodStart =
    (item as { current_period_start?: number } | undefined)?.current_period_start ??
    (subscription as unknown as { current_period_start?: number }).current_period_start ??
    subscription.start_date ??
    'na';

  return `stripe:${subscription.id}:${periodStart}`;
}
