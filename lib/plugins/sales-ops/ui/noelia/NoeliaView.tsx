'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { preload } from 'swr';
import { ArrowLeft, Banknote, Check, Clock3, Flame, Loader2, Pause, Play, SearchCheck, Timer, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { DetailPayload, OverviewPayload } from '../../shared/api-types';
import type { OwnerFilterValue } from '../components/OwnerFilter';
import { ErrorState } from '../components/States';
import { SALES_OPS_API, fetcher, fmtInt } from '../components/format';
import { AvisoBloque } from '../focus/AvisoBloque';
import { Confeti } from '../focus/Confeti';
import { LimiteDeError } from '../focus/LimiteDeError';
import { PanelContacto, type SolapaContacto } from '../focus/PanelContacto';
import { Reloj } from '../focus/Reloj';
import { useAtajosTeclado } from '../focus/useAtajosTeclado';
import { useBloque } from '../focus/useBloque';
import { porcentaje, useColaFocus } from '../focus/useColaFocus';
import { NoeliaMovil } from './NoeliaMovil';
import { TarjetaNoelia } from './TarjetaNoelia';
import type { AccionesTarjetaHandle } from './AccionesTarjeta';
import { ETAPAS_NOELIA, ETAPA_NOELIA_META, FILTROS_NOELIA, LS_BLOQUE_NOELIA, type EtapaNoelia, type FiltrosNoelia } from './tipos';

type Detalle = DetailPayload & { header: { chatId: number; name: string; customData: Record<string, unknown> } };
const detalleUrl = (chatId: number) => `${SALES_OPS_API}/contacts/${chatId}`;

const ICONOS = { dinero: Banknote, oportunidades: Flame, barrido: TrendingUp, revisar: SearchCheck };

export function NoeliaView({ owner, onSalir }: { owner: OwnerFilterValue; onSalir: () => void }) {
  const [filtros, setFiltros] = useState<FiltrosNoelia>(FILTROS_NOELIA);
  const [contexto, setContexto] = useState(false);
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
    setContexto(false);
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
    if (cola.error) return <ErrorState message={cola.error} onRetry={cola.recargar} />;
    if (cola.cargando) return <TarjetaSkeleton />;
    if (cola.terminada || !cola.actual) {
      return (
        <div className="mx-auto flex min-h-[420px] max-w-md flex-col items-center justify-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary"><Check className="size-7" aria-hidden /></span>
          <h2 className="mt-4 text-xl font-black">Todo revisado</h2>
          <p className="mt-1 text-sm text-muted-foreground">Focus no tiene decisiones pendientes para vos en {ETAPA_NOELIA_META[cola.etapa].label.toLowerCase()}.</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {siguienteEtapa && <Button onClick={cola.pasarASiguienteEtapa}>Ver {ETAPA_NOELIA_META[siguienteEtapa].label}</Button>}
            <Button variant="outline" onClick={onSalir}>Volver al Command Center</Button>
          </div>
        </div>
      );
    }
    if (detalleError) return <ErrorState message="No se pudo cargar el caso. La cola conserva tu lugar." onRetry={() => void mutate()} />;
    if (!detalle || detalle.header.chatId !== cola.actual.chatId) return <TarjetaSkeleton />;
    return (
      <TarjetaNoelia
        ref={acciones}
        chatId={cola.actual.chatId}
        detalle={detalle}
        onContexto={() => setContexto(true)}
        onResuelto={resuelto}
        onSaltar={saltar}
        onDetalleCambio={() => void mutate()}
      />
    );
  })();

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex min-h-12 items-center gap-2 px-2 sm:px-4">
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2 text-muted-foreground" onClick={onSalir}><ArrowLeft className="size-4" /> Salir</Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-black sm:text-base">Modo Noelia</h1>
            <p className="hidden truncate text-[11px] text-muted-foreground sm:block">El sistema investigó. Vos decidí.</p>
          </div>
          <div className="hidden items-center gap-2 text-[11px] font-bold text-muted-foreground sm:flex">
            <span>{fmtInt(cola.procesadosEtapa)} / {fmtInt(cola.total)} revisados</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct}><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} /></div>
          </div>
          <button type="button" onClick={() => !bloque.hayBloque ? bloque.arrancar('foco') : bloque.pausado ? bloque.reanudar() : bloque.pausar()} className="flex h-9 items-center gap-1.5 rounded-xl border border-border px-2 font-mono text-xs tabular-nums">
            {!bloque.hayBloque ? <Timer className="size-3.5" /> : bloque.pausado ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            {bloque.hayBloque ? <Reloj terminaEn={bloque.terminaEn} pausadoCon={bloque.pausadoCon} /> : '25:00'}
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:px-4" role="tablist" aria-label="Categorías">
          {ETAPAS_NOELIA.map((etapa) => {
            const Icon = ICONOS[etapa];
            const activa = cola.etapa === etapa;
            return <button key={etapa} type="button" role="tab" aria-selected={activa} onClick={() => elegirEtapa(etapa)} className={cn('flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', activa ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground')}><Icon className="size-4" /><span>{ETAPA_NOELIA_META[etapa].label}</span><span className={cn('rounded-full px-1.5 py-0.5 tabular-nums', activa ? 'bg-primary-foreground/20' : 'bg-muted')}>{fmtInt(counts[etapa])}</span></button>;
          })}
        </div>
      </header>

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-muted/25 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="truncate">Vos no tenés que leer todo. El sistema ya investigó. Decidí qué hacemos.</span>
        <span className="shrink-0 font-bold">Desafío 60 · nuevas hoy: {fmtInt(overview?.counters.newToday)} / 60</span>
      </div>

      <NoeliaMovil>{body}</NoeliaMovil>
      <Confeti activo={cola.terminada && cola.procesadosEtapa > 0} />

      <Sheet open={contexto} onOpenChange={setContexto}>
        <SheetContent side="right" className="flex w-full max-w-full flex-col p-0 sm:max-w-xl">
          <SheetTitle className="border-b border-border px-4 py-3 text-base">Más contexto</SheetTitle>
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

function TarjetaSkeleton() {
  return <div className="mx-auto w-full max-w-3xl space-y-4 rounded-3xl border border-border bg-card p-5" aria-busy="true"><div className="flex gap-3"><Skeleton className="size-11 rounded-2xl" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-2/3" /></div></div><div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-44 rounded-2xl" /></div>;
}
