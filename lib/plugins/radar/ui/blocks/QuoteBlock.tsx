'use client';

/** `quote` — cita textual del cliente, con comilla decorativa y fuente al pie. */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockHeader, toneClasses } from './primitives';

export type QuoteBlockData = Extract<RadarBlock, { type: 'quote' }>;

export function QuoteBlock({ block }: { block: QuoteBlockData }) {
  const classes = toneClasses(block.tone);

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />

      <figure className="min-w-0">
        <blockquote className="flex min-w-0 gap-2">
          <span className={`shrink-0 select-none text-3xl font-black leading-none ${classes.text}`} aria-hidden="true">
            &ldquo;
          </span>
          <p className="min-w-0 whitespace-pre-wrap break-words pt-1 text-sm italic leading-relaxed text-neutral-700 dark:text-neutral-200">
            {block.text}
          </p>
        </blockquote>
        {block.source && (
          <figcaption className="mt-2 pl-6 text-[11px] font-bold text-neutral-400 dark:text-neutral-500">
            — {block.source}
          </figcaption>
        )}
      </figure>
    </div>
  );
}
