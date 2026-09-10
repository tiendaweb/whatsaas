'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ArrowLeft, CalendarClock, Check, Loader2, MessageSquarePlus, PanelRightOpen, Pencil, RefreshCw, Save, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { MotivoRechazo } from './MotivoRechazo';
import type { RejectReason } from '@/lib/plugins/sales-ops/shared/taxonomy';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { surfaceCard } from '@/components/escritorio/tokens';
import type { ActionRow, QueueBatchPayload } from '../../shared/api-types';
import { esEjecutableEnServidor, type ActionKind } from '../../shared/taxonomy';
import { KIND_LABELS, PHASE_LABELS, QUEUE_ENDPOINT, ROLE_LABELS, STATUS_LABELS, batchPhase, fetcher, formatDate, postJson, type ApiError } from './api';
import { AbrirChat, AbrirIa } from './AbrirChat';

const PENDING = new Set(['proposed', 'pending_approval']);

/**
 * Qué hace "Aprobar" según el tipo de lote, dicho en el botón.
 *
 * Aprobar ya ejecuta lo que el servidor sabe hacer solo: un programado queda
 * programado, un mensaje sale, una tarea se crea. El botón lo dice para que
 * nadie apriete creyendo que después viene otro paso —y para que con un envío
 * se lea "enviar" antes de confirmar.
 */
function etiquetaAprobar(kind: ActionKind | undefined, n: number): string {
  const verbo: Partial<Record<ActionKind, string>> = {
    send_message: 'enviar',
    schedule_message: 'programar',
    create_task: 'crear',
    request_demo: 'pedir',
    mark_pre_descarte: 'marcar',
    mark_descarte: 'marcar',
    assign_owner: 'asignar',
    schedule_call: 'agendar',
  };
  const v = kind ? verbo[kind] : undefined;
  return v ? `Aprobar y ${v} ${n}` : `Aprobar ${n}`;
}

/** El error crudo de una fila fallida, en castellano. */
function motivoDeFalla(result: Record<string, unknown> | null | undefined): string | null {
  const e = result && typeof result.error === 'string' ? result.error : null;
  if (!e) return null;
  if (e === 'customer_replied') return 'El cliente escribió después de la aprobación: no salió.';
  if (e === 'send_unknown') return 'Timeout: no se sabe si salió. Revisá el chat antes de reintentar.';
  if (e === 'sin_texto') return 'La acción no tiene texto.';
  if (e === 'sin_texto_o_fecha') return 'La acción no tiene texto o fecha de salida.';
  if (e === 'sin_contacto') return 'El chat no tiene ficha de contacto.';
  if (e === 'sin_responsable') return 'La acción no dice a quién asignarlo.';
  if (e === 'manual') return 'Marcado como fallido a mano.';
  return e.slice(0, 200);
}

/**
 * "Revisar lote" (doc 05 §5): lista completa de contactos con checkbox para
 * excluir, texto final por contacto, advertencias resaltadas y dos botones:
 * "Aprobar y <verbo> N" y "Rechazar lote". Aprobar ejecuta en el acto lo que
 * el servidor sabe hacer solo; "Ejecutar" queda para lo que quedó aprobado sin
 * salir (fallas, lotes viejos).
 */
export function RevisarLote({
  batchId,
  onBack,
  onChanged,
  onDecidido,
  reprocesando,
  onOpen,
  onOpenChat,
  onOpenIa,
  selectedChatId,
  embebido,
}: {
  batchId: string;
  /** Sin esto (modo embebido) no hay a dónde volver: el lote ya está a la vista. */
  onBack?: () => void;
  /** Algo cambió en el lote (una edición, una indicación, una fila menos): hay que volver a pedirlo. */
  onChanged?: () => void;
  /**
   * Se decidió el lote entero: aprobado o rechazado. Distinto de `onChanged`:
   * el Focus de supervisión lo usaba para marcar "aprobado" y avanzar, y
   * guardar una corrección disparaba lo mismo que aprobar.
   */
  onDecidido?: (decision: 'aprobado' | 'rechazado') => void;
  /** Abre la ficha del contacto en el panel derecho (misma que en las listas). */
  /** Hay una corrección pedida a la IA sin cerrar: el lote espera que la reescriban. */
  reprocesando?: boolean;
  onOpen?: (chatId: number) => void;
  /** Abre la misma ficha en la pestaña Chat. */
  onOpenChat?: (chatId: number) => void;
  /** Abre la misma ficha en la pestaña IA, para dejarle un pedido al conector. */
  onOpenIa?: (chatId: number) => void;
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
  const [rechazando, setRechazando] = useState(false);
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

  /**
   * Aprobar ejecuta en el mismo request lo que el servidor sabe hacer solo.
   *
   * Antes aprobar dejaba las filas en `approved` y había un segundo botón
   * "Ejecutar" que nadie apretaba: 24 filas de pre-descarte y responsable
   * quedaron aprobadas semanas sin que pasara nada. Ahora aprobar un programado
   * es programarlo. El envío directo sigue pidiendo confirmación, porque es lo
   * único que le llega al cliente y no se deshace.
   */
  async function approve() {
    if (!approvable.length) return;
    const kind = data?.batch.kind;
    const directo = kind ? esEjecutableEnServidor(kind) : false;
    if (kind === 'send_message' && !window.confirm(`Se van a enviar ${approvable.length} mensajes por WhatsApp apenas apruebes. No se pueden deshacer.\n\n¿Seguimos?`)) return;
    setBusy('approve');
    try {
      const result = await postJson<{ approved: number; rejected: number; execution: { executed: number; skipped: number; failed: number; results: Array<{ name: string; status: string; reason?: string }> } | null }>(
        `${QUEUE_ENDPOINT}/${encodeURIComponent(batchId)}/approve`,
        { excludeActionIds: [...excluded], execute: true },
      );
      if (result.execution) {
        const ex = result.execution;
        const partes = [`hechos ${ex.executed}`];
        if (ex.skipped) partes.push(`salteados ${ex.skipped}`);
        if (ex.failed) partes.push(`fallidos ${ex.failed}`);
        setApprovedNotice(`Aprobado ${result.approved} · ${partes.join(' · ')}.`);
        const saltado = ex.results.find((r) => r.status === 'skipped' && r.reason);
        if (saltado) toast.info(`${saltado.name}: ${saltado.reason}`);
        if (ex.failed) toast.error(`${ex.failed} no se pudieron hacer. Mirá el motivo en cada fila.`);
        else toast.success(`Listo: ${partes.join(' · ')}.`);
      } else {
        setApprovedNotice(directo ? `Aprobado ${result.approved}. No se ejecutó: apretá “Ejecutar” abajo.` : `Aprobado ${result.approved}. Este tipo lo hace una persona o un conector: marcá el resultado en cada fila.`);
      }
      setExcluded(new Set());
      await mutate();
      onChanged?.();
      onDecidido?.('aprobado');
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

  /**
   * Rechazar pide el motivo antes de cerrar el lote.
   *
   * El motivo no es burocracia: es el único dato que vuelve al prompt de quien
   * redacta. Sin él, el mismo texto se propone otra vez mañana.
   */
  async function reject(motivo: { code: RejectReason; reason?: string }) {
    setBusy('reject');
    try {
      const result = await postJson<{ rejected: number }>(`${QUEUE_ENDPOINT}/${encodeURIComponent(batchId)}/reject`, {
        reason: motivo.reason,
        code: motivo.code,
      });
      toast.success(`Lote rechazado (${result.rejected} filas). El motivo queda para la próxima redacción.`);
      await mutate();
      onChanged?.();
      onDecidido?.('rechazado');
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
        body: JSON.stringify({
          text: texto,
          title: `Corregir lote · ${data?.batch.batchLabel ?? batchId}`,
          targetKind: 'batch',
          targetRef: batchId,
          mode: 'queue',
          // Aprobada de entrada: la escribió una persona mirando el lote, así
          // que no vuelve a pedir una decisión — va derecho al conector.
          approved: true,
        }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(cuerpo?.error ?? `Error ${res.status}`));
      toast.success('En cola: el conector vuelve a trabajar el lote con esta corrección.');
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

      {/*
        * El lote ya salió de revisión: lo que falta no es decidir, es que un
        * conector lo reescriba. Se dice acá adentro también porque desde la
        * pantalla del lote no hay forma de ver en qué sección de la Cola quedó.
        */}
      {reprocesando && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
          <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            En cola con una corrección pedida: lo reescribe el próximo conector. Salió de «En revisión» y no se envía
            nada hasta que lo apruebes.
          </span>
        </div>
      )}

      {approvedNotice && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>{approvedNotice}</span>
        </div>
      )}

      {/*
        * Pedirle una corrección a la IA.
        *
        * Un lote no siempre se aprueba o se rechaza: la mayoría de las veces
        * está casi bien y lo que falta es decir qué cambiar —"son muy largos",
        * "no menciones el descuento", "saltéate a los que pagaron"—. Eso se
        * anota como una indicación apuntada al LOTE y el lote **sale de
        * revisión y vuelve a la cola**: ya está decidido qué hacer con él, lo
        * que falta es que un conector lo vuelva a escribir.
        *
        * Aprobar sigue siendo lo otro, y sigue ejecutando: son dos caminos
        * distintos y por eso son dos botones distintos.
        */}
      <div className="mb-3">
        {instruccionAbierta ? (
          <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3" aria-hidden />
              Corrección para la IA
            </p>
            <Textarea
              value={instruccion}
              onChange={(e) => setInstruccion(e.target.value)}
              rows={3}
              placeholder="Ej.: los mensajes quedaron largos, acortalos a dos renglones y sacá el «espero tu respuesta»."
              className="resize-none text-xs"
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              El lote sale de revisión y queda en cola: no se envía nada hasta que lo vuelvas a aprobar.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setInstruccionAbierta(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy !== null || instruccion.trim().length < 5} onClick={dejarInstruccion}>
                {busy === 'instruccion' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
                Dejar en cola para reprocesar
              </Button>
            </div>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setInstruccionAbierta(true)}>
            <MessageSquarePlus className="size-3.5" aria-hidden />
            Pedirle una corrección a la IA
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
                      {/* Y la conversación: decidir si este texto sale se hace
                          leyendo lo último que dijo la persona, no sólo su ficha.
                          IA, al lado, para dejarle el pedido siguiente. */}
                      <AbrirChat onOpen={onOpenChat && (() => onOpenChat(action.chatId))} nombre={action.name} className="size-6" />
                      <AbrirIa onOpen={onOpenIa && (() => onOpenIa(action.chatId))} nombre={action.name} className="size-6" />
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
                        <div className="mt-1">
                          <p className="whitespace-pre-wrap text-sm text-foreground/90">{text}</p>
                          {isPending && (
                            /* Corregir una palabra ya no obliga a excluir al
                               contacto y armar otro lote sólo para él. El
                               afford era un lápiz de 12 px metido adentro del
                               párrafo y no lo encontraba nadie: acá es un botón
                               con su etiqueta, debajo del texto que corrige. */
                            <button
                              type="button"
                              onClick={() => setEditando({ id: action.id, texto: text })}
                              className="mt-1 inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="size-3" aria-hidden />
                              Editar el texto
                            </button>
                          )}
                        </div>
                      )
                    )}
                    {/*
                      * Cuándo sale.
                      *
                      * Un lote programado guarda la hora en `scheduledFor` y no
                      * se mostraba en ningún lado: se aprobaba "programar 40"
                      * sin ver para cuándo, y para saberlo había que ir a
                      * Programados después de haberlo aprobado.
                      */}
                    {action.scheduledFor && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                        <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        {action.status === 'executed' || action.status === 'resulted'
                          ? `Programado para ${formatDate(action.scheduledFor, true)}`
                          : `Sale ${formatDate(action.scheduledFor, true)}`}
                      </p>
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
                    {action.status === 'failed' && motivoDeFalla(action.result) && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>{motivoDeFalla(action.result)}</span>
                      </p>
                    )}
                    {action.status === 'approved' && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Aprobado {formatDate(action.approvedAt, true)} · {esEjecutableEnServidor(action.kind) ? 'sin ejecutar: apretá “Ejecutar” abajo' : 'lo hace una persona o un conector'}</span>
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
                <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => setRechazando(true)} className="gap-1.5">
                  {busy === 'reject' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                  Rechazar lote
                </Button>
                <Button type="button" size="sm" disabled={busy !== null || approvable.length === 0} onClick={approve} className="gap-1.5" title={data && esEjecutableEnServidor(data.batch.kind) ? 'Aprobar ya lo ejecuta desde el servidor' : 'Aprobar deja las filas listas para una persona o un conector'}>
                  {busy === 'approve' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
                  {etiquetaAprobar(data?.batch.kind, approvable.length)}
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

      <MotivoRechazo
        open={rechazando}
        onOpenChange={setRechazando}
        titulo={`Rechazar «${data?.batch.batchLabel ?? 'el lote'}»`}
        detalle={`Se rechazan ${pending.length} fila${pending.length === 1 ? '' : 's'} sin decidir. Elegí por qué: el motivo vuelve al prompt de quien redacta.`}
        confirmLabel="Rechazar lote"
        onConfirm={reject}
      />
    </div>
  );
}
