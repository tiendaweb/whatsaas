'use server';

import { redirect } from 'next/navigation';
import { createCheckoutSession, createCustomerPortalSession, stripe } from './stripe';
import { withTeam } from '@/lib/auth/middleware';
import { db } from '@/lib/db/drizzle';
import { teams, plans } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const checkoutAction = withTeam(async (formData, team) => {
  const priceId = formData.get('priceId') as string;
  await createCheckoutSession({ team: team, priceId });
});

export const customerPortalAction = withTeam(async (_, team) => {
  const portalSession = await createCustomerPortalSession(team);
  redirect(portalSession.url);
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