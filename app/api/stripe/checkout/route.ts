import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, teams, plans, resellerPlanPrices } from '@/lib/db/schema';
import { setSession } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';
import { getStripeClientFor } from '@/lib/payments/stripe';
import { getActivePaymentProvider } from '@/lib/payments/provider-settings';
import { chargePlanActivation } from '@/lib/resellers/billing';
import { stripeSubscriptionChargeKey } from '@/lib/resellers/idempotency';
import Stripe from 'stripe';
import { getTeamForUser } from '@/lib/db/queries';
import { resolvePaymentTenantContext } from '@/lib/payments/context';
import { and, inArray } from 'drizzle-orm';

function redirectToPricingWithInfo(request: NextRequest, reason: string) {
  const redirectUrl = new URL('/pricing', request.url);
  redirectUrl.searchParams.set('payment_notice', reason);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return redirectToPricingWithInfo(request, 'missing_checkout_session');
  }

  const currentTeam = await getTeamForUser();
  if (!currentTeam) {
    return redirectToPricingWithInfo(request, 'team_not_found');
  }

  const activeProvider = await getActivePaymentProvider(currentTeam.resellerId);
  if (activeProvider !== 'stripe') {
    return redirectToPricingWithInfo(request, `checkout_ignored_provider_${activeProvider}`);
  }

  if (currentTeam.resellerId == null && !process.env.STRIPE_SECRET_KEY) {
    console.error({
      scope: 'api.stripe.checkout',
      action: 'validate_stripe_config',
      message: 'Stripe checkout ignored because STRIPE_SECRET_KEY is missing',
      hasSessionId: Boolean(sessionId),
    });
    return redirectToPricingWithInfo(request, 'stripe_not_configured');
  }

  try {
    const context = await resolvePaymentTenantContext({
      provider: 'stripe',
      resellerId: currentTeam.resellerId,
      teamId: currentTeam.id,
      requirePaymentsEnabled: false,
    });
    const stripe = await getStripeClientFor(currentTeam.resellerId, context.providerConfig);

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    });

    if (!session.customer || typeof session.customer === 'string') {
      throw new Error('Invalid customer data from Stripe.');
    }

    const customerId = session.customer.id;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      throw new Error('No subscription found for this session.');
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });

    const priceItem = subscription.items.data[0]?.price;

    if (!priceItem) {
      throw new Error('No price found for this subscription.');
    }

    const product = priceItem.product as Stripe.Product;
    const productId = product.id;

    if (!productId) {
      throw new Error('No product ID found for this subscription.');
    }

    const internalPlan = currentTeam.resellerId
      ? await db.query.plans.findFirst({
          where: inArray(
            plans.id,
            db
              .select({ id: resellerPlanPrices.planId })
              .from(resellerPlanPrices)
              .where(and(
                eq(resellerPlanPrices.resellerId, currentTeam.resellerId),
                eq(resellerPlanPrices.externalProductRef, productId),
              )),
          ),
        })
      : await db.query.plans.findFirst({ where: eq(plans.stripeProductId, productId) });

    if (!internalPlan) {
      throw new Error('Internal plan not found for this Stripe product.');
    }

    const userId = session.client_reference_id;
    if (!userId) {
      throw new Error("No user ID found in session's client_reference_id.");
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(userId)))
      .limit(1);

    if (user.length === 0) {
      throw new Error('User not found in database.');
    }

    await db
      .update(teams)
      .set({
        planId: internalPlan.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeProductId: productId,
        planName: product.name,
        subscriptionStatus: subscription.status,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, currentTeam.id));

    // El cliente ya pagó, así que el cobro al reseller no puede rechazarse (allowDebt).
    // Comparte la clave con handleSubscriptionChange(), que se dispara por webhook
    // para esta misma alta: sin eso, se le cobraría el plan dos veces.
    await chargePlanActivation({
      teamId: currentTeam.id,
      planId: internalPlan.id,
      idempotencyKey: stripeSubscriptionChargeKey(subscription),
      allowDebt: true,
      provider: 'stripe',
      providerRef: subscriptionId,
    });

    await setSession(user[0]);
    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error({
      scope: 'api.stripe.checkout',
      action: 'handle_successful_checkout',
      message: 'Error handling successful checkout',
      sessionId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(new URL('/error', request.url));
  }
}
