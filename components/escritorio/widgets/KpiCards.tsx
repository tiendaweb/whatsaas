'use client';

import { DollarSign, Handshake, Sparkles, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { kpiGradient, surfaceCardHover } from '../tokens';
import { formatMoney, formatNumber } from '../format';
import type { DesktopOverview } from '@/lib/desktop/types';

type Props = {
  kpis: DesktopOverview['kpis'];
  locale: string;
  labels: { revenue: string; leads: string; dealsClosed: string; conversion: string; vsPrevious: string };
};

function KpiCard({
  title,
  value,
  changePct,
  trend,
  progress,
  icon: Icon,
  gradient,
  vsPrevious,
  delay,
}: {
  title: string;
  value: string;
  changePct: number;
  trend: 'up' | 'down';
  progress: number;
  icon: LucideIcon;
  gradient: string;
  vsPrevious: string;
  delay: number;
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : TrendingDown;
  const sign = changePct > 0 ? '+' : '';
  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
      // Valor dinámico legítimo: es una propiedad CSS, no una clase de Tailwind.
      style={{ animationDelay: `${delay}ms` }}
    >
      <Card className={surfaceCardHover}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br transition-transform duration-300 group-hover:scale-110',
              gradient,
            )}
          >
            <Icon className="h-5 w-5 text-white" aria-hidden />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-3xl font-bold tabular-nums">{value}</span>
            <span
              className={cn(
                'flex items-center gap-1 text-sm font-medium',
                // El estado no se comunica sólo por color: va con flecha y signo.
                trend === 'up' ? 'text-[#0d9488] dark:text-[#14b8a6]' : 'text-[#dc2626] dark:text-[#f87171]',
              )}
            >
              <TrendIcon className="h-4 w-4" aria-hidden />
              {sign}
              {changePct}%<span className="sr-only"> {vsPrevious}</span>
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>
    </div>
  );
}

export function KpiCards({ kpis, locale, labels }: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title={labels.revenue}
        value={formatMoney(kpis.revenue.value, kpis.revenue.currency, locale)}
        changePct={kpis.revenue.changePct}
        trend={kpis.revenue.trend}
        progress={kpis.revenue.progress}
        icon={DollarSign}
        gradient={kpiGradient(0)}
        vsPrevious={labels.vsPrevious}
        delay={0}
      />
      <KpiCard
        title={labels.leads}
        value={formatNumber(kpis.leads.value, locale)}
        changePct={kpis.leads.changePct}
        trend={kpis.leads.trend}
        progress={kpis.leads.progress}
        icon={Sparkles}
        gradient={kpiGradient(1)}
        vsPrevious={labels.vsPrevious}
        delay={100}
      />
      <KpiCard
        title={labels.dealsClosed}
        value={formatNumber(kpis.dealsClosed.value, locale)}
        changePct={kpis.dealsClosed.changePct}
        trend={kpis.dealsClosed.trend}
        progress={kpis.dealsClosed.progress}
        icon={Handshake}
        gradient={kpiGradient(2)}
        vsPrevious={labels.vsPrevious}
        delay={200}
      />
      <KpiCard
        title={labels.conversion}
        value={`${kpis.conversion.value}%`}
        changePct={kpis.conversion.changePct}
        trend={kpis.conversion.trend}
        progress={kpis.conversion.progress}
        icon={TrendingUp}
        gradient={kpiGradient(3)}
        vsPrevious={labels.vsPrevious}
        delay={300}
      />
    </div>
  );
}
