'use client';

/** `markdown` — documento markdown entero dentro de un bloque. */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockHeader } from './primitives';
import { Markdown } from './markdown';

export type MarkdownBlockData = Extract<RadarBlock, { type: 'markdown' }>;

export function MarkdownBlock({ block }: { block: MarkdownBlockData }) {
  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      <Markdown text={block.body} />
    </div>
  );
}
