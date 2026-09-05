'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarClock, ChevronLeft, ChevronRight, Flame, MessageSquare, Pause, Play, SkipForward, SlidersHorizontal, Sparkles, Timer, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GateBadge } from '../components/GateBadge';
import { fmtInt } from '../components/format';
import { Reloj } from './Reloj';
import { ETAPA_LABELS, type Etapa } from './tipos';
import { porcentaje } from './useColaFocus';
import type { AnalysisRow } from '../../shared/api-types';

export const PESTANAS_MOVIL = ['accion', 'chat', 'programados', 'datos'] as const;
export type PestanaMovil = (typeof PESTANAS_MOVIL)[number];

const META: Record<PestanaMovil, { label: string; icon: typeof User }> = {
  accion: { label: 'Acción', icon: Sparkles },
  chat: { label: 'Chat', icon: MessageSquare },
  programados: { label: 'Programa', icon: CalendarClock },
  datos: { label: 'Datos', icon: User },
};

type Props = {
  etapa: Etapa;
  actual: AnalysisRow;
  posicion: number;
  total: number;
  procesados: number;
  racha: number;
  terminaEn: number | null;
  pausadoCon: number | null;
  pausado: boolean;
  hayBloque: boolean;
  pestana: PestanaMovil;
  onPestana: (p: PestanaMovil) => void;
  /** Cuántos ítems tiene cada pestaña, para el puntito de aviso. */
  avisos: Partial<Record<PestanaMovil, number>>;
  onReloj: () => void;
  onSalir: () => void;
  onFiltros: () => void;
  onAnterior: () => void;
  onSiguiente: () => void;
  onSaltar: () => void;
  puedeRetroceder: boolean;
  /** El panel de la pestaña activa. */
  children: ReactNode;
  /** La barra de prompt, que en Acción va pegada abajo de la pestaña. */
  prompt: ReactNode;
};

/**
 * Focus en el celular.
 *
 * En escritorio las tres columnas se miran a la vez; acá no entra ni una. La
 * pantalla se parte en cuatro pestañas —Acción, Chat, Programados, Datos— con
 * una barra abajo, al alcance del pulgar, y arriba queda fija la tarjeta del
 * cliente: quién es, en qué grado está y qué hay que hacerle. Eso último es lo
 * que no se puede perder al cambiar de pestaña, porque es la razón por la que
 * uno entró.
 *
 * Se pasa de cliente arrastrando la tarjeta hacia el costado, como un mazo. Las
 * flechas siguen ahí para quien no descubra el gesto: un gesto que no se anuncia
 * no puede ser la única forma de hacer algo.
 */
export function FocusMovil({
  etapa,
  actual,
  posicion,
  total,
  procesados,
  racha,
  terminaEn,
  pausadoCon,
  pausado,
  hayBloque,
  pestana,
  onPestana,
  avisos,
  onReloj,
  onSalir,
  onFiltros,
  onAnterior,
  onSiguiente,
  onSaltar,
  puedeRetroceder,
  children,
  prompt,
}: Props) {
  const pct = porcentaje(procesados, total);
  const [arrastre, setArrastre] = useState(0);
  const inicio = useRef<{ x: number; y: number } | null>(null);

  // Al cambiar de cliente se vuelve a Acción: la pestaña que quedó abierta era
  // sobre el anterior, y seguir en Chat mostraría otra conversación sin aviso.
  useEffect(() => {
    onPestana('accion');
    setArrastre(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual.chatId]);

  const soltar = () => {
    const dx = arrastre;
    setArrastre(0);
    inicio.current = null;
    if (dx <= -70) onSiguiente();
    else if (dx >= 70 && puedeRetroceder) onAnterior();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barra: salir, reloj, progreso y filtros. Una sola línea. */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button variant="ghost" size="icon" className="size-9 shrink-0 text-muted-foreground" onClick={onSalir} aria-label="Salir de Focus">
          <ArrowLeft className="size-5" aria-hidden />
        </Button>

        <button
          type="button"
          onClick={onReloj}
          aria-label={pausado ? 'Reanudar el bloque' : 'Pausar el bloque'}
          className={cn(
            'flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 font-mono text-sm tabular-nums',
            !hayBloque ? 'border-dashed border-border text-muted-foreground' : pausado ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-border bg-card',
          )}
        >
          {!hayBloque ? <Timer className="size-3.5" aria-hidden /> : pausado ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          {hayBloque ? <Reloj terminaEn={terminaEn} pausadoCon={pausadoCon} /> : '25:00'}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] font-medium">{ETAPA_LABELS[etapa]}</span>
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {fmtInt(procesados)}/{fmtInt(total)}
            </span>
          </div>
          <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {racha >= 2 && (
          <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-orange-600 dark:text-orange-400" title={`${racha} seguidos sin saltear`}>
            <Flame className="size-3" aria-hidden />
            {racha}
          </span>
        )}

        <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={onFiltros} aria-label="Filtros y orden">
          <SlidersHorizontal className="size-4" aria-hidden />
        </Button>
      </header>

      {/* Tarjeta del cliente: fija, y es lo que se arrastra para cambiar. */}
      <div
        className="shrink-0 touch-pan-y border-b border-border bg-card px-3 py-2"
        style={{ transform: `translateX(${arrastre}px)`, transition: arrastre === 0 ? 'transform 180ms ease-out' : undefined }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          inicio.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchMove={(e) => {
          if (!inicio.current) return;
          const t = e.touches[0];
          const dx = t.clientX - inicio.current.x;
          // Sólo si el gesto es claramente horizontal: si no, es scroll.
          if (Math.abs(t.clientY - inicio.current.y) > Math.abs(dx)) return;
          setArrastre(Math.max(-120, Math.min(120, dx)));
        }}
        onTouchEnd={soltar}
        onTouchCancel={soltar}
      >
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={onAnterior} disabled={!puedeRetroceder} aria-label="Cliente anterior">
            <ChevronLeft className="size-4" aria-hidden />
          </Button>

          <div className="min-w-0 flex-1 text-center">
            <div className="flex items-center justify-center gap-1.5">
              <GateBadge gate={actual.currentGate} />
              <p className="min-w-0 truncate text-sm font-semibold" title={actual.name}>{actual.name}</p>
            </div>
            <p className="mt-0.5 truncate text-[11px] leading-snug text-muted-foreground" title={actual.recommendedAction ?? ''}>
              {actual.recommendedAction || 'Sin acción recomendada'}
            </p>
          </div>

          <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={onSaltar} aria-label="Saltar este cliente">
            <SkipForward className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground" onClick={onSiguiente} aria-label="Cliente siguiente">
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        <p className="mt-0.5 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
          #{posicion} de {fmtInt(total)} · arrastrá para cambiar
        </p>
      </div>

      {/* Panel de la pestaña. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

      {/* En Acción, el prompt va pegado arriba de la barra de pestañas. */}
      {pestana === 'accion' && prompt}

      <nav className="flex shrink-0 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]" aria-label="Secciones del cliente">
        {PESTANAS_MOVIL.map((id) => {
          const { label, icon: Icon } = META[id];
          const activa = pestana === id;
          const aviso = avisos[id] ?? 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onPestana(id)}
              aria-current={activa ? 'page' : undefined}
              className={cn('relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors', activa ? 'text-primary' : 'text-muted-foreground')}
            >
              <span className="relative">
                <Icon className="size-5" aria-hidden />
                {aviso > 0 && (
                  <span className="absolute -right-1.5 -top-1 rounded-full bg-primary px-1 font-mono text-[9px] leading-4 text-primary-foreground">{aviso > 9 ? '9+' : aviso}</span>
                )}
              </span>
              {label}
              {activa && <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
