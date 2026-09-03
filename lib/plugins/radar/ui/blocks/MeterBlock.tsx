'use client';

/** `meter` — una sola barra partida en segmentos proporcionales + leyenda. */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, formatValue, toneAt, toneClasses } from './primitives';

export type MeterBlockData = Extract<RadarBlock, { type: 'meter' }>;

export function MeterBlock({ block }: { block: MeterBlockData }) {
  const segments = (block.segments ?? []).map((segment, index) => ({
    ...segment,
    // Los negativos no tienen sentido en una barra de proporciones.
    value: Number.isFinite(segment.value) && segment.value > 0 ? segment.value : 0,
    classes: toneClasses(toneAt(index, segment.tone)),
  }));
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      {total <= 0 ? (
        <BlockEmpty />
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
            {segments.map((segment, index) =>
              segment.value > 0 ? (
                <div
                  key={`${segment.label}-${index}`}
                  className={`h-full transition-all duration-200 ${segment.classes.fill}`}
                  style={{ width: `${(segment.value / total) * 100}%` }}
                  title={segment.hint ? `${segment.label} · ${segment.hint}` : segment.label}
                />
              ) : null,
            )}
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {segments.map((segment, index) => (
              <li key={`${segment.label}-${index}`} className="flex min-w-0 items-center gap-1.5 text-xs">
                <span className={`h-2 w-2 shrink-0 rounded-full ${segment.classes.fill}`} aria-hidden="true" />
                <span className="min-w-0 truncate text-neutral-500 dark:text-neutral-400">{segment.label}</span>
                {block.showValues && (
                  <span className="shrink-0 font-black tabular-nums text-neutral-800 dark:text-neutral-100">
                    {formatValue(segment.value, 'number')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
