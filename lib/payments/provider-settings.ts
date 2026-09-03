import { db } from '@/lib/db/drizzle';
import { relationExists } from '@/lib/db/relation-exists';
import { paymentProviderSettings } from '@/lib/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { decryptProviderConfig } from '@/lib/payments/secrets';

export type PaymentProviderId = 'stripe' | 'manual' | 'mercadopago' | 'lemonsqueezy';

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
    checkoutMode?: 'payment' | 'subscription';
    subscriptionReason?: string;
  };
  lemonsqueezy: {
    apiKey?: string;
    storeId?: string;
    webhookSecret?: string;
    successUrl?: string;
  };
};

function getEnvDefaultProvider(): PaymentProviderId {
  const envProvider = process.env.PAYMENT_PROVIDER;
  if (
    envProvider === 'manual' ||
    envProvider === 'mercadopago' ||
    envProvider === 'stripe' ||
    envProvider === 'lemonsqueezy'
  ) {
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

let paymentTablesBootstrapped = false;

async function ensurePaymentTables() {
  if (paymentTablesBootstrapped) return;

  const [hasProviderSettings, hasManualPayments, hasWebhookEvents] = await Promise.all([
    relationExists('payment_provider_settings'),
    relationExists('manual_payments'),
    relationExists('payment_webhook_events'),
  ]);

  if (!hasProviderSettings) {
    // Sin UNIQUE global sobre `provider`: cada reseller tiene su propia fila por
    // proveedor. La unicidad se expresa con los dos índices parciales de abajo
    // (mismo esquema que la migración 0050).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_provider_settings (
        id serial PRIMARY KEY,
        reseller_id integer,
        provider varchar(50) NOT NULL,
        enabled boolean NOT NULL DEFAULT false,
        is_default boolean NOT NULL DEFAULT false,
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pps_provider_platform_uidx
      ON payment_provider_settings (provider)
      WHERE reseller_id IS NULL;
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS pps_provider_reseller_uidx
      ON payment_provider_settings (reseller_id, provider)
      WHERE reseller_id IS NOT NULL;
    `);
  }

  if (!hasManualPayments) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS manual_payments (
        id serial PRIMARY KEY,
        team_id integer NOT NULL REFERENCES teams(id) ON DELETE cascade,
        plan_id integer NOT NULL REFERENCES plans(id) ON DELETE cascade,
        amount integer NOT NULL,
        currency varchar(3) NOT NULL DEFAULT 'usd',
        status varchar(30) NOT NULL DEFAULT 'pending_manual_review',
        reference text,
        proof_url text,
        reviewed_by integer REFERENCES users(id) ON DELETE set null,
        reviewed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);
  }

  await db.execute(sql`
    ALTER TABLE manual_payments
    ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE cascade;
  `);

  if (!hasWebhookEvents) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id serial PRIMARY KEY,
        reseller_id integer REFERENCES resellers(id) ON DELETE cascade,
        provider varchar(50) NOT NULL,
        topic varchar(80) NOT NULL,
        event_id varchar(191),
        payment_id varchar(191),
        status varchar(20) NOT NULL DEFAULT 'processing',
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        error_message text,
        processed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

  }

  await db.execute(sql`
    ALTER TABLE payment_webhook_events
    ADD COLUMN IF NOT EXISTS reseller_id integer REFERENCES resellers(id) ON DELETE cascade;
  `);
  await db.execute(sql`DROP INDEX IF EXISTS payment_webhook_events_provider_event_id_uidx;`);
  await db.execute(sql`DROP INDEX IF EXISTS payment_webhook_events_provider_payment_id_uidx;`);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS pwe_provider_event_uidx
    ON payment_webhook_events (provider, COALESCE(reseller_id, 0), event_id)
    WHERE event_id IS NOT NULL;
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS pwe_provider_payment_uidx
    ON payment_webhook_events (provider, COALESCE(reseller_id, 0), payment_id)
    WHERE payment_id IS NOT NULL;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payment_audit_events (
      id serial PRIMARY KEY,
      reseller_id integer REFERENCES resellers(id) ON DELETE set null,
      team_id integer REFERENCES teams(id) ON DELETE set null,
      provider varchar(50) NOT NULL,
      payment_reference varchar(191) NOT NULL,
      previous_status varchar(30),
      next_status varchar(30) NOT NULL,
      actor varchar(30) NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamp NOT NULL DEFAULT now()
    );
  `);

  paymentTablesBootstrapped = true;
}

/**
 * La tabla contiene tanto las credenciales de la plataforma (reseller_id NULL) como
 * las de cada reseller. Toda lectura tiene que acotar el tenant: sin esto, la
 * plataforma leería la pasarela de un reseller cualquiera.
 */
function scopeToTenant(resellerId?: number | null) {
  return resellerId == null
    ? isNull(paymentProviderSettings.resellerId)
    : eq(paymentProviderSettings.resellerId, resellerId);
}

export async function ensurePaymentProviderDefaults(resellerId?: number | null) {
  try {
    await ensurePaymentTables();

    // Los defaults solo se siembran para la plataforma. Un reseller arranca sin
    // credenciales y las carga desde su panel.
    if (resellerId != null) return;

    const requiredProviders = [
      { provider: 'stripe', enabled: true, isDefault: true, config: {} },
      { provider: 'manual', enabled: true, isDefault: false, config: {} },
      { provider: 'mercadopago', enabled: false, isDefault: false, config: {} },
      { provider: 'lemonsqueezy', enabled: false, isDefault: false, config: {} },
    ] as const;

    const existing = await db
      .select()
      .from(paymentProviderSettings)
      .where(scopeToTenant(null));
    const existingProviders = new Set(existing.map((row) => row.provider));

    const missingProviders = requiredProviders.filter((provider) => !existingProviders.has(provider.provider));
    if (missingProviders.length > 0) {
      await db.insert(paymentProviderSettings).values(missingProviders).onConflictDoNothing();
    }

    const providers = missingProviders.length > 0
      ? await db.select().from(paymentProviderSettings).where(scopeToTenant(null))
      : existing;
    const hasDefaultProvider = providers.some((provider) => provider.isDefault);

    if (!hasDefaultProvider) {
      const deterministicDefault =
        providers.find((provider) => provider.provider === 'stripe' && provider.enabled) ??
        requiredProviders
          .map((requiredProvider) => providers.find((provider) => provider.provider === requiredProvider.provider && provider.enabled))
          .find((provider) => provider !== undefined);

      if (deterministicDefault) {
        await db
          .update(paymentProviderSettings)
          .set({ isDefault: true })
          .where(
            and(
              scopeToTenant(null),
              eq(paymentProviderSettings.provider, deterministicDefault.provider),
            ),
          );
      }
    }
  } catch (error) {
    if (isRelationMissingError(error)) {
      warnWithFallback('ensurePaymentProviderDefaults', error);
      return;
    }
    throw error;
  }
}

export async function getPaymentProvidersConfig(resellerId?: number | null) {
  try {
    await ensurePaymentProviderDefaults(resellerId);
    return await db
      .select()
      .from(paymentProviderSettings)
      .where(scopeToTenant(resellerId));
  } catch (error) {
    if (isRelationMissingError(error)) {
      warnWithFallback('getPaymentProvidersConfig', error);
      return [];
    }
    throw error;
  }
}

export async function getActivePaymentProvider(
  resellerId?: number | null,
): Promise<PaymentProviderId> {
  try {
    const providers = await getPaymentProvidersConfig(resellerId);
    const defaultProvider = providers.find((p) => p.isDefault && p.enabled);
    if (defaultProvider) return defaultProvider.provider as PaymentProviderId;

    const anyEnabled = providers.find((p) => p.enabled);
    if (anyEnabled) return anyEnabled.provider as PaymentProviderId;

    // Un reseller sin proveedor propio configurado no hereda el de la plataforma:
    // cobrar con las credenciales de la plataforma mandaría su dinero a otra cuenta.
    if (resellerId != null) return 'manual';

    return getEnvDefaultProvider();
  } catch (error) {
    if (isRelationMissingError(error)) {
      warnWithFallback('getActivePaymentProvider', error);
      return getEnvDefaultProvider();
    }
    throw error;
  }
}

export async function getProviderConfig<T extends PaymentProviderId>(
  provider: T,
  resellerId?: number | null,
): Promise<ProviderConfigMap[T]> {
  await ensurePaymentProviderDefaults(resellerId);
  const settings = await db.query.paymentProviderSettings.findFirst({
    where: and(
      scopeToTenant(resellerId),
      eq(paymentProviderSettings.provider, provider),
    ),
  });

  return decryptProviderConfig((settings?.config ?? {}) as ProviderConfigMap[T]);
}
