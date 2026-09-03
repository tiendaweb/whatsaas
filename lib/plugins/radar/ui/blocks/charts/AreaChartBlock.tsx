'use client';

import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader } from '../primitives';
import {
  AXIS_PROPS,
  ChartFrame,
  ChartLegend,
  ChartTooltipContent,
  GRID_PROPS,
  chartFormatter,
  chartHeight,
  mergeSeries,
  svgSafeId,
  useChartMounted,
} from './chart-kit';

type Props = { block: Extract<RadarBlock, { type: 'areaChart' }> };

export function AreaChartBlock({ block }: Props) {
  const mounted = useChartMounted();
  const gradientId = svgSafeId(useId());
  const fmt = chartFormatter(block);
  const { rows, keys } = mergeSeries(block.series);

  const header = <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />;
  if (!rows.length || !keys.length) {
    return <>{header}<BlockEmpty /></>;
  }

  const showLegend = block.legend ?? keys.length > 1;

  return (
    <>
      {header}
      <ChartFrame height={chartHeight(block)} mounted={mounted}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {keys.map((key) => (
                <linearGradient key={key.key} id={`${gradientId}-${key.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={key.color} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={key.color} stopOpacity={0.04} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...GRID_PROPS} vertical={false} />
            <XAxis {...AXIS_PROPS} dataKey="label" interval="preserveStartEnd" />
            <YAxis {...AXIS_PROPS} width={52} tickFormatter={(value: number) => fmt(value)} />
            <Tooltip
              cursor={{ stroke: 'currentColor', strokeOpacity: 0.25 }}
              content={(props: any) => <ChartTooltipContent {...props} fmt={fmt} />}
            />
            {keys.map((key) => (
              <Area
                key={key.key}
                type={block.curved === false ? 'linear' : 'monotone'}
                dataKey={key.key}
                name={key.name}
                stroke={key.color}
                strokeWidth={2.5}
                fill={`url(#${gradientId}-${key.key})`}
                stackId={block.stacked ? 'radar' : undefined}
                dot={false}
                activeDot={{ r: 5, fill: key.color, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
      {showLegend && <ChartLegend items={keys.map((key) => ({ name: key.name, color: key.color }))} />}
    </>
  );
}

export default AreaChartBlock;
