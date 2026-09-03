'use client';

import { Copy, FolderOpen, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ES } from '../i18n/es';

/**
 * Origen de la tarea: espacio y proyecto como DOS etiquetas separadas y
 * navegables, en vez de un solo texto "Espacio · Proyecto" que se cortaba a
 * 140px y no se podía usar para nada.
 *
 * Si la tarea está compartida en otros tableros (tarea espejo), se muestra
 * dónde más vive: antes no había forma de saberlo desde la lista.
 */
export function ChipProyecto(props: {
  workspaceNombre?: string | null;
  proyectoNombre: string;
  /** Otros tableros donde la misma tarea aparece. */
  espejos?: { projectId: number; projectName: string; workspaceName?: string | null }[];
  onAbrirWorkspace?: () => void;
  onAbrirProyecto?: () => void;
  onAbrirEspejo?: (projectId: number) => void;
}) {
  const base = 'inline-flex max-w-[160px] items-center gap-1 truncate rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors';
  const pasivo = 'bg-[var(--t-chip)] text-[var(--t-muted)]';
  const activo = 'bg-[var(--t-chip)] text-[var(--t-muted)] hover:bg-[color-mix(in_srgb,var(--tareas-accent)_15%,transparent)] hover:text-[var(--tareas-accent)]';

  const detener = (fn?: () => void) => (event: React.MouseEvent) => {
    if (!fn) return;
    event.stopPropagation();
    event.preventDefault();
    fn();
  };

  return (
    <>
      {props.workspaceNombre && (
        <button
          type="button"
          onClick={detener(props.onAbrirWorkspace)}
          disabled={!props.onAbrirWorkspace}
          title={props.workspaceNombre}
          className={cn(base, props.onAbrirWorkspace ? activo : pasivo)}
        >
          <Layers className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{props.workspaceNombre}</span>
        </button>
      )}

      <button
        type="button"
        onClick={detener(props.onAbrirProyecto)}
        disabled={!props.onAbrirProyecto}
        title={props.proyectoNombre}
        className={cn(base, props.onAbrirProyecto ? activo : pasivo)}
      >
        <FolderOpen className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{props.proyectoNombre}</span>
      </button>

      {(props.espejos ?? []).map((espejo) => (
        <button
          key={espejo.projectId}
          type="button"
          onClick={detener(props.onAbrirEspejo ? () => props.onAbrirEspejo!(espejo.projectId) : undefined)}
          disabled={!props.onAbrirEspejo}
          title={ES.espejo.tooltip(espejo.workspaceName ? `${espejo.workspaceName} · ${espejo.projectName}` : espejo.projectName)}
          className={cn(
            base,
            'border border-dashed border-[color-mix(in_srgb,var(--tareas-accent)_40%,transparent)] bg-transparent text-[var(--tareas-accent)]',
            props.onAbrirEspejo && 'hover:bg-[color-mix(in_srgb,var(--tareas-accent)_12%,transparent)]',
          )}
        >
          <Copy className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{espejo.projectName}</span>
        </button>
      ))}
    </>
  );
}
