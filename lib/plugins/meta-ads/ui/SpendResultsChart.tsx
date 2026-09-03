'use client';

import { forwardRef } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OverviewSeriesPoint } from '@/lib/ads/types';
import { formatCurrency, formatNumber } from './format';

export const SPEND_COLOR = '#49b653'; // verde de marca, igual que analytics-charts
export const RESULTS_COLOR = '#2563eb';

type Props = {
  series: OverviewSeriesPoint[];
  currency: string;
  resultLabel: string;
  title?: string;
};

function RoundedBar(props: any) {
  const { fill, x, y, width, height } = props;
  if (height <= 0) return null;
  return <rect x={x} y={y} width={width} height={height} rx={4} ry={4} fill={fill} />;
}

/**
 * El ref apunta al contenedor: el PDF busca ahí adentro el <svg> que genera recharts
 * y lo rasteriza, sin necesidad de html2canvas.
 */
export const SpendResultsChart = forwardRef<HTMLDivElement, Props>(function SpendResultsChart(
  { series, currency, resultLabel, title = 'Inversión y resultados' },
  ref,
) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={ref} className="h-[260px] w-full sm:h-[300px]">
          {series.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No hay datos en este período.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                {/* El label ya viene formateado según la granularidad (día, semana o mes). */}
                <XAxis
                  dataKey="label"
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                  minTickGap={16}
                />
                <YAxis
                  yAxisId="spend"
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(value) => formatNumber(value)}
                />
                <YAxis
                  yAxisId="results"
                  orientation="right"
                  stroke="#94A3B8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(value) => formatNumber(value)}
                />
                <Tooltip
                  formatter={(value: number | undefined, name: string | undefined) =>
                    name === 'spend'
                      ? [formatCurrency(value ?? 0, currency), 'Inversión (con imp.)']
                      : [formatNumber(value ?? 0), resultLabel]
                  }
                  contentStyle={{
                    backgroundColor: 'hsl(var(--popover))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  cursor={{ fill: 'transparent' }}
                />
                <Legend
                  formatter={(value) => (value === 'spend' ? 'Inversión (con imp.)' : resultLabel)}
                  wrapperStyle={{ fontSize: '12px' }}
                />
                <Bar yAxisId="spend" dataKey="spend" fill={SPEND_COLOR} shape={<RoundedBar />} maxBarSize={28} />
                <Line
                  yAxisId="results"
                  type="monotone"
                  dataKey="results"
                  stroke={RESULTS_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
