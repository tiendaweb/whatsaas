import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskItems, type TaskChecklistItem } from '@/lib/db/schema';
import { archiveClientProject } from '@/lib/plugins/tasks/server/client-projects';
import { createTaskProject } from '@/lib/plugins/tasks/server/projects';
import { patchTaskItem, type TaskPatchInput } from '@/lib/plugins/tasks/server/task-os';

/**
 * Las escrituras de la vista Proyectos de Empresa.
 *
 * Ninguna toca la base por su cuenta: todas pasan por las mismas funciones que
 * usa Tareas OS (`patchTaskItem`, `createTaskProject`, `archiveClientProject`),
 * que son las que mantienen las invariantes —mover de columna reubica la fila
 * de posición, completar la última checklist cierra la tarea, archivar exige
 * que no quede trabajo abierto—. Empresa no reimplementa ninguna de ésas.
 *
 * Las checklists se editan acá y no en el navegador a propósito: el JSON de la
 * tarea se guarda entero de una vez, así que si el cliente mandara la lista que
 * tiene en pantalla, cualquier ítem que no hubiera viajado se borraría. Leer,
 * modificar y escribir del lado del servidor hace imposible esa pérdida.
 */

export type ResultadoAccion<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const MAX_ITEMS_CHECKLIST = 200;

/** La tarea, acotada al equipo. Sin esto se podría editar la tarea de otro. */
async function leerTarea(teamId: number, taskId: number) {
  return db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, taskId), eq(teamTaskItems.teamId, teamId)),
  });
}

async function guardarChecklist(
  teamId: number,
  taskId: number,
  checklist: TaskChecklistItem[],
): Promise<ResultadoAccion<TaskChecklistItem[]>> {
  const resultado = await patchTaskItem({ teamId, taskId, patch: { checklist } });
  if ('error' in resultado) return { ok: false, status: 404, error: 'Tarea no encontrada.' };
  return { ok: true, data: resultado.item.checklist ?? [] };
}

export async function crearProyecto(
  teamId: number,
  userId: number,
  input: { nombre: string; workspaceId?: number | null },
): Promise<ResultadoAccion<{ id: number; name: string }>> {
  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, status: 400, error: 'Poné un nombre para el proyecto.' };
  if (nombre.length > 200) return { ok: false, status: 400, error: 'El nombre es demasiado largo.' };

  const proyecto = await createTaskProject({
    teamId,
    userId,
    name: nombre,
    workspaceId: input.workspaceId ?? null,
  });
  return { ok: true, data: { id: proyecto.id, name: proyecto.name } };
}

/**
 * Los campos de la tarea que se pueden tocar desde Empresa.
 *
 * Es un subconjunto explícito y no un `patch` libre: la ruta recibe JSON del
 * navegador, y `patchTaskItem` acepta cosas como `parentTaskId` o los campos de
 * IA que esta pantalla no muestra. Dejar pasar el objeto entero convertiría a
 * este endpoint en un editor de tareas sin interfaz.
 */
export type EdicionTarea = {
  titulo?: string;
  notas?: string;
  columnaId?: number;
  responsableId?: number | null;
  inicio?: string | null;
  fin?: string | null;
  etiquetaIds?: string[];
  hecha?: boolean;
};

export async function editarTarea(
  teamId: number,
  taskId: number,
  edicion: EdicionTarea,
): Promise<ResultadoAccion<{ id: number }>> {
  const patch: TaskPatchInput = {};

  if (edicion.titulo !== undefined) {
    const titulo = edicion.titulo.trim();
    if (!titulo) return { ok: false, status: 400, error: 'La tarea necesita un título.' };
    if (titulo.length > 500) return { ok: false, status: 400, error: 'El título es demasiado largo.' };
    patch.title = titulo;
  }
  if (edicion.notas !== undefined) patch.notes = edicion.notas;
  if (edicion.columnaId !== undefined) patch.columnId = edicion.columnaId;
  if (edicion.responsableId !== undefined) patch.assigneeId = edicion.responsableId;
  if (edicion.etiquetaIds !== undefined) patch.labelIds = edicion.etiquetaIds;

  // El Gantt lee `inicio`/`fin`; `fin` se guarda en `endDate`, que es de donde
  // sale la fecha que muestra la vista.
  if (edicion.inicio !== undefined) patch.startDate = edicion.inicio || null;
  if (edicion.fin !== undefined) patch.endDate = edicion.fin || null;

  // `hecha` es el estado real del tablero; `patchTaskItem` se encarga de la
  // marca de completado y de su fecha.
  if (edicion.hecha !== undefined) patch.status = edicion.hecha ? 'done' : 'open';

  if (!Object.keys(patch).length) return { ok: false, status: 400, error: 'No hay nada que cambiar.' };

  const resultado = await patchTaskItem({ teamId, taskId, patch });
  if ('error' in resultado) {
    if (resultado.error === 'column_not_found') return { ok: false, status: 404, error: 'La columna no existe.' };
    if (resultado.error === 'column_project_mismatch') {
      return { ok: false, status: 400, error: 'Esa columna es de otro proyecto.' };
    }
    return { ok: false, status: 404, error: 'Tarea no encontrada.' };
  }
  return { ok: true, data: { id: resultado.item.id } };
}

export async function agregarItemChecklist(
  teamId: number,
  taskId: number,
  texto: string,
): Promise<ResultadoAccion<TaskChecklistItem[]>> {
  const limpio = texto.trim();
  if (!limpio) return { ok: false, status: 400, error: 'Escribí el ítem antes de agregarlo.' };
  if (limpio.length > 500) return { ok: false, status: 400, error: 'El ítem es demasiado largo.' };

  const tarea = await leerTarea(teamId, taskId);
  if (!tarea) return { ok: false, status: 404, error: 'Tarea no encontrada.' };

  const actual = tarea.checklist ?? [];
  if (actual.length >= MAX_ITEMS_CHECKLIST) {
    return { ok: false, status: 409, error: `Una tarea no puede tener más de ${MAX_ITEMS_CHECKLIST} ítems.` };
  }

  // Mismo formato de id que usa Tareas OS al agregar un paso, para que una
  // checklist editada desde acá sea indistinguible de una editada allá.
  const nuevo: TaskChecklistItem = {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: limpio,
    completed: false,
  };
  return guardarChecklist(teamId, taskId, [...actual, nuevo]);
}

export async function alternarItemChecklist(
  teamId: number,
  taskId: number,
  itemId: string,
  hecho: boolean,
): Promise<ResultadoAccion<TaskChecklistItem[]>> {
  const tarea = await leerTarea(teamId, taskId);
  if (!tarea) return { ok: false, status: 404, error: 'Tarea no encontrada.' };

  const actual = tarea.checklist ?? [];
  if (!actual.some((item) => item.id === itemId)) {
    return { ok: false, status: 404, error: 'Ese ítem ya no está en la checklist.' };
  }
  const siguiente = actual.map((item) => (item.id === itemId ? { ...item, completed: hecho } : item));
  return guardarChecklist(teamId, taskId, siguiente);
}

export async function quitarItemChecklist(
  teamId: number,
  taskId: number,
  itemId: string,
): Promise<ResultadoAccion<TaskChecklistItem[]>> {
  const tarea = await leerTarea(teamId, taskId);
  if (!tarea) return { ok: false, status: 404, error: 'Tarea no encontrada.' };

  const actual = tarea.checklist ?? [];
  const siguiente = actual.filter((item) => item.id !== itemId);
  if (siguiente.length === actual.length) {
    return { ok: false, status: 404, error: 'Ese ítem ya no está en la checklist.' };
  }
  return guardarChecklist(teamId, taskId, siguiente);
}

export async function archivarProyecto(
  teamId: number,
  userId: number,
  proyectoId: number,
): Promise<ResultadoAccion<{ proyectoId: number; clienteId: number }>> {
  const resultado = await archiveClientProject(teamId, userId, proyectoId);
  if (!resultado.ok) return { ok: false, status: resultado.status, error: resultado.error };
  return { ok: true, data: { proyectoId: resultado.projectId, clienteId: resultado.customerId } };
}
