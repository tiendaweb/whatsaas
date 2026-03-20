import { getPublishedPlans, getTeamForUser } from '@/lib/db/queries';
import { PricingClient } from './pricing-client';
import { getActivePaymentProvider } from '@/lib/payments/provider-settings';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  const [plans, team, paymentProvider] = await Promise.all([
    getPublishedPlans(),
    getTeamForUser(),
    getActivePaymentProvider(),
  ]);
  const teamData = team ? {
    planId: team.planId,
    subscriptionStatus: team.subscriptionStatus
  } : undefined;

  return <PricingClient allPlans={plans} currentTeam={teamData} paymentProvider={paymentProvider} />;
}
