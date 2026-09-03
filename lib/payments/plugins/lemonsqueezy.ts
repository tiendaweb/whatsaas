import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { getUser, getFreePlan } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { paymentWebhookEvents, plans, resellerPlanPrices, teams } from '@/lib/db/schema';
import { PaymentPlugin } from './types';
import { consolePaymentAuditLogger } from './audit';
import { chargePlanActivation } from '@/lib/resellers/billing';
import { normalizeLemonSqueezyStatus } from '@/lib/payments/statuses';

type LemonSqueezyOrder = {
  id: string;
  attributes: {
    status: string;
    total: number;
    currency: string;
  };
};

type LemonSqueezySubscription = {
  id: string;
  attributes: {
    status: string;
  };
};

type CustomData = {
  teamId?: string | number;
  planId?: string | number;
  priceId?: string;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return null;
}

function parseCustomData(meta: Record<string, unknown> | undefined): { teamId: number | null; planId: number | null } {
  const customData = (meta?.custom_data ?? {}) as CustomData;
  return {
    teamId: parseNumber(customData.teamId),
    planId: parseNumber(customData.planId),
  };
}

function secureEqual(a: string, b: string): boolean {
  const first = Buffer.from(a, 'utf8');
  const second = Buffer.from(b, 'utf8');

  if (first.length !== second.length) return false;
  return timingSafeEqual(first, second);
}

async function fetchFromLemonSqueezy<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`https://api.lemonsqueezy.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/vnd.api+json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Lemon Squeezy API ${path} failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}

async function activateTeamPlan(teamId: number, planId: number) {
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
  if (!plan) {
    throw new Error(`Plan ${planId} not found while trying to activate team ${teamId}`);
  }

  await db.update(teams).set({
    planId: plan.id,
    planName: plan.name,
    subscriptionStatus: 'active',
    isCanceled: false,
    updatedAt: new Date(),
  }).where(eq(teams.id, teamId));
}

async function cancelTeamPlan(teamId: number) {
  const freePlan = await getFreePlan();
  await db.update(teams).set({
    planId: freePlan?.id ?? null,
    planName: freePlan?.name ?? null,
    subscriptionStatus: 'canceled',
    isCanceled: true,
    updatedAt: new Date(),
  }).where(eq(teams.id, teamId));
}

async function getSaleTerms(plan: typeof plans.$inferSelect, resellerId: number | null) {
  if (resellerId == null) return { amount: plan.amount, currency: plan.currency };
  const price = await db.query.resellerPlanPrices.findFirst({
    where: and(
      eq(resellerPlanPrices.resellerId, resellerId),
      eq(resellerPlanPrices.planId, plan.id),
      eq(resellerPlanPrices.isPublished, true),
    ),
  });
  if (!price) throw new Error(`Plan ${plan.id} is not published for reseller ${resellerId}.`);
  return { amount: price.retailAmount, currency: price.currency };
}

async function resolveTeamAndPlan(
  teamId: number | null,
  planId: number | null,
  resellerId: number | null,
  referenceLabel: string,
) {
  if (!teamId || !planId) {
    throw new Error(`Missing teamId/planId for ${referenceLabel}`);
  }

  const [team, plan] = await Promise.all([
    db.query.teams.findFirst({ where: eq(teams.id, teamId) }),
    db.query.plans.findFirst({ where: eq(plans.id, planId) }),
  ]);

  if (!team || !plan) {
    throw new Error(`Team (${teamId}) or plan (${planId}) not found.`);
  }
  if ((team.resellerId ?? null) !== resellerId) {
    throw new Error(`Team ${team.id} does not belong to webhook tenant.`);
  }

  return { team, plan };
}

export const lemonSqueezyPlugin: PaymentPlugin = {
  id: 'lemonsqueezy',
  async validateConfig(context) {
    const ls = context.providerConfig;
    if (!ls.apiKey || !ls.storeId) {
      throw new Error('Lemon Squeezy no está configurado. Faltan API key o Store ID.');
    }
  },
  async createCheckout({ team, priceId, planId, context }) {
    const user = await getUser();
    const redirectQuery = new URLSearchParams({
      redirect: 'checkout',
      ...(priceId ? { priceId } : {}),
      ...(planId ? { planId: String(planId) } : {}),
    }).toString();
    if (!team || !user) {
      redirect(`/sign-up?${redirectQuery}`);
    }

    const plan = planId
      ? await db.query.plans.findFirst({ where: eq(plans.id, planId) })
      : await db.query.plans.findFirst({ where: eq(plans.stripePriceId, priceId) });
    if (!plan) {
      throw new Error('Plan no encontrado.');
    }

    const ls = context.providerConfig;
    if (!ls.apiKey || !ls.storeId) {
      throw new Error('Lemon Squeezy no está configurado. Faltan API key o Store ID.');
    }

    const baseUrl = context.baseUrl;
    const variantId = priceId || plan.stripePriceId;

    const payload = {
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: user.email,
            custom: {
              teamId: String(team.id),
              planId: String(plan.id),
              priceId: variantId,
            },
          },
          product_options: {
            redirect_url: ls.successUrl || `${baseUrl}/pricing?payment=success`,
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: ls.storeId } },
          variant: { data: { type: 'variants', id: variantId } },
        },
      },
    };

    const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ls.apiKey}`,
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`No se pudo crear checkout de Lemon Squeezy: ${text}`);
    }

    const data = await response.json();
    const checkoutUrl = data?.data?.attributes?.url;

    if (!checkoutUrl) {
      throw new Error('Lemon Squeezy no devolvió URL de checkout.');
    }

    redirect(checkoutUrl);
  },
  async handleWebhook(request, tenantContext) {
    await lemonSqueezyPlugin.validateConfig(tenantContext);

    const rawBody = await request.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ received: false, message: 'Invalid JSON payload.' }, { status: 400 });
    }

    const ls = tenantContext.providerConfig;

    if (ls.webhookSecret) {
      const signature = request.headers.get('x-signature');
      if (!signature) {
        return NextResponse.json({ received: false, message: 'Missing X-Signature header.' }, { status: 401 });
      }

      const computed = createHmac('sha256', ls.webhookSecret).update(rawBody).digest('hex');
      if (!secureEqual(computed, signature)) {
        return NextResponse.json({ received: false, message: 'Webhook signature mismatch.' }, { status: 401 });
      }
    }

    const meta = (payload.meta ?? {}) as Record<string, unknown>;
    const eventName = typeof meta.event_name === 'string' ? meta.event_name : 'unknown';
    // Lemon Squeezy no garantiza un id de evento propio en el header/payload: la
    // deduplicación real la da el índice único parcial sobre (provider, reseller, payment_id).
    const eventId = request.headers.get('x-event-id') || randomUUID();
    const data = (payload.data ?? {}) as Record<string, unknown>;
    const entityId = typeof data.id === 'string' ? data.id : undefined;
    const entityType = typeof data.type === 'string' ? data.type : undefined;

    const idempotencyInsert = await db.insert(paymentWebhookEvents).values({
      resellerId: tenantContext.resellerId,
      provider: 'lemonsqueezy',
      topic: eventName,
      eventId,
      paymentId: entityId ?? null,
      status: 'processing',
      payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing().returning({ id: paymentWebhookEvents.id });

    if (idempotencyInsert.length === 0) {
      return NextResponse.json({ received: true, ignored: true, message: 'Duplicated webhook event.' });
    }

    try {
      if (!ls.apiKey) {
        throw new Error('Lemon Squeezy API key missing while handling webhook.');
      }

      if (entityType === 'orders' && entityId) {
        const order = await fetchFromLemonSqueezy<{ data: LemonSqueezyOrder }>(`/v1/orders/${entityId}`, ls.apiKey);
        const { teamId, planId } = parseCustomData(meta);
        const { team, plan } = await resolveTeamAndPlan(teamId, planId, tenantContext.resellerId, `order ${entityId}`);

        const amountInCents = order.data.attributes.total;
        const normalizedCurrency = (order.data.attributes.currency || '').toLowerCase();
        const saleTerms = await getSaleTerms(plan, tenantContext.resellerId);

        if (amountInCents !== saleTerms.amount || normalizedCurrency !== saleTerms.currency.toLowerCase()) {
          throw new Error(`Order mismatch for team ${team.id}: expected ${saleTerms.amount}/${saleTerms.currency}, got ${amountInCents}/${normalizedCurrency}`);
        }

        const canonicalStatus = lemonSqueezyPlugin.normalizePaymentStatus(order.data.attributes.status);

        if (canonicalStatus === 'paid') {
          await activateTeamPlan(team.id, plan.id);
          await chargePlanActivation({
            teamId: team.id,
            planId: plan.id,
            idempotencyKey: `lemonsqueezy:order:${order.data.id}`,
            allowDebt: true,
            provider: 'lemonsqueezy',
            providerRef: order.data.id,
          });
        }

        if (canonicalStatus === 'canceled' || canonicalStatus === 'rejected' || canonicalStatus === 'failed') {
          await cancelTeamPlan(team.id);
        }

        await lemonSqueezyPlugin.audit.recordStatusChange({
          provider: 'lemonsqueezy',
          paymentReference: order.data.id,
          previousStatus: null,
          nextStatus: canonicalStatus,
          actor: 'webhook',
          metadata: {
            teamId: team.id,
            planId: plan.id,
            eventName,
            eventId,
            providerStatus: order.data.attributes.status,
            resellerId: tenantContext.resellerId,
          },
        });
      } else if (entityType === 'subscriptions' && entityId) {
        const subscription = await fetchFromLemonSqueezy<{ data: LemonSqueezySubscription }>(`/v1/subscriptions/${entityId}`, ls.apiKey);
        const { teamId, planId } = parseCustomData(meta);
        const { team, plan } = await resolveTeamAndPlan(teamId, planId, tenantContext.resellerId, `subscription ${entityId}`);

        // Las suscripciones no exponen un importe fiable en todos los eventos: el
        // importe ya se validó en el order_created de la primera cobranza.
        const canonicalStatus = lemonSqueezyPlugin.normalizePaymentStatus(subscription.data.attributes.status);

        if (canonicalStatus === 'paid') {
          await activateTeamPlan(team.id, plan.id);
          await chargePlanActivation({
            teamId: team.id,
            planId: plan.id,
            idempotencyKey: `lemonsqueezy:subscription:${subscription.data.id}:${eventName}`,
            allowDebt: true,
            provider: 'lemonsqueezy',
            providerRef: subscription.data.id,
          });
        }

        if (canonicalStatus === 'canceled' || canonicalStatus === 'rejected' || canonicalStatus === 'failed') {
          await cancelTeamPlan(team.id);
        }

        await lemonSqueezyPlugin.audit.recordStatusChange({
          provider: 'lemonsqueezy',
          paymentReference: subscription.data.id,
          previousStatus: null,
          nextStatus: canonicalStatus,
          actor: 'webhook',
          metadata: {
            teamId: team.id,
            planId: plan.id,
            eventName,
            eventId,
            providerStatus: subscription.data.attributes.status,
            resellerId: tenantContext.resellerId,
          },
        });
      } else {
        await lemonSqueezyPlugin.audit.recordStatusChange({
          provider: 'lemonsqueezy',
          paymentReference: 'unknown',
          previousStatus: null,
          nextStatus: 'pending',
          actor: 'webhook',
          metadata: { eventName, eventId },
        });
      }

      await db.update(paymentWebhookEvents).set({
        status: 'processed',
        processedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(paymentWebhookEvents.id, idempotencyInsert[0].id));

      return NextResponse.json({ received: true });
    } catch (error) {
      await db.update(paymentWebhookEvents).set({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      }).where(eq(paymentWebhookEvents.id, idempotencyInsert[0].id));

      console.error({
        scope: 'payments.plugins.lemonsqueezy',
        action: 'handle_webhook',
        message: 'Lemon Squeezy webhook processing failed',
        eventName,
        eventId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json({ received: false, message: 'Webhook processing failed.' }, { status: 500 });
    }
  },
  normalizePaymentStatus: normalizeLemonSqueezyStatus,
  async getPublicConfig(context) {
    const ls = context.providerConfig;
    return {
      provider: 'lemonsqueezy',
      storeIdConfigured: Boolean(ls.storeId),
    };
  },
  audit: consolePaymentAuditLogger,
};
