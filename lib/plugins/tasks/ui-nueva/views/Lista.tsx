'use client';

import { ListaTareas } from '../components/ListaTareas';
import type { GrupoFecha } from '../data/vistas';
import type { Tarea } from '../data/tipos';

export function Lista(props: {
  grupos: GrupoFecha[] | null;
  tareas: Tarea[];
  mostrarOrigen: boolean;
  puedeArrastrar: boolean;
  seleccionable: boolean;
  seleccion: Set<number>;
  vacioTitulo?: string;
  vacioDetalle?: string;
  onToggle: (tarea: Tarea) => void;
  onPrepare?: (tarea: Tarea) => void;
  onOpen: (tarea: Tarea) => void;
  onReorder?: (fromId: number, toId: number, posicion: 'antes' | 'despues') => void;
  clientesPorTarea?: Record<number, { id: number; name: string; tipo: 'cliente' | 'lead' }[]>;
  onAbrirCliente?: (id: number) => void;
  /** Un lead no tiene ficha de cliente propia: abre la ficha en modo lead. */
  onAbrirLead?: (contactId: number) => void;
  onAbrirProyecto?: (projectId: number) => void;
  onAbrirWorkspace?: (workspaceId: number) => void;
}) {
  return <ListaTareas {...props} />;
}
