import 'server-only';

import { and, asc, eq, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamSiteFiles, teamSites } from '@/lib/db/schema';
import {
  DEFAULT_INDEX_HTML,
  RESERVED_SITE_NAMES,
  SITE_SLUG_PATTERN,
} from './constants';
import { mimeForPath } from './mime';

export type SiteSummary = {
  id: number;
  name: string;
  category: string | null;
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  settings: Record<string, unknown>;
  published: boolean;
  fileCount: number;
  sizeBytes: number;
  updatedAt: string;
  publicPath: string;
  subdomainHost: string | null;
};

export function normalizeCustomDomain(raw: string) {
  const candidate = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (
    candidate.length > 253 ||
    candidate.includes('/') ||
    candidate.includes(':') ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/i.test(candidate)
  ) {
    throw new Error('El dominio personalizado no es válido. Usá solo el host, por ejemplo sitio.com.');
  }
  return candidate;
}

export function normalizeSiteKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 63);
}

export function validateSiteKey(value: string, label: string) {
  if (!SITE_SLUG_PATTERN.test(value) || RESERVED_SITE_NAMES.has(value)) {
    throw new Error(`${label} no es válido o está reservado.`);
  }
}

async function ensureSiteKeyAvailable(value: string, excludeSiteId?: number) {
  const conditions = [or(eq(teamSites.slug, value), eq(teamSites.subdomain, value))];
  if (excludeSiteId) conditions.push(ne(teamSites.id, excludeSiteId));
  const existing = await db.query.teamSites.findFirst({
    where: and(...conditions),
    columns: { id: true },
  });
  if (existing) throw new Error('Ese slug o subdominio ya está en uso.');
}

async function ensureCustomDomainAvailable(value: string, excludeSiteId?: number) {
  const conditions = [eq(teamSites.customDomain, value)];
  if (excludeSiteId) conditions.push(ne(teamSites.id, excludeSiteId));
  const existing = await db.query.teamSites.findFirst({
    where: and(...conditions),
    columns: { id: true },
  });
  if (existing) throw new Error('Ese dominio personalizado ya está vinculado a otro sitio.');
}

export async function createUniqueSiteKey(raw: string) {
  const base = normalizeSiteKey(raw) || 'sitio';
  validateSiteKey(base, 'El slug');

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const value = suffix === 0 ? base : `${base.slice(0, 59)}-${suffix + 1}`;
    const existing = await db.query.teamSites.findFirst({
      where: or(eq(teamSites.slug, value), eq(teamSites.subdomain, value)),
      columns: { id: true },
    });
    if (!existing) return value;
  }

  throw new Error('No se pudo generar un slug disponible.');
}

export async function listSites(teamId: number): Promise<SiteSummary[]> {
  const sites = await db
    .select()
    .from(teamSites)
    .where(eq(teamSites.teamId, teamId))
    .orderBy(asc(teamSites.name));
  const files = await db
    .select({
      siteId: teamSiteFiles.siteId,
      kind: teamSiteFiles.kind,
      sizeBytes: teamSiteFiles.sizeBytes,
    })
    .from(teamSiteFiles)
    .where(eq(teamSiteFiles.teamId, teamId));

  const stats = new Map<number, { fileCount: number; sizeBytes: number }>();
  for (const file of files) {
    const current = stats.get(file.siteId) ?? { fileCount: 0, sizeBytes: 0 };
    if (file.kind === 'file') current.fileCount += 1;
    current.sizeBytes += file.sizeBytes;
    stats.set(file.siteId, current);
  }

  const baseDomain = process.env.SITES_BASE_DOMAIN?.trim().toLowerCase() || 'whatspro.uno';
  return sites.map((site) => ({
    id: site.id,
    name: site.name,
    category: site.category,
    slug: site.slug,
    subdomain: site.subdomain,
    customDomain: site.customDomain,
    settings: site.settings ?? {},
    published: site.published,
    fileCount: stats.get(site.id)?.fileCount ?? 0,
    sizeBytes: stats.get(site.id)?.sizeBytes ?? 0,
    updatedAt: site.updatedAt.toISOString(),
    publicPath: `/s/${site.slug}`,
    subdomainHost: site.subdomain ? `${site.subdomain}.${baseDomain}` : null,
  }));
}

export async function createSite(input: {
  teamId: number;
  userId: number;
  name: string;
  category?: string | null;
  requestedSlug?: string;
}) {
  const slug = input.requestedSlug
    ? normalizeSiteKey(input.requestedSlug)
    : await createUniqueSiteKey(input.name);
  validateSiteKey(slug, 'El slug');
  await ensureSiteKeyAvailable(slug);

  return db.transaction(async (tx) => {
    const [site] = await tx
      .insert(teamSites)
      .values({
        teamId: input.teamId,
        name: input.name.trim(),
        category: input.category?.trim() || null,
        slug,
        subdomain: null,
        published: true,
        createdBy: input.userId,
        updatedBy: input.userId,
      })
      .returning();

    await tx.insert(teamSiteFiles).values({
      teamId: input.teamId,
      siteId: site.id,
      path: 'index.html',
      kind: 'file',
      mimeType: mimeForPath('index.html'),
      encoding: 'utf8',
      content: DEFAULT_INDEX_HTML,
      sizeBytes: Buffer.byteLength(DEFAULT_INDEX_HTML),
      createdBy: input.userId,
      updatedBy: input.userId,
    });

    await tx.insert(activityLogs).values({
      teamId: input.teamId,
      userId: input.userId,
      action: `sites.created:${site.id}`,
    });

    return site;
  });
}

export async function getOwnedSite(siteId: number, teamId: number) {
  return (
    (await db.query.teamSites.findFirst({
      where: and(eq(teamSites.id, siteId), eq(teamSites.teamId, teamId)),
    })) ?? null
  );
}

export async function updateSite(input: {
  siteId: number;
  teamId: number;
  userId: number;
  name?: string;
  category?: string | null;
  slug?: string;
  subdomain?: string | null;
  customDomain?: string | null;
  settings?: Record<string, unknown>;
  published?: boolean;
}) {
  const existing = await getOwnedSite(input.siteId, input.teamId);
  if (!existing) return null;

  const updates: Partial<typeof teamSites.$inferInsert> = {
    updatedBy: input.userId,
    updatedAt: new Date(),
  };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.category !== undefined) updates.category = input.category?.trim() || null;
  if (input.published !== undefined) updates.published = input.published;

  if (input.slug !== undefined) {
    const slug = normalizeSiteKey(input.slug);
    validateSiteKey(slug, 'El slug');
    await ensureSiteKeyAvailable(slug, input.siteId);
    updates.slug = slug;
  }

  if (input.subdomain !== undefined) {
    const subdomain = input.subdomain ? normalizeSiteKey(input.subdomain) : null;
    if (subdomain) {
      validateSiteKey(subdomain, 'El subdominio');
      await ensureSiteKeyAvailable(subdomain, input.siteId);
    }
    updates.subdomain = subdomain;
  }

  if (input.customDomain !== undefined) {
    const customDomain = input.customDomain ? normalizeCustomDomain(input.customDomain) : null;
    if (customDomain) await ensureCustomDomainAvailable(customDomain, input.siteId);
    updates.customDomain = customDomain;
  }
  if (input.settings !== undefined) updates.settings = input.settings;

  const [updated] = await db
    .update(teamSites)
    .set(updates)
    .where(and(eq(teamSites.id, input.siteId), eq(teamSites.teamId, input.teamId)))
    .returning();

  await db.insert(activityLogs).values({
    teamId: input.teamId,
    userId: input.userId,
    action: `sites.updated:${input.siteId}`,
  });
  return updated;
}
