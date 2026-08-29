'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ArrowLeft, Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { surfaceCard } from '@/components/escritorio/tokens';
import type { ActionRow, QueueBatchPayload } from '../../shared/api-types';
import { KIND_LABELS, PHASE_LABELS, QUEUE_ENDPOINT, ROLE_LABELS, STATUS_LABELS, batchPhase, fetcher, formatDate, postJson, type ApiError } from './api';

const PENDING = new Set(['proposed', 'pending_approval']);

/**
 * "Revisar lote" (doc 05 §5): lista completa de contactos con checkbox para
 * excluir, texto final por contacto, advertencias resaltadas y dos botones:
 * "Aprobar N" y "Rechazar lote". Aprobar NO envía.
 */
export function RevisarLote({ batchId, onBack, onChanged }: { batchId: string; onBack: () => void; onChanged?: () => void }) {
  const { data, isLoading, error, mutate } = useSWR<QueueBatchPayload>(`${QUEUE_ENDPOINT}/${encodeURIComponent(batchId)}`, fetcher);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<'approve' | 'reject' | number | null>(null);
  const [approvedNotice, setApprovedNotice] = useState<string | null>(null);

  const actions = data?.actions ?? [];
  const pending = useMemo(() => actions.filter((a) => PENDING.has(a.status)), [actions]);
  const approvable = pending.filter((a) => !excluded.has(a.id));
  const phase = data ? batchPhase(data.batch.byStatus) : null;

  function toggle(id: number) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function approve() {
    if (!approvable.length) return;
    setBusy('approve');
    try {
      const result = await postJson<{ approved: number; rejected: number }>(`${QUEUE_ENDPOINT}/${encodeURIComponent(batchId)}/approve`, {
        excludeActionIds: [...excluded],
      });
      setApprovedNotice(`Aprobado ${result.approved} — la ejecución es por conector o manual hasta la Fase 6.`);
      setExcluded(new Set());
      await mutate();
      onChanged?.();
    } catch (err) {
      const e = err as ApiError;
      if (e.blockedChats?.length) {
        toast.error(`No se aprobó nada: ${e.blockedChats.map((b) => `${b.name} ya está aprobado en "${b.batchLabel}"`).join('; ')}. Sacalo del lote.`);
        // Se preselecciona para excluir: un toque más y se puede aprobar el resto.
        const blockedChatIds = new Set(e.blockedChats.map((b) => b.chatId));
        setExcluded((current) => new Set([...current, ...pending.filter((a) => blockedChatIds.has(a.chatId)).map((a) => a.id)]));
      } else {
        toast.error(e.message);
      }
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    setBusy('reject');
    try {
      const result = await postJson<{ rejected: number }>(`${QUEUE_ENDPOINT}/${encodeURIComponent(batchId)}/reject`, { reason: 'rechazado desde la cola' });
      toast.success(`Lote rechazado (${result.rejected} filas).`);
      await mutate();
      onChanged?.();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function markManual(action: ActionRow, status: 'executed' | 'failed') {
    setBusy(action.id);
    try {
      await postJson(`${QUEUE_ENDPOINT}/actions/${action.id}/result`, { status, executedVia: 'manual', result: status === 'failed' ? { error: 'manual' } : null });
      toast.success(status === 'executed' ? 'Marcado como enviado a mano.' : 'Marcado como fallido.');
      await mutate();
      onChanged?.();
    } catch (err) {
      toast.error((err as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-[60dvh] flex-col">
      <div className="flex items-center gap-2 pb-3">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Volver a la cola">
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-foreground">{data?.batch.batchLabel ?? 'Lote'}</h2>
          {data && (
            <p className="truncate text-xs text-muted-foreground">
              {data.batch.total} contactos · {KIND_LABELS[data.batch.kind]} · aprueba {ROLE_LABELS[data.batch.requiresRole]} · {PHASE_LABELS[phase ?? 'closed']} · {formatDate(data.batch.createdAt, true)}
            </p>
          )}
        </div>
      </div>

      {approvedNotice && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>{approvedNotice}</span>
        </div>
      )}

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{String(error.message)}</div>}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {data && (
        <div className="flex-1 space-y-2 pb-24">
          {actions.map((action) => {
            const isPending = PENDING.has(action.status);
            const isOut = excluded.has(action.id);
            const text = typeof action.payload.text === 'string' ? action.payload.text : null;
            return (
              <div
                key={action.id}
                className={cn(
                  'rounded-xl border p-3',
                  surfaceCard,
                  isOut && 'opacity-50',
                  action.warnings.length > 0 && !isOut && 'border-amber-500/50',
                )}
              >
                <div className="flex items-start gap-3">
                  {isPending ? (
                    <Checkbox checked={!isOut} onCheckedChange={() => toggle(action.id)} aria-label={`Incluir a ${action.name}`} className="mt-0.5" />
                  ) : (
                    <span className="mt-0.5 size-4 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{action.name}</span>
                      {action.gateAtCreation && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{action.gateAtCreation}</span>}
                      {action.variant && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{action.variant}</span>}
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{STATUS_LABELS[action.status]}</span>
                    </div>
                    {text && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{text}</p>}
                    {!text && action.kind !== 'send_message' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {KIND_LABELS[action.kind]}
                        {typeof action.payload.owner === 'string' ? ` → ${action.payload.owner}` : ''}
                        {typeof action.payload.taskTitle === 'string' ? ` · ${action.payload.taskTitle}` : ''}
                      </p>
                    )}
                    {action.warnings.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {action.warnings.map((warning) => (
                          <li key={warning} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                            <span>{warning}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {action.status === 'approved' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Aprobado {formatDate(action.approvedAt, true)} · ejecución por conector o manual</span>
                        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy !== null} onClick={() => markManual(action, 'executed')}>
                          {busy === action.id ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                          Lo mandé a mano
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy !== null} onClick={() => markManual(action, 'failed')}>
                          No salió
                        </Button>
                      </div>
                    )}
                    {(action.status === 'executed' || action.status === 'resulted') && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Enviado {formatDate(action.executedAt, true)} vía {action.executedVia ?? '—'}
                        {action.resultMessageId ? ` · msg ${action.resultMessageId.slice(-8)}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && pending.length > 0 && (
        <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-border/40 bg-white/90 px-4 py-3 backdrop-blur-sm dark:bg-card/90">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium tabular-nums text-primary">{approvable.length} de {pending.length}</span>
            {excluded.size > 0 && <span className="text-xs text-muted-foreground">{excluded.size} afuera</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={reject} className="gap-1.5">
              {busy === 'reject' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
              Rechazar lote
            </Button>
            <Button type="button" size="sm" disabled={busy !== null || approvable.length === 0} onClick={approve} className="gap-1.5">
              {busy === 'approve' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              Aprobar {approvable.length}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
