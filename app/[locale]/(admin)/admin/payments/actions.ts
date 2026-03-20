'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { manualPayments, paymentProviderSettings, plans, teams } from '@/lib/db/schema';
import { ensurePaymentProviderDefaults, PaymentProviderId } from '@/lib/payments/provider-settings';

async function assertAdmin() {
  const user = await getUser();
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized');
  }
  return user;
}

export async function getPaymentAdminData() {
  await assertAdmin();
  await ensurePaymentProviderDefaults();

  const [providers, pendingManualPayments] = await Promise.all([
    db.select().from(paymentProviderSettings),
    db
      .select({
        payment: manualPayments,
        team: {
          id: teams.id,
          name: teams.name,
        },
        plan: {
          id: plans.id,
          name: plans.name,
        },
      })
      .from(manualPayments)
      .innerJoin(teams, eq(manualPayments.teamId, teams.id))
      .innerJoin(plans, eq(manualPayments.planId, plans.id))
      .where(eq(manualPayments.status, 'pending_manual_review'))
      .orderBy(desc(manualPayments.createdAt))
      .limit(50),
  ]);

  return { providers, pendingManualPayments };
}

export async function saveProviderConfig(formData: FormData) {
  await assertAdmin();

  const provider = formData.get('provider') as PaymentProviderId;
  const enabled = formData.get('enabled') === 'on';
  const isDefault = formData.get('isDefault') === 'on';

  const config: Record<string, string> = {};

  if (provider === 'mercadopago') {
    config.accessToken = (formData.get('accessToken') as string) || '';
    config.publicKey = (formData.get('publicKey') as string) || '';
    config.webhookSecret = (formData.get('webhookSecret') as string) || '';
    config.successUrl = (formData.get('successUrl') as string) || '';
    config.failureUrl = (formData.get('failureUrl') as string) || '';
    config.pendingUrl = (formData.get('pendingUrl') as string) || '';
  }

  if (isDefault) {
    await db.update(paymentProviderSettings).set({ isDefault: false, updatedAt: new Date() });
  }

  await db
    .update(paymentProviderSettings)
    .set({
      enabled,
      isDefault,
      config,
      updatedAt: new Date(),
    })
    .where(eq(paymentProviderSettings.provider, provider));

  revalidatePath('/admin/payments');
}

export async function approveManualPayment(formData: FormData) {
  const admin = await assertAdmin();
  const paymentId = Number(formData.get('paymentId'));

  const payment = await db.query.manualPayments.findFirst({
    where: eq(manualPayments.id, paymentId),
  });

  if (!payment || payment.status !== 'pending_manual_review') {
    throw new Error('Pago manual não encontrado ou já processado.');
  }
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, payment.planId) });

  await db.update(manualPayments).set({
    status: 'paid',
    reviewedBy: admin.id,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(manualPayments.id, payment.id));

  await db.update(teams).set({
    planId: payment.planId,
    planName: plan?.name || null,
    subscriptionStatus: 'active',
    isCanceled: false,
    updatedAt: new Date(),
  }).where(eq(teams.id, payment.teamId));

  revalidatePath('/admin/payments');
}

export async function rejectManualPayment(formData: FormData) {
  const admin = await assertAdmin();
  const paymentId = Number(formData.get('paymentId'));

  await db.update(manualPayments).set({
    status: 'rejected',
    reviewedBy: admin.id,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(manualPayments.id, paymentId), eq(manualPayments.status, 'pending_manual_review')));

  revalidatePath('/admin/payments');
}
