'use client';

import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { OverviewKpis } from '@/lib/ads/types';
import { computeDelta, formatCurrency, formatNumber, formatPercent, type Delta } from './format';

type Props = {
  kpis: OverviewKpis;
  previousKpis?: OverviewKpis;
  currency: string;
  taxRate: number;
  resultLabel: string;
};

function DeltaBadge({ delta, lowerIsBetter = false }: { delta: Delta; lowerIsBetter?: boolean }) {
  if (!delta) return null;

  const Icon = delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : ArrowRight;
  // En costo por resultado, bajar es ganar: el color no puede seguir sólo a la flecha.
  const isGood =
    delta.direction === 'flat' ? null : lowerIsBetter ? delta.direction === 'down' : delta.direction === 'up';

  const color =
    isGood === null
      ? 'text-muted-foreground'
      : isGood
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400';

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(delta.percent).toFixed(0)}%
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
  lowerIsBetter,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: Delta;
  lowerIsBetter?: boolean;
  emphasis?: boolean;
}) {
  return (
    <Card className={emphasis ? 'border-primary/40 bg-primary/5' : undefined}>
      <CardContent className="p-3 sm:p-4">
        <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <p className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
          <DeltaBadge delta={delta ?? null} lowerIsBetter={lowerIsBetter} />
        </div>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function KpiCards({ kpis, previousKpis, currency, taxRate, resultLabel }: Props) {
  const delta = (current: number | null, previous: number | null | undefined) =>
    previousKpis ? computeDelta(current, previous ?? null) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi
          label={`Inversión final (con ${formatNumber(taxRate)}% imp.)`}
          value={formatCurrency(kpis.spend, currency)}
          delta={delta(kpis.spend, previousKpis?.spend)}
          hint={`Neto ${formatCurrency(kpis.spendNet, currency)} + ${formatCurrency(kpis.tax, currency)} imp.`}
        />
        <Kpi
          label={resultLabel}
          value={formatNumber(kpis.results)}
          delta={delta(kpis.results, previousKpis?.results)}
          hint={`${kpis.activeCampaigns > 0 ? `${kpis.activeCampaigns} campañas activas` : 'Resultados del período'}`}
        />
        <Kpi
          label="Costo por resultado"
          value={formatCurrency(kpis.costPerResult, currency)}
          delta={delta(kpis.costPerResult, previousKpis?.costPerResult)}
          lowerIsBetter
          hint="Impuesto incluido"
          emphasis
        />
        <Kpi
          label="Clics"
          value={formatNumber(kpis.clicks)}
          delta={delta(kpis.clicks, previousKpis?.clicks)}
          hint={`CTR ${formatPercent(kpis.ctr)} · CPC ${formatCurrency(kpis.cpc, currency)}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi
          label="Impresiones"
          value={formatNumber(kpis.impressions)}
          delta={delta(kpis.impressions, previousKpis?.impressions)}
          hint={`CPM ${formatCurrency(kpis.cpm, currency)}`}
        />
        <Kpi
          label="Alcance (pico diario)"
          value={formatNumber(kpis.reach)}
          hint="Meta no permite sumarlo entre días"
        />
        <Kpi
          label="Frecuencia"
          value={kpis.frequency ? kpis.frequency.toFixed(2) : '—'}
          hint="Veces que se vio cada persona"
        />
        <Kpi
          label="Impuesto del período"
          value={formatCurrency(kpis.tax, currency)}
          hint={`${formatNumber(taxRate)}% sobre el neto`}
        />
      </div>
    </div>
  );
}
