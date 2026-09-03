'use client';

/** `timeline` — cronología vertical con puntos, fecha, título y detalle. */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, resolveIcon, toneAt, toneClasses } from './primitives';

export type TimelineBlockData = Extract<RadarBlock, { type: 'timeline' }>;

export function TimelineBlock({ block }: { block: TimelineBlockData }) {
  const items = block.items ?? [];

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      {items.length === 0 ? (
        <BlockEmpty />
      ) : (
        <ol className="min-w-0">
          {items.map((item, index) => {
            const classes = toneClasses(toneAt(index, item.tone));
            // Un hecho sin icono es un punto en el tiempo: reloj, no Sparkles.
            const Icon = resolveIcon(item.icon, 'Clock');
            const last = index === items.length - 1;

            return (
              <li key={`${item.title}-${index}`} className="relative flex min-w-0 gap-3 pb-4 last:pb-0">
                {/* La línea vive detrás del punto y se corta en el último ítem. */}
                {!last && (
                  <span
                    className="absolute left-[0.8125rem] top-7 bottom-0 w-px bg-neutral-100 dark:bg-neutral-700"
                    aria-hidden="true"
                  />
                )}
                <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${classes.soft}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  {item.date && (
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] tabular-nums text-neutral-400 dark:text-neutral-500">
                      {item.date}
                    </p>
                  )}
                  <p className="mt-0.5 break-words text-sm font-bold text-neutral-900 dark:text-white">{item.title}</p>
                  {item.detail && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                      {item.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
