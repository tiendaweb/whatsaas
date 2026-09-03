'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { chartAxis, seriesColor } from '@/lib/charts/theme';
import { surfaceCard } from '../tokens';
import { formatMoney } from '../format';
import { useChartMode } from '../useChartMode';
import type { DesktopTrendPoint } from '@/lib/desktop/types';

type Props = {
  data: DesktopTrendPoint[];
  currency: string;
  locale: string;
  labels: { title: string; hint: string; revenue: string; target: string; empty: string };
};

function monthLabel(month: string, locale: string) {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, (m ?? 1) - 1, 1).toLocaleDateString(locale, { month: 'short' });
}

export function RevenueTrend({ data, currency, locale, labels }: Props) {
  const mode = useChartMode();
  const axis = chartAxis(mode);
  const revenueColor = seriesColor(0, mode);
  const targetColor = seriesColor(1, mode);

  const points = data.map((point) => ({
    ...point,
    label: monthLabel(point.month, locale),
    revenueUnits: point.revenue / 100,
    targetUnits: point.target / 100,
  }));

  // Los puntos ya vienen en unidades, no en centavos: se multiplica para reusar
  // el formateador tolerante, que trabaja en centavos.
  const money = (value: number) => formatMoney(value * 100, currency, locale);

  return (
    <Card className={`${surfaceCard} overflow-hidden`}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{labels.title}</CardTitle>
        <CardDescription className="text-sm">{labels.hint}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 pb-6">
        {points.length === 0 ? (
          <p className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
            {labels.empty}
          </p>
        ) : (
          <div className="min-h-[300px] w-full">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="escritorio-revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={revenueColor} stopOpacity={0.3} />
                    <stop offset="90%" stopColor={revenueColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                {/* Grilla recesiva: sin verticales, punteada. El dato manda. */}
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={axis.grid} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: axis.label, fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: axis.label, fontSize: 12 }}
                  tickFormatter={(value: number) => money(value)}
                  width={72}
                />
                <Tooltip
                  formatter={(value?: number, name?: string) => [money(value ?? 0), name ?? '']}
                  contentStyle={{
                    background: axis.tooltipBg,
                    border: `1px solid ${axis.tooltipBorder}`,
                    borderRadius: 12,
                    color: axis.tooltipText,
                    fontSize: 12,
                  }}
                />
                <Legend verticalAlign="top" align="right" iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="revenueUnits"
                  name={labels.revenue}
                  stroke={revenueColor}
                  strokeWidth={2}
                  fill="url(#escritorio-revenue)"
                />
                {/* El objetivo va punteado: se distingue aunque no se vea el color. */}
                <Area
                  type="monotone"
                  dataKey="targetUnits"
                  name={labels.target}
                  stroke={targetColor}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="none"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
