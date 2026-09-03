import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamTaskColumns, teamTaskMedia, teamTaskProjects, teamTaskWorkspaces } from '@/lib/db/schema';
import { TaskOpsError } from './errors';
import {
  assertProject,
  assertTask,
  copyTaskMedia,
  createTaskInColumn,
  insertRelation,
  loadTaskOsData,
} from './task-os';

export type DuplicateTaskOptions = {
  /** Columna destino. Si se omite, la copia queda en la misma columna que la original. */
  columnId?: number | null;
  /** Proyecto destino: sólo sirve para validar que `columnId` pertenece a ese proyecto. */
  projectId?: number | null;
};

/**
 * Duplica una tarea con notas, etiquetas, checklist, fechas, estado, color e
 * ícono, copia sus adjuntos y deja la relación `duplicated_to`.
 *
 * Cuando se manda una columna distinta, el título se conserva tal cual (es un
 * "copiar a otro tablero"); cuando se duplica en el mismo lugar se le agrega
 * " copia" para que no queden dos tarjetas indistinguibles.
 */
export async function duplicateTask(
  teamId: number,
  userId: number,
  taskId: number,
  opts: DuplicateTaskOptions = {},
) {
  const task = await assertTask(teamId, taskId);
  if (!task) throw new TaskOpsError('Task not found', 404);

  const targetColumnId = opts.columnId ? Number(opts.columnId) : task.columnId;
  const targetProjectId = opts.projectId ? Number(opts.projectId) : null;
  if (targetProjectId) {
    const column = await db.query.teamTaskColumns.findFirst({
      where: and(
        eq(teamTaskColumns.id, targetColumnId),
        eq(teamTaskColumns.projectId, targetProjectId),
        eq(teamTaskColumns.teamId, teamId),
      ),
      columns: { id: true },
    });
    if (!column) throw new TaskOpsError('Column not found', 404);
  }

  const duplicate = await createTaskInColumn({
    teamId,
    userId,
    columnId: targetColumnId,
    title: opts.columnId ? task.title : `${task.title} copia`,
    notes: task.notes,
    labelIds: task.labelIds,
    checklist: task.checklist,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    startDate: task.startDate ? task.startDate.toISOString() : null,
    endDate: task.endDate ? task.endDate.toISOString() : null,
    parentTaskId: task.parentTaskId,
    status: task.status,
    color: task.color,
    icon: task.icon,
    coverMediaId: task.coverMediaId ?? null,
  });
  if (!duplicate) throw new TaskOpsError('Column not found', 404);

  await copyTaskMedia({ teamId, userId, sourceTaskId: task.id, targetTaskId: duplicate.id });

  await insertRelation({
    teamId,
    userId,
    sourceType: 'task',
    sourceId: task.id,
    targetType: 'task',
    targetId: duplicate.id,
    relationType: 'duplicated_to',
  });

  return duplicate;
}

export type DuplicateProjectOptions = {
  /** Espacio de trabajo destino. Si se omite, la copia queda en el mismo espacio. */
  targetWorkspaceId?: number | null;
};

/**
 * Duplica un proyecto entero: columnas, tareas (con sus adjuntos), adjuntos del
 * proyecto y la relación `duplicated_to`. La copia se llama "<nombre> copia" y
 * va al final del espacio destino.
 */
export async function duplicateProject(
  teamId: number,
  userId: number,
  projectId: number,
  opts: DuplicateProjectOptions = {},
) {
  const project = await assertProject(teamId, projectId);
  if (!project) throw new TaskOpsError('Project not found', 404);

  const targetWorkspaceId = opts.targetWorkspaceId ? Number(opts.targetWorkspaceId) : project.workspaceId;
  if (targetWorkspaceId) {
    const workspace = await db.query.teamTaskWorkspaces.findFirst({
      where: and(eq(teamTaskWorkspaces.id, targetWorkspaceId), eq(teamTaskWorkspaces.teamId, teamId)),
      columns: { id: true },
    });
    if (!workspace) throw new TaskOpsError('Workspace not found', 404);
  }

  const maxOrder = await db.query.teamTaskProjects.findMany({
    where: targetWorkspaceId
      ? and(eq(teamTaskProjects.teamId, teamId), eq(teamTaskProjects.workspaceId, targetWorkspaceId))
      : eq(teamTaskProjects.teamId, teamId),
    orderBy: (t, { desc }) => [desc(t.order)],
    limit: 1,
  });

  const [copy] = await db.insert(teamTaskProjects).values({
    teamId,
    workspaceId: targetWorkspaceId,
    name: `${project.name} copia`,
    backgroundUrl: project.backgroundUrl,
    labels: project.labels,
    order: maxOrder.length ? maxOrder[0].order + 1 : 0,
    color: project.color,
    icon: project.icon,
    createdBy: userId,
  }).returning();

  const columns = await db.query.teamTaskColumns.findMany({
    where: and(eq(teamTaskColumns.teamId, teamId), eq(teamTaskColumns.projectId, project.id)),
    orderBy: (t, { asc }) => [asc(t.order), asc(t.createdAt)],
  });

  const columnMap = new Map<number, number>();
  for (const column of columns) {
    const [newColumn] = await db.insert(teamTaskColumns).values({
      teamId,
      projectId: copy.id,
      title: column.title,
      order: column.order,
      color: column.color,
      icon: column.icon,
    }).returning();
    columnMap.set(column.id, newColumn.id);
  }

  const data = await loadTaskOsData(teamId);
  const source = data.flatMap((workspace) => workspace.projects).find((item) => item.id === project.id);
  const taskIdMap = new Map<number, number>();
  for (const column of source?.columns ?? []) {
    const newColumnId = columnMap.get(column.id);
    if (!newColumnId) continue;
    for (const item of column.items) {
      if (!item) continue;
      const created = await createTaskInColumn({
        teamId,
        userId,
        columnId: newColumnId,
        title: item.title,
        notes: item.notes,
        labelIds: item.labelIds,
        checklist: item.checklist,
        dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : null,
        startDate: item.startDate ? new Date(item.startDate).toISOString() : null,
        endDate: item.endDate ? new Date(item.endDate).toISOString() : null,
        status: item.status,
        parentTaskId: item.parentTaskId,
        color: item.color,
        icon: item.icon,
      });
      if (created) taskIdMap.set(item.id, created.id);
    }
  }

  for (const [sourceTaskId, targetTaskId] of taskIdMap) {
    await copyTaskMedia({ teamId, userId, sourceTaskId, targetTaskId });
  }

  const media = await db.query.teamTaskMedia.findMany({
    where: and(eq(teamTaskMedia.teamId, teamId), eq(teamTaskMedia.ownerType, 'project'), eq(teamTaskMedia.ownerId, project.id)),
  });
  if (media.length) {
    await db.insert(teamTaskMedia).values(media.map((item) => ({
      teamId,
      ownerType: 'project',
      ownerId: copy.id,
      url: item.url,
      fileName: item.fileName,
      mimeType: item.mimeType,
      size: item.size,
      source: item.source,
      metadata: item.metadata,
      createdBy: userId,
    })));
  }

  await insertRelation({
    teamId,
    userId,
    sourceType: 'project',
    sourceId: project.id,
    targetType: 'project',
    targetId: copy.id,
    relationType: 'duplicated_to',
  });

  return { project: copy, columns: columnMap.size, tasks: taskIdMap.size };
}
