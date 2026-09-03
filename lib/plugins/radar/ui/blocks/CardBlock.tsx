'use client';

/**
 * `card` — el bloque estrella de Radar: icono + título + descripción, con
 * badges, viñetas y un enlace discreto al pie. Está pensado para verse igual
 * de bien suelto que dentro de una grilla de 2 o 3 columnas, por eso ocupa
 * toda la altura disponible y empuja el enlace al fondo.
 */
import { ArrowUpRight } from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockHeader, Chip, toneClasses } from './primitives';
import { Markdown, renderInlineMarkdown } from './markdown';

export type CardBlockData = Extract<RadarBlock, { type: 'card' }>;

/**
 * Los `href` los inventa la IA: sólo dejamos pasar rutas internas y https para
 * que un `javascript:` no llegue vivo hasta el DOM.
 */
function safeHref(href?: string | null): string | null {
  if (!href) return null;
  const value = href.trim();
  if (value.startsWith('/')) return value;
  return /^https:\/\//i.test(value) ? value : null;
}

export function CardBlock({ block }: { block: CardBlockData }) {
  const classes = toneClasses(block.tone);
  const badges = block.badges ?? [];
  const bullets = block.bullets ?? [];
  const href = safeHref(block.href);
  const markdown = block.format === 'markdown';
  const external = href ? !href.startsWith('/') : false;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      {badges.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {badges.map((badge, index) => (
            <Chip key={`${badge.label}-${index}`} label={badge.label} tone={badge.tone ?? block.tone} />
          ))}
        </div>
      )}

      {markdown ? (
        <Markdown text={block.description} />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {block.description}
        </p>
      )}

      {bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {bullets.map((bullet, index) => (
            <li key={index} className="flex min-w-0 gap-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              <span className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${classes.fill}`} aria-hidden="true" />
              <span className="min-w-0 break-words">{markdown ? renderInlineMarkdown(bullet) : bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {href && (
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          className={`mt-auto inline-flex w-fit items-center gap-1 pt-4 text-xs font-bold transition-all duration-200 hover:gap-1.5 ${classes.text}`}
        >
          {block.hrefLabel || 'Abrir'}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}
