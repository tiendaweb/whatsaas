'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { getUser } from '@/lib/db/queries';
import { manualPayments, paymentProviderSettings, plans, teams } from '@/lib/db/schema';
import { ensurePaymentProviderDefaults, PaymentProviderId } from '@/lib/payments/provider-settings';
import { chargePlanActivation } from '@/lib/resellers/billing';
import { encryptProviderConfig } from '@/lib/payments/secrets';

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
      db
        .select()
        .from(paymentProviderSettings)
        .where(isNull(paymentProviderSettings.resellerId)),
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
        .where(and(
          eq(manualPayments.status, 'pending_manual_review'),
          isNull(teams.resellerId),
        ))
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
  const allowedProviders: PaymentProviderId[] = ['stripe', 'manual', 'mercadopago', 'lemonsqueezy'];

  if (!provider || typeof provider !== 'string' || !allowedProviders.includes(provider as PaymentProviderId)) {
    return { error: 'Proveedor de pago inválido.' };
  }

  const requestedEnabled = formData.get('enabled') === 'on';
  const isDefault = formData.get('isDefault') === 'on';
  const enabled = isDefault ? true : requestedEnabled;

  const existingSetting = await db.query.paymentProviderSettings.findFirst({
    where: and(
      isNull(paymentProviderSettings.resellerId),
      eq(paymentProviderSettings.provider, provider),
    ),
  });
  const config: Record<string, string | undefined> = { ...(existingSetting?.config ?? {}) };
  const preserveSecret = (key: string) => {
    const value = String(formData.get(key) ?? '').trim();
    if (value) config[key] = value;
  };

  if (provider === 'stripe') {
    preserveSecret('secretKey');
    config.publishableKey = (formData.get('publishableKey') as string) || '';
    preserveSecret('webhookSecret');
  }

  if (provider === 'mercadopago') {
    preserveSecret('accessToken');
    config.publicKey = (formData.get('publicKey') as string) || '';
    preserveSecret('webhookSecret');
    config.successUrl = (formData.get('successUrl') as string) || '';
    config.failureUrl = (formData.get('failureUrl') as string) || '';
    config.pendingUrl = (formData.get('pendingUrl') as string) || '';
    config.checkoutMode = (formData.get('checkoutMode') as string) === 'subscription' ? 'subscription' : 'payment';
    config.subscriptionReason = (formData.get('subscriptionReason') as string) || '';
  }

  if (provider === 'lemonsqueezy') {
    preserveSecret('apiKey');
    config.storeId = (formData.get('storeId') as string) || '';
    preserveSecret('webhookSecret');
    config.successUrl = (formData.get('successUrl') as string) || '';
  }
  const protectedConfig = encryptProviderConfig(provider, config);

  // Este admin gestiona SOLO las credenciales de la plataforma. La tabla también
  // contiene una fila por proveedor de cada reseller, así que toda lectura y
  // escritura tiene que acotarse a reseller_id IS NULL: sin esto, guardar aquí
  // apagaría el proveedor por defecto de todos los resellers.
  const platformScope = isNull(paymentProviderSettings.resellerId);

  try {
    await db.transaction(async (tx) => {
      let providers = await tx.select().from(paymentProviderSettings).where(platformScope);
      let currentProvider = providers.find((item) => item.provider === provider);

      if (!currentProvider) {
        await tx.insert(paymentProviderSettings).values({
          provider,
          resellerId: null,
          enabled: false,
          isDefault: false,
          config: {},
        }).onConflictDoNothing();

        providers = await tx.select().from(paymentProviderSettings).where(platformScope);
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
        await tx
          .update(paymentProviderSettings)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(platformScope, ne(paymentProviderSettings.provider, provider)));
      }

      await tx
        .update(paymentProviderSettings)
        .set({
          enabled,
          isDefault,
          config: protectedConfig,
          updatedAt: new Date(),
        })
        .where(and(platformScope, eq(paymentProviderSettings.provider, provider)));
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
  const paymentTeam = await db.query.teams.findFirst({ where: eq(teams.id, payment.teamId) });
  if (!paymentTeam || paymentTeam.resellerId != null) {
    throw new Error('Los pagos de revendedores deben ser procesados por su revendedor.');
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

  // El pago manual ya está aprobado y el cliente activado: el débito al reseller no
  // puede rechazarse. La clave es el id del pago, que solo se aprueba una vez.
  await chargePlanActivation({
    teamId: payment.teamId,
    planId: payment.planId,
    idempotencyKey: `manual:${payment.id}`,
    allowDebt: true,
    provider: 'manual',
    providerRef: payment.reference,
  });

  revalidatePath('/admin/payments');
}

export async function rejectManualPayment(formData: FormData) {
  const admin = await assertAdmin();
  const paymentId = Number(formData.get('paymentId'));

  const payment = await db.query.manualPayments.findFirst({ where: eq(manualPayments.id, paymentId) });
  const paymentTeam = payment
    ? await db.query.teams.findFirst({ where: eq(teams.id, payment.teamId) })
    : null;
  if (!payment || !paymentTeam || paymentTeam.resellerId != null) {
    throw new Error('Pago manual no encontrado en el ámbito de la plataforma.');
  }

  await db.update(manualPayments).set({
    status: 'rejected',
    reviewedBy: admin.id,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(manualPayments.id, paymentId), eq(manualPayments.status, 'pending_manual_review')));

  revalidatePath('/admin/payments');
}
