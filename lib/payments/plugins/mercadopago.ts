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
import { normalizeMercadoPagoStatus } from '@/lib/payments/statuses';

type MercadoPagoPayment = {
  id: number;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  currency_id?: string;
  external_reference?: string;
  metadata?: {
    teamId?: number | string;
    planId?: number | string;
    [key: string]: unknown;
  };
};

type MercadoPagoPreapproval = {
  id: string;
  status?: string;
  reason?: string;
  external_reference?: string;
  auto_recurring?: {
    transaction_amount?: number;
    currency_id?: string;
    frequency?: number;
    frequency_type?: string;
  };
};

type WebhookContext = {
  topic: string;
  eventId: string;
  paymentId?: string;
  preapprovalId?: string;
  payload: Record<string, unknown>;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return null;
}

function parseExternalReference(reference: string | null | undefined): { teamId: number | null; planId: number | null } {
  if (!reference) return { teamId: null, planId: null };

  const parts = reference.split(':');
  const teamId = parseNumber(parts[0]);
  const planId = parseNumber(parts[1]);
  return {
    teamId,
    planId,
  };
}

function parseTopic(payload: Record<string, unknown>, requestUrl: URL): string {
  const queryTopic = requestUrl.searchParams.get('type') || requestUrl.searchParams.get('topic');
  if (queryTopic) return queryTopic;

  const payloadType = typeof payload.type === 'string' ? payload.type : undefined;
  const payloadTopic = typeof payload.topic === 'string' ? payload.topic : undefined;
  return payloadType || payloadTopic || 'unknown';
}

function parseEventId(payload: Record<string, unknown>, request: Request): string {
  return (
    request.headers.get('x-request-id') ||
    (typeof payload.id === 'string' ? payload.id : undefined) ||
    (typeof payload.id === 'number' ? String(payload.id) : undefined) ||
    randomUUID()
  );
}

function parseEntityId(payload: Record<string, unknown>, requestUrl: URL): string | undefined {
  const queryDataId = requestUrl.searchParams.get('data.id');
  if (queryDataId) return queryDataId;

  const payloadData = payload.data;
  if (payloadData && typeof payloadData === 'object' && 'id' in payloadData) {
    const dataId = (payloadData as { id?: unknown }).id;
    if (typeof dataId === 'string') return dataId;
    if (typeof dataId === 'number') return String(dataId);
  }

  return undefined;
}

function parseSignatureHeader(signature: string): { ts: string | null; v1: string | null } {
  const parts = signature.split(',').map((part) => part.trim());
  let ts: string | null = null;
  let v1: string | null = null;

  for (const part of parts) {
    if (part.startsWith('ts=')) ts = part.slice(3);
    if (part.startsWith('v1=')) v1 = part.slice(3);
  }

  return { ts, v1 };
}

function secureEqual(a: string, b: string): boolean {
  const first = Buffer.from(a, 'utf8');
  const second = Buffer.from(b, 'utf8');

  if (first.length !== second.length) return false;
  return timingSafeEqual(first, second);
}

async function fetchFromMercadoPago<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercado Pago API ${path} failed (${response.status}): ${body}`);
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

export const mercadoPagoPlugin: PaymentPlugin = {
  id: 'mercadopago',
  async validateConfig(context) {
    const mp = context.providerConfig;
    if (!mp.accessToken) {
      throw new Error('Mercado Pago no está configurado. Falta access token.');
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
      throw new Error('Plano não encontrado.');
    }

    const mp = context.providerConfig;
    if (!mp.accessToken) {
      throw new Error('Mercado Pago no está configurado. Falta access token.');
    }

    const baseUrl = context.baseUrl;
    const saleTerms = await getSaleTerms(plan, context.resellerId);
    const checkoutMode = mp.checkoutMode === 'subscription' ? 'subscription' : 'payment';
    const externalReference = `${team.id}:${plan.id}:${priceId || plan.stripePriceId}`;

    if (checkoutMode === 'subscription') {
      const frequencyType = plan.interval === 'year' ? 'months' : 'months';
      const frequency = plan.interval === 'year' ? 12 : 1;

      const payload = {
        reason: mp.subscriptionReason || `${plan.name} subscription`,
        external_reference: externalReference,
        back_url: mp.successUrl || `${baseUrl}/pricing?payment=success`,
        payer_email: user.email,
        auto_recurring: {
          frequency,
          frequency_type: frequencyType,
          transaction_amount: Number((saleTerms.amount / 100).toFixed(2)),
          currency_id: saleTerms.currency.toUpperCase(),
        },
      };

      const response = await fetch('https://api.mercadopago.com/preapproval', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mp.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`No se pudo crear suscripción de Mercado Pago: ${text}`);
      }

      const data = await response.json();
      const checkoutUrl = data.init_point;

      if (!checkoutUrl) {
        throw new Error('Mercado Pago no devolvió URL de checkout para suscripción.');
      }

      redirect(checkoutUrl);
    }

    const payload = {
      items: [
        {
          title: plan.name,
          description: plan.description || plan.name,
          quantity: 1,
          currency_id: saleTerms.currency.toUpperCase(),
          unit_price: Number((saleTerms.amount / 100).toFixed(2)),
        },
      ],
      back_urls: {
        success: mp.successUrl || `${baseUrl}/pricing?payment=success`,
        failure: mp.failureUrl || `${baseUrl}/pricing?payment=failure`,
        pending: mp.pendingUrl || `${baseUrl}/pricing?payment=pending`,
      },
      auto_return: 'approved',
      external_reference: externalReference,
      metadata: {
        teamId: team.id,
        planId: plan.id,
        priceId,
        userId: user.id,
        resellerId: context.resellerId,
      },
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mp.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`No se pudo crear preferencia de Mercado Pago: ${text}`);
    }

    const data = await response.json();
    const checkoutUrl = data.init_point || data.sandbox_init_point;

    if (!checkoutUrl) {
      throw new Error('Mercado Pago no devolvió URL de checkout.');
    }

    redirect(checkoutUrl);
  },
  async handleWebhook(request, tenantContext) {
    await mercadoPagoPlugin.validateConfig(tenantContext);

    const rawBody = await request.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ received: false, message: 'Invalid JSON payload.' }, { status: 400 });
    }
    const requestUrl = new URL(request.url);

    const topic = parseTopic(payload, requestUrl);
    const eventId = parseEventId(payload, request);
    const entityId = parseEntityId(payload, requestUrl);
    const paymentId = topic.includes('payment') ? entityId : undefined;
    const preapprovalId = topic.includes('preapproval') || topic.includes('subscription') ? entityId : undefined;

    const mp = tenantContext.providerConfig;
    if (mp.webhookSecret) {
      const signature = request.headers.get('x-signature');
      const requestId = request.headers.get('x-request-id');

      if (!signature || !requestId || !entityId) {
        return NextResponse.json({ received: false, message: 'Webhook signature headers are missing.' }, { status: 401 });
      }

      const { ts, v1 } = parseSignatureHeader(signature);
      if (!ts || !v1) {
        return NextResponse.json({ received: false, message: 'Invalid x-signature format.' }, { status: 401 });
      }

      const manifest = `id:${entityId};request-id:${requestId};ts:${ts};`;
      const computed = createHmac('sha256', mp.webhookSecret).update(manifest).digest('hex');

      if (!secureEqual(computed, v1)) {
        return NextResponse.json({ received: false, message: 'Webhook signature mismatch.' }, { status: 401 });
      }
    }

    const idempotencyInsert = await db.insert(paymentWebhookEvents).values({
      resellerId: tenantContext.resellerId,
      provider: 'mercadopago',
      topic,
      eventId,
      paymentId: paymentId ?? preapprovalId ?? null,
      status: 'processing',
      payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing().returning({ id: paymentWebhookEvents.id });

    if (idempotencyInsert.length === 0) {
      return NextResponse.json({ received: true, ignored: true, message: 'Duplicated webhook event.' });
    }

    const context: WebhookContext = {
      topic,
      eventId,
      paymentId,
      preapprovalId,
      payload,
    };

    try {
      if (!mp.accessToken) {
        throw new Error('Mercado Pago access token missing while handling webhook.');
      }

      if (context.paymentId) {
        const payment = await fetchFromMercadoPago<MercadoPagoPayment>(`/v1/payments/${context.paymentId}`, mp.accessToken);
        const parsedFromReference = parseExternalReference(payment.external_reference);
        const metadataTeamId = parseNumber(payment.metadata?.teamId);
        const metadataPlanId = parseNumber(payment.metadata?.planId);

        const resolvedTeamId = metadataTeamId ?? parsedFromReference.teamId;
        const resolvedPlanId = metadataPlanId ?? parsedFromReference.planId;

        if (!resolvedTeamId || !resolvedPlanId) {
          throw new Error(`Missing teamId/planId for payment ${context.paymentId}`);
        }

        const [team, plan] = await Promise.all([
          db.query.teams.findFirst({ where: eq(teams.id, resolvedTeamId) }),
          db.query.plans.findFirst({ where: eq(plans.id, resolvedPlanId) }),
        ]);

        if (!team || !plan) {
          throw new Error(`Team (${resolvedTeamId}) or plan (${resolvedPlanId}) not found.`);
        }
        if ((team.resellerId ?? null) !== tenantContext.resellerId) {
          throw new Error(`Team ${team.id} does not belong to webhook tenant.`);
        }

        const amountInCents = Math.round((payment.transaction_amount ?? 0) * 100);
        const normalizedCurrency = (payment.currency_id || '').toLowerCase();
        const saleTerms = await getSaleTerms(plan, tenantContext.resellerId);

        if (amountInCents !== saleTerms.amount || normalizedCurrency !== saleTerms.currency.toLowerCase()) {
          throw new Error(`Payment mismatch for team ${resolvedTeamId}: expected ${saleTerms.amount}/${saleTerms.currency}, got ${amountInCents}/${normalizedCurrency}`);
        }

        const canonicalStatus = mercadoPagoPlugin.normalizePaymentStatus(payment.status || 'pending');

        if (canonicalStatus === 'paid') {
          await activateTeamPlan(team.id, plan.id);
          await chargePlanActivation({
            teamId: team.id,
            planId: plan.id,
            idempotencyKey: `mercadopago:payment:${payment.id}`,
            allowDebt: true,
            provider: 'mercadopago',
            providerRef: String(payment.id),
          });
        }

        if (canonicalStatus === 'canceled' || canonicalStatus === 'rejected' || canonicalStatus === 'failed') {
          await cancelTeamPlan(team.id);
        }

        await mercadoPagoPlugin.audit.recordStatusChange({
          provider: 'mercadopago',
          paymentReference: String(payment.id),
          previousStatus: null,
          nextStatus: canonicalStatus,
          actor: 'webhook',
          metadata: {
            teamId: team.id,
            planId: plan.id,
            topic: context.topic,
            eventId: context.eventId,
            providerStatus: payment.status,
            resellerId: tenantContext.resellerId,
          },
        });
      } else if (context.preapprovalId) {
        const preapproval = await fetchFromMercadoPago<MercadoPagoPreapproval>(`/preapproval/${context.preapprovalId}`, mp.accessToken);
        const referenceData = parseExternalReference(preapproval.external_reference);

        if (!referenceData.teamId || !referenceData.planId) {
          throw new Error(`Missing teamId/planId for preapproval ${context.preapprovalId}`);
        }

        const [team, plan] = await Promise.all([
          db.query.teams.findFirst({ where: eq(teams.id, referenceData.teamId!) }),
          db.query.plans.findFirst({ where: eq(plans.id, referenceData.planId!) }),
        ]);

        if (!team || !plan) {
          throw new Error(`Team (${referenceData.teamId}) or plan (${referenceData.planId}) not found.`);
        }
        if ((team.resellerId ?? null) !== tenantContext.resellerId) {
          throw new Error(`Team ${team.id} does not belong to webhook tenant.`);
        }

        const amountInCents = Math.round((preapproval.auto_recurring?.transaction_amount ?? 0) * 100);
        const normalizedCurrency = (preapproval.auto_recurring?.currency_id || '').toLowerCase();
        const saleTerms = await getSaleTerms(plan, tenantContext.resellerId);

        if (amountInCents !== saleTerms.amount || normalizedCurrency !== saleTerms.currency.toLowerCase()) {
          throw new Error(`Preapproval mismatch for team ${team.id}: expected ${saleTerms.amount}/${saleTerms.currency}, got ${amountInCents}/${normalizedCurrency}`);
        }

        const canonicalStatus = mercadoPagoPlugin.normalizePaymentStatus(preapproval.status || 'pending');

        if (canonicalStatus === 'paid') {
          await activateTeamPlan(team.id, plan.id);
          await chargePlanActivation({
            teamId: team.id,
            planId: plan.id,
            idempotencyKey: `mercadopago:preapproval:${preapproval.id}`,
            allowDebt: true,
            provider: 'mercadopago',
            providerRef: preapproval.id,
          });
        }

        if (canonicalStatus === 'canceled' || canonicalStatus === 'rejected' || canonicalStatus === 'failed') {
          await cancelTeamPlan(team.id);
        }

        await mercadoPagoPlugin.audit.recordStatusChange({
          provider: 'mercadopago',
          paymentReference: preapproval.id,
          previousStatus: null,
          nextStatus: canonicalStatus,
          actor: 'webhook',
          metadata: {
            teamId: team.id,
            planId: plan.id,
            topic: context.topic,
            eventId: context.eventId,
            providerStatus: preapproval.status,
            resellerId: tenantContext.resellerId,
          },
        });
      } else {
        await mercadoPagoPlugin.audit.recordStatusChange({
          provider: 'mercadopago',
          paymentReference: 'unknown',
          previousStatus: null,
          nextStatus: 'pending',
          actor: 'webhook',
          metadata: {
            topic,
            eventId,
          },
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
        scope: 'payments.plugins.mercadopago',
        action: 'handle_webhook',
        message: 'Mercado Pago webhook processing failed',
        topic,
        eventId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json({ received: false, message: 'Webhook processing failed.' }, { status: 500 });
    }
  },
  normalizePaymentStatus: normalizeMercadoPagoStatus,
  async getPublicConfig(context) {
    const mp = context.providerConfig;
    return {
      provider: 'mercadopago',
      publicKey: mp.publicKey,
      checkoutMode: mp.checkoutMode || 'payment',
    };
  },
  audit: consolePaymentAuditLogger,
};
