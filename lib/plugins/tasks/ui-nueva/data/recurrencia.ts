import type { CreateTaskInput } from '@/lib/plugins/tasks/client/types';
import { sumarDiasIso, sumarMesesIso } from './fechas';
import type { Recurrencia, Tarea } from './tipos';
import { PRIO_IDS, REC_IDS } from './tipos';

export function siguienteFecha(recurrencia: Recurrencia, dueDate: string | null): string | null {
  if (recurrencia === 'unica') return dueDate;
  if (recurrencia === 'diaria') return sumarDiasIso(dueDate, 1);
  if (recurrencia === 'semanal') return sumarDiasIso(dueDate, 7);
  return sumarMesesIso(dueDate, 1);
}

export function payloadSucesora(tarea: Tarea): CreateTaskInput {
  const labelIds = [
    ...tarea.labelIds.filter((id) => !id.startsWith('prio-') && !id.startsWith('rec-')),
    PRIO_IDS[tarea.prioridad],
    ...(tarea.recurrencia !== 'unica' ? [REC_IDS[tarea.recurrencia]] : []),
  ];
  return {
    columnId: tarea.columnId,
    title: tarea.title,
    notes: tarea.notes,
    dueDate: siguienteFecha(tarea.recurrencia, tarea.dueDate),
    labelIds,
    checklist: tarea.subtareas.map((step) => ({ ...step, completed: false })),
    status: 'open',
  };
}
