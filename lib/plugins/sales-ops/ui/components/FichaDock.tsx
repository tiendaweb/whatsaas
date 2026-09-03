'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DockItem<T extends string> = { id: T; label: string; icon: LucideIcon; badge?: number };

/**
 * Barra de secciones de la ficha y de la Cola.
 *
 * Antes eran pestañas de texto en una tira con flechas: en el panel de 440 px
 * entraban tres y media, así que "Versiones" e "Historial" existían pero nadie
 * las encontraba. Ahora cada sección es ícono + etiqueta, entra bastante más
 * por renglón, y lo que sobra scrollea en horizontal sin flechas.
 *
 * Horizontal en todos los tamaños: un riel vertical le come al panel el ancho
 * que justamente no le sobra.
 *
 * Usa los tokens del sistema (no la paleta fija de Tareas OS) porque vive
 * dentro del tema del Command Center y tiene que seguir al modo claro y oscuro.
 */
export function FichaDock<T extends string>({
  items,
  active,
  onChange,
  className,
}: {
  items: DockItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <nav
      className={cn(
        'flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-muted/30 p-1.5',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      aria-label="Secciones"
    >
      {items.map(({ id, label, icon: Icon, badge }) => {
        const activo = active === id;
        return (
          <button
            key={id}
            type="button"
            title={label}
            aria-current={activo ? 'page' : undefined}
            onClick={() => onChange(id)}
            className={cn(
              'relative flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-xs transition-colors',
              activo ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
            {badge !== undefined && badge > 0 && (
              <span className="rounded-full bg-foreground px-1 text-[9px] font-semibold tabular-nums text-background">{badge > 99 ? '99+' : badge}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
