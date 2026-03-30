import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { manualPayments, plans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { PaymentPlugin } from './types';
import { NextResponse } from 'next/server';
import { consolePaymentAuditLogger } from './audit';

export const manualPaymentPlugin: PaymentPlugin = {
  id: 'manual',
  validateConfig() {
    return;
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
      throw new Error('Plano não encontrado para pagamento manual.');
    }

    const reference = `MANUAL-${team.id}-${Date.now()}`;

    await db.insert(manualPayments).values({
      teamId: team.id,
      planId: plan.id,
      amount: plan.amount,
      currency: plan.currency,
      status: 'pending_manual_review',
      reference,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await manualPaymentPlugin.audit.recordStatusChange({
      provider: 'manual',
      paymentReference: reference,
      previousStatus: null,
      nextStatus: 'pending_manual_review',
      actor: 'system',
    });

    redirect('/pricing?manualPayment=pending');
  },
  async handleWebhook() {
    return NextResponse.json({
      received: true,
      ignored: true,
      message: 'Manual payment plugin does not process webhooks.',
    });
  },
  normalizePaymentStatus(providerStatus) {
    const normalized = providerStatus.toLowerCase();

    if (normalized === 'approved' || normalized === 'paid') {
      return 'paid';
    }

    if (normalized === 'pending_manual_review') {
      return 'pending_manual_review';
    }

    if (normalized === 'rejected') {
      return 'rejected';
    }

    if (normalized === 'canceled') {
      return 'canceled';
    }

    if (normalized === 'pending') {
      return 'pending';
    }

    return 'failed';
  },
  getPublicConfig() {
    return { provider: 'manual' };
  },
  audit: consolePaymentAuditLogger,
};
