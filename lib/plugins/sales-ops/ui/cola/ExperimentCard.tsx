'use client';

import { cn } from '@/lib/utils';
import { surfaceCard } from '@/components/escritorio/tokens';
import type { ExperimentFunnel, ExperimentRow } from '../../shared/api-types';
import { formatDate, formatUsd, pct } from './api';

const STEPS: Array<{ key: keyof Omit<ExperimentFunnel, 'revenueUsd'>; label: string }> = [
  { key: 'eligible', label: 'Elegibles' },
  { key: 'sent', label: 'Enviados' },
  { key: 'delivered', label: 'Entregados' },
  { key: 'responded', label: 'Respondieron' },
  { key: 'recovered', label: 'Recuperados' },
  { key: 'proposal', label: 'Propuesta' },
  { key: 'paid', label: 'Pago' },
];

function FunnelColumn({ variant, funnel, hasB }: { variant: 'A' | 'B' | 'all'; funnel: ExperimentFunnel; hasB: boolean }) {
  const base = funnel.sent || funnel.eligible;
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-1.5">
        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', variant === 'all' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary')}>
          {variant === 'all' ? (hasB ? 'Total' : 'Único') : `Variante ${variant}`}
        </span>
      </div>
      <ol className="space-y-1">
        {STEPS.map((step) => {
          const value = funnel[step.key];
          const width = base ? Math.max(4, Math.round((value / base) * 100)) : 0;
          return (
            <li key={step.key} className="text-[11px]">
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="truncate">{step.label}</span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {value}
                  {step.key !== 'eligible' && <span className="ml-1 text-muted-foreground">{pct(value, base)}</span>}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, width)}%` }} />
              </div>
            </li>
          );
        })}
        <li className="flex items-center justify-between pt-1 text-[11px]">
          <span className="text-muted-foreground">Caja</span>
          <span className="font-medium tabular-nums text-foreground">{formatUsd(funnel.revenueUsd)}</span>
        </li>
      </ol>
    </div>
  );
}

/** Tarjeta de experimento (doc 05 §7): embudo por variante con tasas y USD. */
export function ExperimentCard({ experiment, onClose, closing }: { experiment: ExperimentRow; onClose?: (id: number) => void; closing?: boolean }) {
  const hasB = Boolean(experiment.messageB) || experiment.funnel.B.eligible > 0;
  return (
    <article className={cn('rounded-xl border p-3', surfaceCard)}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{experiment.name}</h3>
          <p className="text-[11px] text-muted-foreground">
            {experiment.segmentGates.length ? experiment.segmentGates.join(' · ') : 'sin gates'} · {experiment.status === 'running' ? 'en curso' : experiment.status === 'closed' ? 'cerrado' : 'borrador'} ·{' '}
            {formatDate(experiment.startedAt)}
            {experiment.endedAt ? ` → ${formatDate(experiment.endedAt)}` : ''}
          </p>
          {experiment.hypothesis && <p className="mt-1 text-xs text-muted-foreground">{experiment.hypothesis}</p>}
        </div>
        {experiment.status !== 'closed' && onClose && (
          <button
            type="button"
            disabled={closing}
            onClick={() => onClose(experiment.id)}
            className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cerrar
          </button>
        )}
      </header>

      <div className="mt-3 flex gap-4">
        {hasB ? (
          <>
            <FunnelColumn variant="A" funnel={experiment.funnel.A} hasB />
            <FunnelColumn variant="B" funnel={experiment.funnel.B} hasB />
          </>
        ) : (
          <FunnelColumn variant="all" funnel={experiment.funnel.all} hasB={false} />
        )}
      </div>

      {(experiment.messageA || experiment.messageB) && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Ver textos</summary>
          <div className="mt-2 space-y-2">
            {experiment.messageA && (
              <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-foreground/90">
                <span className="mr-1 font-semibold text-primary">A</span>
                {experiment.messageA}
              </p>
            )}
            {experiment.messageB && (
              <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-foreground/90">
                <span className="mr-1 font-semibold text-primary">B</span>
                {experiment.messageB}
              </p>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
