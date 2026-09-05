'use client';

import { cn } from '@/lib/utils';
import { SKILL_ICON_COMPONENTS } from '../skills/skill-meta';
import { ACCIONES, ACCIONES_VISIBLES, type AccionFocus } from './acciones';

/**
 * Qué tiene que producir este pedido, elegido de una lista corta.
 *
 * Es lo que faltaba para que supervisar tuviera sentido: mirando un cuadro de
 * texto no se sabe si lo que va a salir es un mensaje, una tarea o un cambio de
 * CRM, y el conector tampoco. Elegir acá escribe la instrucción con su cadena de
 * tools y le pone nombre a la corrida.
 *
 * Se puede cambiar en cualquier momento, y el texto sigue siendo editable
 * después: la plantilla es un punto de partida, no un formulario.
 */
export function SelectorAccion({
  valor,
  onCambio,
  className,
  compacto,
}: {
  valor: AccionFocus;
  onCambio: (accion: AccionFocus) => void;
  className?: string;
  /** En el celular sólo el ícono: siete etiquetas no entran en una fila. */
  compacto?: boolean;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1', className)} role="group" aria-label="Qué tiene que producir">
      {ACCIONES_VISIBLES.map((key) => {
        const def = ACCIONES[key];
        const Icon = SKILL_ICON_COMPONENTS[def.icon];
        const activa = valor === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onCambio(key)}
            title={def.ayuda}
            aria-pressed={activa}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
              activa ? 'border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className={cn(compacto && 'sr-only')}>{def.label}</span>
          </button>
        );
      })}
    </div>
  );
}
