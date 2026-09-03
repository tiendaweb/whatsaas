import 'server-only';

import { TaskOpsError } from './errors';
import { assertTask, createTaskInColumn, insertRelation } from './task-os';

/**
 * Convierte cada ítem del checklist de una tarea en una tarea propia, en la
 * misma columna, hija de la original (parentTaskId) y ligada por la relación
 * `converted_checklist_item`. Los ítems tildados nacen en estado done. El
 * checklist original se conserva: no es un "mover", es un "desplegar".
 */
export async function checklistToTasks(teamId: number, userId: number, taskId: number) {
  const task = await assertTask(teamId, taskId);
  if (!task) throw new TaskOpsError('Task not found', 404);

  const created = [];
  for (const item of task.checklist ?? []) {
    const createdTask = await createTaskInColumn({
      teamId,
      userId,
      columnId: task.columnId,
      title: item.text,
      notes: item.sourceSnapshot?.notes ?? '',
      parentTaskId: task.id,
      status: item.completed ? 'done' : 'open',
    });
    if (createdTask) {
      await insertRelation({
        teamId,
        userId,
        sourceType: 'task',
        sourceId: task.id,
        targetType: 'task',
        targetId: createdTask.id,
        relationType: 'converted_checklist_item',
      });
      created.push(createdTask);
    }
  }

  return { task, created };
}
