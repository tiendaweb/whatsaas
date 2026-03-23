import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  serverExternalPackages: ['esbuild'],
  experimental: {
    //ppr: true,
    //clientSegmentCache: true,
  }
};

export default withNextIntl(nextConfig);