'use client';

import { cn } from '@/lib/utils';

import { GATES, GATE_LABELS, type Gate } from '../../shared/taxonomy';
import { GateBadge } from './GateBadge';

/**
 * Filtro por etapa, a la vista.
 *
 * Los gates son el eje del sistema —toda la clasificación termina en uno— y sin
 * embargo elegirlos estaba a tres toques dentro del panel de filtros, donde
 * nadie los usaba. Acá están los trece, con su color, y se prenden y apagan de
 * a uno: sin nada elegido se ve todo.
 *
 * Cada chip es el mismo `GateBadge` que después aparece en cada fila, para que
 * el color con el que filtrás sea el color que buscás en la lista.
 */
export function FiltroGates({
  seleccionados,
  onChange,
  className,
}: {
  seleccionados: Gate[] | undefined;
  onChange: (gates: Gate[] | undefined) => void;
  className?: string;
}) {
  const activos = seleccionados ?? [];

  const alternar = (gate: Gate) => {
    const proximos = activos.includes(gate) ? activos.filter((g) => g !== gate) : [...activos, gate];
    onChange(proximos.length ? proximos : undefined);
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      <button
        type="button"
        onClick={() => onChange(undefined)}
        aria-pressed={activos.length === 0}
        className={cn(
          'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
          activos.length === 0 ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:bg-muted',
        )}
      >
        Todas
      </button>
      {GATES.map((gate) => (
        <button
          key={gate}
          type="button"
          onClick={() => alternar(gate)}
          aria-pressed={activos.includes(gate)}
          title={`${gate} · ${GATE_LABELS[gate]}`}
          className={cn(
            'rounded-md ring-offset-background transition-shadow',
            activos.includes(gate) ? 'ring-2 ring-primary ring-offset-1' : 'opacity-80 hover:opacity-100',
          )}
        >
          <GateBadge gate={gate} />
        </button>
      ))}
    </div>
  );
}
