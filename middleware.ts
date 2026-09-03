import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { signToken, verifyToken } from '@/lib/auth/session';
import { locales, defaultLocale } from '@/i18n/request';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed' 
});

const protectedRoutes = [
  '/admin',
  '/analytics',
  '/apps',
  '/automation',
  '/campaigns',
  '/contacts',
  '/dashboard',
  '/drafts',
  '/plugins',
  '/reseller',
  '/settings',
  '/templates',
  '/todosloscontactos',
];

const noIndexRoutes = [
  '/todosloscontactos',
];

const publicUploadPrefixes = ['/uploads/branding/', '/uploads/chat-theme/'];
const authRouteAliases: Record<string, string> = {
  '/login': '/sign-in',
  '/signin': '/sign-in',
  '/register': '/sign-up',
  '/registro': '/sign-up',
  '/signup': '/sign-up',
};

const sitesBaseDomain = (process.env.SITES_BASE_DOMAIN || 'whatspro.uno').trim().toLowerCase();
const reservedSiteSubdomains = new Set(
  ['www', 'api', 'app', 'admin', 'chatpro', 'mail', 'support']
    .concat((process.env.SITES_RESERVED_SUBDOMAINS || '').split(','))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const pathWithoutLocale = pathname.replace(/^\/(pt|en|es)(?=\/|$)/, '') || '/';
  const requestLocale = pathname.match(/^\/(pt|en|es)(?=\/|$)/)?.[1] || defaultLocale;

  const slugSiteMatch = pathWithoutLocale.match(/^\/s\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\/(.*))?$/i);
  if (slugSiteMatch) {
    const [, identifier, sitePath = ''] = slugSiteMatch;
    const destination = request.nextUrl.clone();
    destination.pathname = `/api/sites-public/${identifier.toLowerCase()}${sitePath ? `/${sitePath}` : ''}`;
    const headers = new Headers(request.headers);
    headers.set('x-sites-lookup', 'slug');
    return NextResponse.rewrite(destination, { request: { headers } });
  }

  const hostname = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
  const siteSuffix = `.${sitesBaseDomain}`;
  if (hostname.endsWith(siteSuffix)) {
    const subdomain = hostname.slice(0, -siteSuffix.length);
    if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain) && !reservedSiteSubdomains.has(subdomain)) {
      const destination = request.nextUrl.clone();
      destination.pathname = `/api/sites-public/${subdomain}${pathname === '/' ? '' : pathname}`;
      const headers = new Headers(request.headers);
      headers.set('x-sites-lookup', 'subdomain');
      return NextResponse.rewrite(destination, { request: { headers } });
    }
  }

  if (pathname.startsWith('/uploads/')) {
    if (publicUploadPrefixes.some((prefix) => pathname.startsWith(prefix))) {
      return NextResponse.next();
    }

    const mediaUrl = new URL('/api/media', request.url);
    mediaUrl.searchParams.set('path', pathname.replace(/^\/+/, ''));
    // El query param se duplica como header porque los rewrites pueden perder
    // los search params en builds de producción (Next/Turbopack).
    const mediaHeaders = new Headers(request.headers);
    mediaHeaders.set('x-media-path', pathname.replace(/^\/+/, ''));
    return NextResponse.rewrite(mediaUrl, { request: { headers: mediaHeaders } });
  }

  const authAliasTarget = authRouteAliases[pathWithoutLocale];
  if (authAliasTarget) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${requestLocale}${authAliasTarget}`;
    return NextResponse.redirect(redirectUrl);
  }

  const response = intlMiddleware(request);

  const locale = request.nextUrl.locale || requestLocale;
  const sessionCookie = request.cookies.get('session');
  
  const isProtectedRoute = protectedRoutes.some(route => pathWithoutLocale.startsWith(route));
  const isNoIndexRoute = noIndexRoutes.some(route => pathWithoutLocale.startsWith(route));

  if (isProtectedRoute && !sessionCookie) {
    const redirectResponse = NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
    if (isNoIndexRoute) {
      redirectResponse.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }
    return redirectResponse;
  }

  if (sessionCookie) {
    try {
      const parsed = await verifyToken(sessionCookie.value);
      const expiresInOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);

      response.cookies.set({
        name: 'session',
        value: await signToken({
          ...parsed,
          expires: expiresInOneDay.toISOString()
        }),
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        expires: expiresInOneDay
      });
    } catch (error) {
      console.error('Error updating session:', error);
      response.cookies.delete('session');
      if (isProtectedRoute) {
        const redirectResponse = NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
        if (isNoIndexRoute) {
          redirectResponse.headers.set('X-Robots-Tag', 'noindex, nofollow');
        }
        return redirectResponse;
      }
    }
  }

  if (isNoIndexRoute) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|\.well-known|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|pwa-icon|apple-touch-icon|integrations|sounds).*)']
};
