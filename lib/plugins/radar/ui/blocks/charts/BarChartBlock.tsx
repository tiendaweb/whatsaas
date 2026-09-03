'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, toneAt, toneHex } from '../primitives';
import {
  AXIS_PROPS,
  ChartFrame,
  ChartLegend,
  ChartTooltipContent,
  GRID_PROPS,
  categoryAxisWidth,
  chartFormatter,
  chartHeight,
  mergeSeries,
  useChartMounted,
  type ChartRow,
  type LegendItem,
} from './chart-kit';

type Props = { block: Extract<RadarBlock, { type: 'barChart' }> };

export function BarChartBlock({ block }: Props) {
  const mounted = useChartMounted();
  const fmt = chartFormatter(block);
  const horizontal = block.orientation === 'horizontal';

  const merged = mergeSeries(block.series);
  const points = (block.points ?? []).filter((point) => Number.isFinite(point.value));

  const multi = merged.keys.length > 0;
  const rows: ChartRow[] = multi
    ? merged.rows
    : points.map((point) => ({ label: point.label, value: point.value, __hint: point.hint ?? null }));

  const header = <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />;
  if (!rows.length) {
    return <>{header}<BlockEmpty /></>;
  }

  const legendItems: LegendItem[] = multi
    ? merged.keys.map((key) => ({ name: key.name, color: key.color }))
    : [];
  const showLegend = block.legend ?? multi;

  const base = chartHeight(block);
  // Con muchas categorías horizontales el alto pedido no alcanza para que las
  // etiquetas del eje no se pisen: sube a 26px por barra.
  const height = horizontal ? Math.max(base, rows.length * 26 + 24) : base;

  const labels = rows.map((row) => String(row.label ?? ''));
  const categoryAxis = horizontal
    ? <YAxis {...AXIS_PROPS} type="category" dataKey="label" width={categoryAxisWidth(labels)} />
    : <XAxis {...AXIS_PROPS} type="category" dataKey="label" interval="preserveStartEnd" />;
  const valueAxis = horizontal
    ? <XAxis {...AXIS_PROPS} type="number" tickFormatter={(value: number) => fmt(value)} />
    : <YAxis {...AXIS_PROPS} type="number" width={52} tickFormatter={(value: number) => fmt(value)} />;

  const radius: [number, number, number, number] = horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0];

  return (
    <>
      {header}
      <ChartFrame height={height} mounted={mounted}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout={horizontal ? 'vertical' : 'horizontal'}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid {...GRID_PROPS} vertical={horizontal} horizontal={!horizontal} />
            {categoryAxis}
            {valueAxis}
            <Tooltip
              cursor={{ fill: 'currentColor', fillOpacity: 0.06 }}
              content={(props: any) => <ChartTooltipContent {...props} fmt={fmt} />}
            />
            {multi
              ? merged.keys.map((key) => (
                <Bar
                  key={key.key}
                  dataKey={key.key}
                  name={key.name}
                  fill={key.color}
                  stackId={block.stacked ? 'radar' : undefined}
                  radius={block.stacked ? 2 : radius}
                  maxBarSize={horizontal ? 22 : 48}
                />
              ))
              : (
                <Bar dataKey="value" name={block.title ?? 'Valor'} radius={radius} maxBarSize={horizontal ? 22 : 48}>
                  {points.map((point, index) => (
                    <Cell key={`${point.label}-${index}`} fill={toneHex(toneAt(index, point.tone))} />
                  ))}
                </Bar>
              )}
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      {showLegend && <ChartLegend items={legendItems} />}
    </>
  );
}

export default BarChartBlock;
