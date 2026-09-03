import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { manualPayments, plans, resellerPlanPrices } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { PaymentPlugin } from './types';
import { NextResponse } from 'next/server';
import { consolePaymentAuditLogger } from './audit';
import { normalizeManualPaymentStatus } from '@/lib/payments/statuses';

export const manualPaymentPlugin: PaymentPlugin = {
  id: 'manual',
  validateConfig() {
    return;
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
      throw new Error('Plano não encontrado para pagamento manual.');
    }

    const resellerPrice = context.resellerId
      ? await db.query.resellerPlanPrices.findFirst({
          where: and(
            eq(resellerPlanPrices.resellerId, context.resellerId),
            eq(resellerPlanPrices.planId, plan.id),
            eq(resellerPlanPrices.isPublished, true),
          ),
        })
      : null;

    if (context.resellerId && !resellerPrice) {
      throw new Error('Este plan no está publicado por el revendedor.');
    }

    const reference = `MANUAL-${team.id}-${Date.now()}`;

    const [payment] = await db.insert(manualPayments).values({
      resellerId: context.resellerId,
      teamId: team.id,
      planId: plan.id,
      amount: resellerPrice?.retailAmount ?? plan.amount,
      currency: resellerPrice?.currency ?? plan.currency,
      status: 'pending_manual_review',
      reference,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: manualPayments.id });

    await manualPaymentPlugin.audit.recordStatusChange({
      provider: 'manual',
      paymentReference: reference,
      previousStatus: null,
      nextStatus: 'pending_manual_review',
      actor: 'system',
      metadata: { teamId: team.id, resellerId: context.resellerId, planId: plan.id },
    });

    redirect(`/pricing?manualPayment=pending&paymentId=${payment.id}`);
  },
  async handleWebhook() {
    return NextResponse.json({
      received: true,
      ignored: true,
      message: 'Manual payment plugin does not process webhooks.',
    });
  },
  normalizePaymentStatus: normalizeManualPaymentStatus,
  getPublicConfig() {
    return { provider: 'manual' };
  },
  audit: consolePaymentAuditLogger,
};
