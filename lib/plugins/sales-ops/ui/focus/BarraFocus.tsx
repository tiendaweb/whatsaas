'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, SkipForward, SlidersHorizontal, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { fmtInt } from '../components/format';
import { Reloj } from './Reloj';
import { PanelFiltros } from './PanelFiltros';
import { ETAPA_LABELS, type Etapa, type FiltrosFocus } from './tipos';
import { porcentaje, type ResumenSesion } from './useColaFocus';

type Props = {
  etapa: Etapa;
  procesados: number;
  total: number;
  posicion: number;
  sesion: ResumenSesion;
  filtros: FiltrosFocus;
  onFiltros: (f: FiltrosFocus) => void;
  terminaEn: number | null;
  pausadoCon: number | null;
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
  terminaEn,
  pausadoCon,
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
  const pct = porcentaje(procesados, total);

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
        {hayBloque ? <Reloj terminaEn={terminaEn} pausadoCon={pausadoCon} /> : '25:00'}
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
          <PanelFiltros filtros={filtros} onFiltros={onFiltros} />
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
