'use client';

/** `divider` — separador con etiqueta centrada opcional. */
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockLabel } from './primitives';

export type DividerBlockData = Extract<RadarBlock, { type: 'divider' }>;

export function DividerBlock({ block }: { block: DividerBlockData }) {
  const label = block.label?.trim();

  if (!label) {
    return <hr className="border-t border-neutral-100 dark:border-neutral-800" />;
  }

  return (
    <div className="flex min-w-0 items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
      <BlockLabel>{label}</BlockLabel>
      <span className="h-px flex-1 bg-neutral-100 dark:bg-neutral-800" />
    </div>
  );
}
