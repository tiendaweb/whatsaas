'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { preload } from 'swr';
import { ArrowLeft, Check, Loader2, MessageSquare, Pause, Play, SlidersHorizontal, Timer } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DetailPayload, OverviewPayload } from '../../shared/api-types';
import type { OwnerFilterValue } from '../components/OwnerFilter';
import { FiltroSituacion } from '../components/FiltroSituacion';
import { SALES_OPS_API, fetcher, fmtInt } from '../components/format';
import { AvisoBloque } from '../focus/AvisoBloque';
import { Confeti } from '../focus/Confeti';
import { PanelContacto, type SolapaContacto } from '../focus/PanelContacto';
import { Reloj } from '../focus/Reloj';
import { useAtajosTeclado } from '../focus/useAtajosTeclado';
import { useBloque } from '../focus/useBloque';
import { porcentaje, useColaFocus } from '../focus/useColaFocus';
import { TarjetaNoelia } from './TarjetaNoelia';
import type { AccionesTarjetaHandle } from './AccionesTarjeta';
import {
  ETAPAS_NOELIA,
  ETAPA_NOELIA_META,
  FILTROS_NOELIA,
  LS_BLOQUE_NOELIA,
  type EtapaNoelia,
  type FiltrosNoelia,
} from './tipos';

type Detalle = DetailPayload & { header: { chatId: number; name: string; customData: Record<string, unknown> } };
const detalleUrl = (chatId: number) => `${SALES_OPS_API}/contacts/${chatId}`;

const BTN_GHOST = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-[var(--mn-line)] bg-transparent px-3 text-[13px] font-black text-[var(--mn-text)] outline-none transition-colors hover:border-[var(--mn-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]';

/**
 * Modo Noelia: la interfaz de decisión humana de TORRE.
 *
 * Sigue la maqueta de `aapp.space/business-command#modo-noelia` —cuatro colas
 * con contador, progreso, una sola tarjeta de decisión— pero con el negro del
 * Command Center en vez de los azules de la landing, y en **una sola pantalla**:
 * nada de la cabina scrollea, sólo el mensaje adentro de su caja. Un cliente,
 * una decisión, siguiente.
 */
export function NoeliaView({ owner, onSalir }: { owner: OwnerFilterValue; onSalir: () => void }) {
  const [filtros, setFiltros] = useState<FiltrosNoelia>(FILTROS_NOELIA);
  const [chatMovil, setChatMovil] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [solapa, setSolapa] = useState<SolapaContacto>('chat');
  const acciones = useRef<AccionesTarjetaHandle | null>(null);
  const cola = useColaFocus(filtros, owner, ETAPAS_NOELIA);
  const bloque = useBloque(LS_BLOQUE_NOELIA);
  const chatId = cola.actual?.chatId ?? null;
  const { data: detalle, error: detalleError, mutate } = useSWR<Detalle>(chatId ? detalleUrl(chatId) : null, fetcher, { revalidateOnFocus: false });
  const { data: overview } = useSWR<OverviewPayload>(`${SALES_OPS_API}/overview`, fetcher, { refreshInterval: 60_000 });

  useEffect(() => {
    const anterior = document.title;
    const scroll = document.body.style.overflow;
    document.title = 'Modo Noelia — Command Center';
    document.body.style.overflow = 'hidden';
    return () => { document.title = anterior; document.body.style.overflow = scroll; };
  }, []);

  useEffect(() => {
    if (!bloque.hayBloque) bloque.arrancar('foco');
    // Sólo al entrar: el bloque persiste por su propia clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setChatMovil(false);
    setSolapa('chat');
    if (cola.siguiente) preload(detalleUrl(cola.siguiente.chatId), fetcher).catch(() => {});
  }, [chatId, cola.siguiente]);

  const saltar = useCallback(() => {
    if (chatId) cola.marcar(chatId, 'saltado');
  }, [chatId, cola]);
  const resuelto = useCallback(() => {
    if (chatId) cola.marcar(chatId, 'encolado');
  }, [chatId, cola]);

  const teclas = useMemo(() => ({
    a: () => acciones.current?.enviar(),
    e: () => acciones.current?.editar(),
    i: () => acciones.current?.ia(),
    g: () => acciones.current?.programar(),
    c: () => acciones.current?.cola(),
    p: () => acciones.current?.posponer(),
    d: () => acciones.current?.prompt(),
    x: () => acciones.current?.excluir(),
  }), []);
  useAtajosTeclado({ onAnterior: cola.retroceder, onSiguiente: cola.avanzar, onSaltar: saltar, acciones: teclas });

  const elegirEtapa = (etapa: EtapaNoelia) => setFiltros((actual) => ({ ...actual, etapas: [etapa] }));
  const siguienteEtapa = cola.etapas[cola.etapaIdx + 1] ?? null;
  const pct = porcentaje(cola.procesadosEtapa, cola.total);
  const counts: Record<EtapaNoelia, number> = {
    dinero: overview?.counters.moneyNow ?? 0,
    oportunidades: overview?.counters.opportunities ?? 0,
    barrido: overview?.counters.sweep ?? 0,
    revisar: overview?.audit.review ?? 0,
  };

  const body = (() => {
    if (cola.error) return <Aviso titulo="No se pudo cargar la cola" detalle={cola.error} accion="Reintentar" onAccion={cola.recargar} />;
    if (cola.cargando) return <Analizando />;
    if (cola.terminada || !cola.actual) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-[var(--mn-box-line)] bg-[var(--mn-case)] p-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-[var(--mn-msg-bg)] text-[var(--mn-green)]"><Check className="size-6" aria-hidden /></span>
          <h2 className="mt-3 text-lg font-black">TODO REVISADO</h2>
          <p className="mt-1 text-sm text-[var(--mn-muted)]">Hoy no hay prioridad visible en {ETAPA_NOELIA_META[cola.etapa].label.toLowerCase()}.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {siguienteEtapa && <button type="button" className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[var(--mn-accent)] px-4 text-[13px] font-black text-[#150a26]" onClick={cola.pasarASiguienteEtapa}>VER {ETAPA_NOELIA_META[siguienteEtapa].label.toUpperCase()}</button>}
            <button type="button" className={BTN_GHOST} onClick={onSalir}>VOLVER AL COMMAND CENTER</button>
          </div>
        </div>
      );
    }
    if (detalleError) return <Aviso titulo="No se pudo cargar el caso" detalle="La cola conserva tu lugar." accion="Reintentar" onAccion={() => void mutate()} />;
    if (!detalle || detalle.header.chatId !== cola.actual.chatId) return <Analizando />;
    return (
      <TarjetaNoelia
        ref={acciones}
        chatId={cola.actual.chatId}
        detalle={detalle}
        situacion={cola.actual.situacion}
        onVerConversacion={() => setChatMovil(true)}
        onResuelto={resuelto}
        onSaltar={saltar}
        onDetalleCambio={() => void mutate()}
      />
    );
  })();

  return (
    // `dark` además de `modo-noelia`: la cabina es oscura siempre y el panel de
    // contacto usa los tokens del tema, que así son los del Command Center.
    // `overflow-hidden` es la regla de la pantalla: nada scrollea salvo el
    // mensaje y el panel del chat.
    <div className="dark modo-noelia fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-[var(--mn-bg)] text-[var(--mn-text)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--mn-shell-line)] bg-[var(--mn-shell)] px-2 py-1.5 sm:px-3">
        <button type="button" onClick={onSalir} className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[13px] font-black text-[var(--mn-muted)] hover:text-[var(--mn-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]">
          <ArrowLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Salir</span>
        </button>
        <p className="shrink-0 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--mn-accent)]">⚡ Noelia</p>

        {/* Progreso: ocupa el medio y el texto se achica en pantallas chicas. */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--mn-track)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="mn-progress-fill h-full rounded-full transition-[width] duration-[250ms]" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] font-black tabular-nums text-[var(--mn-muted)]">{fmtInt(cola.procesadosEtapa)}/{fmtInt(cola.total)}</span>
        </div>

        <button
          type="button"
          onClick={() => setChatMovil(true)}
          disabled={!chatId}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--mn-line)] px-2 text-[11px] font-black text-[var(--mn-muted)] hover:border-[var(--mn-accent)] disabled:opacity-40 xl:hidden"
        >
          <MessageSquare className="size-3.5" aria-hidden /> Chat
        </button>
        {/* La cabina es una sola pantalla y no scrollea, así que los filtros
            viven en una hoja: el pedido de "quiero ver sólo los que contestaron
            y nadie fue" no puede costar salir del modo. */}
        <button
          type="button"
          onClick={() => setFiltrosAbiertos(true)}
          aria-label="Filtros de la cola"
          className={cn(
            'flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-black hover:border-[var(--mn-accent)]',
            filtros.situaciones.length || filtros.cliente
              ? 'border-[var(--mn-accent)] text-[var(--mn-accent)]'
              : 'border-[var(--mn-line)] text-[var(--mn-muted)]',
          )}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {filtros.situaciones.length > 0 && <span className="tabular-nums">{filtros.situaciones.length}</span>}
        </button>
        <button
          type="button"
          onClick={() => !bloque.hayBloque ? bloque.arrancar('foco') : bloque.pausado ? bloque.reanudar() : bloque.pausar()}
          className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[var(--mn-line)] px-2 font-mono text-[11px] tabular-nums text-[var(--mn-muted)]"
        >
          {!bloque.hayBloque ? <Timer className="size-3.5" aria-hidden /> : bloque.pausado ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          <span className="hidden sm:inline">{bloque.hayBloque ? <Reloj terminaEn={bloque.terminaEn} pausadoCon={bloque.pausadoCon} /> : '25:00'}</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-3">
          {/* Las cuatro colas, en una fila que no se corta en ningún ancho. */}
          <div className="grid shrink-0 grid-cols-4 gap-1.5" role="tablist" aria-label="Colas de decisión">
            {ETAPAS_NOELIA.map((etapa) => {
              const activa = cola.etapa === etapa;
              const meta = ETAPA_NOELIA_META[etapa];
              return (
                <button
                  key={etapa}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  title={meta.hint}
                  onClick={() => elegirEtapa(etapa)}
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-1.5 rounded-xl border bg-[var(--mn-panel)] px-1 text-[var(--mn-text)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]',
                    activa ? 'border-[var(--mn-accent)] shadow-[inset_0_0_0_1px_var(--mn-accent-soft)]' : 'border-[var(--mn-kpi-line)] hover:border-[var(--mn-accent)]',
                  )}
                >
                  <span aria-hidden>{meta.emoji}</span>
                  <span className="hidden truncate text-[10px] font-black uppercase text-[var(--mn-muted)] min-[560px]:inline">{meta.label}</span>
                  <b className="text-base font-black tabular-nums leading-none">{fmtInt(counts[etapa])}</b>
                </button>
              );
            })}
          </div>

          {body}
        </div>

        {/* El mismo panel de contacto que usa Focus, fijo al costado. */}
        <aside className="hidden shrink-0 flex-col border-l border-[var(--mn-shell-line)] bg-[var(--mn-shell)] p-2 xl:flex xl:w-[400px] 2xl:w-[440px]" aria-label="Conversación">
          {chatId ? <PanelContacto chatId={chatId} solapa={solapa} onSolapa={setSolapa} className="min-h-0 flex-1" /> : null}
        </aside>
      </div>

      <Confeti activo={cola.terminada && cola.procesadosEtapa > 0} />

      <Sheet open={chatMovil} onOpenChange={setChatMovil}>
        <SheetContent side="right" className="dark flex w-full max-w-full flex-col p-0 sm:max-w-xl">
          <SheetTitle className="border-b border-border px-4 py-3 text-base">Conversación</SheetTitle>
          {chatId && <PanelContacto chatId={chatId} solapa={solapa} onSolapa={setSolapa} className="min-h-0 flex-1 p-3" />}
        </SheetContent>
      </Sheet>

      <Sheet open={filtrosAbiertos} onOpenChange={setFiltrosAbiertos}>
        <SheetContent side="bottom" className="dark max-h-[80vh] overflow-y-auto rounded-t-2xl p-4">
          <SheetTitle className="text-base">Filtros de la cola</SheetTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            La cola se rearma al tocar. Sin nada tildado entran todos los casos de la etapa.
          </p>
          <FiltroSituacion
            className="mt-3"
            situaciones={filtros.situaciones}
            cliente={filtros.cliente}
            onSituaciones={(situaciones) => setFiltros((f) => ({ ...f, situaciones }))}
            onCliente={(cliente) => setFiltros((f) => ({ ...f, cliente }))}
          />
        </SheetContent>
      </Sheet>

      <AvisoBloque
        abierto={bloque.mostrarAviso}
        tipo={bloque.tipo}
        hechos={cola.enBloque}
        onOtroBloque={() => { bloque.arrancar('foco'); cola.reiniciarBloque(); }}
        onDescanso={() => bloque.arrancar('descanso')}
        onSalir={onSalir}
      />
    </div>
  );
}

function Analizando() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-[var(--mn-box-line)] bg-[var(--mn-case)] p-6 text-center" aria-busy="true">
      <b className="flex items-center gap-2 text-sm font-black">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Analizando conversaciones…
      </b>
      <div className="mt-3 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--mn-track)]">
        <div className="mn-progress-fill h-full w-1/3 rounded-full motion-safe:animate-pulse" />
      </div>
      <small className="mt-3 block text-[12px] text-[var(--mn-dim)]">Buscando intención, bloqueos, pagos y próximos pasos.</small>
    </div>
  );
}

function Aviso({ titulo, detalle, accion, onAccion }: { titulo: string; detalle: string; accion: string; onAccion: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-[var(--mn-amber-soft)] bg-[var(--mn-amber-bg)] p-6 text-center">
      <h2 className="text-base font-black text-[var(--mn-amber-soft)]">{titulo}</h2>
      <p className="mt-1 text-sm text-[var(--mn-soft)]">{detalle}</p>
      <button type="button" className={cn(BTN_GHOST, 'mt-4')} onClick={onAccion}>{accion.toUpperCase()}</button>
    </div>
  );
}
