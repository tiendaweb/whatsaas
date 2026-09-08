'use client';

import { cn } from '@/lib/utils';
import { SITUACIONES_EN_ORDEN_DE_TRABAJO, SITUACION_META, type Situacion } from '../../shared/situacion';
import { SITUACION_COLOR, SITUACION_ICONO } from './SituacionBadge';

/**
 * Las diez situaciones como chips, y el corte cliente / no cliente.
 *
 * Un solo componente para las tres pantallas —Focus, listas y Modo Noelia—
 * porque son el mismo filtro: si en el Focus "Contestó, sin atender" quisiera
 * decir algo distinto que en Dinero, habría que aprenderlo dos veces y la
 * primera vez que no coincidieran nadie volvería a confiar en el filtro.
 *
 * Ninguna seleccionada = todas. Es lo que corresponde: la situación es un
 * recorte de la lista, no un modo de trabajo, y arrancar con nueve tildadas
 * sería pedirle a la persona que destilde para ver todo.
 */
export type FiltroCliente = 'con' | 'sin' | null;

export function FiltroSituacion({
  situaciones,
  cliente,
  onSituaciones,
  onCliente,
  className,
  compacto,
  conteos,
}: {
  situaciones: Situacion[];
  cliente: FiltroCliente;
  onSituaciones: (s: Situacion[]) => void;
  onCliente: (c: FiltroCliente) => void;
  className?: string;
  /** Sin los títulos de sección: para barras donde el espacio es el problema. */
  compacto?: boolean;
  /** Cuántos hay en cada situación con los filtros puestos. Sin esto, el chip va sin número. */
  conteos?: Partial<Record<Situacion, number>>;
}) {
  const alternar = (s: Situacion) =>
    onSituaciones(situaciones.includes(s) ? situaciones.filter((x) => x !== s) : [...situaciones, s]);

  return (
    <div className={className}>
      {!compacto && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Situación</p>
          {situaciones.length > 0 && (
            <button
              type="button"
              onClick={() => onSituaciones([])}
              className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Ver todas
            </button>
          )}
        </div>
      )}
      <div className={cn('flex flex-wrap gap-1', !compacto && 'mt-1.5')}>
        {SITUACIONES_EN_ORDEN_DE_TRABAJO.map((s) => {
          const activa = situaciones.includes(s);
          const Icon = SITUACION_ICONO[s];
          const n = conteos?.[s];
          // Un chip en cero se atenúa pero no se esconde: si desapareciera, la
          // fila de chips cambiaría de forma en cada recarga y no se podría
          // apuntar dos veces al mismo lugar.
          const vacio = n === 0 && !activa;
          return (
            <button
              key={s}
              type="button"
              title={SITUACION_META[s].hint}
              aria-pressed={activa}
              onClick={() => alternar(s)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors',
                activa
                  ? 'border-primary/40 bg-primary/10 font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                vacio && 'opacity-45',
              )}
            >
              <Icon className={cn('size-3.5 shrink-0', SITUACION_COLOR[s])} aria-hidden />
              {SITUACION_META[s].label}
              {typeof n === 'number' && <span className="tabular-nums opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      {!compacto && <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cliente</p>}
      <div className={cn('flex flex-wrap gap-1', compacto ? 'mt-1' : 'mt-1.5')}>
        {([
          { key: null, label: 'Todos' },
          { key: 'con' as const, label: 'Ya es cliente' },
          { key: 'sin' as const, label: 'Todavía no' },
        ]).map(({ key, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={cliente === key}
            onClick={() => onCliente(key)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
              cliente === key
                ? 'border-transparent bg-foreground font-medium text-background'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
