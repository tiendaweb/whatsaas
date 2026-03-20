import { PaymentPlugin } from './types';
import { manualPaymentPlugin } from './manual';
import { mercadoPagoPlugin } from './mercadopago';
import { createCheckoutSession, createCustomerPortalSession } from '@/lib/payments/stripe';
import { getActivePaymentProvider, PaymentProviderId } from '@/lib/payments/provider-settings';

const stripePlugin: PaymentPlugin = {
  id: 'stripe',
  createCheckout: async ({ team, priceId, planId }) => createCheckoutSession({ team, priceId, planId }),
  createCustomerPortal: async (team) => {
    const portal = await createCustomerPortalSession(team);
    return portal.url;
  },
};

const registry: Record<PaymentProviderId, PaymentPlugin> = {
  stripe: stripePlugin,
  manual: manualPaymentPlugin,
  mercadopago: mercadoPagoPlugin,
};

export function getPluginById(provider: PaymentProviderId): PaymentPlugin {
  return registry[provider] ?? stripePlugin;
}

export async function getActivePlugin(): Promise<PaymentPlugin> {
  const activeProvider = await getActivePaymentProvider();
  return getPluginById(activeProvider);
}
