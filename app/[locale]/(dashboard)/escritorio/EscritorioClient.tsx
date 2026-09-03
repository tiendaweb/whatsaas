'use client';

/**
 * Escritorio — réplica del dashboard de PulzeCRM sobre las entidades de WhatsPro.
 *
 * Spec: docs/escritorio-pulze/ (02 para tokens, 04 para el payload, 07 para el plan).
 * El acento celeste del original (#3b82a8) se reemplazó por el verde de marca
 * (`--primary`, #49b653) en toda la pantalla. No debe quedar ningún hex azul.
 *
 * Esta pantalla reemplaza `/escritorio`. `/dashboard` y su Kanban del CRM quedan
 * intactos.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import { Command, Loader2, Search, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  DESKTOP_PERIOD_IDS,
  type DesktopLayout,
  type DesktopOverview,
  type DesktopPeriodId,
  type DesktopSearchResult,
  type DesktopWidgetId,
  type HeaderPosition,
} from '@/lib/desktop/types';
import { pageBackground, surfaceCard } from '@/components/escritorio/tokens';
import { CustomizeDialog } from '@/components/escritorio/CustomizeDialog';
import { DesktopNav, type DesktopView } from '@/components/escritorio/DesktopNav';
import { KpiCards } from '@/components/escritorio/widgets/KpiCards';
import { RevenueTrend } from '@/components/escritorio/widgets/RevenueTrend';
import { PipelineDonut } from '@/components/escritorio/widgets/PipelineDonut';
import { TopDeals } from '@/components/escritorio/widgets/TopDeals';
import { ActivityTimeline } from '@/components/escritorio/widgets/ActivityTimeline';
import { QuickActions, type QuickActionId } from '@/components/escritorio/widgets/QuickActions';
import { UpcomingItems } from '@/components/escritorio/widgets/UpcomingItems';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

/** Ancho de columna de cada widget dentro del grid de 6. */
const WIDGET_SPAN: Partial<Record<DesktopWidgetId, string>> = {
  'kpi-cards': 'lg:col-span-6',
  forecast: 'lg:col-span-3',
  pipeline: 'lg:col-span-3',
  'recent-deals': 'lg:col-span-3',
  'activity-feed': 'lg:col-span-3',
  'quick-actions': 'lg:col-span-3',
  upcoming: 'lg:col-span-3',
};

export function EscritorioClient({ embedded = false }: { embedded?: boolean }) {
  const t = useTranslations('DesktopOperations');
  const locale = useLocale();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<DesktopOverview>(
    '/api/escritorio/overview',
    fetcher,
    { refreshInterval: 60000 },
  );

  const [layout, setLayout] = useState<DesktopLayout | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: searchResults, isLoading: searching } = useSWR<DesktopSearchResult[]>(
    search.trim().length >= 2 ? `/api/escritorio/search?q=${encodeURIComponent(search)}` : null,
    fetcher,
    { keepPreviousData: true },
  );

  useEffect(() => {
    if (data && !layout) setLayout(data.layout);
  }, [data, layout]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  async function persistLayout(next: DesktopLayout) {
    setLayout(next);
    await fetch('/api/escritorio/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    // El período cambia lo que devuelve el overview, así que hay que recargarlo.
    await mutate();
  }

  // Las etapas se traducen desde una lista cerrada, no interpolando la clave.
  // `next-intl` ante una clave inexistente no lanza: devuelve el path completo
  // CON el namespace ("DesktopOperations.overview.stages.x"), así que comparar
  // contra la clave sin namespace nunca acierta y terminaría pintando eso en
  // pantalla. Una etapa desconocida cae a su propio identificador.
  const stageLabel = useMemo(() => {
    const known = new Set(['qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost']);
    return (stage: string) =>
      known.has(stage) ? t(`overview.stages.${stage}` as never) : stage;
  }, [t]);

  const formatRelative = useMemo(() => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    return (value: string | null) => {
      if (!value) return '';
      const time = new Date(value).getTime();
      // No todo lo que llega en `at` es una fecha ISO: la agenda de las
      // mini-apps guarda horas sueltas como "10:10", y `new Date("10:10")` da
      // NaN. `Intl.RelativeTimeFormat.format(NaN)` LANZA un RangeError, y ese
      // error tumbaba el render entero del Escritorio. Lo que no sea una fecha
      // se muestra tal cual, que es más útil que una pantalla de error.
      if (!Number.isFinite(time)) return value;
      const minutes = Math.round((time - Date.now()) / 60000);
      if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
      const hours = Math.round(minutes / 60);
      if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
      return rtf.format(Math.round(hours / 24), 'day');
    };
  }, [locale]);

  function runQuickAction(id: QuickActionId) {
    // Cada acción lleva a donde esa tarea se hace de verdad, en vez de abrir un
    // formulario que después duplica lógica de otra app.
    const routes: Record<QuickActionId, string> = {
      lead: '/dashboard',
      message: '/dashboard',
      call: '/plugins/calendar',
      meeting: '/plugins/calendar',
    };
    router.push(routes[id]);
  }

  if (error) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <span className="text-sm font-medium">{t('loadError')}</span>
        <Button variant="outline" onClick={() => mutate()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (isLoading || !data || !layout) {
    return (
      <div className={cn('min-h-[70vh]', embedded ? '' : pageBackground)}>
        <div className="mx-auto max-w-[1400px] space-y-6 px-6 py-8 lg:px-8">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">{t('loading')}</span>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-36 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-[380px] rounded-xl" />
            <Skeleton className="h-[380px] rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const visible = layout.order.filter(
    (id) => !layout.hidden.includes(id) && WIDGET_SPAN[id] !== undefined,
  );

  const widgets: Partial<Record<DesktopWidgetId, React.ReactNode>> = {
    'kpi-cards': (
      <KpiCards
        kpis={data.kpis}
        locale={locale}
        labels={{
          revenue: t('overview.kpi.revenue'),
          leads: t('overview.kpi.leads'),
          dealsClosed: t('overview.kpi.dealsClosed'),
          conversion: t('overview.kpi.conversion'),
          vsPrevious: t('overview.kpi.vsPrevious'),
        }}
      />
    ),
    forecast: (
      <RevenueTrend
        data={data.revenueTrend}
        currency={data.kpis.revenue.currency}
        locale={locale}
        labels={{
          title: t('overview.trend.title'),
          hint: t('overview.trend.hint'),
          revenue: t('overview.trend.revenue'),
          target: t('overview.trend.target'),
          empty: t('overview.trend.empty'),
        }}
      />
    ),
    pipeline: (
      <PipelineDonut
        data={data.pipeline}
        stageLabel={stageLabel}
        labels={{
          title: t('overview.pipelineChart.title'),
          hint: t('overview.pipelineChart.hint'),
          total: t('overview.pipelineChart.total'),
          empty: t('overview.pipelineChart.empty'),
        }}
      />
    ),
    'recent-deals': (
      <TopDeals
        deals={data.topDeals}
        locale={locale}
        stageLabel={stageLabel}
        labels={{
          title: t('overview.topDeals.title'),
          empty: t('overview.topDeals.empty'),
          probability: t('overview.topDeals.probability'),
        }}
      />
    ),
    'activity-feed': (
      <ActivityTimeline
        items={data.activity}
        formatRelative={formatRelative}
        labels={{ title: t('overview.activity.title'), empty: t('overview.activity.empty') }}
      />
    ),
    'quick-actions': (
      <QuickActions
        onSelect={runQuickAction}
        labels={{
          title: t('overview.quickActions.title'),
          items: {
            lead: {
              label: t('overview.quickActions.items.lead.label'),
              hint: t('overview.quickActions.items.lead.hint'),
            },
            message: {
              label: t('overview.quickActions.items.message.label'),
              hint: t('overview.quickActions.items.message.hint'),
            },
            call: {
              label: t('overview.quickActions.items.call.label'),
              hint: t('overview.quickActions.items.call.hint'),
            },
            meeting: {
              label: t('overview.quickActions.items.meeting.label'),
              hint: t('overview.quickActions.items.meeting.hint'),
            },
          },
        }}
      />
    ),
    upcoming: (
      <UpcomingItems
        items={data.upcoming}
        formatRelative={formatRelative}
        labels={{
          title: t('overview.upcoming.title'),
          empty: t('overview.upcoming.empty'),
          high: t('overview.upcoming.high'),
        }}
      />
    ),
  };

  return (
    <main
      className={cn(
        'h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]',
        embedded ? '' : pageBackground,
      )}
    >
      <div className="mx-auto w-full max-w-[1400px] space-y-6 px-6 py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-8 md:pb-10">
        <DesktopNav
          labels={
            {
              overview: t('overview.nav.overview'),
              command: t('overview.nav.command'),
              leads: t('overview.nav.leads'),
              deals: t('overview.nav.deals'),
              accounts: t('overview.nav.accounts'),
              contacts: t('overview.nav.contacts'),
              tasks: t('overview.nav.tasks'),
              reports: t('overview.nav.reports'),
              calendar: t('overview.nav.calendar'),
            } satisfies Record<DesktopView, string>
          }
        />
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold text-foreground">
              {t('overview.title')}
            </h1>
            <p className="mt-1 text-[0.9375rem] text-muted-foreground">{t('overview.subtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="hidden min-w-[200px] justify-start gap-2 text-muted-foreground sm:inline-flex"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">{t('search')}</span>
              <kbd className="ml-auto flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10px]">
                <Command className="h-3 w-3" />K
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="sm:hidden"
              onClick={() => setSearchOpen(true)}
              aria-label={t('search')}
            >
              <Search className="h-4 w-4" />
            </Button>

            <Select
              value={layout.period}
              onValueChange={(value) => persistLayout({ ...layout, period: value as DesktopPeriodId })}
            >
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DESKTOP_PERIOD_IDS.map((period) => (
                  <SelectItem key={period} value={period}>
                    {t(`overview.period.${period}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => setCustomizeOpen(true)}>
              <Settings2 className="mr-2 h-4 w-4" />
              {t('overview.customize')}
            </Button>
          </div>
        </header>

        {/* El orden y la visibilidad salen del layout guardado, igual que en el
            original: `order` en CSS evita reordenar el árbol de React. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-6">
          {visible.map((id, index) => (
            <div key={id} className={cn('min-w-0', WIDGET_SPAN[id])} style={{ order: index }}>
              {widgets[id]}
            </div>
          ))}
        </div>
      </div>

      <CustomizeDialog
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        layout={layout}
        onChange={(next) => void persistLayout(next)}
        labels={{
          title: t('overview.customize'),
          hint: t('overview.customizeHint'),
          headerPosition: t('overview.headerPosition'),
          positions: {
            left: t('overview.positions.left'),
            right: t('overview.positions.right'),
            top: t('overview.positions.top'),
          } as Record<HeaderPosition, string>,
          categories: {
            metrics: t('overview.categories.metrics'),
            charts: t('overview.categories.charts'),
            lists: t('overview.categories.lists'),
            activity: t('overview.categories.activity'),
          },
          widget: (id) => ({
            name: t(`overview.widgets.${id}.name` as never),
            hint: t(`overview.widgets.${id}.hint` as never),
          }),
        }}
      />

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('search')}</DialogTitle>
            <DialogDescription>{t('searchHint')}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
          />
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {searching && <p className="p-3 text-sm text-muted-foreground">{t('searching')}</p>}
            {!searching && search.trim().length >= 2 && (searchResults?.length ?? 0) === 0 && (
              <p className="p-3 text-sm text-muted-foreground">{t('noResults')}</p>
            )}
            {searchResults?.map((result) => (
              <Link
                key={`${result.type}-${result.id}`}
                href={result.href}
                onClick={() => setSearchOpen(false)}
                className={cn('block rounded-xl p-3 transition-colors hover:bg-muted/50', surfaceCard)}
              >
                <p className="truncate text-sm font-medium">{result.title}</p>
                <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
