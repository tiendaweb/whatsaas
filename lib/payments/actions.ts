'use server';

import { redirect } from 'next/navigation';
import { stripe, getActivePlugin } from './plugins';
import { withTeam } from '@/lib/auth/middleware';
import { db } from '@/lib/db/drizzle';
import { teams, plans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const checkoutAction = withTeam(async (formData, team) => {
  const priceId = formData.get('priceId') as string;
  const rawPlanId = formData.get('planId');
  const planId = rawPlanId ? Number(rawPlanId) : undefined;
  const plugin = await getActivePlugin();
  await plugin.createCheckout({ team: team, priceId, planId });
});

export const customerPortalAction = withTeam(async (_, team) => {
  const plugin = await getActivePlugin();
  if (plugin.createCustomerPortal) {
    const portalUrl = await plugin.createCustomerPortal(team);
    if (portalUrl) {
      redirect(portalUrl);
    }
  }

  redirect('/pricing');
});

export const joinFreePlanAction = withTeam(async (formData, team) => {
  const planId = parseInt(formData.get('planId') as string);
  const plan = await db.query.plans.findFirst({
    where: eq(plans.id, planId)
  });

  if (!plan || plan.amount > 0) {
    throw new Error("Este plano não é gratuito.");
  }

  if (team.stripeSubscriptionId && team.subscriptionStatus === 'active') {
    try {
      await stripe.subscriptions.cancel(team.stripeSubscriptionId);
    } catch (error) {
      console.error("Erro ao cancelar assinatura anterior no Stripe:", error);
    }
  }

  await db.update(teams).set({
    planId: plan.id,
    subscriptionStatus: 'active',
    stripeSubscriptionId: null,
    stripeProductId: null,
    planName: plan.name,
    updatedAt: new Date()
  }).where(eq(teams.id, team.id));
  
  redirect('/dashboard');
});
