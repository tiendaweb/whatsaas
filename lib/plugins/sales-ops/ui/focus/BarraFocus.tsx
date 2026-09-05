'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, SkipForward, SlidersHorizontal, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { GATES, type Gate } from '../../shared/taxonomy';
import { GateBadge } from '../components/GateBadge';
import { fmtInt } from '../components/format';
import { ETAPAS, ETAPA_HINTS, ETAPA_LABELS, ORDENES, reloj, type Etapa, type FiltrosFocus, type OrdenFocus } from './tipos';
import type { ResumenSesion } from './useColaFocus';

type Props = {
  etapa: Etapa;
  procesados: number;
  total: number;
  posicion: number;
  sesion: ResumenSesion;
  filtros: FiltrosFocus;
  onFiltros: (f: FiltrosFocus) => void;
  restante: number;
  pausado: boolean;
  hayBloque: boolean;
  onReloj: () => void;
  onSalir: () => void;
  onAnterior: () => void;
  onSiguiente: () => void;
  onSaltar: () => void;
  puedeRetroceder: boolean;
  hayActual: boolean;
};

/**
 * La única barra del Focus. Todo lo que no es el cliente vive acá arriba, en una
 * sola línea de 44 px: salir, el reloj, dónde estoy, y los filtros.
 *
 * El cronómetro es un botón: un clic lo pausa, otro lo reanuda. No hay menú ni
 * confirmación — pausar el reloj no rompe nada.
 */
export function BarraFocus({
  etapa,
  procesados,
  total,
  posicion,
  sesion,
  filtros,
  onFiltros,
  restante,
  pausado,
  hayBloque,
  onReloj,
  onSalir,
  onAnterior,
  onSiguiente,
  onSaltar,
  puedeRetroceder,
  hayActual,
}: Props) {
  const pct = total > 0 ? Math.min(100, Math.round((procesados / total) * 100)) : 0;

  const alternarEtapa = (e: Etapa) => {
    const activas = filtros.etapas.includes(e) ? filtros.etapas.filter((x) => x !== e) : [...filtros.etapas, e];
    // Nunca cero etapas: una cola vacía por filtro no se distingue de una cola terminada.
    onFiltros({ ...filtros, etapas: activas.length ? ETAPAS.filter((x) => activas.includes(x)) : filtros.etapas });
  };

  const alternarGate = (g: Gate) => {
    const activos = filtros.gates.includes(g) ? filtros.gates.filter((x) => x !== g) : [...filtros.gates, g];
    onFiltros({ ...filtros, gates: activos });
  };

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-2 sm:px-3">
      <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground" onClick={onSalir}>
        <ArrowLeft className="size-4" aria-hidden />
        <span className="hidden sm:inline">Salir</span>
      </Button>

      <button
        type="button"
        onClick={onReloj}
        title={!hayBloque ? 'Arrancar un bloque de 25 minutos' : pausado ? 'Reanudar el bloque' : 'Pausar el bloque'}
        className={cn(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 font-mono text-sm tabular-nums transition-colors',
          !hayBloque
            ? 'border-dashed border-border text-muted-foreground hover:text-foreground'
            : pausado
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-border bg-card text-foreground',
        )}
      >
        {!hayBloque ? <Timer className="size-3.5" aria-hidden /> : pausado ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
        {hayBloque ? reloj(restante) : '25:00'}
      </button>

      {/* Etapa y progreso: es lo que la persona mira de reojo, así que se queda
          con todo el espacio elástico. */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="hidden shrink-0 text-sm font-semibold sm:inline">{ETAPA_LABELS[etapa]}</span>
        <div className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progreso de ${ETAPA_LABELS[etapa]}`}>
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <span
          className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
          title={`${fmtInt(procesados)} procesados · ${fmtInt(Math.max(0, total - procesados))} por procesar`}
        >
          {fmtInt(procesados)}/{fmtInt(total)}
        </span>
      </div>

      <span className="hidden shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground lg:flex" title="Ejecutados · dejados para conector · saltados en esta sesión">
        <span className="text-emerald-600 dark:text-emerald-400">{sesion.ejecutados}</span>
        <span className="text-sky-600 dark:text-sky-400">{sesion.encolados}</span>
        <span>{sesion.saltados}</span>
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Filtros y orden">
            <SlidersHorizontal className="size-4" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tipo</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {ETAPAS.map((e) => (
              <label
                key={e}
                title={ETAPA_HINTS[e]}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition-colors',
                  filtros.etapas.includes(e) ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Checkbox checked={filtros.etapas.includes(e)} onCheckedChange={() => alternarEtapa(e)} className="size-3.5" />
                {ETAPA_LABELS[e]}
              </label>
            ))}
          </div>

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grado</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {GATES.map((g) => (
              <button key={g} type="button" onClick={() => alternarGate(g)} className={cn('rounded-md transition-opacity', filtros.gates.includes(g) ? 'ring-1 ring-primary' : 'opacity-45 hover:opacity-100')}>
                <GateBadge gate={g} />
              </button>
            ))}
          </div>
          {filtros.gates.length > 0 && (
            <button type="button" className="mt-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => onFiltros({ ...filtros, gates: [] })}>
              Sacar los grados ({filtros.gates.length})
            </button>
          )}

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Orden</p>
          <div className="mt-1.5 space-y-0.5">
            {ORDENES.map((o) => (
              <button
                key={o.key}
                type="button"
                title={o.hint}
                onClick={() => onFiltros({ ...filtros, orden: o.key as OrdenFocus })}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  filtros.orden === o.key ? 'bg-primary/10 font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-border pt-3 text-xs text-foreground">
            <Checkbox checked={filtros.soloPendientes} onCheckedChange={(v) => onFiltros({ ...filtros, soloPendientes: v === true })} className="mt-0.5 size-3.5" />
            <span>
              Sólo pendientes de verificación
              <span className="block text-[11px] text-muted-foreground">Deja afuera a los que ya tienen algo esperando salir.</span>
            </span>
          </label>
        </PopoverContent>
      </Popover>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" className="size-8" onClick={onAnterior} disabled={!puedeRetroceder} aria-label="Cliente anterior" title="Anterior (←)">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={onSiguiente} disabled={!hayActual} aria-label="Cliente siguiente" title="Siguiente, sin anotar nada (→)">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" onClick={onSaltar} disabled={!hayActual} aria-label="Saltar este cliente" title="Saltar: queda anotado como saltado en la sesión (S)">
          <SkipForward className="size-4" aria-hidden />
        </Button>
        <span className="hidden px-1 font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">#{posicion}</span>
      </div>
    </header>
  );
}
