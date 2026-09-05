'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Ban, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Layers, Loader2, MessageSquareText,
  Pause, Pencil, Play, Save, SkipForward, Timer, Wand2, X, type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { BatchSummary } from '../../shared/api-types';
import { HumanDecisionCard } from './HumanDecisionCard';
import { QUEUE_ENDPOINT, KIND_LABELS, PHASE_LABELS, batchPhase, formatDate, postJson } from './api';
import { RevisarLote } from './RevisarLote';
import { TarjetaProgramado } from '../programados/TarjetaProgramado';
import type { Programado } from '../programados/api';
import { fmtDateTime, fmtInt, tiempoRelativo } from '../components/format';
import { Reloj } from '../focus/Reloj';
import { porcentaje } from '../focus/useColaFocus';
import { useBloque } from '../focus/useBloque';
import { FallaCorrida } from '../skills/FallaCorrida';
import { approveRun, cancelRun, editRun, type SkillRun } from '../skills/api';
import { RUN_STATUS_LABELS } from '../skills/skill-meta';

/**
 * El violeta es la señal de que esto es otra cosa.
 *
 * El Focus de trabajo es verde: se avanza, se ejecuta, se suma. Éste es de
 * supervisión —se lee lo que otro dejó y se decide si sale o no—, y confundirlos
 * es aprobar algo creyendo que se estaba trabajando un cliente. Por eso el color
 * cambia en toda la pantalla y no sólo en el botón que la abre.
 *
 * Clases literales, sin armar strings: Tailwind v4 no genera lo que no ve.
 */
const TONO = {
  barra: 'border-violet-500/30 bg-violet-500/10',
  acento: 'text-violet-600 dark:text-violet-400',
  barraProgreso: 'bg-violet-500',
  tarjeta: 'border-violet-500/30',
  boton: 'bg-violet-600 text-white hover:bg-violet-700',
  chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
};

export type ItemSupervision =
  | { key: string; tipo: 'lote'; fecha: string; batch: BatchSummary }
  | { key: string; tipo: 'indicacion' | 'prompt'; fecha: string; run: SkillRun }
  | { key: string; tipo: 'programado'; fecha: string; programado: Programado };

const TIPO_META: Record<ItemSupervision['tipo'], { label: string; icon: LucideIcon }> = {
  lote: { label: 'Lote', icon: Layers },
  indicacion: { label: 'Indicación', icon: MessageSquareText },
  prompt: { label: 'Prompt', icon: Wand2 },
  programado: { label: 'Programado', icon: Clock },
};

type Props = {
  items: ItemSupervision[];
  onSalir: () => void;
  /** Se resolvió algo: la Cola vuelve a pedir sus listas. */
  onCambio: () => void;
};

/**
 * Focus de supervisión: revisar de a uno lo que espera una decisión.
 *
 * Es el hermano del Focus de trabajo, pero del otro lado del mostrador: en vez
 * de recorrer clientes para ejecutarles algo, recorre lo que quedó esperando que
 * alguien lo mire —prompts sin aprobar, corridas que fallaron, lotes propuestos,
 * programados pausados— y en cada uno deja hacer lo único que hace falta:
 * leerlo entero, corregirlo si está mal, y aprobarlo o descartarlo.
 *
 * La lista se congela al entrar. Resolver un ítem lo saca del servidor, y si la
 * lista se recalculara sola el siguiente se correría un lugar justo cuando la
 * persona va a apretar: se marca lo resuelto y se avanza el índice, nada más.
 */
export function FocusCola({ items, onSalir, onCambio }: Props) {
  const [idx, setIdx] = useState(0);
  const [resueltos, setResueltos] = useState<Record<string, 'aprobado' | 'descartado' | 'saltado'>>({});
  const [cola] = useState<ItemSupervision[]>(items);
  /**
   * Lote abierto fila por fila, SIN salir del Focus.
   *
   * Antes "Abrir en detalle" cerraba la supervisión y llevaba a la pantalla de
   * revisión: se perdía el índice, el progreso y el bloque, y volver era empezar
   * de nuevo. Ahora la misma pantalla se monta acá adentro y "Volver" devuelve
   * a la tarjeta del lote, en el mismo lugar de la cola.
   */
  const [detalleLote, setDetalleLote] = useState<string | null>(null);
  const bloque = useBloque();

  const actual = cola[idx] ?? null;
  const total = cola.length;
  const revisados = useMemo(() => Object.values(resueltos).filter((v) => v !== 'saltado').length, [resueltos]);
  const pct = porcentaje(revisados, total);

  const marcar = (clave: string, como: 'aprobado' | 'descartado' | 'saltado') => {
    setResueltos((prev) => ({ ...prev, [clave]: como }));
    setDetalleLote(null);
    setIdx((i) => i + 1);
    if (como !== 'saltado') onCambio();
  };

  useEffect(() => {
    const escuchar = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (detalleLote) return;
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(i + 1, total));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', escuchar);
    return () => window.removeEventListener('keydown', escuchar);
  }, [total, detalleLote]);

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-full flex-col bg-background text-foreground">
      <header className={cn('flex h-11 shrink-0 items-center gap-2 border-b px-2 sm:px-3', TONO.barra)}>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground" onClick={onSalir}>
          <ArrowLeft className="size-4" aria-hidden />
          <span className="hidden sm:inline">Salir</span>
        </Button>

        <button
          type="button"
          onClick={() => (!bloque.hayBloque ? bloque.arrancar('foco') : bloque.pausado ? bloque.reanudar() : bloque.pausar())}
          title={!bloque.hayBloque ? 'Arrancar un bloque de 25 minutos' : bloque.pausado ? 'Reanudar' : 'Pausar'}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 font-mono text-sm tabular-nums"
        >
          {!bloque.hayBloque ? <Timer className="size-3.5" aria-hidden /> : bloque.pausado ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          {bloque.hayBloque ? <Reloj terminaEn={bloque.terminaEn} pausadoCon={bloque.pausadoCon} /> : '25:00'}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={cn('hidden shrink-0 text-sm font-semibold sm:inline', TONO.acento)}>Supervisión</span>
          <div className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de la revisión">
            <div className={cn('h-full rounded-full transition-[width] duration-500', TONO.barraProgreso)} style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground" title={`${revisados} revisados · ${Math.max(0, total - revisados)} por revisar`}>
            {fmtInt(revisados)}/{fmtInt(total)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Anterior" title="Anterior (←)">
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setIdx((i) => Math.min(i + 1, total))} disabled={!actual} aria-label="Siguiente" title="Siguiente (→)">
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <span className="hidden px-1 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">#{Math.min(idx + 1, Math.max(total, 1))}</span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        <div className={cn('mx-auto w-full', detalleLote ? 'max-w-[1000px]' : 'max-w-[720px]')}>
          {detalleLote ? (
            <RevisarLote
              batchId={detalleLote}
              onBack={() => setDetalleLote(null)}
              onChanged={onCambio}
            />
          ) : !actual ? (
            <FinDeRevision total={total} revisados={revisados} onSalir={onSalir} onVolver={() => setIdx(0)} />
          ) : (
            <TarjetaSupervision
              key={actual.key}
              item={actual}
              onResuelto={(como) => marcar(actual.key, como)}
              onSaltar={() => marcar(actual.key, 'saltado')}
              onAbrirLote={setDetalleLote}
              onCambio={onCambio}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FinDeRevision({ total, revisados, onSalir, onVolver }: { total: number; revisados: number; onSalir: () => void; onVolver: () => void }) {
  return (
    <div className="py-12 text-center">
      <div className={cn('mx-auto flex size-12 items-center justify-center rounded-full', TONO.chip)}>
        <CheckCircle2 className="size-6" aria-hidden />
      </div>
      <h2 className="mt-3 text-lg font-semibold">Revisaste todo</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {revisados} de {total} resueltos{revisados < total ? `, ${total - revisados} salteados` : ''}.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        {revisados < total && (
          <Button variant="outline" onClick={onVolver}>
            Volver a los salteados
          </Button>
        )}
        <Button className={TONO.boton} onClick={onSalir}>
          Salir
        </Button>
      </div>
    </div>
  );
}

/** El ítem que se está mirando, entero y con lo que se puede hacerle. */
function TarjetaSupervision({
  item,
  onResuelto,
  onSaltar,
  onAbrirLote,
  onCambio,
}: {
  item: ItemSupervision;
  onResuelto: (como: 'aprobado' | 'descartado') => void;
  onSaltar: () => void;
  onAbrirLote: (batchId: string) => void;
  onCambio: () => void;
}) {
  const { label, icon: Icon } = TIPO_META[item.tipo];
  return (
    <article className={cn('rounded-2xl border bg-card p-4', TONO.tarjeta)}>
      <div className="flex items-center gap-2">
        <span className={cn('flex size-7 items-center justify-center rounded-lg', TONO.chip)}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{tiempoRelativo(item.fecha)}</span>
      </div>

      <div className="mt-3">
        {item.tipo === 'lote' ? (
          <CuerpoLote batch={item.batch} onResuelto={onResuelto} onAbrirLote={onAbrirLote} />
        ) : item.tipo === 'programado' ? (
          <CuerpoProgramado programado={item.programado} onResuelto={onResuelto} />
        ) : (
          <CuerpoCorrida run={item.run} onResuelto={onResuelto} onCambio={onCambio} />
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={onSaltar}>
          <SkipForward className="size-3.5" aria-hidden />
          Saltar por ahora
        </Button>
      </div>
    </article>
  );
}

/**
 * Una corrida del Prompt Studio: el texto entero, editable.
 *
 * Es el caso que justifica esta pantalla. En la Cola el texto se ve recortado a
 * dos renglones y corregirlo abre un editor chico; acá se lee completo y se
 * corrige donde se lee, que es cuando uno se da cuenta de lo que está mal.
 */
function CuerpoCorrida({ run, onResuelto, onCambio }: { run: SkillRun; onResuelto: (como: 'aprobado' | 'descartado') => void; onCambio: () => void }) {
  const [titulo, setTitulo] = useState(run.title);
  const [texto, setTexto] = useState(run.text);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const sucio = titulo !== run.title || texto !== run.text;
  const esperandoAprobacion = run.status === 'queued' && !run.approvedAt;
  const necesitaCriterio = run.status === 'blocked' && Boolean(run.humanRequest);
  const fallida = run.status === 'failed' || (run.status === 'blocked' && !run.humanRequest);

  const guardar = async () => {
    setGuardando(true);
    try {
      await editRun(run.id, { title: titulo.trim() || run.title, text: texto });
      toast.success('Corregido.');
      setEditando(false);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const correr = async (accion: 'aprobar' | 'descartar') => {
    setOcupado(true);
    try {
      if (accion === 'aprobar') {
        // Si se corrigió el texto y no se guardó, se guarda antes: aprobar lo
        // viejo después de haberlo editado es el peor final posible.
        if (sucio) await editRun(run.id, { title: titulo.trim() || run.title, text: texto });
        await approveRun(run.id);
        toast.success('Aprobada. La toma el próximo conector.');
        onResuelto('aprobado');
      } else {
        await cancelRun(run.id);
        toast.success('Descartada.');
        onResuelto('descartado');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        {editando ? (
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-8 text-sm font-medium" maxLength={160} />
        ) : (
          <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug">{titulo}</h2>
        )}
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {necesitaCriterio ? 'Necesita tu criterio' : (RUN_STATUS_LABELS[run.status] ?? run.status)}
        </span>
      </div>

      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {run.targetKind === 'chat' ? (run.targetName ?? `chat ${run.targetId}`) : run.targetKind === 'batch' ? `lote ${run.targetName ?? run.targetId}` : 'equipo'}
        {' · '}
        {fmtDateTime(run.createdAt)}
      </p>

      {editando ? (
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={14} className="mt-3 resize-y font-mono text-[12px] leading-relaxed" />
      ) : (
        <pre className="mt-3 max-h-[46vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 font-mono text-[12px] leading-relaxed text-foreground/90">{texto}</pre>
      )}

      {/* Una corrida fallida NO muestra su `summary`: ahí viene el error crudo
          del SDK, y el 429 de Gemini son 900 caracteres de JSON. `FallaCorrida`
          lo dice en castellano y deja el detalle técnico a un clic. */}
      {fallida ? (
        !editando && <FallaCorrida run={run} className="mt-3" onRetried={() => onResuelto('aprobado')} />
      ) : (
        (run.summary || run.output) && !editando && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Lo que devolvió</p>
            <pre className="mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border p-3 text-[12px] leading-relaxed">{run.output ?? run.summary}</pre>
          </div>
        )
      )}

      {necesitaCriterio && (
        <div className="mt-3">
          <HumanDecisionCard run={run} onAnswered={() => onResuelto('aprobado')} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {editando ? (
          <>
            <Button size="sm" className={cn('h-9 gap-1.5', TONO.boton)} onClick={() => void guardar()} disabled={guardando || !sucio}>
              {guardando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Guardar
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => { setTitulo(run.title); setTexto(run.text); setEditando(false); }}>
              <X className="size-4" aria-hidden /> Cancelar
            </Button>
          </>
        ) : (
          <>
            {esperandoAprobacion && (
              <Button size="sm" className={cn('h-9 gap-1.5', TONO.boton)} onClick={() => void correr('aprobar')} disabled={ocupado}>
                {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                {sucio ? 'Guardar y aprobar' : 'Aprobar'}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setEditando(true)}>
              <Pencil className="size-4" aria-hidden />
              Corregir
            </Button>
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => void correr('descartar')} disabled={ocupado}>
              <Ban className="size-4" aria-hidden />
              Descartar
            </Button>
          </>
        )}
      </div>
    </>
  );
}

/** Un lote: el resumen y la decisión. El detalle fila por fila vive en Revisar lote. */
function CuerpoLote({ batch, onResuelto, onAbrirLote }: { batch: BatchSummary; onResuelto: (como: 'aprobado' | 'descartado') => void; onAbrirLote: (batchId: string) => void }) {
  const [ocupado, setOcupado] = useState(false);
  const phase = batchPhase(batch.byStatus);
  const pendientes = (batch.byStatus.proposed ?? 0) + (batch.byStatus.pending_approval ?? 0);

  const correr = async (accion: 'approve' | 'reject') => {
    if (accion === 'reject' && !window.confirm(`¿Descartar el lote “${batch.batchLabel}”? Se rechaza lo que todavía no salió.`)) return;
    setOcupado(true);
    try {
      await postJson(`${QUEUE_ENDPOINT}/${encodeURIComponent(batch.batchId)}/${accion}`, {});
      toast.success(accion === 'approve' ? 'Lote aprobado.' : 'Lote descartado.');
      onResuelto(accion === 'approve' ? 'aprobado' : 'descartado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <h2 className="text-sm font-semibold leading-snug">{batch.batchLabel}</h2>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {KIND_LABELS[batch.kind] ?? batch.kind} · {fmtInt(batch.total)} acciones · {PHASE_LABELS[phase]} · creado {formatDate(batch.createdAt, true)}
      </p>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-border py-2">
          <dd className="font-mono text-base font-semibold tabular-nums">{fmtInt(pendientes)}</dd>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Sin aprobar</dt>
        </div>
        <div className="rounded-lg border border-border py-2">
          <dd className="font-mono text-base font-semibold tabular-nums">{fmtInt(batch.responded)}</dd>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Respondieron</dt>
        </div>
        <div className="rounded-lg border border-border py-2">
          <dd className="font-mono text-base font-semibold tabular-nums">{fmtInt(batch.recovered)}</dd>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Recuperados</dt>
        </div>
      </dl>

      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        Aprobar acá aprueba el lote entero. Si querés mirar fila por fila —corregir un texto, sacar un contacto— abrilo en detalle.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {pendientes > 0 && (
          <Button size="sm" className={cn('h-9 gap-1.5', TONO.boton)} onClick={() => void correr('approve')} disabled={ocupado}>
            {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
            Aprobar las {fmtInt(pendientes)}
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => onAbrirLote(batch.batchId)}>
          <Layers className="size-4" aria-hidden />
          Abrir en detalle
        </Button>
        <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => void correr('reject')} disabled={ocupado}>
          <Ban className="size-4" aria-hidden />
          Descartar
        </Button>
      </div>
    </>
  );
}

/**
 * Un programado, con su editor completo adentro del Focus.
 *
 * Es la misma tarjeta de la app de Programados (`TarjetaProgramado`): edita el
 * texto y la fecha, guarda el prompt, lo reescribe con la IA del equipo, pausa,
 * activa, lo pasa a la cola como pedido y lo borra. Se reusa entera en vez de
 * repetir un editor recortado: un segundo editor con la mitad de los campos es
 * la forma segura de que uno de los dos se quede viejo.
 *
 * `onResuelto` se dispara cuando la tarjeta avisa que cambió algo: en esta
 * pantalla, tocarlo ya es haberlo supervisado.
 */
function CuerpoProgramado({ programado, onResuelto }: { programado: Programado; onResuelto: (como: 'aprobado' | 'descartado') => void }) {
  return (
    <TarjetaProgramado
      item={programado}
      onCambio={() => onResuelto('aprobado')}
    />
  );
}
