'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { surfaceCardHover } from '@/components/escritorio/tokens';
import type { BatchSummary } from '../../shared/api-types';
import { KIND_LABELS, PHASE_LABELS, ROLE_LABELS, batchPhase, formatDate } from './api';

/** Fila de lote (doc 05 §5): nombre · N contactos · tipo · rol — estado — [Revisar]. */
export function BatchCard({ batch, onOpen }: { batch: BatchSummary; onOpen: (batchId: string) => void }) {
  const phase = batchPhase(batch.byStatus);
  const pending = (batch.byStatus.proposed ?? 0) + (batch.byStatus.pending_approval ?? 0);
  const approved = (batch.byStatus.approved ?? 0) + (batch.byStatus.executing ?? 0);
  const sent = (batch.byStatus.executed ?? 0) + (batch.byStatus.resulted ?? 0);
  const kindLabel = batch.kind === 'send_message' && batch.experimentId ? 'mensaje A/B' : KIND_LABELS[batch.kind]?.toLowerCase() ?? batch.kind;

  return (
    <button
      type="button"
      onClick={() => onOpen(batch.batchId)}
      className={cn('flex w-full items-center gap-3 rounded-xl border p-3 text-left', surfaceCardHover)}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{batch.batchLabel}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(batch.createdAt)}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {batch.total} contacto{batch.total === 1 ? '' : 's'} · {kindLabel}
          {batch.requiresRole !== 'any' ? ` · ${ROLE_LABELS[batch.requiresRole]}` : ''}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 font-medium',
              phase === 'proposed' && 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
              phase === 'approved' && 'bg-primary/10 text-primary',
              phase === 'done' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
              phase === 'closed' && 'bg-muted text-muted-foreground',
            )}
          >
            {PHASE_LABELS[phase]}
          </span>
          {pending > 0 && phase !== 'proposed' && <span className="text-muted-foreground">{pending} pendientes</span>}
          {approved > 0 && <span className="text-muted-foreground">{approved} aprobados</span>}
          {sent > 0 && (
            <span className="text-muted-foreground">
              enviados {sent} · respondieron {batch.responded} · recuperados {batch.recovered}
            </span>
          )}
          {(batch.byStatus.rejected ?? 0) > 0 && <span className="text-muted-foreground">{batch.byStatus.rejected} rechazados</span>}
          {(batch.byStatus.expired ?? 0) > 0 && <span className="text-muted-foreground">{batch.byStatus.expired} vencidos</span>}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
