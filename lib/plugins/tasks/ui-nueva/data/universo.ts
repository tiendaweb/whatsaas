import type { TaskColumn, TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { mapearTarea } from './mapeo';
import type { GrupoProyecto, Tarea, Universo } from './tipos';

export function construirUniverso(workspaces: TaskWorkspace[] | undefined): Universo {
  const proyectos: TaskProject[] = [];
  const columnas: TaskColumn[] = [];

  /**
   * UNA entrada por TAREA, no por ubicación.
   *
   * El backend devuelve la tarea una vez por cada tablero donde vive (una
   * tarea compartida en dos proyectos viene dos veces). Antes eso se volcaba
   * tal cual a la lista, con dos consecuencias: la tarea se veía duplicada, y
   * como la clave de React es el id de la tarea, quedaban dos filas con la
   * MISMA clave — React las confunde al reordenar, que es por qué el arrastre
   * se comportaba de forma errática.
   *
   * Se conserva la ubicación principal y las demás quedan como `espejos`,
   * para poder mostrar en qué otros tableros está.
   */
  const porTarea = new Map<number, Tarea>();

  for (const workspace of workspaces ?? []) {
    for (const proyecto of workspace.projects ?? []) {
      proyectos.push(proyecto);
      for (const columna of proyecto.columns ?? []) {
        columnas.push(columna);
        for (const item of columna.items ?? []) {
          const mapeada = mapearTarea(item, proyecto, workspace);
          const previa = porTarea.get(mapeada.id);

          if (!previa) {
            porTarea.set(mapeada.id, mapeada);
            continue;
          }

          // Ya estaba: la que manda es la ubicación principal; la otra se
          // registra como espejo en ambos sentidos.
          const estaEsPrincipal = item.isPrimaryLocation === true;
          const principal = estaEsPrincipal ? mapeada : previa;
          const secundaria = estaEsPrincipal ? previa : mapeada;

          principal.espejos = [
            ...(previa.espejos ?? []),
            ...(mapeada.espejos ?? []),
            {
              projectId: secundaria.projectId,
              projectName: secundaria.proyectoNombre,
              workspaceName: secundaria.workspaceNombre || null,
            },
          ].filter((espejo, index, todos) =>
            espejo.projectId !== principal.projectId
            && todos.findIndex((otro) => otro.projectId === espejo.projectId) === index);

          porTarea.set(mapeada.id, principal);
        }
      }
    }
  }

  return { workspaces: workspaces ?? [], proyectos, columnas, tareas: [...porTarea.values()] };
}

export function agruparProyectos(proyectos: TaskProject[], workspaces: TaskWorkspace[], tareas: Tarea[] = []): GrupoProyecto[] {
  const wsName = new Map(workspaces.map((ws) => [ws.id, ws.name]));
  const taskCounts = new Map<number, { total: number; active: number }>();
  for (const tarea of tareas) {
    const counts = taskCounts.get(tarea.projectId) ?? { total: 0, active: 0 };
    counts.total += 1;
    if (tarea.status !== 'done' && !tarea.aiReadyAt) counts.active += 1;
    taskCounts.set(tarea.projectId, counts);
  }
  const groups = new Map<string, GrupoProyecto>();

  for (const proyecto of proyectos) {
    const workspaceId = proyecto.workspaceId ?? 0;
    const key = `${workspaceId}::${proyecto.name}`;
    const existing = groups.get(key);
    if (existing) {
      existing.projectIds.push(proyecto.id);
      const counts = taskCounts.get(proyecto.id);
      existing.totalTasks += counts?.total ?? 0;
      existing.activeTasks += counts?.active ?? 0;
      continue;
    }
    const counts = taskCounts.get(proyecto.id);
    groups.set(key, {
      key,
      name: proyecto.name,
      workspaceId,
      workspaceNombre: wsName.get(workspaceId) ?? '',
      color: proyecto.color ?? null,
      projectIds: [proyecto.id],
      totalTasks: counts?.total ?? 0,
      activeTasks: counts?.active ?? 0,
    });
  }

  return Array.from(groups.values());
}

export function primeraColumna(proyecto: TaskProject | null | undefined) {
  if (!proyecto?.columns?.length) return null;
  return [...proyecto.columns].sort((a, b) => a.order - b.order || a.id - b.id)[0] ?? null;
}

export function proyectoPorId(universo: Universo, projectId: number | null | undefined) {
  if (!projectId) return null;
  return universo.proyectos.find((proyecto) => proyecto.id === projectId) ?? null;
}

export function workspacePorId(universo: Universo, workspaceId: number | null | undefined) {
  if (!workspaceId) return null;
  return universo.workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
}

export function esProyectoEjemplo(name: string): boolean {
  return /^mi proyecto os$/i.test(name.trim());
}

export function nombreNormalizado(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function esEspacioEquipo(name: string): boolean {
  return nombreNormalizado(name) === 'equipo';
}

export function chipOrigen(tarea: Tarea): string {
  if (tarea.workspaceNombre && tarea.proyectoNombre) {
    return `${tarea.workspaceNombre} · ${tarea.proyectoNombre}`;
  }
  return tarea.proyectoNombre;
}
