'use client';

import { cn } from '@/lib/utils';
import { C } from '../data/clases';
import { primerNombreDe, type MiembroFiltro } from '../data/miembros';
import { ES } from '../i18n/es';

export type { MiembroFiltro };

function primerNombre(miembro: MiembroFiltro): string {
  return primerNombreDe(miembro);
}

function inicial(miembro: MiembroFiltro): string {
  return primerNombre(miembro).slice(0, 1).toUpperCase();
}

export function FiltroMiembros(props: {
  miembros: MiembroFiltro[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  if (props.miembros.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
      <button
        type="button"
        onClick={() => props.onChange(null)}
        className={cn(C.chip, 'shrink-0', props.value == null && 'border-[var(--tareas-accent)] text-[var(--tareas-accent)] bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)]')}
      >
        {ES.miembros.todos}
      </button>
      {props.miembros.map((miembro) => {
        const active = props.value === miembro.id;
        return (
          <button
            key={miembro.id}
            type="button"
            onClick={() => props.onChange(active ? null : miembro.id)}
            className={cn(
              C.chip,
              'shrink-0',
              active && 'border-[var(--tareas-accent)] text-[var(--tareas-accent)] bg-[color-mix(in_srgb,var(--tareas-accent)_10%,transparent)]',
            )}
          >
            <span
              className="w-5 h-5 rounded-full text-white text-[10px] font-black flex items-center justify-center"
              style={{ background: 'var(--tareas-accent)' }}
            >
              {inicial(miembro)}
            </span>
            {primerNombre(miembro)}
          </button>
        );
      })}
    </div>
  );
}
