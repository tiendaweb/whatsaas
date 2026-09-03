import Stripe from 'stripe';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { teams, plans, resellerPlanPrices } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { chargePlanActivation } from '@/lib/resellers/billing';
import { stripeSubscriptionChargeKey } from '@/lib/resellers/idempotency';
import { getProviderConfig } from '@/lib/payments/provider-settings';
import { getTenantForReseller } from '@/lib/tenant/resolve';
import { baseUrlForTenant } from '@/lib/tenant/urls';
import type { PaymentTenantContext } from '@/lib/payments/plugin-types';
import {
  getTeamByStripeCustomerId,
  getUser,
  getFreePlan
} from '@/lib/db/queries';

export function getStripeClient() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error('Stripe no está configurado. Falta STRIPE_SECRET_KEY.');
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: '2025-08-27.basil'
  });
}

/**
 * Cliente de Stripe del tenant. Para un reseller usa SUS claves: el dinero de sus
 * clientes tiene que entrar en su cuenta, no en la de la plataforma.
 *
 * No hay fallback a las claves de la plataforma a propósito. Si un reseller tiene el
 * cobro activado pero no ha cargado su secret key, el checkout debe fallar: cobrar con
 * las claves de la plataforma le mandaría el dinero a la cuenta equivocada.
 */
export async function getStripeClientFor(
  resellerId?: number | null,
  providerConfig?: Record<string, string | undefined>,
) {
  if (resellerId == null) {
    return getStripeClient();
  }

  const config = providerConfig ?? await getProviderConfig('stripe', resellerId);
  const secretKey = config.secretKey;

  if (!secretKey) {
    throw new Error(
      'Este proveedor no tiene Stripe configurado. Contacta con soporte.',
    );
  }

  return new Stripe(secretKey, { apiVersion: '2025-08-27.basil' });
}

export async function createCheckoutSession({
  team,
  priceId,
  planId,
  context,
}: {
  team: typeof teams.$inferSelect | null;
  priceId: string;
  planId?: number;
  context?: PaymentTenantContext;
}) {
  const user = await getUser();
  const redirectQuery = new URLSearchParams({
    redirect: 'checkout',
    ...(priceId ? { priceId } : {}),
    ...(planId ? { planId: String(planId) } : {}),
  }).toString();

  if (!team || !user) {
    redirect(`/sign-up?${redirectQuery}`);
  }

  // El reseller sale del equipo, no del host: es quien cobra y a quien se le debita.
  const resellerId = team.resellerId ?? null;

  if (resellerId == null && !process.env.STRIPE_SECRET_KEY) {
    redirect('/pricing?payment_notice=stripe_not_configured');
  }

  const plan = planId
    ? await db.query.plans.findFirst({ where: eq(plans.id, planId) })
    : await db.query.plans.findFirst({ where: eq(plans.stripePriceId, priceId) });

  let resolvedPriceId: string | undefined;

  if (resellerId != null) {
    // NUNCA se cae a plan.stripePriceId: ese price vive en la cuenta de la
    // plataforma y cobrarlo aquí metería el dinero del cliente del reseller en la
    // cuenta equivocada. Si no ha sincronizado sus precios, se falla.
    const planPrice = plan
      ? await db.query.resellerPlanPrices.findFirst({
          where: and(
            eq(resellerPlanPrices.resellerId, resellerId),
            eq(resellerPlanPrices.planId, plan.id),
          ),
        })
      : null;

    resolvedPriceId = planPrice?.externalPriceRef ?? undefined;

    if (!resolvedPriceId) {
      throw new Error(
        'Este plan todavía no está disponible para la compra. Contacta con soporte.',
      );
    }
  } else {
    resolvedPriceId = priceId || plan?.stripePriceId;
  }

  if (!resolvedPriceId) {
    throw new Error('El plan no tiene precio de Stripe configurado.');
  }

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: {
      planId: plan?.id.toString() || ''
    }
  };

  if (plan && plan.trialDays > 0) {
    subscriptionData.trial_period_days = plan.trialDays;
  }

  // Las claves del reseller si el equipo es suyo; las de la plataforma si no.
  const stripe = await getStripeClientFor(resellerId, context?.providerConfig);

  // El cliente vuelve a la web por la que compró, no al dominio de la plataforma.
  const baseUrl = context?.baseUrl ?? baseUrlForTenant(await getTenantForReseller(resellerId));

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price: resolvedPriceId,
        quantity: 1
      }
    ],
    mode: 'subscription',
    success_url: `${baseUrl}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing`,
    customer: team.stripeCustomerId || undefined,
    client_reference_id: user.id.toString(),
    allow_promotion_codes: true,
    subscription_data: subscriptionData,
    metadata: {
      teamId: String(team.id),
      resellerId: resellerId == null ? 'platform' : String(resellerId),
      planId: plan?.id ? String(plan.id) : '',
    },
  });

  redirect(session.url!);
}

export async function createCustomerPortalSession(
  team: typeof teams.$inferSelect,
  context?: PaymentTenantContext,
) {
  if (!team.stripeCustomerId || !team.stripeProductId) {
    redirect('/pricing');
  }

  if (team.resellerId == null && !process.env.STRIPE_SECRET_KEY) {
    redirect('/pricing?payment_notice=stripe_not_configured');
  }

  const stripe = await getStripeClientFor(team.resellerId, context?.providerConfig);

  let configuration: Stripe.BillingPortal.Configuration;
  const configurations = await stripe.billingPortal.configurations.list();

  if (configurations.data.length > 0) {
    configuration = configurations.data[0];
  } else {
    const product = await stripe.products.retrieve(team.stripeProductId);
    if (!product.active) {
      throw new Error("Team's product is not active in Stripe");
    }

    const prices = await stripe.prices.list({
      product: product.id,
      active: true
    });
    if (prices.data.length === 0) {
      throw new Error("No active prices found for the team's product");
    }

    configuration = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: 'Manage your subscription'
      },
      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ['price', 'quantity', 'promotion_code'],
          proration_behavior: 'create_prorations',
          products: [
            {
              product: product.id,
              prices: prices.data.map((price) => price.id)
            }
          ]
        },
        subscription_cancel: {
          enabled: true,
          mode: 'at_period_end',
          cancellation_reason: {
            enabled: true,
            options: [
              'too_expensive',
              'missing_features',
              'switched_service',
              'unused',
              'other'
            ]
          }
        },
        payment_method_update: {
          enabled: true
        }
      }
    });
  }

  return stripe.billingPortal.sessions.create({
    customer: team.stripeCustomerId,
    return_url: `${context?.baseUrl ?? process.env.BASE_URL}/dashboard`,
    configuration: configuration.id
  });
}

export async function handleSubscriptionChange(
  subscription: Stripe.Subscription,
  resellerId?: number | null,
) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  const team = await getTeamByStripeCustomerId(customerId, resellerId);

  if (!team) {
    console.error('Team not found for Stripe customer:', customerId);
    return;
  }

  const planStripeProduct = subscription.items.data[0]?.price.product as string;
  let localPlanId = null;
  let planName = null;

  if (status === 'active' || status === 'trialing') {
    if (planStripeProduct) {
      // Si el equipo es de un reseller, el product id viene de SU cuenta de Stripe:
      // buscarlo en plans.stripeProductId (ids de la plataforma) no encontraría nada
      // y la suscripción quedaría sin plan.
      const localPlan = team.resellerId
        ? await db.query.plans.findFirst({
            where: inArray(
              plans.id,
              db
                .select({ id: resellerPlanPrices.planId })
                .from(resellerPlanPrices)
                .where(
                  and(
                    eq(resellerPlanPrices.resellerId, team.resellerId),
                    eq(resellerPlanPrices.externalProductRef, planStripeProduct),
                  ),
                ),
            ),
          })
        : await db.query.plans.findFirst({
            where: eq(plans.stripeProductId, planStripeProduct),
          });

      if (localPlan) {
        localPlanId = localPlan.id;
        planName = localPlan.name;
      }
    }
  } else if (status === 'canceled' || status === 'unpaid') {
    const freePlan = await getFreePlan();
    if (freePlan) {
      localPlanId = freePlan.id;
      planName = freePlan.name;
    }
  }

  const updateData: any = {
    stripeSubscriptionId: status === 'canceled' ? null : subscriptionId,
    subscriptionStatus: status,
    isCanceled: subscription.cancel_at_period_end,
    trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    updatedAt: new Date()
  };

  if (localPlanId) {
    updateData.planId = localPlanId;
    updateData.planName = planName;
    if (status === 'canceled' || status === 'unpaid') {
      updateData.subscriptionStatus = 'active';
      updateData.isCanceled = false;
      updateData.trialEndsAt = null;
    }
  }

  if (planStripeProduct && status !== 'canceled' && status !== 'unpaid') {
    updateData.stripeProductId = planStripeProduct;
  }

  await db.update(teams)
    .set(updateData)
    .where(eq(teams.id, team.id));

  // Cobro al reseller. Solo en altas y renovaciones activas: una cancelación baja al
  // plan free y no debe generar débito.
  if (localPlanId && (status === 'active' || status === 'trialing')) {
    // Misma clave que /api/stripe/checkout, que también procesa esta alta. La clave
    // incluye el inicio del periodo, así que cada renovación sí vuelve a cobrar.
    await chargePlanActivation({
      teamId: team.id,
      planId: localPlanId,
      idempotencyKey: stripeSubscriptionChargeKey(subscription),
      // El cliente ya le pagó al reseller: la activación no se revierte aunque
      // el reseller se haya quedado sin saldo.
      allowDebt: true,
      provider: 'stripe',
      providerRef: subscriptionId,
    });
  }
}

export async function cancelStripeSubscription(
  team: typeof teams.$inferSelect,
  context: PaymentTenantContext,
) {
  if (!team.stripeSubscriptionId) return;
  const stripe = await getStripeClientFor(team.resellerId, context.providerConfig);
  await stripe.subscriptions.cancel(team.stripeSubscriptionId);
}

export async function getStripePrices() {
  const stripe = getStripeClient();
  const prices = await stripe.prices.list({
    expand: ['data.product'],
    active: true,
    type: 'recurring'
  });

  return prices.data.map((price) => ({
    id: price.id,
    productId:
      typeof price.product === 'string' ? price.product : price.product.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
    trialPeriodDays: price.recurring?.trial_period_days
  }));
}

export async function getStripeProducts() {
  const stripe = getStripeClient();
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price']
  });

  return products.data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    defaultPriceId:
      typeof product.default_price === 'string'
        ? product.default_price
        : product.default_price?.id
  }));
}
