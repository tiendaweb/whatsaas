import type { TaskItem, TaskLabel, TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { esReservada, prioridadPorNombre } from './etiquetas';
import type { Prioridad, Recurrencia, Tarea } from './tipos';

function statusDe(value: string | null | undefined): Tarea['status'] {
  if (value === 'done' || value === 'in_progress') return value;
  return 'open';
}

function prioridadDe(item: TaskItem, labels: TaskLabel[]): Prioridad {
  if (item.labelIds?.includes('prio-high')) return 'alta';
  if (item.labelIds?.includes('prio-low')) return 'baja';
  if (item.labelIds?.includes('prio-medium')) return 'media';
  return prioridadPorNombre(labels, item.labelIds ?? []) ?? 'media';
}

function recurrenciaDe(item: TaskItem): Recurrencia {
  if (item.labelIds?.includes('rec-daily')) return 'diaria';
  if (item.labelIds?.includes('rec-weekly')) return 'semanal';
  if (item.labelIds?.includes('rec-monthly')) return 'mensual';
  return 'unica';
}

export function mapearTarea(
  item: TaskItem,
  proyecto: TaskProject,
  workspace: TaskWorkspace | null,
): Tarea {
  const labels = proyecto.labels ?? [];
  return {
    id: item.id,
    title: item.title,
    notes: item.notes ?? '',
    dueDate: item.dueDate,
    completedAt: item.completedAt,
    status: statusDe(item.status),
    prioridad: prioridadDe(item, labels),
    recurrencia: recurrenciaDe(item),
    etiquetas: (item.labelIds ?? [])
      .map((id) => labels.find((label) => label.id === id))
      .filter((label): label is TaskLabel => !!label && !esReservada(label.id))
      .map((label) => ({ id: label.id, name: label.name, color: label.color })),
    subtareas: (item.checklist ?? []).map((step) => ({
      id: step.id,
      text: step.text,
      completed: !!step.completed,
    })),
    labelIds: item.labelIds ?? [],
    projectId: item.projectId,
    columnId: item.columnId,
    workspaceId: workspace?.id ?? proyecto.workspaceId,
    proyectoNombre: proyecto.name,
    workspaceNombre: workspace?.name ?? '',
    order: item.order,
    projectLabels: labels,
    createdBy: item.createdBy ?? null,
    assigneeId: item.assigneeId ?? null,
    aiPrompt: item.aiPrompt ?? '',
    aiNextStep: item.aiNextStep ?? '',
    aiContextQuestion: item.aiContextQuestion ?? '',
    aiContextAnswer: item.aiContextAnswer ?? '',
    aiReadyAt: isoDue(item.aiReadyAt),
  };
}

export function isoDue(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}
