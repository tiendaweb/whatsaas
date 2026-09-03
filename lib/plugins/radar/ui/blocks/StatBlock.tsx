'use client';

/** `stat` — filas dato/valor tipo ficha. Siempre 1 columna en móvil. */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, BlockLabel, resolveIcon, toneClasses } from './primitives';

export type StatBlockData = Extract<RadarBlock, { type: 'stat' }>;

const COLUMNS: Record<1 | 2 | 3, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
};

export function StatBlock({ block }: { block: StatBlockData }) {
  const items = block.items ?? [];
  const grid = COLUMNS[block.columns ?? 2];

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      {items.length === 0 ? (
        <BlockEmpty />
      ) : (
        <dl className={`grid grid-cols-1 gap-2 ${grid}`}>
          {items.map((item, index) => {
            const tone = item.tone ?? block.tone;
            const classes = toneClasses(tone);
            const Icon = resolveIcon(item.icon);

            return (
              <div
                key={`${item.label}-${index}`}
                className="flex min-w-0 items-start gap-2.5 rounded-2xl border border-neutral-100 bg-white px-3.5 py-2.5 dark:border-neutral-800 dark:bg-neutral-800/60"
              >
                {item.icon && (
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${classes.soft}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <dt>
                    <BlockLabel>{item.label}</BlockLabel>
                  </dt>
                  <dd
                    className={`mt-0.5 break-words text-sm font-bold ${
                      item.tone ? classes.text : 'text-neutral-900 dark:text-white'
                    }`}
                  >
                    {item.value || '—'}
                  </dd>
                </div>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
