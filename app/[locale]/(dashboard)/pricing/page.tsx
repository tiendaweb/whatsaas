import { getPublishedPlansForTenant, getTeamForUser } from '@/lib/db/queries';
import { PricingClient } from './pricing-client';
import { getActivePaymentProvider } from '@/lib/payments/provider-settings';
import { getTenantId } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const [team, tenantId] = await Promise.all([getTeamForUser(), getTenantId()]);

  // El equipo manda sobre el host: un cliente de un reseller sigue viendo (y pagando)
  // los precios de SU proveedor aunque entre por el dominio de la plataforma. Así el
  // precio que ve coincide siempre con quién le va a cobrar.
  const resellerId = team?.resellerId ?? tenantId;

  const plans = await getPublishedPlansForTenant(resellerId);

  const paymentProvider = await getActivePaymentProvider(resellerId).catch((error) => {
    const fallbackProvider = process.env.PAYMENT_PROVIDER;
    const safeFallback =
      fallbackProvider === 'manual' ||
      fallbackProvider === 'mercadopago' ||
      fallbackProvider === 'stripe' ||
      fallbackProvider === 'lemonsqueezy'
        ? fallbackProvider
        : 'stripe';

    console.warn({
      scope: 'dashboard.pricing.page',
      action: 'getActivePaymentProvider',
      message: 'failed to read active payment provider, using fallback',
      fallbackProvider: safeFallback,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return safeFallback;
  });
  const teamData = team ? {
    planId: team.planId,
    subscriptionStatus: team.subscriptionStatus
  } : undefined;

  return <PricingClient allPlans={plans} currentTeam={teamData} paymentProvider={paymentProvider} />;
}
