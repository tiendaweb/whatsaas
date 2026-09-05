'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { GATES, type Gate } from '../../shared/taxonomy';
import { GateBadge } from '../components/GateBadge';
import { ETAPAS, ETAPA_HINTS, ETAPA_LABELS, ORDENES, type Etapa, type FiltrosFocus, type OrdenFocus } from './tipos';

/**
 * Los filtros del Focus, sin envase.
 *
 * Los mismos controles se abren en un popover en escritorio y en una hoja desde
 * abajo en el celular. Estaban escritos adentro de la barra de escritorio, así
 * que el celular no los tenía: quedaba ordenado por prioridad y con las cuatro
 * etapas, y no había forma de cambiarlo desde el teléfono.
 */
export function PanelFiltros({ filtros, onFiltros }: { filtros: FiltrosFocus; onFiltros: (f: FiltrosFocus) => void }) {
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
    <div>
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
    </div>
  );
}
