'use client';

/**
 * `replies` — respuestas recomendadas listas para copiar: cada ítem trae
 * cuándo usarla (label) y el texto exacto, con botón Copiar.
 */
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { RadarBlock } from '@/lib/plugins/radar/shared/blocks';
import { BlockEmpty, BlockHeader, Chip, toneClasses } from './primitives';

export type RepliesBlockData = Extract<RadarBlock, { type: 'replies' }>;

function ReplyCard({ item }: { item: RepliesBlockData['items'][number] }) {
  const [copied, setCopied] = useState(false);
  const classes = toneClasses(item.tone ?? 'indigo');

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el texto queda visible igual.
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-800/60">
      <div className="mb-2 flex items-center justify-between gap-2">
        {item.label ? <Chip label={item.label} tone={item.tone ?? 'indigo'} /> : <span />}
        <button
          type="button"
          onClick={() => void copy()}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold transition-all duration-200 ${
            copied ? 'text-emerald-600 dark:text-emerald-400' : `${classes.text} hover:bg-neutral-100 dark:hover:bg-neutral-700`
          }`}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
        {item.text}
      </p>
    </div>
  );
}

export function RepliesBlock({ block }: { block: RepliesBlockData }) {
  const items = block.items ?? [];

  return (
    <div className="min-w-0">
      <BlockHeader icon={block.icon} title={block.title} subtitle={block.subtitle} tone={block.tone} />
      {items.length === 0 ? (
        <BlockEmpty text="Sin respuestas sugeridas." />
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <ReplyCard key={index} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
