'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Atajo } from './atajos';

/**
 * Los atajos de un toque, como fila de fichas.
 *
 * Es la misma fila en la barra del Focus de trabajo y en "Mandar otro pedido"
 * de la supervisión: un pedido se toca igual desde cualquiera de los dos. El
 * de origen `analisis` (la acción recomendada para ESTE cliente) va resaltado
 * con la chispa, porque es el único que no mira a la tanda.
 */
export function ChipsAtajos({
  atajos,
  seleccionado,
  onElegir,
  disabled = false,
  movil = false,
}: {
  atajos: Atajo[];
  /** El texto que está escrito ahora: la ficha igual se marca como elegida. */
  seleccionado: string;
  onElegir: (texto: string) => void;
  disabled?: boolean;
  /** En el celular la ficha puede ser más ancha: hay una sola columna. */
  movil?: boolean;
}) {
  if (atajos.length === 0) return null;
  return (
    <div className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]{display:none}">
      {atajos.map((atajo) => (
        <button
          key={atajo.texto}
          type="button"
          disabled={disabled}
          onClick={() => onElegir(atajo.texto)}
          title={atajo.texto}
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-1 text-left text-[11px] leading-tight transition-colors disabled:opacity-50',
            atajo.texto === seleccionado
              ? 'border-primary bg-primary/10 text-foreground'
              : atajo.origen === 'analisis'
                ? 'border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          {atajo.origen === 'analisis' && <Sparkles className="mr-1 inline size-2.5 text-primary" aria-hidden />}
          <span className={cn('inline-block truncate align-middle', movil ? 'max-w-[62vw]' : 'max-w-[240px]')}>{atajo.texto}</span>
        </button>
      ))}
    </div>
  );
}
