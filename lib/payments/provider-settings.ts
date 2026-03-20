import { db } from '@/lib/db/drizzle';
import { paymentProviderSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type PaymentProviderId = 'stripe' | 'manual' | 'mercadopago';

export type ProviderConfigMap = {
  stripe: Record<string, string | undefined>;
  manual: Record<string, string | undefined>;
  mercadopago: {
    accessToken?: string;
    publicKey?: string;
    webhookSecret?: string;
    successUrl?: string;
    failureUrl?: string;
    pendingUrl?: string;
  };
};

export async function ensurePaymentProviderDefaults() {
  const existing = await db.select().from(paymentProviderSettings);
  if (existing.length > 0) return;

  await db.insert(paymentProviderSettings).values([
    { provider: 'stripe', enabled: true, isDefault: true, config: {} },
    { provider: 'manual', enabled: true, isDefault: false, config: {} },
    { provider: 'mercadopago', enabled: false, isDefault: false, config: {} },
  ]);
}

export async function getPaymentProvidersConfig() {
  await ensurePaymentProviderDefaults();
  return db.select().from(paymentProviderSettings);
}

export async function getActivePaymentProvider(): Promise<PaymentProviderId> {
  const providers = await getPaymentProvidersConfig();
  const defaultProvider = providers.find((p) => p.isDefault && p.enabled);
  if (defaultProvider) return defaultProvider.provider as PaymentProviderId;

  const anyEnabled = providers.find((p) => p.enabled);
  if (anyEnabled) return anyEnabled.provider as PaymentProviderId;

  return 'stripe';
}

export async function getProviderConfig<T extends PaymentProviderId>(provider: T): Promise<ProviderConfigMap[T]> {
  const settings = await db.query.paymentProviderSettings.findFirst({
    where: eq(paymentProviderSettings.provider, provider),
  });

  return (settings?.config ?? {}) as ProviderConfigMap[T];
}
