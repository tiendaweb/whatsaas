'use client';

import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { C } from '../data/clases';
import type { EtiquetaUnificada } from '../data/tipos';
import { ES } from '../i18n/es';

/**
 * Etiquetas en horizontal, debajo de los miembros del equipo.
 *
 * Antes vivían apiladas en la barra lateral, debajo de los proyectos: con
 * varias etiquetas empujaban la lista de proyectos fuera de la vista, y
 * filtrar por etiqueta quedaba lejos de filtrar por persona, que es la misma
 * decisión ("qué recorte estoy mirando"). Acá son chips en una sola fila, al
 * lado de los miembros.
 */
export function FiltroEtiquetas(props: {
  etiquetas: EtiquetaUnificada[];
  valor: string | null;
  onChange: (name: string | null) => void;
  onNueva: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
      <span className={cn(C.rotulo, 'shrink-0 pr-1')}>{ES.rotulos.etiquetas}</span>
      {props.etiquetas.map((etiqueta) => {
        const active = props.valor === etiqueta.name;
        return (
          <button
            key={etiqueta.name}
            type="button"
            onClick={() => props.onChange(active ? null : etiqueta.name)}
            className={cn(
              C.chip,
              'shrink-0',
              active && 'border-[var(--tareas-accent)] text-[var(--tareas-accent)] bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)]',
            )}
          >
            <span
              className="w-2 h-2 rounded-full shadow-sm"
              style={{ background: etiqueta.color }}
            />
            {etiqueta.name}
          </button>
        );
      })}
      <button
        type="button"
        onClick={props.onNueva}
        className={cn(C.chip, 'shrink-0 text-[var(--t-muted)] hover:text-[var(--tareas-accent)]')}
        title={ES.nav.nuevaEtiqueta}
      >
        <Plus className="w-3.5 h-3.5" />
        {ES.nav.nuevaEtiqueta}
      </button>
    </div>
  );
}
