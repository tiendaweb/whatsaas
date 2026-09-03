import type { TaskItem, TaskProject } from './types';

export type TaskNavigation = {
  prevTaskId: number | null;
  nextTaskId: number | null;
  prevColumnTaskId: number | null;
  nextColumnTaskId: number | null;
};

export function getTaskNavigation(project: TaskProject, item: TaskItem): TaskNavigation {
  const columns = [...project.columns].sort((a, b) => a.order - b.order);
  const colIndex = columns.findIndex((c) => c.id === item.columnId);
  const column = columns[colIndex];
  if (!column) {
    return { prevTaskId: null, nextTaskId: null, prevColumnTaskId: null, nextColumnTaskId: null };
  }

  const items = [...column.items].sort((a, b) => a.order - b.order);
  const taskIndex = items.findIndex((t) => t.id === item.id);

  const prevTaskId = taskIndex > 0 ? items[taskIndex - 1].id : null;
  const nextTaskId = taskIndex < items.length - 1 ? items[taskIndex + 1].id : null;

  let prevColumnTaskId: number | null = null;
  let nextColumnTaskId: number | null = null;

  if (colIndex > 0) {
    const prevItems = [...columns[colIndex - 1].items].sort((a, b) => a.order - b.order);
    if (prevItems.length) {
      prevColumnTaskId = prevItems[Math.min(taskIndex, prevItems.length - 1)]?.id ?? null;
    }
  }
  if (colIndex < columns.length - 1) {
    const nextItems = [...columns[colIndex + 1].items].sort((a, b) => a.order - b.order);
    if (nextItems.length) {
      nextColumnTaskId = nextItems[Math.min(taskIndex, nextItems.length - 1)]?.id ?? null;
    }
  }

  return { prevTaskId, nextTaskId, prevColumnTaskId, nextColumnTaskId };
}