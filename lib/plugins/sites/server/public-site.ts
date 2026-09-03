import 'server-only';

import { createHash } from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamSiteFiles, teamSites } from '@/lib/db/schema';
import { normalizeSitePath } from './paths';

export type PublicSiteLookup = 'slug' | 'subdomain' | 'custom-domain';

async function findPublicFile(identifier: string, rawPath: string, lookup: PublicSiteLookup) {
  const site = await db.query.teamSites.findFirst({
    where: and(
      eq(teamSites.published, true),
      lookup === 'subdomain'
        ? eq(teamSites.subdomain, identifier)
        : lookup === 'custom-domain'
          ? eq(teamSites.customDomain, identifier)
          : eq(teamSites.slug, identifier),
    ),
  });
  if (!site) return null;

  const requestedPath = normalizeSitePath(rawPath || 'index.html');
  const candidates = requestedPath.endsWith('/')
    ? [`${requestedPath}index.html`]
    : [requestedPath, `${requestedPath}/index.html`];
  const file = await db.query.teamSiteFiles.findFirst({
    where: and(
      eq(teamSiteFiles.siteId, site.id),
      eq(teamSiteFiles.kind, 'file'),
      or(...candidates.map((candidate) => eq(teamSiteFiles.path, candidate))),
    ),
  });
  return file ? { file, site } : null;
}

export async function servePublicSite(
  request: Request,
  identifier: string,
  path: string[],
  lookup: PublicSiteLookup,
) {
  let result = await findPublicFile(identifier.toLowerCase(), path.join('/'), lookup);
  if (!result && request.headers.get('accept')?.includes('text/html') && path.length > 0) {
    result = await findPublicFile(identifier.toLowerCase(), 'index.html', lookup);
  }
  if (!result) return new NextResponse('Site or file not found', { status: 404 });

  const { file } = result;
  const body = file.encoding === 'base64'
    ? Buffer.from(file.content ?? '', 'base64')
    : Buffer.from(file.content ?? '', 'utf8');
  const etag = `"${createHash('sha256').update(body).digest('base64url')}"`;
  if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304 });

  const headers = new Headers({
    'Content-Type': file.mimeType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (
    file.mimeType?.startsWith('text/html') ||
    file.mimeType?.startsWith('image/svg+xml') ||
    file.mimeType?.startsWith('application/xml')
  ) {
    const formCapability = lookup !== 'slug' ? ' allow-forms' : '';
    headers.set(
      'Content-Security-Policy',
      `sandbox allow-scripts${formCapability} allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads; base-uri 'self'; object-src 'none'`,
    );
  }
  return new NextResponse(body, { headers });
}
