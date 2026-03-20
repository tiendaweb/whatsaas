import { redirect } from 'next/navigation';
import { db } from '@/lib/db/drizzle';
import { manualPayments, plans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUser } from '@/lib/db/queries';
import { PaymentPlugin } from './types';

export const manualPaymentPlugin: PaymentPlugin = {
  id: 'manual',
  async createCheckout({ team, priceId, planId }) {
    const user = await getUser();
    if (!team || !user) {
      redirect(`/sign-up?redirect=checkout&priceId=${priceId}`);
    }

    const plan = planId
      ? await db.query.plans.findFirst({ where: eq(plans.id, planId) })
      : await db.query.plans.findFirst({ where: eq(plans.stripePriceId, priceId) });
    if (!plan) {
      throw new Error('Plano não encontrado para pagamento manual.');
    }

    await db.insert(manualPayments).values({
      teamId: team.id,
      planId: plan.id,
      amount: plan.amount,
      currency: plan.currency,
      status: 'pending_manual_review',
      reference: `MANUAL-${team.id}-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    redirect('/pricing?manualPayment=pending');
  },
};
