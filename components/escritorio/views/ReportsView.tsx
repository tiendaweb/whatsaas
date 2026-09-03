'use client';

import { useLocale, useTranslations } from 'next-intl';
import useSWR from 'swr';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DollarSign, Handshake, Target, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { chartAxis, seriesColor, stageColor } from '@/lib/charts/theme';
import type { DesktopOverview } from '@/lib/desktop/types';
import { DesktopPage } from '../DesktopPage';
import { StatRow } from '../StatRow';
import { RevenueTrend } from '../widgets/RevenueTrend';
import { formatMoney, formatNumber } from '../format';
import { surfaceCard } from '../tokens';
import { useChartMode } from '../useChartMode';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

type LeadStats = { hot: number; warm: number; cold: number };

export function ReportsView() {
  const t = useTranslations('DesktopOperations');
  const locale = useLocale();
  const mode = useChartMode();
  const axis = chartAxis(mode);

  const { data, isLoading } = useSWR<DesktopOverview>('/api/escritorio/overview', fetcher);
  const { data: crm } = useSWR<{ stats: LeadStats | null }>(
    '/api/escritorio/crm?view=contacts&limit=1',
    fetcher,
  );

  if (isLoading || !data) {
    return (
      <DesktopPage title={t('overview.views.reports.title')} subtitle={t('overview.views.reports.subtitle')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[380px] rounded-xl" />
      </DesktopPage>
    );
  }

  const stageLabel = (stage: string) => {
    const known = ['qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
    return known.includes(stage) ? t(`overview.stages.${stage}` as never) : stage;
  };

  const funnelData = data.pipeline.map((slice) => ({
    stage: stageLabel(slice.stage),
    raw: slice.stage,
    count: slice.count,
  }));

  const temperature = crm?.stats
    ? [
        { key: 'hot', label: 'Calientes', value: crm.stats.hot },
        { key: 'warm', label: 'Tibios', value: crm.stats.warm },
        { key: 'cold', label: 'Fríos', value: crm.stats.cold },
      ]
    : [];

  const tooltipStyle = {
    background: axis.tooltipBg,
    border: `1px solid ${axis.tooltipBorder}`,
    borderRadius: 12,
    color: axis.tooltipText,
    fontSize: 12,
  };

  return (
    <DesktopPage
      title={t('overview.views.reports.title')}
      subtitle={t('overview.views.reports.subtitle')}
    >
      <StatRow
        stats={[
          {
            label: t('overview.kpi.revenue'),
            value: formatMoney(data.kpis.revenue.value, data.kpis.revenue.currency, locale),
            icon: DollarSign,
          },
          { label: t('overview.kpi.dealsClosed'), value: formatNumber(data.kpis.dealsClosed.value, locale), icon: Handshake },
          { label: t('overview.kpi.conversion'), value: `${data.kpis.conversion.value}%`, icon: TrendingUp },
          { label: t('overview.kpi.leads'), value: formatNumber(data.kpis.leads.value, locale), icon: Target },
        ]}
      />

      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:grid-cols-3">
          <TabsTrigger value="overview">{t('overview.views.reports.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="pipeline">{t('overview.views.reports.tabs.pipeline')}</TabsTrigger>
          <TabsTrigger value="sources">{t('overview.views.reports.tabs.sources')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
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
        </TabsContent>

        <TabsContent value="pipeline" className="pt-4">
          <Card className={surfaceCard}>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {t('overview.views.reports.funnel')}
              </CardTitle>
              <CardDescription className="text-sm">
                {t('overview.views.reports.funnelHint')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {funnelData.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {t('overview.views.reports.empty')}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  {/* Barras horizontales: los nombres de etapa no entran girados
                      en un eje X sin quedar ilegibles. */}
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke={axis.grid} />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: axis.label, fontSize: 12 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="stage"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: axis.label, fontSize: 12 }}
                      width={110}
                    />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {funnelData.map((entry) => (
                        <Cell key={entry.raw} fill={stageColor(entry.raw, mode)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="pt-4">
          <Card className={surfaceCard}>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">
                {t('overview.views.reports.temperature')}
              </CardTitle>
              <CardDescription className="text-sm">
                {t('overview.views.reports.temperatureHint')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {temperature.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {t('overview.views.reports.empty')}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={temperature} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={axis.grid} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: axis.label, fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: axis.label, fontSize: 12 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: axis.grid, opacity: 0.3 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={64}>
                      {temperature.map((entry, index) => (
                        <Cell key={entry.key} fill={seriesColor(index, mode)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DesktopPage>
  );
}
