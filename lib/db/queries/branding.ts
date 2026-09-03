import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { branding } from '@/lib/db/schema';
import { getTenant } from '@/lib/tenant/context';
import { getPlatformBranding } from '@/lib/tenant/resolve';

/**
 * Resuelve la marca del tenant del request. Mantiene la firma sin argumentos a
 * propósito: los ~18 consumidores (layout, landing, login, emails, docs...) siguen
 * llamándola igual y heredan el multi-tenant sin tocarse.
 *
 * Fuera de un request (crons, scripts) getTenant() devuelve null y cae a la plataforma.
 */
export async function getBranding() {
  const tenant = await getTenant();

  if (tenant) {
    // Un reseller sin fila de branding propia cae a la de la plataforma en vez
    // de quedarse sin marca.
    return tenant.branding ?? (await getPlatformBranding());
  }

  return getPlatformBranding();
}

/** Para contextos sin request: webhooks, emails en background, crons. */
export async function getBrandingForReseller(
  resellerId: number | null | undefined,
) {
  if (!resellerId) return getPlatformBranding();

  const row = await db.query.branding.findFirst({
    where: eq(branding.resellerId, resellerId),
  });

  return row ?? (await getPlatformBranding());
}

export { getPlatformBranding };
