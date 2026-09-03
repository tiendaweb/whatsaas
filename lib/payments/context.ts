import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { resellers } from '@/lib/db/schema';
import { getProviderConfig, type PaymentProviderId } from '@/lib/payments/provider-settings';
import { getTenantForReseller } from '@/lib/tenant/resolve';
import { baseUrlForTenant, PLATFORM_BASE_URL } from '@/lib/tenant/urls';
import type { PaymentTenantContext } from '@/lib/payments/plugin-types';

function platformConfig(provider: PaymentProviderId) {
  if (provider === 'stripe') {
    return {
      secretKey: process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    };
  }
  return {};
}

export async function resolvePaymentTenantContext(input: {
  provider: PaymentProviderId;
  resellerId?: number | null;
  teamId?: number | null;
  requirePaymentsEnabled?: boolean;
}): Promise<PaymentTenantContext> {
  const resellerId = input.resellerId ?? null;
  const storedConfig = await getProviderConfig(input.provider, resellerId);

  if (resellerId == null) {
    return {
      resellerId: null,
      teamId: input.teamId ?? null,
      baseUrl: PLATFORM_BASE_URL,
      providerConfig: { ...platformConfig(input.provider), ...storedConfig },
    };
  }

  const reseller = await db.query.resellers.findFirst({ where: eq(resellers.id, resellerId) });
  if (!reseller) throw new Error('Revendedor no encontrado.');
  if (input.requirePaymentsEnabled !== false && !reseller.paymentsEnabled) {
    throw new Error('Los cobros de este revendedor todavía no están habilitados.');
  }

  const tenant = await getTenantForReseller(resellerId);
  if (!tenant?.hostname) {
    throw new Error('El revendedor no tiene un dominio principal activo y verificado.');
  }
  return {
    resellerId,
    teamId: input.teamId ?? null,
    baseUrl: baseUrlForTenant(tenant),
    providerConfig: storedConfig,
  };
}

export async function findResellerIdBySlug(slug: string): Promise<number | null> {
  if (slug === 'platform') return null;
  const reseller = await db.query.resellers.findFirst({ where: eq(resellers.slug, slug) });
  return reseller?.id ?? null;
}
