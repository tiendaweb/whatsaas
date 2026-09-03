import {
  createProject,
  moveProjectToWorkspace,
  renameWorkspace,
} from '@/lib/plugins/tasks/client/api';
import type { TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { nombreNormalizado } from './universo';

function findWs(list: TaskWorkspace[], ...nombres: string[]) {
  const wanted = new Set(nombres.map(nombreNormalizado));
  return list.find((ws) => wanted.has(nombreNormalizado(ws.name))) ?? null;
}

function allProjects(list: TaskWorkspace[]) {
  return list.flatMap((ws) => (ws.projects ?? []).map((project) => ({
    ...project,
    workspaceId: project.workspaceId ?? ws.id,
  })));
}

/**
 * Idempotent one-shot setup:
 * AAPP SPACE → Ventas, Seguimiento under Ventas,
 * Equipo → Administración, then a new Equipo workspace.
 */
export async function asegurarEspaciosOperativos(workspaces: TaskWorkspace[]): Promise<boolean> {
  const list = workspaces.slice();
  let changed = false;

  const aapp = findWs(list, 'aapp space', 'aapp');
  let ventas = findWs(list, 'ventas');
  if (aapp && !ventas) {
    await renameWorkspace(aapp.id, 'Ventas');
    aapp.name = 'Ventas';
    ventas = aapp;
    changed = true;
  }

  // Antes acá se creaban solos los espacios "Administración" y "Equipo".
  // Quedaban vacíos para siempre y, al borrarlos, volvían en la siguiente
  // carga. Los espacios los crea el equipo cuando los necesita.

  ventas = findWs(list, 'ventas');
  if (ventas) {
    const seguimiento = allProjects(list).find((project) => nombreNormalizado(project.name) === 'seguimiento');
    if (seguimiento && seguimiento.workspaceId !== ventas.id) {
      await moveProjectToWorkspace(seguimiento.id, ventas.id);
      changed = true;
    } else if (!seguimiento) {
      await createProject('Seguimiento', ventas.id);
      changed = true;
    }
  }

  return changed;
}
