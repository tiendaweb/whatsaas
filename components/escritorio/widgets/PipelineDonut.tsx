'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { chartAxis, stageColor } from '@/lib/charts/theme';
import { surfaceCard } from '../tokens';
import { useChartMode } from '../useChartMode';
import type { DesktopPipelineSlice } from '@/lib/desktop/types';

type Props = {
  data: DesktopPipelineSlice[];
  labels: { title: string; hint: string; total: string; empty: string };
  stageLabel: (stage: string) => string;
};

export function PipelineDonut({ data, labels, stageLabel }: Props) {
  const mode = useChartMode();
  const axis = chartAxis(mode);
  const slices = data.filter((slice) => slice.count > 0);
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);

  return (
    <Card className={`${surfaceCard} h-full overflow-hidden`}>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{labels.title}</CardTitle>
        <CardDescription className="text-sm">{labels.hint}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 pb-6">
        {slices.length === 0 ? (
          <p className="flex min-h-[300px] items-center justify-center text-sm text-muted-foreground">
            {labels.empty}
          </p>
        ) : (
          <>
            <div className="relative flex min-h-[300px] w-full items-center justify-center">
              <div className="w-full max-w-[320px]">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="count"
                      nameKey="stage"
                      innerRadius="60%"
                      outerRadius="80%"
                      // 2px de separación entre porciones: se leen como piezas
                      // distintas incluso cuando dos son casi del mismo tamaño.
                      paddingAngle={2}
                      stroke="none"
                    >
                      {slices.map((slice) => (
                        <Cell key={slice.stage} fill={stageColor(slice.stage, mode)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value?: number, name?: string) => [
                        `${value ?? 0}`,
                        stageLabel(String(name ?? '')),
                      ]}
                      contentStyle={{
                        background: axis.tooltipBg,
                        border: `1px solid ${axis.tooltipBorder}`,
                        borderRadius: 12,
                        color: axis.tooltipText,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Total al centro: recharts no trae la etiqueta central del donut. */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-sm font-semibold text-muted-foreground">{labels.total}</span>
                <span className="text-xl font-bold tabular-nums">{total}</span>
              </div>
            </div>
            {/* Leyenda propia en grilla 2×2, con el nombre de la etapa: la
                identidad nunca queda sólo en el color. */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              {slices.map((slice) => (
                <div key={slice.stage} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: stageColor(slice.stage, mode) }}
                    aria-hidden
                  />
                  <span className="truncate text-sm text-muted-foreground">
                    {stageLabel(slice.stage)}: {slice.pct}%
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
