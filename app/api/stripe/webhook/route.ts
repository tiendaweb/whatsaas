import Stripe from 'stripe';
import { handleSubscriptionChange, getStripeClient } from '@/lib/payments/stripe';
import { getActivePaymentProvider } from '@/lib/payments/provider-settings';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const activeProvider = await getActivePaymentProvider();
  if (activeProvider !== 'stripe') {
    console.info({
      scope: 'api.stripe.webhook',
      action: 'ignore_event_non_stripe_provider',
      message: 'Stripe webhook ignored because active payment provider is not stripe',
      activeProvider,
    });

    return NextResponse.json(
      {
        received: true,
        ignored: true,
        message: `Stripe webhook ignored. Active provider: ${activeProvider}`,
      },
      { status: 200 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    console.error({
      scope: 'api.stripe.webhook',
      action: 'validate_stripe_config',
      message: 'Stripe webhook ignored because Stripe configuration is missing',
      hasWebhookSecret: Boolean(webhookSecret),
      hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY),
    });

    return NextResponse.json(
      {
        received: true,
        ignored: true,
        message: 'Stripe webhook ignored due to missing configuration',
      },
      { status: 200 }
    );
  }

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.warn({
      scope: 'api.stripe.webhook',
      action: 'validate_webhook_signature_header',
      message: 'Stripe signature header is missing',
    });

    return NextResponse.json(
      { error: 'Missing stripe-signature header.' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error({
      scope: 'api.stripe.webhook',
      action: 'construct_event',
      message: 'Webhook signature verification failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Webhook signature verification failed.' },
      { status: 400 }
    );
  }

  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionChange(subscription);
      break;
    }
    default:
      console.info({
        scope: 'api.stripe.webhook',
        action: 'unhandled_event_type',
        message: 'Unhandled Stripe event type',
        eventType: event.type,
      });
  }

  return NextResponse.json({ received: true });
}
