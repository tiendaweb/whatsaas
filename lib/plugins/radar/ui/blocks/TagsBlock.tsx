'use client';

/** `tags` — nube de etiquetas con tono y conteo opcional. */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, toneAt, toneClasses } from './primitives';

export type TagsBlockData = Extract<RadarBlock, { type: 'tags' }>;

export function TagsBlock({ block }: { block: TagsBlockData }) {
  const items = block.items ?? [];

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {items.length === 0 ? (
        <BlockEmpty text="Sin etiquetas." />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, index) => {
            const classes = toneClasses(toneAt(index, item.tone ?? block.tone ?? null));
            return (
              <span
                key={`${item.label}-${index}`}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${classes.soft}`}
              >
                {item.label}
                {typeof item.count === 'number' && (
                  <span className="rounded-full bg-white/70 px-1.5 text-[10px] font-black tabular-nums text-neutral-600 dark:bg-black/25 dark:text-neutral-200">
                    {item.count}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
