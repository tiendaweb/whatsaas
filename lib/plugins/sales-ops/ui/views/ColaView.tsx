'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Archive, Ban, Check, CheckCircle2, ChevronDown, ChevronUp, CircleHelp, ClipboardCheck, Clock, Inbox, Layers, Loader2, MessageSquareText, Pencil, Plus, Save, Trash2, Wand2, Wrench, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { BatchSummary, QueueListPayload } from '../../shared/api-types';
import { BatchCard } from '../cola/BatchCard';
import { NuevoLoteDialog } from '../cola/NuevoLoteDialog';
import { FilaRun, PROGRAMADOS_API, ProgramadoRow, programadosFetcher } from '../cola/PromptsEnCola';
import { claveTelefono, resolverChats, type ChatDeTelefono, type Programado } from '../programados/api';
import { RevisarLote } from '../cola/RevisarLote';
import { ConectoresCard } from '../cola/ConectoresCard';
import { CRM_FIXES_ENDPOINT, CrmFixItem } from '../cola/CrmFixItem';
import type { CrmFixPendiente } from '../../server/crm';
import { FocusCola, type ItemSupervision } from '../cola/FocusCola';
import { ReintentarFallidas } from '../cola/ReintentarFallidas';
import { QUEUE_ENDPOINT, batchPhase, fetcher } from '../cola/api';
import { FichaDock, type DockItem } from '../components/FichaDock';
import { SALES_OPS_API, fetcher as jsonFetcher, fmtInt, tiempoRelativo } from '../components/format';
import { runEsEditable } from '../../shared/skills';
import { approveRun, cancelRun, deleteRun, editRun, type SkillRun } from '../skills/api';
import { FallaCorrida } from '../skills/FallaCorrida';
import { HumanDecisionCard } from '../cola/HumanDecisionCard';
import { HechoAMano } from '../cola/HechoAMano';

type Seccion = 'decision' | 'revision' | 'cola' | 'hechos' | 'descartados';
type Tipo = 'lote' | 'indicacion' | 'prompt' | 'programado' | 'crm';

type Item =
  | { key: string; tipo: 'lote'; seccion: Seccion; fecha: string; batch: BatchSummary }
  | { key: string; tipo: 'indicacion' | 'prompt'; seccion: Seccion; fecha: string; run: SkillRun }
  | { key: string; tipo: 'programado'; seccion: Seccion; fecha: string; programado: Programado }
  | { key: string; tipo: 'crm'; seccion: Seccion; fecha: string; crm: CrmFixPendiente };

const TIPO_LABELS: Record<Tipo, string> = { lote: 'Lotes', indicacion: 'Indicaciones', prompt: 'Prompts', programado: 'Programados', crm: 'CRM' };
const TIPO_ICONS: Record<Tipo, LucideIcon> = { lote: Layers, indicacion: MessageSquareText, prompt: Wand2, programado: Clock, crm: Wrench };
const TIPOS: Tipo[] = ['lote', 'indicacion', 'prompt', 'programado', 'crm'];
/** Lo hecho hace más de esto se archiva: sigue estando, pero no tapa lo reciente. */
const ARCHIVO_MS = 2 * 24 * 60 * 60 * 1000;

const SECCION_HELP: Record<Seccion, string> = {
  decision: '',
  revision: 'Espera una decisión tuya. Aprobar ya lo hace: un programado queda programado, un mensaje sale, una corrección de CRM se aplica. Al conector va sólo lo que necesita leer el chat.',
  cola: 'Ya decidido: sale solo a su hora o lo toma un conector. Acá no se decide nada.',
  hechos: 'Lo que ya salió o ya cerró el conector. Lo de hace más de dos días queda archivado.',
  descartados: 'Rechazado, vencido o cancelado. Queda el rastro; nada se borra.',
};

const VACIO: Record<Seccion, string> = {
  decision: '',
  revision: 'Nada esperando tu decisión. Armá un lote con “Nuevo lote”, proponé una acción desde la ficha de un contacto, o pedíselo al conector.',
  cola: 'Nada en cola. Lo que apruebes o encoles cae acá.',
  hechos: 'Todavía no hay nada hecho.',
  descartados: 'Nada descartado.',
};

/**
 * Vista Cola: todo lo que el equipo puso a hacer, por momento y no por tipo.
 *
 * Antes cada tipo tenía su pestaña —lotes acá, "prompts y programados" allá con
 * sus propias sub-pestañas— y para saber "qué me espera hoy" había que recorrer
 * cuatro listas. Ahora las secciones son los momentos de cualquier cosa:
 *
 *  - **En revisión**: lo que espera una decisión de una persona. Lotes
 *    propuestos, corridas que volvieron y nadie leyó, corridas fallidas,
 *    programados pausados o que fallaron.
 *  - **En cola**: lo ya decidido que va a salir solo o lo toma un conector.
 *  - **Hechos**: el archivo de lo que salió o se leyó.
 *  - **Descartados**: rechazado, vencido, cancelado.
 *
 * Dentro de cada sección se filtra por tipo (lote, indicación, prompt,
 * programado, corrección de CRM) con chips que muestran cuántos hay de cada uno. "Indicación" es
 * un pedido escrito a mano (`promptKey === 'manual'`); "prompt" es una skill
 * del Studio. Las corridas del motor (clasificación, radar) no entran: las
 * muestra la Actividad del Studio.
 */
export function ColaView({ presetChatIds, onOpen, selectedChatId, focusRequest = 0 }: { presetChatIds?: number[]; onOpen?: (chatId: number) => void; selectedChatId?: number | null; focusRequest?: number } = {}) {
  const tQueue = useTranslations('SalesOpsQueue');
  const { data, isLoading, error, mutate } = useSWR<QueueListPayload>(QUEUE_ENDPOINT, fetcher, { refreshInterval: 60_000 });
  const runs = useSWR<{ runs: SkillRun[] }>(`${SALES_OPS_API}/prompts/queue?status=all&engine=exclude&limit=200`, jsonFetcher, { refreshInterval: 60_000 });
  const programados = useSWR(PROGRAMADOS_API, programadosFetcher<Programado>, { revalidateOnFocus: false, refreshInterval: 120_000 });
  /** Correcciones de CRM que dejó la clasificación: una decisión pendiente más, como un lote. */
  const crmFixes = useSWR<{ rows: CrmFixPendiente[] }>(CRM_FIXES_ENDPOINT, jsonFetcher, { refreshInterval: 120_000 });
  const [openBatch, setOpenBatch] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [seccion, setSeccion] = useState<Seccion>('revision');
  const [filtro, setFiltro] = useState<Tipo | 'todos'>('todos');
  const [verArchivados, setVerArchivados] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [supervisando, setSupervisando] = useState(false);
  const handledFocusRequest = useRef(0);

  // Los teléfonos de los programados cruzados con los chats, para abrir la ficha desde la fila.
  const numeros = useMemo(() => Array.from(new Set((programados.data?.rows ?? []).flatMap((p) => p.targetNumbers ?? []))), [programados.data?.rows]);
  const chatsDeTelefono = useSWR<Record<string, ChatDeTelefono>>(numeros.length ? ['cola-programados-chats', ...numeros] : null, () => resolverChats(numeros), { revalidateOnFocus: false });
  const chatDeProgramado = (p: Programado): number | null => {
    for (const n of p.targetNumbers ?? []) {
      const clave = claveTelefono(n);
      const hit = clave ? chatsDeTelefono.data?.[clave] : undefined;
      if (hit) return hit.chatId;
    }
    return null;
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const batch of data?.batches ?? []) {
      const phase = batchPhase(batch.byStatus);
      const sec: Seccion = phase === 'proposed' ? 'revision' : phase === 'approved' ? 'cola' : phase === 'done' ? 'hechos' : 'descartados';
      out.push({ key: `lote-${batch.batchId}`, tipo: 'lote', seccion: sec, fecha: sec === 'revision' ? batch.createdAt : batch.lastActivityAt ?? batch.createdAt, batch });
    }
    for (const run of runs.data?.runs ?? []) {
      // Mismo ciclo que los lotes: sin aprobar → revisión; aprobada → cola;
      // el conector la cierra → hechos; falló → revisión (hay que decidir);
      // cancelada → descartados.
      let sec: Seccion;
      // Reintentada: su reemplazo ya está en la lista. Ésta va a descartados
      // sin importar cómo quedó, para no mostrar el mismo pedido dos veces.
      if (run.relaunchedAs) sec = 'descartados';
      else if (run.status === 'blocked' && run.humanRequest) sec = 'decision';
      else if (run.status === 'queued') sec = run.approved ? 'cola' : 'revision';
      else if (run.status === 'in_progress') sec = 'cola';
      else if (run.status === 'completed') sec = 'hechos';
      else if (run.status === 'cancelled') sec = 'descartados';
      else sec = 'revision'; // failed / blocked
      out.push({ key: `run-${run.id}`, tipo: run.promptKey === 'manual' ? 'indicacion' : 'prompt', seccion: sec, fecha: run.completedAt ?? run.createdAt, run });
    }
    for (const p of programados.data?.rows ?? []) {
      const sec: Seccion = p.status === 'active' ? 'cola' : p.status === 'completed' ? 'hechos' : 'revision';
      out.push({ key: `prog-${p.id}`, tipo: 'programado', seccion: sec, fecha: p.status === 'active' ? (p.nextRunAt ?? p.createdAt ?? '') : (p.lastRunAt ?? p.createdAt ?? ''), programado: p });
    }
    for (const c of crmFixes.data?.rows ?? []) {
      out.push({ key: `crm-${c.chatId}`, tipo: 'crm', seccion: 'revision', fecha: c.analyzedAt ?? '', crm: c });
    }
    return out;
  }, [data?.batches, runs.data?.runs, programados.data?.rows, crmFixes.data?.rows]);

  const porSeccion = useMemo(() => {
    const map: Record<Seccion, Item[]> = { decision: [], revision: [], cola: [], hechos: [], descartados: [] };
    for (const item of items) map[item.seccion].push(item);
    // En cola lo más próximo primero (programados por hora de salida); en el resto lo más nuevo arriba.
    for (const sec of Object.keys(map) as Seccion[]) map[sec].sort((a, b) => (sec === 'cola' ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha)));
    return map;
  }, [items]);

  // Hechos: lo de hace más de dos días queda archivado (a un clic), así la lista muestra lo reciente.
  const corte = new Date(Date.now() - ARCHIVO_MS).toISOString();
  const archivados = seccion === 'hechos' ? porSeccion.hechos.filter((i) => i.fecha < corte) : [];
  const enSeccion = seccion === 'hechos' && !verArchivados ? porSeccion.hechos.filter((i) => i.fecha >= corte) : porSeccion[seccion];
  const conteoTipos = useMemo(() => {
    const c: Record<Tipo, number> = { lote: 0, indicacion: 0, prompt: 0, programado: 0, crm: 0 };
    for (const item of enSeccion) c[item.tipo] += 1;
    return c;
  }, [enSeccion]);
  const visibles = filtro === 'todos' ? enSeccion : enSeccion.filter((i) => i.tipo === filtro);
  const cargando = isLoading || (runs.isLoading && !runs.data) || (programados.isLoading && !programados.data);

  const refrescar = () => {
    void mutate();
    void runs.mutate();
    void programados.mutate();
    void crmFixes.mutate();
  };

  /**
   * Lo que espera una decisión de una persona, en el orden en que conviene
   * mirarlo: primero lo bloqueado (sin eso el conector no avanza), después el
   * resto de la revisión. Es exactamente lo que el Focus de supervisión recorre.
   */
  /** Las corridas que fallaron, para poder reintentarlas todas juntas. */
  const fallidas = useMemo(
    () => (runs.data?.runs ?? []).filter((r) => r.status === 'failed' && !r.relaunchedAs),
    [runs.data?.runs],
  );

  const paraSupervisar = useMemo<ItemSupervision[]>(
    () =>
      [...porSeccion.decision, ...porSeccion.revision].map((item) => {
        // El chat del ítem: es lo que alimenta el panel de la derecha (chat,
        // resumen y CRM). Un lote toca muchos contactos, así que no tiene uno.
        const chatId =
          item.tipo === 'lote'
            ? null
            : item.tipo === 'programado'
              ? chatDeProgramado(item.programado)
              : item.tipo === 'crm'
                ? item.crm.chatId
                : item.run.targetKind === 'chat'
                  ? Number(item.run.targetId) || null
                  : null;
        const { seccion: _seccion, ...resto } = item;
        return { ...resto, chatId } as ItemSupervision;
      }),
    // `chatDeProgramado` depende del mapa de teléfonos, que llega aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porSeccion.decision, porSeccion.revision, chatsDeTelefono.data],
  );

  useEffect(() => {
    if (!focusRequest || handledFocusRequest.current === focusRequest || cargando) return;
    handledFocusRequest.current = focusRequest;
    if (!paraSupervisar.length) {
      toast.info('No hay decisiones pendientes para revisar.');
      return;
    }
    setSupervisando(true);
  }, [cargando, focusRequest, paraSupervisar.length]);

  if (openBatch) {
    return <RevisarLote batchId={openBatch} onBack={() => setOpenBatch(null)} onChanged={refrescar} onOpen={onOpen} selectedChatId={selectedChatId} />;
  }

  if (supervisando) {
    return (
      <FocusCola
        items={paraSupervisar}
        onSalir={() => {
          setSupervisando(false);
          refrescar();
        }}
        onCambio={refrescar}
      />
    );
  }

  /** Vacía Descartados: borra lotes y corridas descartadas, uno por uno, con lo que falle a la vista. */
  const limpiarDescartados = async () => {
    const lotes = porSeccion.descartados.filter((i): i is Extract<Item, { tipo: 'lote' }> => i.tipo === 'lote');
    const corridas = porSeccion.descartados.filter((i): i is Extract<Item, { tipo: 'indicacion' | 'prompt' }> => i.tipo === 'indicacion' || i.tipo === 'prompt');
    const total = lotes.length + corridas.length;
    if (!total || !window.confirm(`¿Eliminar por completo ${total} elemento${total === 1 ? '' : 's'} descartado${total === 1 ? '' : 's'}? No se puede deshacer.`)) return;
    setLimpiando(true);
    const resultados = await Promise.allSettled([
      ...lotes.map((i) => fetch(`${QUEUE_ENDPOINT}/${encodeURIComponent(i.batch.batchId)}`, { method: 'DELETE' }).then((r) => (r.ok ? r : Promise.reject(new Error(`lote ${i.batch.batchLabel}`))))),
      ...corridas.map((i) => deleteRun(i.run.id)),
    ]);
    setLimpiando(false);
    const fallidos = resultados.filter((r) => r.status === 'rejected').length;
    if (fallidos) toast.error(`${fallidos} no se pudieron eliminar (los lotes con envíos que ya salieron se conservan).`);
    else toast.success('Descartados vaciados.');
    refrescar();
  };

  const secciones: Array<DockItem<Seccion>> = [
    { id: 'decision', label: tQueue('decisionLabel'), icon: CircleHelp, badge: porSeccion.decision.length },
    { id: 'revision', label: 'En revisión', icon: ClipboardCheck, badge: porSeccion.revision.length },
    { id: 'cola', label: 'En cola', icon: Inbox, badge: porSeccion.cola.length },
    { id: 'hechos', label: 'Hechos', icon: CheckCircle2, badge: porSeccion.hechos.length },
    { id: 'descartados', label: 'Descartados', icon: Ban, badge: porSeccion.descartados.length },
  ];

  return (
    <div className="flex min-h-[60dvh] flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">{seccion === 'decision' ? tQueue('decisionHelp') : SECCION_HELP[seccion]}</p>
        <ReintentarFallidas runs={fallidas} onListo={refrescar} />
        {seccion === 'decision' ? (
          porSeccion.decision.length > 0 && (
            <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              {tQueue('decisionCount', { count: porSeccion.decision.length })}
            </span>
          )
        ) : seccion === 'descartados' ? (
          <Button type="button" size="sm" variant="outline" disabled={limpiando || porSeccion.descartados.length === 0} onClick={() => void limpiarDescartados()} className="h-8 shrink-0 gap-1.5">
            {limpiando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
            <span className="hidden sm:inline">Limpiar descartados</span>
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => setCreating(true)} className="h-8 shrink-0 gap-1.5">
            <Plus className="size-4" aria-hidden />
            <span className="hidden sm:inline">Nuevo lote</span>
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
        <FichaDock items={secciones} active={seccion} onChange={setSeccion} />

        {/* Filtro por tipo: chips con conteo. "Todos" siempre; los demás sólo si hay algo de ese tipo en la sección. */}
        <div className="flex gap-1 overflow-x-auto border-b border-border/60 px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Chip activo={filtro === 'todos'} onClick={() => setFiltro('todos')} label="Todos" n={enSeccion.length} />
          {seccion === 'hechos' && archivados.length > 0 && (
            <Chip activo={verArchivados} onClick={() => setVerArchivados((v) => !v)} label={verArchivados ? 'Ocultar archivados' : 'Archivados'} n={archivados.length} Icon={Archive} />
          )}
          {TIPOS.map((tipo) => {
            const Icon = TIPO_ICONS[tipo];
            return <Chip key={tipo} activo={filtro === tipo} onClick={() => setFiltro(tipo)} label={TIPO_LABELS[tipo]} n={conteoTipos[tipo]} Icon={Icon} atenuado={conteoTipos[tipo] === 0} />;
          })}
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{String(error.message)}</div>}
          {cargando && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          )}

          {!cargando && (
            <div className="space-y-4">
              {visibles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {filtro === 'todos' ? (seccion === 'decision' ? tQueue('decisionEmpty') : VACIO[seccion]) : `Sin ${TIPO_LABELS[filtro].toLowerCase()} en esta sección.`}
                </div>
              ) : (
                <ul className="space-y-2">
                  {visibles.map((item) => (
                    <li key={item.key}>
                      {item.tipo === 'lote' ? (
                        <BatchCard
                          batch={item.batch}
                          onOpen={setOpenBatch}
                          onDiscarded={seccion === 'revision' || seccion === 'cola' ? refrescar : undefined}
                          onDeleted={seccion === 'descartados' ? refrescar : undefined}
                        />
                      ) : item.tipo === 'programado' ? (
                        <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2">
                          <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <ProgramadoRow item={item.programado} chatId={chatDeProgramado(item.programado)} onOpen={onOpen} onChanged={() => void programados.mutate()} />
                        </div>
                      ) : item.tipo === 'crm' ? (
                        <CrmFixItem item={item.crm} onOpen={onOpen} onResuelto={() => void crmFixes.mutate()} />
                      ) : (
                        <RunItem run={item.run} tipo={item.tipo} seccion={seccion} onOpen={onOpen} onChanged={() => void runs.mutate()} />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {seccion === 'cola' && (filtro === 'todos' || filtro === 'indicacion' || filtro === 'prompt') && <ConectoresCard />}
            </div>
          )}
        </div>
      </div>

      <NuevoLoteDialog
        open={creating}
        onOpenChange={setCreating}
        presetChatIds={presetChatIds}
        onCreated={(batchId) => {
          void mutate();
          setOpenBatch(batchId);
        }}
      />
    </div>
  );
}

function Chip({ activo, onClick, label, n, Icon, atenuado }: { activo: boolean; onClick: () => void; label: string; n: number; Icon?: LucideIcon; atenuado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-colors',
        activo ? 'border-transparent bg-foreground font-medium text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
        atenuado && !activo && 'opacity-50',
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {label}
      <span className="tabular-nums opacity-70">{fmtInt(n)}</span>
    </button>
  );
}

/**
 * Una corrida (indicación o prompt) en la sección que le toca, con el mismo
 * ciclo que un lote: en revisión se lee entera, se edita ahí mismo y se
 * aprueba o descarta; en cola espera al conector; el conector la cierra y pasa
 * a hechos con su respuesta; descartada, se puede eliminar del todo.
 *
 * Corregir el texto es para **todo lo que espera una decisión**, no sólo lo que
 * está sin aprobar: una fallida se corrige y se reintenta con el texto nuevo, y
 * una frenada pidiendo criterio se corrige antes de contestarle. Es la misma
 * regla que aplica el servidor (`runEsEditable`), así que la pantalla nunca
 * ofrece un botón que la API va a rechazar.
 */
function RunItem({ run, tipo, seccion, onOpen, onChanged }: { run: SkillRun; tipo: 'indicacion' | 'prompt'; seccion: Seccion; onOpen?: (chatId: number) => void; onChanged: () => void }) {
  const tQueue = useTranslations('SalesOpsQueue');
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(run.title);
  const [texto, setTexto] = useState(run.text);
  const [ocupado, setOcupado] = useState<'guardar' | 'aprobar' | 'descartar' | 'eliminar' | null>(null);
  const Icon = TIPO_ICONS[tipo];
  const pideDecision = run.status === 'blocked' && Boolean(run.humanRequest);
  const fallida = run.status === 'failed' || (run.status === 'blocked' && !run.humanRequest);
  const enRevisionSinAprobar = seccion === 'revision' && run.status === 'queued' && !run.approvedAt;
  /** Se corrige mientras espera una decisión: sin aprobar, fallida o pidiendo criterio. */
  const puedeCorregir = (seccion === 'revision' || seccion === 'decision') && runEsEditable(run.status);
  const cuerpo = run.output ?? run.summary;

  const correr = async (que: typeof ocupado, fn: () => Promise<unknown>, ok: string) => {
    setOcupado(que);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setOcupado(null);
    }
  };

  const guardar = () =>
    correr(
      'guardar',
      async () => {
        if (texto.trim().length < 5) throw new Error('El texto es obligatorio (mínimo 5 caracteres).');
        await editRun(run.id, { text: texto.trim(), title: titulo.trim() || run.title });
        setEditando(false);
      },
      fallida ? 'Corregido. Reintentala para correrla con el texto nuevo.' : 'Guardado. Sigue en revisión hasta que lo apruebes.',
    );
  const aprobar = () => correr('aprobar', () => approveRun(run.id), 'Aprobado: pasa a la cola y lo toma el próximo conector.');
  const descartar = () => {
    if (run.status === 'in_progress' && !window.confirm('Un conector la está ejecutando. ¿Descartarla igual?')) return;
    void correr('descartar', () => cancelRun(run.id), 'Descartada.');
  };
  const eliminar = () => {
    if (!window.confirm(`¿Eliminar "${run.title}" por completo? No se puede deshacer.`)) return;
    void correr('eliminar', () => deleteRun(run.id), 'Eliminada.');
  };

  return (
    <div
      className={cn('rounded-xl border bg-card px-3 py-2', enRevisionSinAprobar ? 'border-amber-500/40' : 'border-border')}
      // El estado en el DOM: quien maneje esto desde un navegador (una persona
      // con lector de pantalla o un agente) sabe qué se puede hacer sin tener
      // que deducirlo del color del borde.
      data-run-id={run.id}
      data-run-status={run.status}
      data-run-editable={puedeCorregir ? 'true' : 'false'}
      aria-busy={ocupado !== null}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn('mt-0.5 size-4 shrink-0', tipo === 'prompt' ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
        <div className="min-w-0 flex-1">
          {editando ? (
            <Input id={`run-${run.id}-titulo`} aria-label="Título de la corrida" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-8 text-sm" maxLength={160} />
          ) : (
            <FilaRun run={run} onOpen={onOpen} compact={seccion === 'revision' || seccion === 'cola' || seccion === 'decision'} />
          )}
        </div>
        {(seccion === 'cola' || seccion === 'revision' || seccion === 'decision') && !editando && (
          <button type="button" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Descartar" title="Descartar" disabled={ocupado !== null} onClick={descartar}>
            {ocupado === 'descartar' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
          </button>
        )}
        {seccion === 'descartados' && (
          <button type="button" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Eliminar por completo" title="Eliminar por completo" disabled={ocupado !== null} onClick={eliminar}>
            {ocupado === 'eliminar' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
          </button>
        )}
      </div>

      {/* Acá el texto se lee entero y se corrige ahí mismo: aprobar es firmar ese texto. */}
      {puedeCorregir && (
        <div className="mt-2 space-y-2">
          {editando ? (
            <Textarea
              id={`run-${run.id}-texto`}
              aria-label={`Texto de la corrida ${run.title}`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              className="resize-y text-xs"
              autoFocus
            />
          ) : (
            <pre className={cn('whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-2.5 font-sans text-xs leading-relaxed text-foreground/90', !abierta && 'line-clamp-6')}>{run.text}</pre>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {!editando && run.text.length > 400 ? (
              <button type="button" className="text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAbierta((v) => !v)}>
                {abierta ? 'Ver menos' : 'Ver todo el prompt'}
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1.5">
              {editando ? (
                <>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={ocupado !== null} onClick={() => { setEditando(false); setTexto(run.text); setTitulo(run.title); }}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 px-2 text-[11px]" disabled={ocupado !== null} onClick={() => void guardar()}>
                    {ocupado === 'guardar' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Save className="size-3" aria-hidden />}
                    Guardar
                  </Button>
                </>
              ) : (
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[11px]" disabled={ocupado !== null} aria-label={`Editar el texto de ${run.title}`} onClick={() => setEditando(true)}>
                  <Pencil className="size-3" aria-hidden />
                  Editar
                </Button>
              )}
              {/* Aprobar es sólo de la que espera aprobación: una fallida se
                  reintenta (abajo) y una que pide criterio se contesta. */}
              {enRevisionSinAprobar && (
                <Button type="button" size="sm" className="h-7 gap-1.5 px-2 text-[11px]" disabled={ocupado !== null || editando} onClick={() => void aprobar()}>
                  {ocupado === 'aprobar' ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
                  Aprobar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* En cola el prompt se lee pero no se toca; en decisión ya lo muestra el
          bloque editable de arriba, así que no se repite. */}
      {seccion === 'cola' && (
        <div className="mt-2 rounded-lg border border-border/70 bg-muted/35 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{tQueue('promptFull')}</p>
            {run.text.length > 240 && (
              <button
                type="button"
                className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={abierta}
                onClick={() => setAbierta((value) => !value)}
              >
                {abierta ? <ChevronUp className="size-3" aria-hidden /> : <ChevronDown className="size-3" aria-hidden />}
                {abierta ? tQueue('seeLess') : tQueue('seeFull')}
              </button>
            )}
          </div>
          <pre className={cn('mt-1 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-foreground/85', !abierta && 'line-clamp-4')}>{run.text}</pre>
        </div>
      )}

      {pideDecision && run.humanRequest && (
        <HumanDecisionCard run={run} onAnswered={() => onChanged()} />
      )}

      {fallida && (
        <FallaCorrida run={run} className="mt-1.5" onRetried={onChanged} />
      )}

      {!fallida && !puedeCorregir && cuerpo && run.status === 'completed' && (
        <div className="mt-1.5">
          <p className={cn('whitespace-pre-wrap text-xs text-muted-foreground', !abierta && 'line-clamp-3')}>{cuerpo}</p>
          {cuerpo.length > 200 && (
            <button type="button" className="mt-0.5 text-[11px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setAbierta((v) => !v)}>
              {abierta ? 'Ver menos' : 'Ver todo'}
            </button>
          )}
        </div>
      )}

      {seccion === 'cola' && run.status === 'queued' && (
        <p className="mt-1 text-[11px] text-muted-foreground">Aprobado{run.approvedAt ? ` ${tiempoRelativo(run.approvedAt)}` : ''} · espera al próximo conector.</p>
      )}

      {/* Lo que espera conector también se resuelve a mano: contestar por el
          chat, programar desde la ficha, cargar lo que pida, y cerrarla acá. */}
      {(seccion === 'cola' || seccion === 'revision' || seccion === 'decision') && (run.status === 'queued' || run.status === 'blocked' || run.status === 'failed' || run.status === 'in_progress') && (
        <div className="mt-2">
          <HechoAMano run={run} onHecho={onChanged} />
        </div>
      )}
    </div>
  );
}
