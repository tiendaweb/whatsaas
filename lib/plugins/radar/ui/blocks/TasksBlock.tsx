'use client';

/**
 * `tasks` — tareas del sistema con estado, vencimiento y responsable. Los
 * datos van embebidos en el bloque (los lee la IA con las tools de Tareas OS);
 * `href` enlaza a la tarea o, por defecto, al tablero de Tareas OS.
 */
import type { RadarBlock, RadarTaskState } from '@/lib/plugins/radar/shared/blocks';
import type { RadarIcon, RadarTone } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, Chip, resolveIcon, toneClasses, toPercent } from './primitives';

export type TasksBlockData = Extract<RadarBlock, { type: 'tasks' }>;

const STATE_STYLE: Record<RadarTaskState, { icon: RadarIcon; tone: RadarTone; label: string }> = {
  pending: { icon: 'Clock', tone: 'slate', label: 'Pendiente' },
  in_progress: { icon: 'Timer', tone: 'sky', label: 'En curso' },
  done: { icon: 'CheckCircle2', tone: 'emerald', label: 'Hecha' },
  blocked: { icon: 'Ban', tone: 'rose', label: 'Bloqueada' },
  overdue: { icon: 'AlertTriangle', tone: 'rose', label: 'Vencida' },
};

function safeHref(href?: string | null): string | null {
  if (!href) return null;
  const value = href.trim();
  if (value.startsWith('/')) return value;
  return /^https:\/\//i.test(value) ? value : null;
}

export function TasksBlock({ block }: { block: TasksBlockData }) {
  const items = block.items ?? [];
  const done = items.filter((item) => item.state === 'done').length;

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      {block.showProgress && items.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-neutral-400">
            <span>Avance</span>
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
        <BlockEmpty text="Sin tareas." />
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, index) => {
            const state = STATE_STYLE[item.state ?? 'pending'];
            const classes = toneClasses(item.tone ?? state.tone);
            const Icon = resolveIcon(state.icon);
            const href = safeHref(item.href) ?? '/plugins/tasks';

            return (
              <li key={item.id ?? `${item.title}-${index}`}>
                <a
                  href={href}
                  className="flex min-w-0 items-start gap-2.5 rounded-2xl border border-neutral-100 bg-white px-3.5 py-2.5 transition-all duration-200 hover:border-indigo-500 dark:border-neutral-800 dark:bg-neutral-800/60"
                >
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${classes.soft}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`min-w-0 break-words text-sm font-bold ${
                          item.state === 'done'
                            ? 'text-neutral-400 line-through dark:text-neutral-500'
                            : 'text-neutral-900 dark:text-white'
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.badge && <Chip label={item.badge.label} tone={item.badge.tone ?? item.tone} />}
                    </span>
                    {item.detail && (
                      <span className="mt-0.5 block break-words text-xs text-neutral-500 dark:text-neutral-400">{item.detail}</span>
                    )}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                      <span className={`font-bold ${classes.text}`}>{state.label}</span>
                      {item.due && <span>· vence {item.due}</span>}
                      {item.assignee && <span>· {item.assignee}</span>}
                      {item.project && <span>· {item.project}</span>}
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
