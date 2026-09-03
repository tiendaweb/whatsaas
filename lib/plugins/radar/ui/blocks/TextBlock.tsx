'use client';

/**
 * `text` — párrafo libre. En texto plano se respetan los saltos de línea con
 * `whitespace-pre-wrap`; con `format: 'markdown'` pasa por el parser a nodos
 * React. En ninguno de los dos casos se interpreta HTML del cuerpo.
 */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockHeader } from './primitives';
import { Markdown } from './markdown';

export type TextBlockData = Extract<RadarBlock, { type: 'text' }>;

export function TextBlock({ block }: { block: TextBlockData }) {
  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {block.format === 'markdown' ? (
        <Markdown text={block.body} />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          {block.body}
        </p>
      )}
    </div>
  );
}
