'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { DesktopNav, type DesktopView } from './DesktopNav';
import { pageBackground } from './tokens';

/**
 * Marco común de las vistas del Escritorio: fondo, ancho máximo, navegación y
 * cabecera. Todas las pantallas lo comparten para que el lenguaje visual sea uno
 * solo y no se disperse en cada archivo.
 */
export function DesktopPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useTranslations('DesktopOperations');
  const labels = {
    overview: t('overview.nav.overview'),
    command: t('overview.nav.command'),
    leads: t('overview.nav.leads'),
    deals: t('overview.nav.deals'),
    accounts: t('overview.nav.accounts'),
    contacts: t('overview.nav.contacts'),
    tasks: t('overview.nav.tasks'),
    reports: t('overview.nav.reports'),
    calendar: t('overview.nav.calendar'),
  } satisfies Record<DesktopView, string>;

  return (
    <main
      className={cn(
        'h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]',
        pageBackground,
      )}
    >
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-6 py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 md:pb-10">
        <DesktopNav labels={labels} />
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold text-foreground">{title}</h1>
            {subtitle && (
              <p className="mt-1 text-[0.9375rem] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </main>
  );
}
