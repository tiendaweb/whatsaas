'use client';

/**
 * `tiles` — grilla de mini-cards con icono, título y descripción: la misma
 * card que usa el menú lateral de Radar, como bloque reutilizable. Sirve para
 * armar "menús" de accesos, resúmenes de áreas o launchers dentro de un widget.
 */
import { ArrowUpRight } from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockHeader, Chip, formatValue, resolveIcon, toneClasses } from './primitives';

export type TilesBlockData = Extract<RadarBlock, { type: 'tiles' }>;

// Literales completos: Tailwind v4 no genera clases concatenadas en runtime.
const COLUMNS_CLASS: Record<2 | 3 | 4, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

function safeHref(href?: string | null): string | null {
  if (!href) return null;
  const value = href.trim();
  if (value.startsWith('/')) return value;
  return /^https:\/\//i.test(value) ? value : null;
}

export function TilesBlock({ block }: { block: TilesBlockData }) {
  const columns = block.columns ?? (block.items.length >= 4 ? 3 : 2);

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      <div className={`grid grid-cols-1 gap-2.5 ${COLUMNS_CLASS[columns]}`}>
        {block.items.map((item, index) => {
          const Icon = resolveIcon(item.icon, 'Boxes');
          const tone = toneClasses(item.tone ?? block.tone);
          const href = safeHref(item.href);
          const external = href ? !href.startsWith('/') : false;

          const body = (
            <>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.soft}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-neutral-800 dark:text-neutral-100">{item.label}</span>
                  {item.badge && <Chip label={item.badge.label} tone={item.badge.tone ?? item.tone} />}
                </span>
                {item.description && (
                  <span className="mt-0.5 block truncate text-[11px] text-neutral-400 dark:text-neutral-500">
                    {item.description}
                  </span>
                )}
              </span>
              {item.value !== undefined && (
                <span className="shrink-0 text-lg font-black tabular-nums text-neutral-300 dark:text-neutral-600">
                  {typeof item.value === 'number' ? formatValue(item.value, 'compact') : item.value}
                </span>
              )}
              {href && <ArrowUpRight className={`h-3.5 w-3.5 shrink-0 ${tone.text}`} />}
            </>
          );

          const className =
            'flex w-full items-center gap-3 rounded-2xl border border-neutral-100 bg-white p-2.5 text-left transition-all duration-200 dark:border-neutral-800 dark:bg-neutral-800/60';

          return href ? (
            <a
              key={index}
              href={href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noreferrer' : undefined}
              className={`${className} hover:border-neutral-200 hover:bg-neutral-50 dark:hover:border-neutral-700 dark:hover:bg-neutral-800`}
            >
              {body}
            </a>
          ) : (
            <div key={index} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
