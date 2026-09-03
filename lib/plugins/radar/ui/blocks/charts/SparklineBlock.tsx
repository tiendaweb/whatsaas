'use client';

import { useId } from 'react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, formatValue, toneClasses, toneHex } from '../primitives';
import { svgSafeId } from './chart-kit';

type Props = { block: Extract<RadarBlock, { type: 'sparkline' }> };

const VIEW_W = 100;
const VIEW_H = 32;
const PAD = 3;

export function SparklineBlock({ block }: Props) {
  const gradientId = svgSafeId(useId());
  const values = (block.values ?? []).filter((value) => Number.isFinite(value));

  const header = <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />;
  if (values.length < 2) {
    return <>{header}<BlockEmpty /></>;
  }

  const color = toneHex(block.tone);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Serie plana: sin rango no hay escala posible, se dibuja en el medio.
  const span = max - min || 1;
  const flat = max === min;

  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * VIEW_W;
    const y = flat
      ? VIEW_H / 2
      : VIEW_H - PAD - ((value - min) / span) * (VIEW_H - PAD * 2);
    return { x, y };
  });

  const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  const area = `${line} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;
  const last = coords[coords.length - 1];

  const delta = block.delta;
  const deltaTone = delta === undefined ? null : delta >= 0 ? 'emerald' : 'rose';

  return (
    <>
      {header}
      <div className="flex items-center gap-4">
        <div className="min-w-0 shrink-0">
          {block.label && (
            <p className="truncate text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 dark:text-neutral-500">
              {block.label}
            </p>
          )}
          {block.value !== undefined && (
            <p className="text-2xl font-black tabular-nums text-neutral-900 dark:text-white">
              {typeof block.value === 'number' ? formatValue(block.value) : block.value}
            </p>
          )}
          {delta !== undefined && deltaTone && (
            <p className={`text-xs font-bold tabular-nums ${toneClasses(deltaTone).text}`}>
              {delta >= 0 ? '↑' : '↓'} {formatValue(Math.abs(delta), 'percent')}
            </p>
          )}
        </div>
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            className="h-12 w-full"
            role="img"
            aria-label={`Tendencia de ${values.length} valores, de ${formatValue(values[0])} a ${formatValue(values[values.length - 1])}`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#${gradientId})`} />
            {/* El viewBox se estira en X: sin esto el trazo se deforma con el ancho. */}
            <path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span
            aria-hidden="true"
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-neutral-800"
            style={{ background: color, left: '100%', top: `${(last.y / VIEW_H) * 100}%` }}
          />
        </div>
      </div>
    </>
  );
}

export default SparklineBlock;
