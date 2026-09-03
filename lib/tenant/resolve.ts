import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { unstable_cache, updateTag } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { branding, resellerDomains, resellers } from '@/lib/db/schema';
import type { Tenant } from '@/lib/tenant/types';

export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;

  const cleaned = host
    .trim()
    .toLowerCase()
    .split(',')[0]           // x-forwarded-host puede venir encadenado
    .trim()
    .replace(/:\d+$/, '')    // puerto
    .replace(/^www\./, '');

  return cleaned || null;
}

export function tenantCacheTag(host: string): string {
  return `tenant-domain:${host}`;
}

export function resellerCacheTag(resellerId: number): string {
  return `tenant-reseller:${resellerId}`;
}

async function loadTenantByHost(host: string): Promise<Tenant | null> {
  const [row] = await db
    .select({ domain: resellerDomains, reseller: resellers })
    .from(resellerDomains)
    .innerJoin(resellers, eq(resellerDomains.resellerId, resellers.id))
    .where(
      and(
        eq(resellerDomains.hostname, host),
        eq(resellerDomains.status, 'active'),
      ),
    )
    .limit(1);

  // Un reseller suspendido deja de resolver: su dominio cae a la marca de la
  // plataforma en vez de servir una marca que ya no debería estar activa.
  if (!row || row.reseller.status === 'suspended') return null;

  const brandingRow = await db.query.branding.findFirst({
    where: eq(branding.resellerId, row.reseller.id),
  });

  return {
    resellerId: row.reseller.id,
    slug: row.reseller.slug,
    companyName: row.reseller.companyName,
    status: row.reseller.status,
    hostname: row.domain.hostname,
    branding: brandingRow ?? null,
    reseller: row.reseller,
  };
}

/**
 * Cacheado entre requests e invalidable por tag: se llama en cada render de cada
 * página, así que no puede pegarle a la BD cada vez.
 */
export function resolveTenantByHost(host: string): Promise<Tenant | null> {
  return unstable_cache(
    () => loadTenantByHost(host),
    ['tenant-by-host', host],
    { tags: [tenantCacheTag(host)] },
  )();
}

/** Para webhooks, emails y crons: ahí no hay request del que sacar el Host. */
export async function getTenantForReseller(
  resellerId: number | null | undefined,
): Promise<Tenant | null> {
  if (!resellerId) return null;

  const reseller = await db.query.resellers.findFirst({
    where: eq(resellers.id, resellerId),
  });
  if (!reseller) return null;

  const [brandingRow, primaryDomain] = await Promise.all([
    db.query.branding.findFirst({ where: eq(branding.resellerId, reseller.id) }),
    db.query.resellerDomains.findFirst({
      where: and(
        eq(resellerDomains.resellerId, reseller.id),
        eq(resellerDomains.isPrimary, true),
        eq(resellerDomains.status, 'active'),
      ),
    }),
  ]);

  return {
    resellerId: reseller.id,
    slug: reseller.slug,
    companyName: reseller.companyName,
    status: reseller.status,
    hostname: primaryDomain?.hostname ?? '',
    branding: brandingRow ?? null,
    reseller,
  };
}

export async function getPlatformBranding() {
  return db.query.branding.findFirst({
    where: isNull(branding.resellerId),
  });
}

/**
 * Llamar desde toda server action que toque resellers, reseller_domains o branding.
 * El cache está indexado por host, así que invalidar por reseller obliga a resolver
 * todos sus dominios: si no, el branding viejo seguiría sirviéndose desde su dominio.
 *
 * Usa updateTag (no revalidateTag) para tener read-your-own-writes: al guardar su
 * marca, el reseller ve el cambio en el acto y no en el siguiente request.
 */
export async function invalidateTenantCache(opts: {
  host?: string | null;
  resellerId?: number | null;
}) {
  const hosts = new Set<string>();

  const direct = normalizeHost(opts.host);
  if (direct) hosts.add(direct);

  if (opts.resellerId) {
    const domains = await db
      .select({ hostname: resellerDomains.hostname })
      .from(resellerDomains)
      .where(eq(resellerDomains.resellerId, opts.resellerId));

    for (const domain of domains) {
      const host = normalizeHost(domain.hostname);
      if (host) hosts.add(host);
    }
  }

  for (const host of hosts) {
    updateTag(tenantCacheTag(host));
  }
}
