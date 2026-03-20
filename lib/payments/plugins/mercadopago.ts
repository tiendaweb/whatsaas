import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { plans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { PaymentPlugin } from './types';
import { getProviderConfig } from '@/lib/payments/provider-settings';

export const mercadoPagoPlugin: PaymentPlugin = {
  id: 'mercadopago',
  async createCheckout({ team, priceId, planId }) {
    const user = await getUser();
    if (!team || !user) {
      redirect(`/sign-up?redirect=checkout&priceId=${priceId}`);
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
};
