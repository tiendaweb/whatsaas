'use client';

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, toneAt, toneHex } from '../primitives';
import {
  AXIS_TICK,
  ChartFrame,
  ChartLegend,
  ChartTooltipContent,
  GRID_PROPS,
  chartFormatter,
  chartHeight,
  useChartMounted,
  type ChartRow,
} from './chart-kit';

type Props = { block: Extract<RadarBlock, { type: 'radarChart' }> };

export function RadarChartBlock({ block }: Props) {
  const mounted = useChartMounted();
  const fmt = chartFormatter(block);

  const axes = (block.axes ?? []).filter((axis) => typeof axis === 'string' && axis.trim() !== '');
  // El contrato dice "un valor por eje" pero no lo puede garantizar: si una
  // serie viene corta se completa con null y recharts la dibuja abierta en vez
  // de romper.
  const usable = (block.series ?? []).filter(
    (serie) => Array.isArray(serie.values) && serie.values.some((value) => Number.isFinite(value)),
  );
  const series = usable.map((serie, index) => ({
    key: `s${index}`,
    name: serie.name,
    color: toneHex(toneAt(index, serie.tone)),
  }));

  const header = <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />;
  if (axes.length < 3 || !series.length) {
    return <>{header}<BlockEmpty /></>;
  }

  const rows: ChartRow[] = axes.map((axis, axisIndex) => {
    const row: ChartRow = { axis };
    usable.forEach((serie, serieIndex) => {
      const value = serie.values[axisIndex];
      row[`s${serieIndex}`] = Number.isFinite(value) ? value : null;
    });
    return row;
  });

  const max = Number.isFinite(block.max) && (block.max as number) > 0 ? (block.max as number) : undefined;
  const showLegend = block.legend ?? series.length > 1;

  return (
    <>
      {header}
      <ChartFrame height={chartHeight(block)} mounted={mounted}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={rows} outerRadius="72%" margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <PolarGrid stroke={GRID_PROPS.stroke} strokeOpacity={GRID_PROPS.strokeOpacity} />
            <PolarAngleAxis dataKey="axis" tick={AXIS_TICK} />
            <PolarRadiusAxis
              domain={max ? [0, max] : undefined}
              tick={{ ...AXIS_TICK, fontSize: 9 }}
              axisLine={false}
              tickFormatter={(value: number) => fmt(value)}
            />
            <Tooltip content={(props: any) => <ChartTooltipContent {...props} fmt={fmt} />} />
            {series.map((serie) => (
              <Radar
                key={serie.key}
                dataKey={serie.key}
                name={serie.name}
                stroke={serie.color}
                strokeWidth={2}
                fill={serie.color}
                fillOpacity={series.length > 1 ? 0.18 : 0.3}
                isAnimationActive={false}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>
      </ChartFrame>
      {showLegend && <ChartLegend items={series.map((serie) => ({ name: serie.name, color: serie.color }))} />}
    </>
  );
}

export default RadarChartBlock;
