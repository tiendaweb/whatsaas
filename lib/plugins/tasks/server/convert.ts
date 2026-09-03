import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskColumns, teamTaskProjects } from '@/lib/db/schema';
import { TaskOpsError } from './errors';
import {
  assertProject,
  assertTask,
  createTaskInColumn,
  getProjectFirstColumn,
  insertRelation,
  loadTaskOsData,
} from './task-os';

/**
 * Convierte una tarea en un proyecto nuevo: el proyecto se llama como la tarea,
 * hereda el espacio y las etiquetas del proyecto de origen, arranca con las
 * columnas "Por hacer / En progreso / Completado" y cada ítem del checklist se
 * vuelve una tarea (hija de la original) en "Por hacer". La tarea original NO
 * se borra: queda ligada por la relación `converted_to`.
 */
export async function convertTaskToProject(teamId: number, userId: number, taskId: number) {
  const task = await assertTask(teamId, taskId);
  if (!task) throw new TaskOpsError('Task not found', 404);

  const sourceProject = await assertProject(teamId, task.projectId);
  const maxOrder = await db.query.teamTaskProjects.findMany({
    where: eq(teamTaskProjects.teamId, teamId),
    orderBy: (t, { desc }) => [desc(t.order)],
    limit: 1,
  });

  const [project] = await db.insert(teamTaskProjects).values({
    teamId,
    workspaceId: sourceProject?.workspaceId ?? null,
    name: task.title,
    labels: sourceProject?.labels ?? [],
    order: maxOrder.length ? maxOrder[0].order + 1 : 0,
    createdBy: userId,
  }).returning();

  const [todo] = await db.insert(teamTaskColumns).values({
    projectId: project.id,
    teamId,
    title: 'Por hacer',
    order: 0,
  }).returning();
  await db.insert(teamTaskColumns).values([
    { projectId: project.id, teamId, title: 'En progreso', order: 1 },
    { projectId: project.id, teamId, title: 'Completado', order: 2 },
  ]);

  let createdTasks = 0;
  for (const item of task.checklist ?? []) {
    const created = await createTaskInColumn({
      teamId,
      userId,
      columnId: todo.id,
      title: item.text,
      notes: item.sourceSnapshot?.notes ?? '',
      status: item.completed ? 'done' : 'open',
      parentTaskId: task.id,
    });
    if (created) createdTasks += 1;
  }

  await insertRelation({
    teamId,
    userId,
    sourceType: 'task',
    sourceId: task.id,
    targetType: 'project',
    targetId: project.id,
    relationType: 'converted_to',
  });

  return { project, createdTasks };
}

/**
 * Convierte un proyecto en una sola tarea: se crea en la primera columna del
 * mismo proyecto, con un checklist donde cada tarea del tablero es un ítem
 * ("<columna>: <título>", tildado si estaba done) que guarda un snapshot de la
 * tarea original. El proyecto NO se borra: queda ligado por `converted_to`.
 */
export async function convertProjectToTask(teamId: number, userId: number, projectId: number) {
  const project = await assertProject(teamId, projectId);
  if (!project) throw new TaskOpsError('Project not found', 404);

  const column = await getProjectFirstColumn(teamId, project.id);
  const data = await loadTaskOsData(teamId);
  const hydratedProject = data.flatMap((workspace) => workspace.projects).find((item) => item.id === project.id);
  const checklist = (hydratedProject?.columns ?? []).flatMap((col) =>
    col.items.flatMap((task) => {
      if (!task) return [];
      return [{
        id: Math.random().toString(36).slice(2, 10),
        text: `${col.title}: ${task.title}`,
        completed: task.status === 'done',
        sourceTaskId: task.id,
        sourceSnapshot: {
          title: task.title,
          notes: task.notes,
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
        },
      }];
    }),
  );

  const task = await createTaskInColumn({
    teamId,
    userId,
    columnId: column.id,
    title: project.name,
    notes: `Proyecto convertido: ${project.name}`,
    checklist,
  });
  if (!task) throw new TaskOpsError('Could not create task', 500);

  await insertRelation({
    teamId,
    userId,
    sourceType: 'project',
    sourceId: project.id,
    targetType: 'task',
    targetId: task.id,
    relationType: 'converted_to',
  });

  return { task, checklistItems: checklist.length };
}
