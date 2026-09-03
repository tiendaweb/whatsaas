import '../../app/globals.css';
import type { Metadata, Viewport } from 'next';
import { SWRConfig } from 'swr';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
import { getBranding } from '@/lib/db/queries/branding';
import { BrandingProvider } from '@/providers/branding-provider';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n/request';
import { IntlProvider } from '@/providers/intl-provider';
import { ChunkLoadRecovery } from '@/components/ChunkLoadRecovery';
import { brandName, buildBrandIdentity } from '@/lib/branding/constants';
import { buildThemeCss } from '@/lib/branding/theme';
import { getTenant } from '@/lib/tenant/context';
import { PLATFORM_BASE_URL } from '@/lib/tenant/urls';
import { PWARegistration } from '@/components/pwa/PWARegistration';


export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#161719' },
  ],
}

/**
 * La marca se resuelve por el header Host, así que nada bajo /[locale] puede
 * prerenderizarse: un build estático hornearía la marca de la plataforma y la
 * serviría también en los dominios de los resellers.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return {
    title: brandName(branding),
    applicationName: brandName(branding),
    description: 'Get started quickly with a WhatsApp CRM designed to manage leads, conversations, and sales in one place.',
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: brandName(branding),
    },
    icons: {
      icon: branding?.faviconUrl ? `${branding.faviconUrl}?v=${new Date(branding.updatedAt).getTime()}` : '/favicon.ico',
      apple: '/apple-touch-icon.png',
    },
  };
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {

  const { locale } = await params;

  if (!locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages();

  const [branding, tenant] = await Promise.all([getBranding(), getTenant()]);
  const themeCss = buildThemeCss(branding);
  const platformHostname = (() => {
    try {
      return new URL(PLATFORM_BASE_URL).hostname;
    } catch {
      return undefined;
    }
  })();
  const identity = buildBrandIdentity(branding, tenant?.hostname ?? platformHostname);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className="bg-background text-foreground"
    >
      {themeCss ? (
        <head>
          {/* Después de globals.css para ganarle en cascada. El contenido está
              validado contra una allowlist en buildThemeCss. */}
          <style
            id="tenant-theme"
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        </head>
      ) : null}
      <body className="min-h-[100dvh] bg-background">
        <ChunkLoadRecovery />
        <PWARegistration />
        <IntlProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
          >
            <SWRConfig
              value={{
                fallback: {},
              }}
            >
              <BrandingProvider branding={branding} identity={identity}>
                {children}
              </BrandingProvider>

              <Toaster
                richColors
                position="top-center"
                theme="system"
              />
            </SWRConfig>
          </ThemeProvider>
        </IntlProvider>
      </body>
    </html>
  );
}
