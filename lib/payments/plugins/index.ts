import Stripe from 'stripe';
import { PaymentPlugin } from '@/lib/payments/plugin-types';
import { manualPaymentPlugin } from './manual';
import { mercadoPagoPlugin } from './mercadopago';
import { lemonSqueezyPlugin } from './lemonsqueezy';
import {
  cancelStripeSubscription,
  handleSubscriptionChange,
  createCheckoutSession,
  createCustomerPortalSession,
  getStripeClientFor,
} from '@/lib/payments/stripe';
import { getActivePaymentProvider, PaymentProviderId } from '@/lib/payments/provider-settings';
import { NextResponse } from 'next/server';
import { consolePaymentAuditLogger } from './audit';
import { db } from '@/lib/db/drizzle';
import { paymentWebhookEvents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { normalizeStripeStatus } from '@/lib/payments/statuses';

const stripePlugin: PaymentPlugin = {
  id: 'stripe',
  validateConfig(context) {
    if (!context.providerConfig.secretKey || !context.providerConfig.webhookSecret) {
      throw new Error('Stripe no está configurado correctamente. Faltan STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET.');
    }
  },
  createCheckout: async ({ team, priceId, planId, context }) =>
    createCheckoutSession({ team, priceId, planId, context }),
  createCustomerPortal: async (team, context) => {
    const portal = await createCustomerPortalSession(team, context);
    return portal.url;
  },
  cancelSubscription: cancelStripeSubscription,
  normalizePaymentStatus: normalizeStripeStatus,
  async handleWebhook(request, context) {
    stripePlugin.validateConfig(context);

    const payload = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ received: false, message: 'Missing stripe-signature header.' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      const stripe = await getStripeClientFor(context.resellerId, context.providerConfig);
      event = stripe.webhooks.constructEvent(
        payload,
        signature,
        context.providerConfig.webhookSecret!,
      );
    } catch (error) {
      console.error({
        scope: 'payments.plugins.stripe',
        action: 'construct_event',
        message: 'Webhook signature verification failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json({ received: false, message: 'Webhook signature verification failed.' }, { status: 400 });
    }

    const [claimedEvent] = await db
      .insert(paymentWebhookEvents)
      .values({
        resellerId: context.resellerId,
        provider: 'stripe',
        topic: event.type,
        eventId: event.id,
        paymentId: typeof event.data.object === 'object' && event.data.object && 'id' in event.data.object
          ? String(event.data.object.id)
          : null,
        status: 'processing',
        payload: event as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ id: paymentWebhookEvents.id });
    if (!claimedEvent) {
      return NextResponse.json({ received: true, ignored: true, message: 'Duplicated webhook event.' });
    }

    try {
      switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const canonicalStatus = stripePlugin.normalizePaymentStatus(subscription.status);
        await handleSubscriptionChange(subscription, context.resellerId);
        await stripePlugin.audit.recordStatusChange({
          provider: 'stripe',
          paymentReference: subscription.id,
          previousStatus: null,
          nextStatus: canonicalStatus,
          actor: 'webhook',
          metadata: {
            eventType: event.type,
            resellerId: context.resellerId,
          },
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
      await db.update(paymentWebhookEvents).set({
        status: 'processed',
        processedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(paymentWebhookEvents.id, claimedEvent.id));
    } catch (error) {
      await db.update(paymentWebhookEvents).set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      }).where(eq(paymentWebhookEvents.id, claimedEvent.id));
      throw error;
    }

    return NextResponse.json({ received: true });
  },
  getPublicConfig(context) {
    return {
      provider: 'stripe',
      publishableKeyConfigured: Boolean(context.providerConfig.publishableKey),
    };
  },
  audit: consolePaymentAuditLogger,
};

const registry: Record<PaymentProviderId, PaymentPlugin> = {
  stripe: stripePlugin,
  manual: manualPaymentPlugin,
  mercadopago: mercadoPagoPlugin,
  lemonsqueezy: lemonSqueezyPlugin,
};

export function getPluginById(provider: PaymentProviderId): PaymentPlugin {
  return registry[provider] ?? stripePlugin;
}

/**
 * El proveedor activo del tenant. Para un reseller es el que él configuró: cobra con
 * sus credenciales, no con las de la plataforma.
 */
export async function getActivePlugin(
  resellerId?: number | null,
): Promise<PaymentPlugin> {
  const activeProvider = await getActivePaymentProvider(resellerId);
  return getPluginById(activeProvider);
}
