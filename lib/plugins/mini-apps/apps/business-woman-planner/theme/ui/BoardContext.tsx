'use client';

import { createContext, useContext } from 'react';

/**
 * Puente hacia el tablero de tareas YA CONSTRUIDO en `index.tsx` (proyectos/
 * columnas/tareas, en vivo con Task OS si está instalado, o locales si no).
 * El bloque `kanban` del tema custom NO reimplementa nada de esto — sólo lee
 * estos datos ya resueltos y llama a los mismos mutadores que usa la pestaña
 * clásica "Proyectos", incluida la MISMA ficha de tarea (con checklist,
 * notas, comentarios y vinculaciones) al abrir una tarea.
 *
 * Los arrays quedan tipados `any[]` a propósito: son los mismos objetos
 * `BusinessProject`/`BusinessColumn`/`BusinessTask`/`ClientItem` que ya
 * existen en `index.tsx` (tipos privados de ese archivo, no exportados) —
 * clonar esas interfaces acá sólo para satisfacer al compilador sería
 * duplicar una fuente de verdad sin ganar nada en runtime.
 *
 * Fase 2 no expone crear/renombrar/borrar COLUMNAS desde el widget embebido
 * a propósito (esas acciones asumen "el proyecto seleccionado" en el estado
 * de la pestaña clásica — mezclarlas con un widget que puede apuntar a
 * CUALQUIER proyecto sin estar "seleccionado" es una fuente de bugs sutiles).
 * Para eso sigue estando la pestaña "Proyectos" completa.
 */
export type BwBoardContextValue = {
  projects: any[];
  columns: any[];
  tasks: any[];
  clients: any[];
  onCreateTask: (columnId: string, title: string) => void;
  onMoveTask: (taskId: string, toColumnId: string, insertBeforeId?: string) => void;
  onOpenTask: (taskId: string) => void;
};

export const BoardContext = createContext<BwBoardContextValue | null>(null);

export function useBoardContext(): BwBoardContextValue | null {
  return useContext(BoardContext);
}
