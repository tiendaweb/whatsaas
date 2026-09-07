'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { preload } from 'swr';
import { ArrowLeft, Check, Loader2, MessageSquare, Pause, Play, Timer } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DetailPayload, OverviewPayload } from '../../shared/api-types';
import type { OwnerFilterValue } from '../components/OwnerFilter';
import { SALES_OPS_API, fetcher, fmtInt } from '../components/format';
import { AvisoBloque } from '../focus/AvisoBloque';
import { Confeti } from '../focus/Confeti';
import { PanelContacto, type SolapaContacto } from '../focus/PanelContacto';
import { Reloj } from '../focus/Reloj';
import { useAtajosTeclado } from '../focus/useAtajosTeclado';
import { useBloque } from '../focus/useBloque';
import { porcentaje, useColaFocus } from '../focus/useColaFocus';
import { NoeliaMovil } from './NoeliaMovil';
import { TarjetaNoelia } from './TarjetaNoelia';
import type { AccionesTarjetaHandle } from './AccionesTarjeta';
import {
  ATAJOS_NOELIA,
  CADENA_MOTOR,
  ETAPAS_NOELIA,
  ETAPA_NOELIA_META,
  FILTROS_NOELIA,
  LS_BLOQUE_NOELIA,
  type EtapaNoelia,
  type FiltrosNoelia,
} from './tipos';

type Detalle = DetailPayload & { header: { chatId: number; name: string; customData: Record<string, unknown> } };
const detalleUrl = (chatId: number) => `${SALES_OPS_API}/contacts/${chatId}`;

const BTN_GHOST = 'inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-[var(--mn-line)] bg-transparent px-4 py-[11px] text-sm font-black text-white outline-none transition-colors hover:border-[var(--mn-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)] disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Modo Noelia: la interfaz de decisión humana de TORRE.
 *
 * Reproduce la maqueta aprobada de `aapp.space/business-command#modo-noelia`:
 * fila de cuatro colas con contador, barra de velocidad con progreso y atajos,
 * una sola tarjeta de decisión, y la cadena del motor abajo. Un cliente, una
 * decisión, siguiente — nunca una lista.
 *
 * La cabina fija su propia paleta oscura (ver `.modo-noelia` en globals.css):
 * los tonos son parte de la identidad del producto, igual que en la landing que
 * el cliente vio antes de comprar.
 */
export function NoeliaView({ owner, onSalir }: { owner: OwnerFilterValue; onSalir: () => void }) {
  const [filtros, setFiltros] = useState<FiltrosNoelia>(FILTROS_NOELIA);
  const [chatMovil, setChatMovil] = useState(false);
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
  const resuelto = useCallback((_tipo: 'aprobado' | 'pospuesto') => {
    if (chatId) cola.marcar(chatId, 'encolado');
  }, [chatId, cola]);

  const teclas = useMemo(() => ({
    a: () => acciones.current?.aprobar(),
    e: () => acciones.current?.editar(),
    i: () => acciones.current?.ia(),
    p: () => acciones.current?.posponer(),
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
        <div className="mx-auto flex min-h-[320px] max-w-md flex-col items-center justify-center rounded-[18px] border border-[var(--mn-box-line)] bg-[var(--mn-case)] p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-[var(--mn-msg-bg)] text-[var(--mn-green)]"><Check className="size-7" aria-hidden /></span>
          <h2 className="mt-4 text-xl font-black">TODO REVISADO</h2>
          <p className="mt-1 text-sm text-[var(--mn-muted)]">Hoy la bandeja no tiene prioridad visible en {ETAPA_NOELIA_META[cola.etapa].label.toLowerCase()}.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {siguienteEtapa && <button type="button" className="inline-flex min-h-[46px] items-center justify-center rounded-xl bg-[var(--mn-accent)] px-4 text-sm font-black text-[#0d0718]" onClick={cola.pasarASiguienteEtapa}>VER {ETAPA_NOELIA_META[siguienteEtapa].label.toUpperCase()}</button>}
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
        onVerConversacion={() => setChatMovil(true)}
        onResuelto={resuelto}
        onSaltar={saltar}
        onDetalleCambio={() => void mutate()}
      />
    );
  })();

  return (
    // `dark` además de `modo-noelia`: la cabina es oscura siempre, y el panel de
    // contacto usa los tokens del tema, así que sin esto quedaba un panel blanco
    // pegado a una cabina negra cuando el usuario tiene el tema claro.
    <div className="dark modo-noelia fixed inset-0 z-50 flex h-dvh flex-col bg-[var(--mn-bg)] text-[var(--mn-text)]">
      <header className="shrink-0 border-b border-[var(--mn-shell-line)] bg-[var(--mn-shell)]">
        <div className="mx-auto flex min-h-14 w-full max-w-[1120px] items-center gap-2 px-3 sm:px-4">
          <button type="button" onClick={onSalir} className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-black text-[var(--mn-muted)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]">
            <ArrowLeft className="size-4" aria-hidden /> Salir
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-black uppercase tracking-[0.15em] text-[var(--mn-accent)]">⚡ Modo Noelia</p>
            <p className="hidden truncate text-[11px] text-[var(--mn-muted)] sm:block">Torre ve todo. Acá aparece sólo lo que necesita de vos.</p>
          </div>
          {/* Debajo de xl no entra la columna: el mismo panel se abre en hoja. */}
          <button
            type="button"
            onClick={() => setChatMovil(true)}
            disabled={!chatId}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--mn-key-line)] px-2.5 text-xs font-black text-[var(--mn-soft)] hover:border-[var(--mn-accent)] disabled:opacity-40 xl:hidden"
          >
            <MessageSquare className="size-3.5" aria-hidden /> Chat
          </button>
          <button
            type="button"
            onClick={() => !bloque.hayBloque ? bloque.arrancar('foco') : bloque.pausado ? bloque.reanudar() : bloque.pausar()}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--mn-key-line)] px-2 font-mono text-xs tabular-nums text-[var(--mn-soft)]"
          >
            {!bloque.hayBloque ? <Timer className="size-3.5" aria-hidden /> : bloque.pausado ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            {bloque.hayBloque ? <Reloj terminaEn={bloque.terminaEn} pausadoCon={bloque.pausadoCon} /> : '25:00'}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <NoeliaMovil>
        <div className="mx-auto w-full max-w-[1120px] rounded-[22px] border border-[var(--mn-shell-line)] bg-[var(--mn-shell)] p-3 shadow-[0_28px_70px_rgba(0,0,0,.32)] sm:p-[18px]">
          {/* Las cuatro colas: filtro con contador, no navegación. */}
          <div className="grid grid-cols-2 gap-2.5 min-[820px]:grid-cols-4" role="tablist" aria-label="Colas de decisión">
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
                    'rounded-[13px] border bg-[var(--mn-panel)] p-3 text-left text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--mn-accent)]',
                    activa ? 'border-[var(--mn-accent)] shadow-[inset_0_0_0_1px_var(--mn-accent-soft)]' : 'border-[var(--mn-kpi-line)] hover:border-[var(--mn-accent)]',
                  )}
                >
                  <small className="block text-[11px] font-black uppercase text-[#d6e1eb]">{meta.emoji} {meta.label}</small>
                  <b className="mt-1 block text-[25px] font-black tabular-nums leading-none">{fmtInt(counts[etapa])}</b>
                </button>
              );
            })}
          </div>

          {/* Barra de velocidad: progreso del bloque y atajos. */}
          <div className="mt-2.5 grid items-center gap-3.5 rounded-[14px] border border-[var(--mn-speed-line)] bg-[var(--mn-panel)] p-3 min-[820px]:grid-cols-[auto_1fr_auto]">
            <div>
              <small className="block text-[11px] font-black text-[var(--mn-green)]">MODO VELOCIDAD</small>
              <b className="block text-[13px] font-black">{fmtInt(cola.procesadosEtapa)} / {fmtInt(cola.total)} decisiones revisadas</b>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--mn-track)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="mn-progress-fill h-full rounded-full transition-[width] duration-[250ms]" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ATAJOS_NOELIA.map(({ tecla, accion }) => (
                <span key={tecla} className="rounded-[7px] border border-[var(--mn-key-line)] px-1.5 py-1 text-[11px] text-[var(--mn-soft)]">
                  <b className="font-black">{tecla}</b> {accion}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-3">{body}</div>

          {/* Navegación entre casos: cliente → decisión → siguiente. */}
          {cola.actual && !cola.terminada && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#a8b7c7]">
              <button type="button" className={cn(BTN_GHOST, 'max-[820px]:order-2')} onClick={cola.retroceder}>← ANTERIOR</button>
              <span className="max-[820px]:order-1 max-[820px]:w-full max-[820px]:text-center">Cliente → decisión → siguiente</span>
              <button type="button" className={cn(BTN_GHOST, 'max-[820px]:order-3')} onClick={cola.avanzar}>SIGUIENTE →</button>
            </div>
          )}

          {/* La cadena del motor: de dónde sale lo que estás viendo. */}
          <div className="mt-4 grid gap-2 min-[820px]:grid-cols-5">
            {CADENA_MOTOR.map(({ paso, detalle: texto }) => (
              <div key={paso} className="rounded-xl border border-[var(--mn-chain-line)] bg-[var(--mn-panel)] p-3">
                <b className="block text-[12px] font-black text-[#d8e3ee]">{paso}</b>
                <small className="mt-1 block text-[11px] text-[var(--mn-dim)]">{texto}</small>
              </div>
            ))}
          </div>
        </div>

        <p className="mx-auto mt-3 w-full max-w-[1120px] text-[13px] text-[#9fb0c1]">
          Aprobar manda el mensaje: pasa por la cola, con clave de idempotencia y auditoría.
          Modo Noelia forma parte de TORRE; no es un producto separado.
          {overview && <> · Nuevas hoy: <b className="font-black">{fmtInt(overview.counters.newToday)}</b></>}
        </p>
        </NoeliaMovil>

        {/* El mismo panel de contacto que usa Focus, fijo a la derecha. Modo
            Noelia decide sobre una conversación: tenerla al lado evita abrir y
            cerrar una hoja en cada caso. */}
        <aside className="hidden shrink-0 flex-col border-l border-[var(--mn-shell-line)] bg-[var(--mn-shell)] p-3 xl:flex xl:w-[420px]" aria-label="Conversación">
          {chatId ? <PanelContacto chatId={chatId} solapa={solapa} onSolapa={setSolapa} className="min-h-0 flex-1" /> : null}
        </aside>
      </div>

      <Confeti activo={cola.terminada && cola.procesadosEtapa > 0} />

      {/* En el celular el mismo panel entra como hoja: no hay lugar para la columna. */}
      <Sheet open={chatMovil} onOpenChange={setChatMovil}>
        <SheetContent side="right" className="dark flex w-full max-w-full flex-col p-0 sm:max-w-xl">
          <SheetTitle className="border-b border-border px-4 py-3 text-base">Conversación</SheetTitle>
          {chatId && <PanelContacto chatId={chatId} solapa={solapa} onSolapa={setSolapa} className="min-h-0 flex-1 p-3" />}
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

/** El «Analizando conversaciones…» de la maqueta hermana de la misma landing. */
function Analizando() {
  return (
    <div className="mx-auto w-full max-w-4xl rounded-[18px] border border-[var(--mn-box-line)] bg-[var(--mn-case)] p-6 text-center" aria-busy="true">
      <b className="flex items-center justify-center gap-2 text-sm font-black">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Analizando conversaciones…
      </b>
      <div className="mx-auto mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-[var(--mn-track)]">
        <div className="mn-progress-fill h-full w-1/3 rounded-full motion-safe:animate-pulse" />
      </div>
      <small className="mt-3 block text-[12px] text-[var(--mn-dim)]">Buscando intención, bloqueos, pagos y próximos pasos.</small>
    </div>
  );
}

function Aviso({ titulo, detalle, accion, onAccion }: { titulo: string; detalle: string; accion: string; onAccion: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-[18px] border border-[var(--mn-amber-soft)] bg-[var(--mn-amber-bg)] p-6 text-center">
      <h2 className="text-base font-black text-[var(--mn-amber-soft)]">{titulo}</h2>
      <p className="mt-1 text-sm text-[var(--mn-soft)]">{detalle}</p>
      <button type="button" className={cn(BTN_GHOST, 'mt-4')} onClick={onAccion}>{accion.toUpperCase()}</button>
    </div>
  );
}
