import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { plans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { PaymentPlugin } from './types';
import { getProviderConfig } from '@/lib/payments/provider-settings';
import { NextResponse } from 'next/server';
import { consolePaymentAuditLogger } from './audit';

export const mercadoPagoPlugin: PaymentPlugin = {
  id: 'mercadopago',
  async validateConfig() {
    const mp = await getProviderConfig('mercadopago');
    if (!mp.accessToken) {
      throw new Error('Mercado Pago no está configurado. Falta access token.');
    }
  },
  async createCheckout({ team, priceId, planId }) {
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

    const mp = await getProviderConfig('mercadopago');
    if (!mp.accessToken) {
      throw new Error('Mercado Pago no está configurado. Falta access token.');
    }

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const payload = {
      items: [
        {
          title: plan.name,
          description: plan.description || plan.name,
          quantity: 1,
          currency_id: plan.currency.toUpperCase(),
          unit_price: Number((plan.amount / 100).toFixed(2)),
        },
      ],
      back_urls: {
        success: mp.successUrl || `${baseUrl}/pricing?payment=success`,
        failure: mp.failureUrl || `${baseUrl}/pricing?payment=failure`,
        pending: mp.pendingUrl || `${baseUrl}/pricing?payment=pending`,
      },
      auto_return: 'approved',
      external_reference: `${team.id}:${priceId}`,
      metadata: {
        teamId: team.id,
        priceId,
        userId: user.id,
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
  async handleWebhook(request) {
    await mercadoPagoPlugin.validateConfig();
    const payload = await request.json().catch(() => ({}));
    const providerStatus = String(payload?.data?.status ?? payload?.status ?? 'pending');
    const canonicalStatus = mercadoPagoPlugin.normalizePaymentStatus(providerStatus);

    await mercadoPagoPlugin.audit.recordStatusChange({
      provider: 'mercadopago',
      paymentReference: String(payload?.data?.id ?? payload?.id ?? 'unknown'),
      previousStatus: null,
      nextStatus: canonicalStatus,
      actor: 'webhook',
      metadata: payload,
    });

    return NextResponse.json({ received: true });
  },
  normalizePaymentStatus(providerStatus) {
    const normalized = providerStatus.toLowerCase();

    if (normalized === 'approved' || normalized === 'accredited' || normalized === 'paid') {
      return 'paid';
    }

    if (normalized === 'in_process' || normalized === 'pending' || normalized === 'authorized') {
      return 'pending';
    }

    if (normalized === 'cancelled' || normalized === 'canceled') {
      return 'canceled';
    }

    if (normalized === 'rejected' || normalized === 'refunded' || normalized === 'charged_back') {
      return 'rejected';
    }

    return 'failed';
  },
  async getPublicConfig() {
    const mp = await getProviderConfig('mercadopago');
    return {
      provider: 'mercadopago',
      publicKey: mp.publicKey,
    };
  },
  audit: consolePaymentAuditLogger,
};
