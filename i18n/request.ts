import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  getIntlMessageFallback,
  handleIntlError
} from '@/lib/i18n/fallback';

export const locales = ['pt', 'en', 'es'];
export const defaultLocale = 'en';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !locales.includes(locale as any)) {
    locale = defaultLocale;
  }

  return {
    locale,
    timeZone: 'UTC',
    messages: (await import(`../messages/${locale}.json`)).default,
    onError: handleIntlError,
    getMessageFallback: getIntlMessageFallback
  };
});
