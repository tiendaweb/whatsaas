'use client';

/**
 * `checklist` — lista con estado hecho/pendiente por ítem. A diferencia de
 * `list` variant checklist (que dibuja todo tildado), acá cada ítem trae su
 * `done` real, y la barra de avance sale de eso.
 */
import { Check } from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, toPercent, toneClasses } from './primitives';

export type ChecklistBlockData = Extract<RadarBlock, { type: 'checklist' }>;

export function ChecklistBlock({ block }: { block: ChecklistBlockData }) {
  const items = block.items ?? [];
  const done = items.filter((item) => item.done).length;

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      {block.showProgress && items.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-neutral-400">
            <span>Completado</span>
            <span className="tabular-nums">{done}/{items.length}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${toPercent(done, items.length)}%` }}
            />
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <BlockEmpty text="Checklist vacío." />
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const classes = toneClasses(item.tone ?? block.tone ?? 'emerald');
            return (
              <li key={index} className="flex min-w-0 items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    item.done
                      ? `${classes.soft} border-transparent`
                      : 'border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800'
                  }`}
                  aria-hidden="true"
                >
                  {item.done && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`break-words text-sm leading-relaxed ${
                      item.done
                        ? 'text-neutral-400 line-through dark:text-neutral-500'
                        : 'text-neutral-700 dark:text-neutral-200'
                    }`}
                  >
                    {item.text}
                  </span>
                  {item.hint && (
                    <span className="mt-0.5 block text-xs text-neutral-400 dark:text-neutral-500">{item.hint}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
