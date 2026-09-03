import { servePublicSite, type PublicSiteLookup } from '@/lib/plugins/sites/server/public-site';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ identifier: string; path?: string[] }> },
) {
  const { identifier, path = [] } = await params;
  const lookupHeader = request.headers.get('x-sites-lookup');
  const lookup: PublicSiteLookup = lookupHeader === 'subdomain'
    ? 'subdomain'
    : lookupHeader === 'custom-domain'
      ? 'custom-domain'
      : 'slug';
  return servePublicSite(request, identifier, path, lookup);
}
