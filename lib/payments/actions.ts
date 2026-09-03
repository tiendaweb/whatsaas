'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { getActivePlugin } from './plugins';
import { withTeam } from '@/lib/auth/middleware';
import { db } from '@/lib/db/drizzle';
import { manualPayments, teams, plans } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  ACTIVATION_BLOCKED_MESSAGE,
  assertResellerCanActivate,
  chargePlanActivation,
} from '@/lib/resellers/billing';
import { resolvePaymentTenantContext } from '@/lib/payments/context';

export const checkoutAction = withTeam(async (formData, team) => {
  const priceId = formData.get('priceId') as string;
  const rawPlanId = formData.get('planId');
  const planId = rawPlanId ? Number(rawPlanId) : undefined;

  // Se comprueba ANTES de cobrarle al cliente final: si el reseller no puede
  // activar (sin saldo o suspendido), no tiene sentido cobrarle un plan que no
  // se le va a poder dar. El motivo real no se le revela al cliente.
  if (planId) {
    const check = await assertResellerCanActivate(team.id, planId);
    if (!check.allowed) {
      throw new Error(ACTIVATION_BLOCKED_MESSAGE);
    }
  }

  // El plugin del reseller del equipo: cobra con SUS credenciales.
  const plugin = await getActivePlugin(team.resellerId);
  const context = await resolvePaymentTenantContext({
    provider: plugin.id,
    resellerId: team.resellerId,
    teamId: team.id,
  });
  await plugin.validateConfig(context);
  await plugin.createCheckout({ team, priceId, planId, context });
});

export const customerPortalAction = withTeam(async (_, team) => {
  const plugin = await getActivePlugin(team.resellerId);
  const context = await resolvePaymentTenantContext({
    provider: plugin.id,
    resellerId: team.resellerId,
    teamId: team.id,
    requirePaymentsEnabled: false,
  });
  if (plugin.createCustomerPortal) {
    const portalUrl = await plugin.createCustomerPortal(team, context);
    if (portalUrl) {
      redirect(portalUrl);
    }
  }

  redirect('/pricing');
});

const PROOF_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);

export const submitManualPaymentProof = withTeam(async (formData, team) => {
  const paymentId = Number(formData.get('paymentId'));
  const proof = formData.get('proof');
  if (!Number.isInteger(paymentId) || !(proof instanceof File) || proof.size === 0) {
    throw new Error('Selecciona un comprobante válido.');
  }
  if (proof.size > 8 * 1024 * 1024) throw new Error('El comprobante supera 8 MB.');

  const extension = extname(proof.name).toLowerCase();
  if (!PROOF_EXTENSIONS.has(extension)) {
    throw new Error('El comprobante debe ser PDF, PNG, JPG o WEBP.');
  }

  const payment = await db.query.manualPayments.findFirst({
    where: and(
      eq(manualPayments.id, paymentId),
      eq(manualPayments.teamId, team.id),
      eq(manualPayments.status, 'pending_manual_review'),
    ),
  });
  if (!payment) throw new Error('Pago manual no encontrado o ya procesado.');

  const directory = join(process.cwd(), 'storage', 'payment-proofs');
  await mkdir(directory, { recursive: true });
  const filename = `${randomUUID()}${extension}`;
  await writeFile(join(directory, filename), Buffer.from(await proof.arrayBuffer()));

  await db
    .update(manualPayments)
    .set({ proofUrl: filename, updatedAt: new Date() })
    .where(and(eq(manualPayments.id, payment.id), eq(manualPayments.teamId, team.id)));

  redirect('/pricing?manualPayment=submitted');
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
      const plugin = await getActivePlugin(team.resellerId);
      const context = await resolvePaymentTenantContext({
        provider: plugin.id,
        resellerId: team.resellerId,
        teamId: team.id,
        requirePaymentsEnabled: false,
      });
      await plugin.cancelSubscription?.(team, context);
    } catch (error) {
      console.error('Error cancelando la suscripción anterior:', error);
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

  // Un plan gratis tiene mayorista 0 y no debita nada, pero se pasa por aquí igual
  // para que un mayorista configurado a mano sobre un plan free sí se cobre.
  await chargePlanActivation({
    teamId: team.id,
    planId: plan.id,
    idempotencyKey: `free:${team.id}:${plan.id}`,
    allowDebt: true,
  });

  redirect('/dashboard');
});
