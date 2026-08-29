'use client';

import type { SignalKind } from '../../shared/taxonomy';
import { KIND_META, KIND_ORDER } from './kind-meta';

/** Cabecera con conteos por tipo. Tocar uno filtra la lista; tocarlo de nuevo la libera. */
export function SignalCounts({
  counts,
  active,
  onSelect,
}: {
  counts: Partial<Record<SignalKind, number>>;
  active: SignalKind | null;
  onSelect: (kind: SignalKind | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {KIND_ORDER.map((kind) => {
        const n = counts[kind] ?? 0;
        const meta = KIND_META[kind];
        const isActive = active === kind;
        return (
          <button
            key={kind}
            type="button"
            onClick={() => onSelect(isActive ? null : kind)}
            className={
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ' +
              (isActive
                ? 'border-primary bg-primary text-primary-foreground'
                : n > 0
                  ? 'border-border bg-card text-foreground hover:bg-muted'
                  : 'border-border/60 bg-muted/40 text-muted-foreground')
            }
            aria-pressed={isActive}
          >
            <span aria-hidden>{meta.emoji}</span>
            <span>{meta.label}</span>
            <span className={'rounded-full px-1.5 font-semibold ' + (isActive ? 'bg-primary-foreground/20' : 'bg-muted')}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}
