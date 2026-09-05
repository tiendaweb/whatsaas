'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ArrowLeft, Check, Loader2, MessageSquarePlus, PanelRightOpen, Pencil, Save, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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
export function RevisarLote({
  batchId,
  onBack,
  onChanged,
  onOpen,
  selectedChatId,
  embebido,
}: {
  batchId: string;
  /** Sin esto (modo embebido) no hay a dónde volver: el lote ya está a la vista. */
  onBack?: () => void;
  onChanged?: () => void;
  /** Abre la ficha del contacto en el panel derecho (misma que en las listas). */
  onOpen?: (chatId: number) => void;
  /** Chat abierto ahora mismo en el panel derecho, para marcar su fila. */
  selectedChatId?: number | null;
  /**
   * Dentro del Focus de supervisión el lote se muestra entero, sin puerta: no
   * hay botón de volver ni alto mínimo, porque no es una pantalla aparte sino
   * el cuerpo de la tarjeta que se está revisando.
   */
  embebido?: boolean;
}) {
  const { data, isLoading, error, mutate } = useSWR<QueueBatchPayload>(`${QUEUE_ENDPOINT}/${encodeURIComponent(batchId)}`, fetcher);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<'approve' | 'reject' | 'execute' | 'instruccion' | number | null>(null);
  const [approvedNotice, setApprovedNotice] = useState<string | null>(null);
  /** Acción cuyo texto se está corrigiendo, y el borrador. */
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [instruccion, setInstruccion] = useState('');
  const [instruccionAbierta, setInstruccionAbierta] = useState(false);

  const actions = data?.actions ?? [];
  const pending = useMemo(() => actions.filter((a) => PENDING.has(a.status)), [actions]);
  const approved = useMemo(() => actions.filter((a) => a.status === 'approved'), [actions]);
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
      setApprovedNotice(`Aprobado ${result.approved}. Todavía no salió nada: apretá “Ejecutar” abajo, o dejalo para un conector.`);
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

  /**
   * Ejecuta lo aprobado desde el servidor (Fase 6).
   *
   * Pide confirmación explícita porque es la única acción de toda la vista que
   * le llega al cliente: todo lo demás se puede deshacer, un mensaje enviado no.
   */
  async function execute() {
    if (!approved.length) return;
    if (!window.confirm(`Se van a ejecutar ${approved.length} acciones aprobadas. Los envíos le llegan al cliente y no se pueden deshacer.\n\n¿Seguimos?`)) return;
    setBusy('execute');
    try {
      const result = await postJson<{ executed: number; skipped: number; failed: number; results: Array<{ name: string; status: string; reason?: string }> }>(
        `${QUEUE_ENDPOINT}/${encodeURIComponent(batchId)}/execute`,
        { confirm: 'EJECUTAR' },
      );
      const partes = [`enviados ${result.executed}`];
      if (result.skipped) partes.push(`salteados ${result.skipped}`);
      if (result.failed) partes.push(`fallidos ${result.failed}`);
      setApprovedNotice(partes.join(' · '));
      const saltado = result.results.find((r) => r.status === 'skipped' && r.reason);
      if (saltado) toast.info(`${saltado.name}: ${saltado.reason}`);
      if (result.failed) toast.error(`${result.failed} no salieron. Mirá el detalle en cada fila.`);
      else toast.success(`Listo: ${partes.join(' · ')}.`);
      await mutate();
      onChanged?.();
    } catch (err) {
      toast.error((err as ApiError).message);
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

  /** Corrige el texto de una fila antes de aprobar. Después de aprobar no se toca. */
  async function guardarEdicion() {
    if (!editando) return;
    setBusy(editando.id);
    try {
      const res = await fetch(`${QUEUE_ENDPOINT}/actions/${editando.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editando.texto }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(cuerpo?.error ?? `Error ${res.status}`));
      toast.success('Texto corregido.');
      setEditando(null);
      await mutate();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Una indicación para todo el lote, antes de que se ejecute.
   *
   * Se guarda como una corrida del Prompt Studio apuntada al lote, así aparece
   * en la cola del conector junto al resto del trabajo. No es un campo suelto
   * que alguien tenga que acordarse de mirar.
   */
  async function dejarInstruccion() {
    const texto = instruccion.trim();
    if (texto.length < 5) return;
    setBusy('instruccion');
    try {
      const res = await fetch(`${QUEUE_ENDPOINT.replace('/queue', '/prompts/launch')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texto, title: `Indicación · ${data?.batch.batchLabel ?? batchId}`, targetKind: 'batch', targetRef: batchId, mode: 'queue' }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(cuerpo?.error ?? `Error ${res.status}`));
      toast.success('Indicación anotada. La ve el conector antes de trabajar el lote.');
      setInstruccion('');
      setInstruccionAbierta(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo anotar la indicación.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Saca al contacto del lote ya: la fila queda rechazada sin esperar a aprobar.
   * A diferencia de destildar, esto también funciona con filas ya aprobadas
   * (mientras no hayan salido).
   */
  async function quitar(action: ActionRow) {
    if (action.status === 'approved' && !window.confirm(`${action.name} ya estaba aprobado. ¿Lo sacamos del lote igual?`)) return;
    setBusy(action.id);
    try {
      const res = await fetch(`${QUEUE_ENDPOINT}/actions/${action.id}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body?.error ?? `Error ${res.status}`));
      setExcluded((current) => {
        const next = new Set(current);
        next.delete(action.id);
        return next;
      });
      toast.success(`${action.name} quedó fuera del lote.`);
      await mutate();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo quitar.');
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
    <div className={cn('flex flex-col', !embebido && 'min-h-[60dvh]')}>
      <div className="flex items-center gap-2 pb-3">
        {!embebido && onBack && (
          <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Volver a la cola">
            <ArrowLeft className="size-4" aria-hidden />
          </Button>
        )}
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

      {/* Indicación para todo el lote: lo que hay que tener en cuenta antes de
          que salga, en un solo lugar en vez de repetido en cada fila. */}
      <div className="mb-3">
        {instruccionAbierta ? (
          <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3" aria-hidden />
              Indicación para todo el lote
            </p>
            <Textarea
              value={instruccion}
              onChange={(e) => setInstruccion(e.target.value)}
              rows={3}
              placeholder="Ej.: antes de mandar, revisá que ninguno haya pagado esta semana; si pagó, saltealo y avisá."
              className="resize-none text-xs"
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setInstruccionAbierta(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy !== null || instruccion.trim().length < 5} onClick={dejarInstruccion}>
                {busy === 'instruccion' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                Anotar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setInstruccionAbierta(true)}>
            <MessageSquarePlus className="size-3.5" aria-hidden />
            Dejar una indicación para este lote
          </Button>
        )}
      </div>

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
                  // El chat abierto en el panel derecho se marca: con la ficha al
                  // lado hay que poder ver de un vistazo a quién se está mirando.
                  selectedChatId === action.chatId && 'border-primary ring-1 ring-primary/30',
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
                      {onOpen ? (
                        // Revisar un lote es decidir si ese mensaje sale: sin
                        // poder abrir la ficha había que memorizar el nombre e
                        // irse a buscarlo a otra vista.
                        <button
                          type="button"
                          onClick={() => onOpen(action.chatId)}
                          className="truncate text-left text-sm font-medium text-foreground underline-offset-2 hover:underline"
                          title="Abrir la ficha del contacto"
                        >
                          {action.name}
                        </button>
                      ) : (
                        <span className="truncate text-sm font-medium text-foreground">{action.name}</span>
                      )}
                      {action.gateAtCreation && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{action.gateAtCreation}</span>}
                      {action.variant && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{action.variant}</span>}
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{STATUS_LABELS[action.status]}</span>
                      {(isPending || action.status === 'approved') && (
                        // Quitar es definitivo para esta fila (queda rechazada);
                        // destildar sólo la deja afuera cuando se apruebe.
                        <button
                          type="button"
                          onClick={() => void quitar(action)}
                          disabled={busy !== null}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          aria-label={`Quitar a ${action.name} del lote`}
                          title="Quitar del lote"
                        >
                          {busy === action.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                        </button>
                      )}
                      {onOpen && (
                        // El nombre subrayado ya abría la ficha, pero nadie lo
                        // descubría: revisar un lote es justamente el momento en
                        // que hace falta el expediente al lado.
                        <button
                          type="button"
                          onClick={() => onOpen(action.chatId)}
                          className={cn('shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground', selectedChatId === action.chatId && 'text-primary')}
                          aria-label={`Abrir la ficha de ${action.name}`}
                          title="Abrir la ficha"
                        >
                          <PanelRightOpen className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                    {editando?.id === action.id ? (
                      <div className="mt-1.5 space-y-1.5">
                        <Textarea
                          value={editando.texto}
                          onChange={(e) => setEditando({ id: action.id, texto: e.target.value })}
                          rows={4}
                          className="resize-none text-sm"
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-1.5">
                          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditando(null)}>
                            Cancelar
                          </Button>
                          <Button type="button" size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={busy !== null} onClick={guardarEdicion}>
                            {busy === action.id ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Save className="size-3" aria-hidden />}
                            Guardar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      text && (
                        <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
                          {text}
                          {isPending && (
                            // Corregir una palabra ya no obliga a excluir al
                            // contacto y armar otro lote sólo para él.
                            <button
                              type="button"
                              onClick={() => setEditando({ id: action.id, texto: text })}
                              className="ml-1.5 inline-flex align-middle text-muted-foreground hover:text-foreground"
                              aria-label={`Corregir el mensaje de ${action.name}`}
                              title="Corregir este texto"
                            >
                              <Pencil className="size-3" aria-hidden />
                            </button>
                          )}
                        </p>
                      )
                    )}
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
                        <span>Aprobado {formatDate(action.approvedAt, true)} · listo para ejecutar</span>
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

      {data && (pending.length > 0 || approved.length > 0) && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-white/90 px-4 py-3 backdrop-blur-sm dark:bg-card/90">
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium tabular-nums text-primary">
                {approvable.length} de {pending.length}
              </span>
            )}
            {excluded.size > 0 && <span className="text-xs text-muted-foreground">{excluded.size} afuera</span>}
            {approved.length > 0 && <span className="text-xs text-muted-foreground">{approved.length} aprobados sin ejecutar</span>}
          </div>
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <>
                <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={reject} className="gap-1.5">
                  {busy === 'reject' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                  Rechazar lote
                </Button>
                <Button type="button" size="sm" disabled={busy !== null || approvable.length === 0} onClick={approve} className="gap-1.5">
                  {busy === 'approve' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                  Aprobar {approvable.length}
                </Button>
              </>
            )}
            {approved.length > 0 && (
              <Button type="button" size="sm" disabled={busy !== null} onClick={execute} className="gap-1.5">
                {busy === 'execute' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
                Ejecutar {approved.length}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
