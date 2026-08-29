'use client';

import { Check, ExternalLink, Loader2 } from 'lucide-react';
import type { SignalRow } from '../../shared/api-types';
import { KIND_META, timeAgo } from './kind-meta';

/**
 * Una fila del radar:
 *   💰 Magic Baby  "pasame el alias así hago la transferencia"  hace 12 min  G9→G9  [Abrir] [✓ Atendida]
 * Móvil primero: el texto ocupa el ancho y los botones bajan a una segunda línea.
 */
export function SignalItem({
  signal,
  busy,
  onOpen,
  onHandle,
}: {
  signal: SignalRow;
  busy: boolean;
  onOpen: (signal: SignalRow) => void;
  onHandle: (signal: SignalRow) => void;
}) {
  const meta = KIND_META[signal.kind] ?? { emoji: '•', label: signal.kind, urgent: false, folded: false };
  const gates = signal.gateBefore || signal.gateAfter
    ? `${signal.gateBefore ?? '—'}→${signal.gateAfter ?? signal.gateBefore ?? '—'}`
    : null;

  return (
    <li
      className={
        'rounded-xl border p-3 transition-colors ' +
        (meta.urgent ? 'border-primary/50 bg-primary/5' : 'border-border bg-card')
      }
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-lg leading-none" aria-label={meta.label} title={meta.label}>
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate font-medium text-foreground">{signal.name}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(signal.createdAt)}</span>
            {gates ? <span className="rounded bg-muted px-1.5 text-[11px] font-mono text-muted-foreground">{gates}</span> : null}
            {signal.triggeredByActionId ? (
              <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">respondió al lote</span>
            ) : null}
            <span className="text-[11px] text-muted-foreground">{signal.confidence}%</span>
          </div>
          <p className="mt-0.5 line-clamp-3 text-sm text-foreground/90">“{signal.excerpt || '(sin texto)'}”</p>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpen(signal)}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          Abrir
        </button>
        {signal.status === 'new' || signal.status === 'seen' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onHandle(signal)}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
            Atendida
          </button>
        ) : null}
      </div>
    </li>
  );
}
