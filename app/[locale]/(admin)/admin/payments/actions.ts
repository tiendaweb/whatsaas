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

export type SaveProviderConfigResult = {
  ok?: boolean;
  error?: string;
};

export async function getPaymentAdminData() {
  await assertAdmin();
  try {
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
  } catch (error) {
    console.error('Error loading payment admin data:', error);
    return { providers: [], pendingManualPayments: [] };
  }
}

async function persistProviderConfig(formData: FormData): Promise<SaveProviderConfigResult> {
  await assertAdmin();

  const provider = formData.get('provider');
  const allowedProviders: PaymentProviderId[] = ['stripe', 'manual', 'mercadopago'];

  if (!provider || typeof provider !== 'string' || !allowedProviders.includes(provider as PaymentProviderId)) {
    return { error: 'Proveedor de pago inválido.' };
  }

  const requestedEnabled = formData.get('enabled') === 'on';
  const isDefault = formData.get('isDefault') === 'on';
  const enabled = isDefault ? true : requestedEnabled;

  const config: Record<string, string> = {};

  if (provider === 'stripe') {
    config.secretKey = (formData.get('secretKey') as string) || '';
    config.publishableKey = (formData.get('publishableKey') as string) || '';
    config.webhookSecret = (formData.get('webhookSecret') as string) || '';
  }

  if (provider === 'mercadopago') {
    config.accessToken = (formData.get('accessToken') as string) || '';
    config.publicKey = (formData.get('publicKey') as string) || '';
    config.webhookSecret = (formData.get('webhookSecret') as string) || '';
    config.successUrl = (formData.get('successUrl') as string) || '';
    config.failureUrl = (formData.get('failureUrl') as string) || '';
    config.pendingUrl = (formData.get('pendingUrl') as string) || '';
    config.checkoutMode = (formData.get('checkoutMode') as string) === 'subscription' ? 'subscription' : 'payment';
    config.subscriptionReason = (formData.get('subscriptionReason') as string) || '';
  }

  try {
    await db.transaction(async (tx) => {
      let providers = await tx.select().from(paymentProviderSettings);
      let currentProvider = providers.find((item) => item.provider === provider);

      if (!currentProvider) {
        await tx.insert(paymentProviderSettings).values({
          provider,
          enabled: false,
          isDefault: false,
          config: {},
        }).onConflictDoNothing();

        providers = await tx.select().from(paymentProviderSettings);
        currentProvider = providers.find((item) => item.provider === provider);
        if (!currentProvider) {
          throw new Error('No se pudo crear la configuración del proveedor de pago.');
        }
      }

      const providersAfterUpdate = providers.map((item) => {
        if (item.provider !== provider) {
          return item;
        }

        return {
          ...item,
          enabled,
          isDefault,
        };
      });

      if (!providersAfterUpdate.some((item) => item.enabled)) {
        throw new Error('Debe haber al menos un proveedor de pago habilitado.');
      }

      if (isDefault) {
        await tx.update(paymentProviderSettings).set({ isDefault: false, updatedAt: new Date() });
      }

      await tx
        .update(paymentProviderSettings)
        .set({
          enabled,
          isDefault,
          config,
          updatedAt: new Date(),
        })
        .where(eq(paymentProviderSettings.provider, provider));
    });
  } catch (error) {
    console.error('Error saving provider config:', error);
    return { error: error instanceof Error ? error.message : 'No se pudo guardar la configuración del proveedor.' };
  }

  revalidatePath('/admin/payments');
  revalidatePath('/admin/settings');
  return { ok: true };
}

export async function saveProviderConfig(formData: FormData): Promise<void> {
  await persistProviderConfig(formData);
}

export async function saveProviderConfigAction(
  _prevState: SaveProviderConfigResult,
  formData: FormData,
): Promise<SaveProviderConfigResult> {
  return persistProviderConfig(formData);
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
