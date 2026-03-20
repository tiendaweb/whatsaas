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

function getEnvDefaultProvider(): PaymentProviderId {
  const envProvider = process.env.PAYMENT_PROVIDER;
  if (envProvider === 'manual' || envProvider === 'mercadopago' || envProvider === 'stripe') {
    return envProvider;
  }

  return 'stripe';
}

function isRelationMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const maybeCode = 'code' in error ? error.code : undefined;
  const maybeMessage = 'message' in error ? error.message : undefined;

  return (
    maybeCode === '42P01' ||
    (typeof maybeMessage === 'string' && maybeMessage.toLowerCase().includes('relation') && maybeMessage.toLowerCase().includes('does not exist'))
  );
}

function warnWithFallback(scope: string, error: unknown) {
  const fallbackProvider = getEnvDefaultProvider();
  console.warn({
    scope: 'payments.provider-settings',
    action: scope,
    message: 'payment_provider_settings table is missing, using fallback provider',
    fallbackProvider,
    errorCode: typeof error === 'object' && error && 'code' in error ? error.code : undefined,
    errorMessage: error instanceof Error ? error.message : String(error),
  });
}

export async function ensurePaymentProviderDefaults() {
  try {
    const existing = await db.select().from(paymentProviderSettings);
    if (existing.length > 0) return;

    await db.insert(paymentProviderSettings).values([
      { provider: 'stripe', enabled: true, isDefault: true, config: {} },
      { provider: 'manual', enabled: true, isDefault: false, config: {} },
      { provider: 'mercadopago', enabled: false, isDefault: false, config: {} },
    ]);
  } catch (error) {
    if (isRelationMissingError(error)) {
      warnWithFallback('ensurePaymentProviderDefaults', error);
      return;
    }
    throw error;
  }
}

export async function getPaymentProvidersConfig() {
  try {
    await ensurePaymentProviderDefaults();
    return await db.select().from(paymentProviderSettings);
  } catch (error) {
    if (isRelationMissingError(error)) {
      warnWithFallback('getPaymentProvidersConfig', error);
      return [];
    }
    throw error;
  }
}

export async function getActivePaymentProvider(): Promise<PaymentProviderId> {
  try {
    const providers = await getPaymentProvidersConfig();
    const defaultProvider = providers.find((p) => p.isDefault && p.enabled);
    if (defaultProvider) return defaultProvider.provider as PaymentProviderId;

    const anyEnabled = providers.find((p) => p.enabled);
    if (anyEnabled) return anyEnabled.provider as PaymentProviderId;

    return getEnvDefaultProvider();
  } catch (error) {
    if (isRelationMissingError(error)) {
      warnWithFallback('getActivePaymentProvider', error);
      return getEnvDefaultProvider();
    }
    throw error;
  }
}

export async function getProviderConfig<T extends PaymentProviderId>(provider: T): Promise<ProviderConfigMap[T]> {
  const settings = await db.query.paymentProviderSettings.findFirst({
    where: eq(paymentProviderSettings.provider, provider),
  });

  return (settings?.config ?? {}) as ProviderConfigMap[T];
}
