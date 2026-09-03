import { servePublicSite } from '@/lib/plugins/sites/server/public-site';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const hostname = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
  if (!hostname) return new Response('Custom domain is required', { status: 400 });
  return servePublicSite(request, hostname, (await params).path ?? [], 'custom-domain');
}
