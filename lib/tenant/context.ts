import 'server-only';

import { cache } from 'react';
import { headers } from 'next/headers';
import { normalizeHost, resolveTenantByHost } from '@/lib/tenant/resolve';
import type { Tenant } from '@/lib/tenant/types';

/**
 * `headers()` lanza fuera del ciclo de un request (crons, scripts, seeds), y esos
 * contextos no tienen tenant. Devolver null en vez de propagar el error mantiene
 * a getBranding() usable desde cualquier sitio.
 */
export async function getTenantHost(): Promise<string | null> {
  try {
    const headerList = await headers();
    return normalizeHost(
      headerList.get('x-forwarded-host') ?? headerList.get('host'),
    );
  } catch {
    return null;
  }
}

/** Cacheado por request: se llama desde el layout, generateMetadata y cada page. */
export const getTenant = cache(async (): Promise<Tenant | null> => {
  const host = await getTenantHost();
  if (!host) return null;

  return resolveTenantByHost(host);
});

export async function getTenantId(): Promise<number | null> {
  const tenant = await getTenant();
  return tenant?.resellerId ?? null;
}
