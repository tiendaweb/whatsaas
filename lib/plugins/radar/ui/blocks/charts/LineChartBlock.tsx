'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
  useChartMounted,
} from './chart-kit';

type Props = { block: Extract<RadarBlock, { type: 'lineChart' }> };

export function LineChartBlock({ block }: Props) {
  const mounted = useChartMounted();
  const fmt = chartFormatter(block);
  const { rows, keys } = mergeSeries(block.series);

  const header = <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />;
  if (!rows.length || !keys.length) {
    return <>{header}<BlockEmpty /></>;
  }

  const showLegend = block.legend ?? keys.length > 1;
  const dots = block.showDots ?? rows.length <= 12;

  return (
    <>
      {header}
      <ChartFrame height={chartHeight(block)} mounted={mounted}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID_PROPS} vertical={false} />
            <XAxis {...AXIS_PROPS} dataKey="label" interval="preserveStartEnd" />
            <YAxis {...AXIS_PROPS} width={52} tickFormatter={(value: number) => fmt(value)} />
            <Tooltip
              cursor={{ stroke: 'currentColor', strokeOpacity: 0.25 }}
              content={(props: any) => <ChartTooltipContent {...props} fmt={fmt} />}
            />
            {keys.map((key) => (
              <Line
                key={key.key}
                type={block.curved === false ? 'linear' : 'monotone'}
                dataKey={key.key}
                name={key.name}
                stroke={key.color}
                strokeWidth={2.5}
                dot={dots ? { r: 3, fill: key.color, strokeWidth: 0 } : false}
                activeDot={{ r: 5, fill: key.color, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
      {showLegend && <ChartLegend items={keys.map((key) => ({ name: key.name, color: key.color }))} />}
    </>
  );
}

export default LineChartBlock;
