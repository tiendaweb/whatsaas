'use client';

/** `list` — lista de señales, riesgos o pendientes. Plana, checklist o numerada. */
import { Check } from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, Chip, resolveIcon, toneAt, toneClasses } from './primitives';

export type ListBlockData = Extract<RadarBlock, { type: 'list' }>;

function safeHref(href?: string | null): string | null {
  if (!href) return null;
  const value = href.trim();
  if (value.startsWith('/')) return value;
  return /^https:\/\//i.test(value) ? value : null;
}

export function ListBlock({ block }: { block: ListBlockData }) {
  const items = block.items ?? [];
  const variant = block.variant ?? 'plain';

  if (items.length === 0) {
    return (
      <div className="min-w-0">
        <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
        <BlockEmpty />
      </div>
    );
  }

  const rows = items.map((item, index) => {
    const tone = toneAt(index, item.tone ?? block.tone ?? null);
    const classes = toneClasses(tone);
    // Sin icono elegido, una flecha neutra: diez ítems sin icono no pueden ser
    // diez Sparkles idénticos.
    const Icon = resolveIcon(item.icon, 'ArrowRight');
    const href = safeHref(item.href);
    const external = href ? !href.startsWith('/') : false;

    const marker =
      variant === 'checklist' ? (
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${classes.soft}`}>
          <Check className="h-3 w-3" />
        </span>
      ) : variant === 'numbered' ? (
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black tabular-nums ${classes.soft}`}
        >
          {index + 1}
        </span>
      ) : (
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${classes.soft}`}>
          <Icon className="h-3 w-3" />
        </span>
      );

    const body = (
      <>
        {marker}
        <span className="min-w-0 flex-1 break-words text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {item.text}
        </span>
        {item.badge && <Chip label={item.badge.label} tone={item.badge.tone ?? tone} />}
      </>
    );

    return (
      <li key={index} className="min-w-0">
        {href ? (
          <a
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noreferrer' : undefined}
            className="-mx-1.5 flex items-start gap-2.5 rounded-xl px-1.5 py-1 transition-all duration-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            {body}
          </a>
        ) : (
          <div className="flex items-start gap-2.5">{body}</div>
        )}
      </li>
    );
  });

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {variant === 'numbered' ? (
        <ol className="space-y-2">{rows}</ol>
      ) : (
        <ul className="space-y-2">{rows}</ul>
      )}
    </div>
  );
}
