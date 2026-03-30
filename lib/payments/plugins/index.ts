import Stripe from 'stripe';
import { PaymentPlugin } from './types';
import { manualPaymentPlugin } from './manual';
import { mercadoPagoPlugin } from './mercadopago';
import { handleSubscriptionChange, createCheckoutSession, createCustomerPortalSession, getStripeClient } from '@/lib/payments/stripe';
import { getActivePaymentProvider, PaymentProviderId } from '@/lib/payments/provider-settings';
import { NextResponse } from 'next/server';
import { consolePaymentAuditLogger } from './audit';

const stripePlugin: PaymentPlugin = {
  id: 'stripe',
  validateConfig() {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('Stripe no está configurado correctamente. Faltan STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET.');
    }
  },
  createCheckout: async ({ team, priceId, planId }) => createCheckoutSession({ team, priceId, planId }),
  createCustomerPortal: async (team) => {
    const portal = await createCustomerPortalSession(team);
    return portal.url;
  },
  normalizePaymentStatus(providerStatus) {
    const normalized = providerStatus.toLowerCase();

    if (normalized === 'active' || normalized === 'trialing' || normalized === 'paid') {
      return 'paid';
    }

    if (normalized === 'incomplete' || normalized === 'past_due' || normalized === 'pending') {
      return 'pending';
    }

    if (normalized === 'canceled') {
      return 'canceled';
    }

    if (normalized === 'unpaid' || normalized === 'incomplete_expired') {
      return 'failed';
    }

    return 'failed';
  },
  async handleWebhook(request) {
    stripePlugin.validateConfig();

    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ received: false, message: 'Missing stripe-signature header.' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      const stripe = getStripeClient();
      event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (error) {
      console.error({
        scope: 'payments.plugins.stripe',
        action: 'construct_event',
        message: 'Webhook signature verification failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json({ received: false, message: 'Webhook signature verification failed.' }, { status: 400 });
    }

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const canonicalStatus = stripePlugin.normalizePaymentStatus(subscription.status);
        await handleSubscriptionChange(subscription);
        await stripePlugin.audit.recordStatusChange({
          provider: 'stripe',
          paymentReference: subscription.id,
          previousStatus: null,
          nextStatus: canonicalStatus,
          actor: 'webhook',
          metadata: { eventType: event.type },
        });
        break;
      }
      default:
        console.info({
          scope: 'payments.plugins.stripe',
          action: 'unhandled_event_type',
          eventType: event.type,
        });
    }

    return NextResponse.json({ received: true });
  },
  getPublicConfig() {
    return {
      provider: 'stripe',
      publishableKeyConfigured: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    };
  },
  audit: consolePaymentAuditLogger,
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
