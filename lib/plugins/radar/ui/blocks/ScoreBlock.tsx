'use client';

/**
 * `score` — anillo de puntaje único. El color sale del umbral aplicable: el de
 * mayor `min` que no supere al valor. Si no hay umbrales manda `block.tone`.
 */
import type { RadarBlock, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { BlockHeader, formatValue, toPercent, toneClasses, toneHex } from './primitives';

export type ScoreBlockData = Extract<RadarBlock, { type: 'score' }>;

/** El SVG se dibuja en coordenadas fijas y escala por CSS (viewBox). */
const SIZE = 120;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function pickTone(block: ScoreBlockData): RadarTone | null | undefined {
  const thresholds = block.thresholds ?? [];
  if (thresholds.length === 0) return block.tone;
  let match: { min: number; tone: RadarTone } | null = null;
  for (const threshold of thresholds) {
    if (block.value >= threshold.min && (match === null || threshold.min > match.min)) match = threshold;
  }
  return match ? match.tone : block.tone;
}

export function ScoreBlock({ block }: { block: ScoreBlockData }) {
  const max = Number.isFinite(block.max) && block.max > 0 ? block.max : 100;
  const percent = toPercent(block.value, max);
  const tone = pickTone(block);
  const classes = toneClasses(tone);
  const offset = C * (1 - percent / 100);
  const shown = formatValue(block.value, 'number');
  const ariaLabel = `${block.label || block.title || 'Puntaje'}: ${shown} de ${formatValue(max, 'number')}`;

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={tone} />

      <div className="flex flex-col items-center gap-3 py-1">
        <div className="relative h-32 w-32 shrink-0">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-full w-full -rotate-90"
            role="img"
            aria-label={ariaLabel}
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="text-neutral-100 dark:text-neutral-700"
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke={toneHex(tone)}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              className="transition-all duration-200"
            />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
            <span className="text-3xl font-black leading-none tabular-nums text-neutral-900 dark:text-white">
              {shown}
            </span>
            <span className="mt-1 text-[10px] font-bold tabular-nums text-neutral-400 dark:text-neutral-500">
              / {formatValue(max, 'number')}
            </span>
          </div>
        </div>

        {block.label && <p className={`text-sm font-bold ${classes.text}`}>{block.label}</p>}
        {block.caption && (
          <p className="max-w-xs text-center text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {block.caption}
          </p>
        )}
      </div>
    </div>
  );
}
