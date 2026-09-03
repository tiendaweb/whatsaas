import 'server-only';

import { getTenant } from '@/lib/tenant/context';
import type { Tenant } from '@/lib/tenant/types';

export const PLATFORM_BASE_URL =
  process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';

/**
 * URL base del tenant. Sin esto, un cliente de chatpro.uno recibiría el link de
 * invitación o de reset de password apuntando a whatspro.uno, revelando la
 * marca de la plataforma y rompiendo su sesión.
 */
export function baseUrlForTenant(tenant: Tenant | null | undefined): string {
  if (tenant?.hostname) {
    return `https://${tenant.hostname}`;
  }
  return PLATFORM_BASE_URL;
}

export async function getBaseUrl(): Promise<string> {
  return baseUrlForTenant(await getTenant());
}
