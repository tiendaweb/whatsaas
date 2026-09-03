'use client';

/** `progress` — barras horizontales apiladas verticalmente, una por ítem. */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, formatValue, toPercent, toneAt, toneClasses } from './primitives';

export type ProgressBlockData = Extract<RadarBlock, { type: 'progress' }>;

export function ProgressBlock({ block }: { block: ProgressBlockData }) {
  const items = block.items ?? [];

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      {items.length === 0 ? (
        <BlockEmpty />
      ) : (
        <div className="space-y-3.5">
          {items.map((item, index) => {
            const max = Number.isFinite(item.max) && item.max > 0 ? item.max : 100;
            const percent = toPercent(item.value, max);
            const classes = toneClasses(toneAt(index, item.tone));
            const readout = item.showRaw
              ? `${formatValue(item.value, 'number')}/${formatValue(max, 'number')}`
              : formatValue(Math.round(percent * 10) / 10, 'percent');

            return (
              <div key={`${item.label}-${index}`} className="min-w-0">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-bold text-neutral-800 dark:text-neutral-100">
                    {item.label}
                  </span>
                  <span className="shrink-0 text-xs font-black tabular-nums text-neutral-500 dark:text-neutral-400">
                    {readout}
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700"
                  role="progressbar"
                  aria-valuenow={Math.round(percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={item.label}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${classes.fill}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                {item.hint && (
                  <p className="mt-1 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">{item.hint}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
