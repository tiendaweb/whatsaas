import type { TaskItem, TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';

export function mapearArbol(
  workspaces: TaskWorkspace[],
  fn: (item: TaskItem, proyecto: TaskProject, workspace: TaskWorkspace) => TaskItem | null,
): TaskWorkspace[] {
  return workspaces.map((workspace) => ({
    ...workspace,
    projects: workspace.projects.map((proyecto) => ({
      ...proyecto,
      columns: proyecto.columns.map((columna) => ({
        ...columna,
        items: columna.items
          .map((item) => fn(item, proyecto, workspace))
          .filter((item): item is TaskItem => item !== null),
      })),
    })),
  }));
}

export function parchearItem(workspaces: TaskWorkspace[], taskId: number, patch: Partial<TaskItem>): TaskWorkspace[] {
  return mapearArbol(workspaces, (item) => (item.id === taskId ? { ...item, ...patch } : item));
}

export function quitarItem(workspaces: TaskWorkspace[], taskId: number): TaskWorkspace[] {
  return mapearArbol(workspaces, (item) => (item.id === taskId ? null : item));
}

export function insertarItem(
  workspaces: TaskWorkspace[],
  projectId: number,
  columnId: number,
  item: TaskItem,
): TaskWorkspace[] {
  return workspaces.map((workspace) => ({
    ...workspace,
    projects: workspace.projects.map((proyecto) => {
      if (proyecto.id !== projectId) return proyecto;
      return {
        ...proyecto,
        columns: proyecto.columns.map((columna) => (
          columna.id === columnId
            ? { ...columna, items: [...columna.items, item] }
            : columna
        )),
      };
    }),
  }));
}

export function parchearProyecto(
  workspaces: TaskWorkspace[],
  projectId: number,
  patch: Partial<TaskProject>,
): TaskWorkspace[] {
  return workspaces.map((workspace) => ({
    ...workspace,
    projects: workspace.projects.map((proyecto) => (
      proyecto.id === projectId ? { ...proyecto, ...patch } : proyecto
    )),
  }));
}
