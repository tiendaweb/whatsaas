import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // DOMPurify usa JSDOM en el servidor. Debe conservarse como paquete Node externo:
  // si webpack lo embebe, JSDOM pierde browser/default-stylesheet.css al recolectar páginas.
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom'],
  // El chequeo de tipos del build corre en un worker aparte que hoy necesita
  // ~4,8 GB y el servidor tiene 8: el kernel lo mata (SIGKILL) y el deploy
  // falla sin ningún error de código. Con NEXT_SKIP_TYPECHECK=1 el build lo
  // saltea; el typecheck se corre antes, aparte, con `tsc` y más heap
  // (NODE_OPTIONS=--max-old-space-size=6144). Nunca desplegar con el flag sin
  // ese tsc en verde.
  typescript: { ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === '1' },
  experimental: {
    //ppr: true,
    //clientSegmentCache: true,
  },
  async headers() {
    return [
      {
        // Hashed static assets can be cached aggressively.
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Optimized images are allowed to cache briefly.
        source: '/_next/image',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
      {
        // HTML, RSC payloads, and API responses must not outlive the active build.
        source: '/((?!_next/static|_next/image|favicon\\.ico|sounds).*)',
        headers: [
          { key: 'Cache-Control', value: 'private, no-cache, no-store, max-age=0, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
