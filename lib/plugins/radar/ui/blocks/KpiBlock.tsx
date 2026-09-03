'use client';

/**
 * `kpi` — fila de números grandes. En móvil siempre son 2 columnas; en
 * escritorio manda `columns`.
 */
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { RadarBlock, RadarKpiItem } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, BlockLabel, formatValue, resolveIcon, toneAt, toneClasses } from './primitives';

export type KpiBlockData = Extract<RadarBlock, { type: 'kpi' }>;

/** Tailwind v4 no genera clases armadas por concatenación: van literales. */
const COLUMNS: Record<2 | 3 | 4, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
};

function safeHref(href?: string | null): string | null {
  if (!href) return null;
  const value = href.trim();
  if (value.startsWith('/')) return value;
  return /^https:\/\//i.test(value) ? value : null;
}

function Delta({ delta, label }: { delta: number; label?: string }) {
  const up = delta > 0;
  const flat = delta === 0;
  const classes = toneClasses(flat ? 'neutral' : up ? 'emerald' : 'rose');
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] font-bold">
      <span className={`inline-flex items-center gap-0.5 ${classes.text}`}>
        {!flat && <Arrow className="h-3 w-3 shrink-0" />}
        <span className="tabular-nums">{formatValue(Math.abs(delta), 'percent')}</span>
      </span>
      {label && <span className="min-w-0 truncate font-medium text-neutral-400 dark:text-neutral-500">{label}</span>}
    </p>
  );
}

function KpiCard({ item, index }: { item: RadarKpiItem; index: number }) {
  const tone = toneAt(index, item.tone);
  const classes = toneClasses(tone);
  const Icon = resolveIcon(item.icon);
  const value = typeof item.value === 'number' ? formatValue(item.value, 'number') : item.value;

  return (
    <>
      <div className="flex items-center gap-2">
        {item.icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${classes.soft}`}>
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <BlockLabel>{item.label}</BlockLabel>
        </div>
      </div>

      <p className="mt-2 flex items-baseline gap-1 text-2xl font-black tabular-nums text-neutral-900 dark:text-white">
        <span className="min-w-0 truncate">{value}</span>
        {item.unit && (
          <span className="shrink-0 text-xs font-bold text-neutral-400 dark:text-neutral-500">{item.unit}</span>
        )}
      </p>

      {typeof item.delta === 'number' && <Delta delta={item.delta} label={item.deltaLabel} />}
      {item.hint && (
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">{item.hint}</p>
      )}
    </>
  );
}

export function KpiBlock({ block }: { block: KpiBlockData }) {
  const items = block.items ?? [];
  const grid = COLUMNS[block.columns ?? 4];

  if (items.length === 0) {
    return (
      <div className="min-w-0">
        <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
        <BlockEmpty />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      <div className={`grid grid-cols-2 gap-2.5 ${grid}`}>
        {items.map((item, index) => {
          const href = safeHref(item.href);
          const external = href ? !href.startsWith('/') : false;
          const shell =
            'min-w-0 rounded-2xl border border-neutral-100 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-800/60';
          if (href) {
            return (
              <a
                key={`${item.label}-${index}`}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
                className={`${shell} block transition-all duration-200 hover:border-indigo-500 hover:shadow-sm`}
              >
                <KpiCard item={item} index={index} />
              </a>
            );
          }
          return (
            <div key={`${item.label}-${index}`} className={shell}>
              <KpiCard item={item} index={index} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
