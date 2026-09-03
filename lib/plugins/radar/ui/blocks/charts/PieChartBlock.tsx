'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, formatValue, toneAt, toneHex } from '../primitives';
import {
  ChartFrame,
  ChartTooltipContent,
  chartFormatter,
  chartHeight,
  useChartMounted,
} from './chart-kit';

type Props = { block: Extract<RadarBlock, { type: 'pieChart' }> };

export function PieChartBlock({ block }: Props) {
  const mounted = useChartMounted();
  const fmt = chartFormatter(block);
  const donut = block.variant !== 'pie';

  // Una porción negativa o cero no tiene ángulo posible: se descarta antes de
  // calcular el total, así los porcentajes de la leyenda cierran en 100.
  const slices = (block.points ?? [])
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .map((point, index) => {
      const tone = toneAt(index, point.tone);
      return { label: point.label, value: point.value, hint: point.hint ?? null, color: toneHex(tone) };
    });

  const header = <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />;
  if (!slices.length) {
    return <>{header}<BlockEmpty /></>;
  }

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const height = chartHeight(block);
  const showLegend = block.legend ?? true;

  return (
    <>
      {header}
      <ChartFrame height={height} mounted={mounted} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <Tooltip content={(props: any) => <ChartTooltipContent {...props} fmt={fmt} />} />
            <Pie
              data={slices.map((slice) => ({ ...slice, __hint: slice.hint }))}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={donut ? '58%' : 0}
              outerRadius="86%"
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((slice, index) => (
                <Cell key={`${slice.label}-${index}`} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {donut && (block.centerValue !== undefined || block.centerLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {block.centerValue !== undefined && (
              <p className="text-2xl font-black tabular-nums text-neutral-900 dark:text-white">
                {typeof block.centerValue === 'number'
                  ? fmt(block.centerValue)
                  : block.centerValue}
              </p>
            )}
            {block.centerLabel && (
              <p className="mt-1 max-w-[70%] truncate text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
                {block.centerLabel}
              </p>
            )}
          </div>
        )}
      </ChartFrame>

      {showLegend && (
        <ul className="mt-3 space-y-1.5">
          {slices.map((slice, index) => (
            <li key={`${slice.label}-${index}`} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
              <span className="min-w-0 flex-1 truncate font-medium text-neutral-600 dark:text-neutral-300">{slice.label}</span>
              <span className="shrink-0 font-bold tabular-nums text-neutral-900 dark:text-white">{fmt(slice.value)}</span>
              <span className="w-12 shrink-0 text-right tabular-nums text-neutral-400 dark:text-neutral-500">
                {formatValue((slice.value / total) * 100, 'percent')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default PieChartBlock;
