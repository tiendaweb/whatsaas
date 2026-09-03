'use client';

import { ChevronRight, Loader2, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { surfaceCardHover } from '@/components/escritorio/tokens';
import type { BatchSummary } from '../../shared/api-types';
import { useState } from 'react';
import { toast } from 'sonner';
import { KIND_LABELS, PHASE_LABELS, QUEUE_ENDPOINT, ROLE_LABELS, batchPhase, formatDate, postJson, type ApiError } from './api';

/** Fila de lote (doc 05 §5): nombre · N contactos · tipo · rol — estado — [Revisar]. */
export function BatchCard({ batch, onOpen, onDiscarded, onDeleted }: { batch: BatchSummary; onOpen: (batchId: string) => void; onDiscarded?: () => void; onDeleted?: () => void }) {
  const [descartando, setDescartando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const phase = batchPhase(batch.byStatus);
  const pending = (batch.byStatus.proposed ?? 0) + (batch.byStatus.pending_approval ?? 0);
  const approved = (batch.byStatus.approved ?? 0) + (batch.byStatus.executing ?? 0);
  const sent = (batch.byStatus.executed ?? 0) + (batch.byStatus.resulted ?? 0);
  const kindLabel = batch.kind === 'send_message' && batch.experimentId ? 'mensaje A/B' : KIND_LABELS[batch.kind]?.toLowerCase() ?? batch.kind;

  /** Descartar = rechazar todo lo pendiente y lo aprobado sin ejecutar. No borra: queda el rastro del lote. */
  const descartar = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const vivas = pending + approved;
    if (!window.confirm(`¿Descartar "${batch.batchLabel}"? Se rechazan ${vivas} fila${vivas === 1 ? '' : 's'}${approved ? ` (${approved} ya aprobadas, todavía sin salir)` : ''}.`)) return;
    setDescartando(true);
    try {
      await postJson(`${QUEUE_ENDPOINT}/${encodeURIComponent(batch.batchId)}/reject`, { reason: 'descartado desde la cola' });
      toast.success('Lote descartado.');
      onDiscarded?.();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setDescartando(false);
    }
  };

  /** Eliminar = borrar el lote de verdad. Sólo para descartados sin envíos que hayan salido. */
  const eliminar = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm(`¿Eliminar "${batch.batchLabel}" por completo? No se puede deshacer.`)) return;
    setEliminando(true);
    try {
      const res = await fetch(`${QUEUE_ENDPOINT}/${encodeURIComponent(batch.batchId)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      toast.success('Lote eliminado.');
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo eliminar.');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(batch.batchId)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(batch.batchId)}
      className={cn('flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left', surfaceCardHover)}
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
      {/* Descartar desde la tarjeta: rechazar un lote entero era entrar a
          revisarlo, bajar hasta el pie y recién ahí encontrar el botón. */}
      {onDeleted && phase === 'closed' && (
        <button
          type="button"
          onClick={eliminar}
          disabled={eliminando}
          aria-label={`Eliminar ${batch.batchLabel}`}
          title="Eliminar por completo"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          {eliminando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
        </button>
      )}
      {onDiscarded && (phase === 'proposed' || phase === 'approved') && (
        <button
          type="button"
          onClick={descartar}
          disabled={descartando}
          aria-label={`Descartar ${batch.batchLabel}`}
          title="Descartar el lote"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          {descartando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}
        </button>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </div>
  );
}
