'use client';

import { C } from '../data/clases';
import type { EtiquetaUnificada } from '../data/tipos';
import { ES } from '../i18n/es';

type WorkspaceLite = { id: number; name: string };
type ProyectoLite = { id: number; name: string; workspaceId: number | null };
export function FiltrosEquipo(props: {
  workspaces: WorkspaceLite[];
  proyectos: ProyectoLite[];
  etiquetas: EtiquetaUnificada[];
  workspaceId: number | null;
  projectId: number | null;
  etiqueta: string | null;
  onWorkspace: (id: number | null) => void;
  onProject: (id: number | null) => void;
  onEtiqueta: (name: string | null) => void;
}) {
  const proyectos = props.workspaceId
    ? props.proyectos.filter((proyecto) => proyecto.workspaceId === props.workspaceId)
    : props.proyectos;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <label className="space-y-1 min-w-0">
        <span className={C.rotulo}>{ES.equipo.filtrarEspacio}</span>
        <select
          value={props.workspaceId ?? ''}
          onChange={(event) => {
            props.onWorkspace(event.target.value ? Number(event.target.value) : null);
            props.onProject(null);
          }}
          className={C.control}
        >
          <option value="">{ES.equipo.todos}</option>
          {props.workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1 min-w-0">
        <span className={C.rotulo}>{ES.equipo.filtrarProyecto}</span>
        <select
          value={props.projectId ?? ''}
          onChange={(event) => props.onProject(event.target.value ? Number(event.target.value) : null)}
          className={C.control}
        >
          <option value="">{ES.equipo.todos}</option>
          {proyectos.map((proyecto) => (
            <option key={proyecto.id} value={proyecto.id}>{proyecto.name}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1 min-w-0">
        <span className={C.rotulo}>{ES.equipo.filtrarEtiqueta}</span>
        <select
          value={props.etiqueta ?? ''}
          onChange={(event) => props.onEtiqueta(event.target.value || null)}
          className={C.control}
        >
          <option value="">{ES.equipo.todos}</option>
          {props.etiquetas.map((etiqueta) => (
            <option key={etiqueta.name} value={etiqueta.name}>{etiqueta.name}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
