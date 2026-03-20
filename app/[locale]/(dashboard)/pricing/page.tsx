import { getPublishedPlans, getTeamForUser } from '@/lib/db/queries';
import { PricingClient } from './pricing-client';
import { getActivePaymentProvider } from '@/lib/payments/provider-settings';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const [plans, team] = await Promise.all([
    getPublishedPlans(),
    getTeamForUser(),
  ]);
  const paymentProvider = await getActivePaymentProvider().catch((error) => {
    const fallbackProvider = process.env.PAYMENT_PROVIDER;
    const safeFallback =
      fallbackProvider === 'manual' || fallbackProvider === 'mercadopago' || fallbackProvider === 'stripe'
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
