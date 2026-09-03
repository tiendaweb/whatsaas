'use client';

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { KeyedMutator } from 'swr';
import {
  createColumn,
  createTaskItem,
  deleteColumn,
  deleteTaskItem,
  moveTaskToLocation,
  patchColumn,
  patchProject,
  patchTaskItem,
} from '@/lib/plugins/tasks/client/api';
import type { TaskItem, TaskLabel, TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { insertarItem, parchearItem, parchearProyecto, quitarItem } from '../data/arbol';
import { agregarEtiquetaAditiva, slugEtiqueta } from '../data/etiquetas';
import { payloadSucesora } from '../data/recurrencia';
import { ES } from '../i18n/es';
import type { EscrituraEtiquetas, Prioridad, Recurrencia, Tarea, Universo } from '../data/tipos';
import { PRIO_IDS, PRIO_LABELS, REC_IDS, REC_LABELS } from '../data/tipos';
import { primeraColumna, proyectoPorId } from '../data/universo';

type ConfirmFn = (title: string, description: string) => Promise<boolean>;

type Opts = {
  workspaces: TaskWorkspace[] | undefined;
  universo: Universo;
  mutate: KeyedMutator<TaskWorkspace[]>;
  escritura: EscrituraEtiquetas;
  etiquetasConfirmadas: number[];
  onConfirmadas: (projectId: number) => void;
  confirmar: ConfirmFn;
};

async function conRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (first) {
    try {
      return await fn();
    } catch {
      throw first;
    }
  }
}

function toastError(message: string) {
  toast.error(message, { duration: 4000 });
}

export function useMutaciones(opts: Opts) {
  const prevStatus = useRef(new Map<number, Tarea['status']>());
  const { workspaces, universo, mutate, escritura, etiquetasConfirmadas, onConfirmadas, confirmar } = opts;

  const revalidar = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const asegurarEtiquetaEnProyecto = useCallback(async (
    projectId: number,
    etiqueta: TaskLabel,
  ): Promise<string | null> => {
    const proyecto = proyectoPorId(universo, projectId);
    if (!proyecto) return null;
    const existing = (proyecto.labels ?? []).find(
      (label) => label.id === etiqueta.id || label.name.toLowerCase() === etiqueta.name.toLowerCase(),
    );
    if (existing) return existing.id;

    const confirmed = etiquetasConfirmadas.includes(projectId)
      || await confirmar(ES.marca, ES.confirmar.etiquetaEnProyecto(etiqueta.name, proyecto.name));
    if (!confirmed) return null;
    onConfirmadas(projectId);

    const next = agregarEtiquetaAditiva(proyecto.labels ?? [], etiqueta);
    const snapshot = workspaces ?? [];
    await mutate(parchearProyecto(snapshot, projectId, { labels: next }), { revalidate: false });
    try {
      await conRetry(() => patchProject(projectId, { labels: next }));
      await revalidar();
      return etiqueta.id;
    } catch {
      await mutate(snapshot, { revalidate: false });
      toastError(ES.errores.guardar);
      return null;
    }
  }, [confirmar, etiquetasConfirmadas, mutate, onConfirmadas, revalidar, universo, workspaces]);

  const escribirReservadas = useCallback(async (
    projectId: number,
    prioridad: Prioridad,
    recurrencia: Recurrencia,
  ) => {
    const proyecto = proyectoPorId(universo, projectId);
    if (!proyecto) return false;
    const labels = proyecto.labels ?? [];
    const hasPrio = labels.some((label) => label.id.startsWith('prio-'));
    const hasRec = labels.some((label) => label.id.startsWith('rec-'));
    const needed: TaskLabel[] = [];
    if (!hasPrio) needed.push(PRIO_LABELS.baja, PRIO_LABELS.media, PRIO_LABELS.alta);
    if (recurrencia !== 'unica' && !hasRec) needed.push(REC_LABELS[recurrencia]);
    if (needed.length === 0) return true;
    if (escritura === 'conservadora') return hasPrio || prioridad === 'media';
    for (const label of needed) {
      const id = await asegurarEtiquetaEnProyecto(projectId, label);
      if (!id) return false;
    }
    return true;
  }, [asegurarEtiquetaEnProyecto, escritura, universo]);

  const labelIdsPara = useCallback((
    tarea: Pick<Tarea, 'labelIds' | 'etiquetas' | 'prioridad' | 'recurrencia'>,
    optsWrite: { prio: boolean; rec: boolean },
  ) => {
    const kept = tarea.labelIds.filter((id) => !id.startsWith('prio-') && !id.startsWith('rec-'));
    const next = [...kept];
    if (optsWrite.prio) next.push(PRIO_IDS[tarea.prioridad]);
    if (optsWrite.rec && tarea.recurrencia !== 'unica') next.push(REC_IDS[tarea.recurrencia]);
    return Array.from(new Set(next));
  }, []);

  const crearTarea = useCallback(async (input: {
    title: string;
    notes?: string;
    dueDate?: string | null;
    prioridad?: Prioridad;
    recurrencia?: Recurrencia;
    etiquetas?: { name: string; color?: string }[];
    projectId: number;
    columnId?: number;
  }) => {
    const proyecto = proyectoPorId(universo, input.projectId);
    const columna = input.columnId
      ? proyecto?.columns.find((col) => col.id === input.columnId)
      : primeraColumna(proyecto);
    if (!proyecto || !columna) {
      toastError(ES.ajustes.sinColumnas);
      return null;
    }

    const prioridad = input.prioridad ?? 'media';
    const recurrencia = input.recurrencia ?? 'unica';
    const labels = proyecto.labels ?? [];
    const hasPrio = labels.some((label) => label.id.startsWith('prio-'));
    const hasRec = labels.some((label) => label.id.startsWith('rec-'));
    await escribirReservadas(proyecto.id, prioridad, recurrencia);

    const labelIds: string[] = [];
    if (hasPrio || escritura === 'completa') {
      labelIds.push(PRIO_IDS[prioridad]);
    }
    if (recurrencia !== 'unica' && (hasRec || escritura === 'completa')) {
      labelIds.push(REC_IDS[recurrencia]);
    }
    for (const etiqueta of input.etiquetas ?? []) {
      const id = `tag-${slugEtiqueta(etiqueta.name)}`;
      const written = await asegurarEtiquetaEnProyecto(proyecto.id, {
        id,
        name: etiqueta.name,
        color: etiqueta.color ?? '#6366f1',
      });
      if (written) labelIds.push(written);
    }

    try {
      const created = await conRetry(() => createTaskItem({
        columnId: columna.id,
        title: input.title,
        notes: input.notes,
        dueDate: input.dueDate ?? null,
        labelIds,
        status: 'open',
      })) as TaskItem;
      await mutate((current) => insertarItem(current ?? [], proyecto.id, columna.id, created), { revalidate: true });
      return created;
    } catch {
      toastError(ES.errores.crear);
      return null;
    }
  }, [asegurarEtiquetaEnProyecto, escribirReservadas, escritura, mutate, universo]);

  const actualizarTarea = useCallback(async (
    tarea: Tarea,
    cambios: Partial<Pick<Tarea,
      | 'title'
      | 'notes'
      | 'aiPrompt'
      | 'aiNextStep'
      | 'aiContextQuestion'
      | 'aiContextAnswer'
      | 'aiReadyAt'
      | 'dueDate'
      | 'prioridad'
      | 'recurrencia'
      | 'subtareas'
      | 'status'
      | 'etiquetas'
    >>,
  ) => {
    const next: Tarea = { ...tarea, ...cambios };
    const proyecto = proyectoPorId(universo, tarea.projectId);
    const hasPrio = (proyecto?.labels ?? []).some((label) => label.id.startsWith('prio-'));
    const hasRec = (proyecto?.labels ?? []).some((label) => label.id.startsWith('rec-'));

    if (cambios.prioridad || cambios.recurrencia) {
      const ok = await escribirReservadas(tarea.projectId, next.prioridad, next.recurrencia);
      if (!ok && cambios.prioridad && !hasPrio) {
        toastError(ES.modal.prioridadBloqueada);
        return false;
      }
    }

    if (cambios.etiquetas) {
      for (const etiqueta of next.etiquetas) {
        await asegurarEtiquetaEnProyecto(tarea.projectId, {
          id: etiqueta.id.startsWith('tag-') ? etiqueta.id : `tag-${slugEtiqueta(etiqueta.name)}`,
          name: etiqueta.name,
          color: etiqueta.color,
        });
      }
    }

    const writePrio = hasPrio || escritura === 'completa';
    const writeRec = hasRec || next.recurrencia !== 'unica';
    const labelIds = labelIdsPara(next, { prio: writePrio, rec: writeRec });

    const snapshot = workspaces ?? [];
    await mutate(parchearItem(snapshot, tarea.id, {
      title: next.title,
      notes: next.notes,
      aiPrompt: next.aiPrompt,
      aiNextStep: next.aiNextStep,
      aiContextQuestion: next.aiContextQuestion,
      aiContextAnswer: next.aiContextAnswer,
      aiReadyAt: next.aiReadyAt,
      dueDate: next.dueDate,
      status: next.status,
      labelIds,
      checklist: next.subtareas,
    }), { revalidate: false });

    try {
      await conRetry(() => patchTaskItem(tarea.id, {
        title: next.title,
        notes: next.notes,
        aiPrompt: next.aiPrompt,
        aiNextStep: next.aiNextStep,
        aiContextQuestion: next.aiContextQuestion,
        aiContextAnswer: next.aiContextAnswer,
        aiReadyAt: next.aiReadyAt,
        dueDate: next.dueDate,
        labelIds,
        checklist: next.subtareas,
        status: next.status,
      }));
      await revalidar();
      return true;
    } catch {
      await mutate(snapshot, { revalidate: false });
      toastError(ES.errores.guardar);
      return false;
    }
  }, [asegurarEtiquetaEnProyecto, escribirReservadas, escritura, labelIdsPara, mutate, revalidar, universo, workspaces]);

  const completarTarea = useCallback(async (tarea: Tarea, completada: boolean) => {
    if (completada) {
      if (tarea.status !== 'done') prevStatus.current.set(tarea.id, tarea.status);
      const snapshot = workspaces ?? [];
      await mutate(parchearItem(snapshot, tarea.id, {
        status: 'done',
        completedAt: new Date().toISOString(),
      }), { revalidate: false });
      try {
        await conRetry(() => patchTaskItem(tarea.id, { status: 'done' }));
        if (tarea.recurrencia !== 'unica') {
          try {
            await conRetry(() => createTaskItem(payloadSucesora(tarea)));
          } catch {
            await conRetry(() => patchTaskItem(tarea.id, { status: prevStatus.current.get(tarea.id) ?? 'open' }));
            await mutate(snapshot, { revalidate: false });
            toastError(ES.errores.recurrencia);
            return false;
          }
        }
        await revalidar();
        return true;
      } catch {
        await mutate(snapshot, { revalidate: false });
        toastError(ES.errores.guardar);
        return false;
      }
    }

    const restored = prevStatus.current.get(tarea.id) ?? 'open';
    const snapshot = workspaces ?? [];
    await mutate(parchearItem(snapshot, tarea.id, { status: restored, completedAt: null }), { revalidate: false });
    try {
      await conRetry(() => patchTaskItem(tarea.id, { status: restored }));
      await revalidar();
      return true;
    } catch {
      await mutate(snapshot, { revalidate: false });
      toastError(ES.errores.guardar);
      return false;
    }
  }, [mutate, revalidar, workspaces]);

  const eliminarTarea = useCallback(async (tarea: Tarea) => {
    const ok = await confirmar(ES.seleccion.eliminar, ES.confirmar.borrarTarea(tarea.title, tarea.proyectoNombre));
    if (!ok) return false;
    const snapshot = workspaces ?? [];
    await mutate(quitarItem(snapshot, tarea.id), { revalidate: false });
    try {
      await conRetry(() => deleteTaskItem(tarea.id));
      await revalidar();
      return true;
    } catch {
      await mutate(snapshot, { revalidate: false });
      toastError(ES.errores.borrar);
      return false;
    }
  }, [confirmar, mutate, revalidar, workspaces]);

  const eliminarMuchas = useCallback(async (tareas: Tarea[]) => {
    if (!tareas.length) return false;
    const proyectos = new Set(tareas.map((tarea) => tarea.projectId));
    const ok = await confirmar(ES.seleccion.eliminar, ES.confirmar.borrarTareas(tareas.length, proyectos.size));
    if (!ok) return false;
    const snapshot = workspaces ?? [];
    let tree = snapshot;
    for (const tarea of tareas) tree = quitarItem(tree, tarea.id);
    await mutate(tree, { revalidate: false });
    try {
      for (const tarea of tareas) {
        await conRetry(() => deleteTaskItem(tarea.id));
      }
      await revalidar();
      return true;
    } catch {
      await mutate(snapshot, { revalidate: false });
      toastError(ES.errores.borrar);
      return false;
    }
  }, [confirmar, mutate, revalidar, workspaces]);

  const moverTarea = useCallback(async (tarea: Tarea, projectId: number, columnId?: number) => {
    const proyecto = proyectoPorId(universo, projectId);
    const columna = columnId
      ? proyecto?.columns.find((col) => col.id === columnId)
      : primeraColumna(proyecto);
    if (!proyecto || !columna) return false;
    const snapshot = workspaces ?? [];
    try {
      await conRetry(() => moveTaskToLocation(tarea.id, proyecto.id, columna.id));
      await revalidar();
      return true;
    } catch {
      await mutate(snapshot, { revalidate: false });
      toastError(ES.errores.guardar);
      return false;
    }
  }, [mutate, revalidar, universo, workspaces]);

  const asignarTarea = useCallback(async (tarea: Tarea, miembroId: number) => {
    if ((tarea.assigneeId ?? tarea.createdBy) === miembroId) return true;
    const snapshot = workspaces ?? [];
    await mutate(parchearItem(snapshot, tarea.id, { assigneeId: miembroId }), { revalidate: false });
    try {
      await conRetry(() => patchTaskItem(tarea.id, { assigneeId: miembroId }));
      await revalidar();
      return true;
    } catch {
      await mutate(snapshot, { revalidate: false });
      toastError(ES.errores.guardar);
      return false;
    }
  }, [mutate, revalidar, workspaces]);

  const reordenar = useCallback(async (columnId: number, ids: number[]) => {
    const snapshot = workspaces ?? [];
    try {
      await Promise.all(ids.map((id, order) => patchTaskItem(id, { columnId, order })));
      await revalidar();
    } catch {
      await mutate(snapshot, { revalidate: false });
      toastError(ES.errores.guardar);
    }
  }, [mutate, revalidar, workspaces]);

  const crearColumna = useCallback(async (projectId: number, title: string) => {
    try {
      await conRetry(() => createColumn(projectId, title));
      await revalidar();
      return true;
    } catch {
      toastError(ES.errores.guardar);
      return false;
    }
  }, [revalidar]);

  const renombrarColumna = useCallback(async (columnId: number, title: string) => {
    try {
      await conRetry(() => patchColumn(columnId, { title }));
      await revalidar();
    } catch {
      toastError(ES.errores.guardar);
    }
  }, [revalidar]);

  const borrarColumna = useCallback(async (columnId: number) => {
    const ok = await confirmar(ES.seleccion.eliminar, ES.confirmar.borrarTarea('esta columna', ''));
    if (!ok) return;
    try {
      await conRetry(() => deleteColumn(columnId));
      await revalidar();
    } catch {
      toastError(ES.errores.borrar);
    }
  }, [confirmar, revalidar]);

  const renombrarEtiquetaUnificada = useCallback(async (
    etiqueta: { name: string; projectIds: number[]; ids: string[] },
    nuevoNombre: string,
  ) => {
    const proyectos = etiqueta.projectIds
      .map((id) => proyectoPorId(universo, id))
      .filter((proyecto): proyecto is NonNullable<typeof proyecto> => !!proyecto);
    const ok = await confirmar(
      ES.ajustes.gestionEtiquetas,
      ES.confirmar.renombrarEtiqueta(etiqueta.name, proyectos.map((p) => p.name)),
    );
    if (!ok) return;
    try {
      for (const proyecto of proyectos) {
        const next = (proyecto.labels ?? []).map((label) => (
          etiqueta.ids.includes(label.id) ? { ...label, name: nuevoNombre } : label
        ));
        await patchProject(proyecto.id, { labels: next });
      }
      await revalidar();
    } catch {
      toastError(ES.errores.guardar);
    }
  }, [confirmar, revalidar, universo]);

  const borrarEtiquetaUnificada = useCallback(async (
    etiqueta: { name: string; projectIds: number[]; ids: string[] },
  ) => {
    const proyectos = etiqueta.projectIds
      .map((id) => proyectoPorId(universo, id))
      .filter((proyecto): proyecto is NonNullable<typeof proyecto> => !!proyecto);
    const ok = await confirmar(
      ES.ajustes.gestionEtiquetas,
      ES.confirmar.borrarEtiqueta(etiqueta.name, proyectos.map((p) => p.name)),
    );
    if (!ok) return;
    try {
      for (const proyecto of proyectos) {
        const nextLabels = (proyecto.labels ?? []).filter((label) => !etiqueta.ids.includes(label.id));
        await patchProject(proyecto.id, { labels: nextLabels });
        for (const columna of proyecto.columns) {
          for (const item of columna.items) {
            if (item.labelIds.some((id) => etiqueta.ids.includes(id))) {
              await patchTaskItem(item.id, {
                labelIds: item.labelIds.filter((id) => !etiqueta.ids.includes(id)),
                status: item.status,
              });
            }
          }
        }
      }
      await revalidar();
    } catch {
      toastError(ES.errores.guardar);
    }
  }, [confirmar, revalidar, universo]);

  const limpiarCompletadas = useCallback(async (projectId: number) => {
    const proyecto = proyectoPorId(universo, projectId);
    if (!proyecto) return;
    const done = proyecto.columns.flatMap((col) => col.items.filter((item) => item.status === 'done'));
    const ok = await confirmar(
      ES.ajustes.limpiarCompletadas,
      ES.ajustes.limpiarConfirmar(done.length, proyecto.name),
    );
    if (!ok) return;
    try {
      for (const item of done) await deleteTaskItem(item.id);
      await revalidar();
    } catch {
      toastError(ES.errores.borrar);
    }
  }, [confirmar, revalidar, universo]);

  return {
    crearTarea,
    actualizarTarea,
    completarTarea,
    eliminarTarea,
    eliminarMuchas,
    moverTarea,
    asignarTarea,
    reordenar,
    crearColumna,
    renombrarColumna,
    borrarColumna,
    asegurarEtiquetaEnProyecto,
    escribirReservadas,
    renombrarEtiquetaUnificada,
    borrarEtiquetaUnificada,
    limpiarCompletadas,
  };
}
