import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamTaskColumns,
  teamTaskItems,
  teamTaskProjects,
  teamTaskWorkspaces,
} from '@/lib/db/schema';
import type { CascadeDocument } from '@/lib/plugins/tasks/client/cascade-dsl';
import { cascadePathKey } from '@/lib/plugins/tasks/client/cascade-dsl';
import type { CascadeScope } from '@/lib/plugins/tasks/client/cascade-scope';
import { createTaskInColumn, loadTaskOsData } from './task-os';

export type CascadeApplyScope = CascadeScope;

export type CascadeApplyPreview = {
  create: { workspaces: number; projects: number; columns: number; tasks: number };
  update: { tasks: number };
  summary: ReturnType<typeof summarizePaths>;
};

function summarizePaths(doc: CascadeDocument) {
  const paths: string[] = [];
  for (const ws of doc.workspaces) {
    for (const project of ws.projects) {
      for (const column of project.columns) {
        for (const task of column.tasks) {
          paths.push(cascadePathKey({
            workspace: ws.title,
            project: project.title,
            column: column.title,
            task: task.title,
          }));
        }
      }
    }
  }
  return { totalPaths: paths.length, paths: paths.slice(0, 50) };
}

export async function previewCascadeApply(teamId: number, document: CascadeDocument): Promise<CascadeApplyPreview> {
  const existing = await loadTaskOsData(teamId);
  const index = buildExistingIndex(existing);

  let createWorkspaces = 0;
  let createProjects = 0;
  let createColumns = 0;
  let createTasks = 0;
  let updateTasks = 0;

  for (const ws of document.workspaces) {
    const wsKey = ws.title;
    if (!index.workspaces.has(wsKey)) createWorkspaces++;

    for (const project of ws.projects) {
      const projKey = `${wsKey}::${project.title}`;
      if (!index.projects.has(projKey)) createProjects++;

      for (const column of project.columns) {
        const colKey = `${projKey}::${column.title}`;
        if (!index.columns.has(colKey)) createColumns++;

        for (const task of column.tasks) {
          const taskKey = cascadePathKey({
            workspace: ws.title,
            project: project.title,
            column: column.title,
            task: task.title,
          });
          const existingTask = index.tasks.get(taskKey);
          if (!existingTask) createTasks++;
          else if (
            (task.notes && task.notes !== existingTask.notes)
            || JSON.stringify(task.checklist) !== JSON.stringify(existingTask.checklist)
          ) {
            updateTasks++;
          }
        }
      }
    }
  }

  return {
    create: {
      workspaces: createWorkspaces,
      projects: createProjects,
      columns: createColumns,
      tasks: createTasks,
    },
    update: { tasks: updateTasks },
    summary: summarizePaths(document),
  };
}

function buildExistingIndex(workspaces: Awaited<ReturnType<typeof loadTaskOsData>>) {
  const wsMap = new Map<string, { id: number }>();
  const projMap = new Map<string, { id: number; workspaceId: number }>();
  const colMap = new Map<string, { id: number; projectId: number }>();
  const taskMap = new Map<string, { id: number; notes: string; checklist: unknown[] }>();

  for (const ws of workspaces) {
    wsMap.set(ws.name, { id: ws.id });
    for (const project of ws.projects) {
      const projKey = `${ws.name}::${project.name}`;
      projMap.set(projKey, { id: project.id, workspaceId: ws.id });
      for (const column of project.columns) {
        const colKey = `${projKey}::${column.title}`;
        colMap.set(colKey, { id: column.id, projectId: project.id });
        for (const item of column.items) {
          if (!item) continue;
          taskMap.set(cascadePathKey({
            workspace: ws.name,
            project: project.name,
            column: column.title,
            task: item.title,
          }), {
            id: item.id,
            notes: item.notes,
            checklist: item.checklist,
          });
        }
      }
    }
  }

  return { workspaces: wsMap, projects: projMap, columns: colMap, tasks: taskMap };
}

function resolveScopeNames(existing: Awaited<ReturnType<typeof loadTaskOsData>>, scope?: CascadeApplyScope) {
  if (!scope || scope.type === 'team') return null;
  if (scope.type === 'workspace') {
    const ws = existing.find((w) => w.id === scope.workspaceId);
    return ws ? { workspaceName: ws.name } : null;
  }
  if (scope.type === 'project') {
    for (const ws of existing) {
      const project = ws.projects.find((p) => p.id === scope.projectId);
      if (project) return { workspaceName: ws.name, projectName: project.name, projectId: project.id, workspaceId: ws.id };
    }
    return null;
  }
  if (scope.type === 'column') {
    for (const ws of existing) {
      for (const project of ws.projects) {
        if (project.id !== scope.projectId) continue;
        const column = project.columns.find((c) => c.id === scope.columnId);
        if (column) {
          return {
            workspaceName: ws.name,
            projectName: project.name,
            projectId: project.id,
            workspaceId: ws.id,
            columnTitle: column.title,
            columnId: column.id,
          };
        }
      }
    }
    return null;
  }
  for (const ws of existing) {
    for (const project of ws.projects) {
      if (project.id !== scope.projectId) continue;
      for (const column of project.columns) {
        const item = column.items.find((t) => t?.id === scope.taskId);
        if (item) {
          return {
            workspaceName: ws.name,
            projectName: project.name,
            projectId: project.id,
            workspaceId: ws.id,
            taskId: item.id,
            columnTitle: column.title,
            columnId: column.id,
            taskTitle: item.title,
          };
        }
      }
    }
  }
  return null;
}

export async function applyCascadeDocument(
  teamId: number,
  userId: number,
  document: CascadeDocument,
  scope?: CascadeApplyScope,
) {
  const existing = await loadTaskOsData(teamId);
  const scopeCtx = resolveScopeNames(existing, scope);
  const index = buildExistingIndex(existing);
  const stats = {
    createdWorkspaces: 0,
    createdProjects: 0,
    createdColumns: 0,
    createdTasks: 0,
    updatedTasks: 0,
  };

  if (scope?.type === 'column' && scopeCtx?.columnId) {
    const column = document.workspaces.flatMap((w) => w.projects.flatMap((p) => p.columns))[0];
    if (!column) return stats;

    for (const task of column.tasks) {
      const taskKey = cascadePathKey({
        workspace: scopeCtx.workspaceName,
        project: scopeCtx.projectName,
        column: scopeCtx.columnTitle,
        task: task.title,
      });
      const existingTask = index.tasks.get(taskKey);

      if (!existingTask) {
        const created = await createTaskInColumn({
          teamId,
          userId,
          columnId: scopeCtx.columnId,
          title: task.title,
          notes: task.notes,
          checklist: task.checklist,
        });
        if (created) {
          index.tasks.set(taskKey, {
            id: created.id,
            notes: created.notes,
            checklist: created.checklist,
          });
          stats.createdTasks++;
        }
        continue;
      }

      const needsUpdate = task.notes !== existingTask.notes
        || JSON.stringify(task.checklist) !== JSON.stringify(existingTask.checklist);

      if (needsUpdate) {
        await db.update(teamTaskItems)
          .set({
            notes: task.notes,
            checklist: task.checklist,
            updatedAt: new Date(),
          })
          .where(and(eq(teamTaskItems.id, existingTask.id), eq(teamTaskItems.teamId, teamId)));
        stats.updatedTasks++;
      }
    }

    return stats;
  }

  if (scope?.type === 'task' && scopeCtx?.taskId) {
    const column = document.workspaces.flatMap((w) => w.projects.flatMap((p) => p.columns))[0];
    const task = column?.tasks[0];
    if (!task) return stats;

    let columnId = scopeCtx.columnId;
    if (column?.title && column.title !== scopeCtx.columnTitle) {
      const projKey = `${scopeCtx.workspaceName}::${scopeCtx.projectName}`;
      const colKey = `${projKey}::${column.title}`;
      const existingColId = index.columns.get(colKey)?.id;
      if (existingColId) columnId = existingColId;
      if (!columnId && scopeCtx.projectId) {
        const [created] = await db.insert(teamTaskColumns).values({
          teamId,
          projectId: scopeCtx.projectId,
          title: column.title,
          order: 99,
        }).returning();
        columnId = created.id;
        stats.createdColumns++;
      }
    }

    await db.update(teamTaskItems)
      .set({
        notes: task.notes,
        checklist: task.checklist,
        ...(columnId && columnId !== scopeCtx.columnId ? { columnId } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(teamTaskItems.id, scopeCtx.taskId), eq(teamTaskItems.teamId, teamId)));
    stats.updatedTasks++;
    return stats;
  }

  for (const ws of document.workspaces) {
    if (scope?.type === 'workspace' && scopeCtx && ws.title !== scopeCtx.workspaceName) continue;
    if (scope?.type === 'project' && scopeCtx && ws.title !== scopeCtx.workspaceName) continue;

    let workspaceId = index.workspaces.get(ws.title)?.id;
    if (!workspaceId) {
      if (scope?.type === 'workspace' || scope?.type === 'project') continue;
      const maxOrder = await db.query.teamTaskWorkspaces.findMany({
        where: eq(teamTaskWorkspaces.teamId, teamId),
        orderBy: (t, { desc }) => [desc(t.order)],
        limit: 1,
      });
      const [created] = await db.insert(teamTaskWorkspaces).values({
        teamId,
        name: ws.title,
        order: maxOrder.length ? maxOrder[0].order + 1 : 0,
        createdBy: userId,
      }).returning();
      workspaceId = created.id;
      index.workspaces.set(ws.title, { id: workspaceId });
      stats.createdWorkspaces++;
    }

    for (const project of ws.projects) {
      const projKey = `${ws.title}::${project.title}`;
      let projectId = index.projects.get(projKey)?.id;

      if (!projectId) {
        if (scope?.type === 'project' && scopeCtx && project.title !== scopeCtx.projectName) continue;
        if (scope?.type === 'project') continue;
        const maxOrder = await db.query.teamTaskProjects.findMany({
          where: eq(teamTaskProjects.teamId, teamId),
          orderBy: (t, { desc }) => [desc(t.order)],
          limit: 1,
        });
        const [created] = await db.insert(teamTaskProjects).values({
          teamId,
          workspaceId,
          name: project.title,
          order: maxOrder.length ? maxOrder[0].order + 1 : 0,
          createdBy: userId,
        }).returning();
        projectId = created.id;
        index.projects.set(projKey, { id: projectId, workspaceId });

        const defaultColumns = ['Por hacer', 'En progreso', 'Completado'];
        for (const [i, title] of defaultColumns.entries()) {
          const [col] = await db.insert(teamTaskColumns).values({
            teamId,
            projectId,
            title,
            order: i,
          }).returning();
          index.columns.set(`${projKey}::${title}`, { id: col.id, projectId });
        }
        stats.createdProjects++;
      }

      for (const [colOrder, column] of project.columns.entries()) {
        const colKey = `${projKey}::${column.title}`;
        let columnId = index.columns.get(colKey)?.id;

        if (!columnId) {
          const [created] = await db.insert(teamTaskColumns).values({
            teamId,
            projectId,
            title: column.title,
            order: colOrder,
          }).returning();
          columnId = created.id;
          index.columns.set(colKey, { id: columnId, projectId });
          stats.createdColumns++;
        }

        for (const task of column.tasks) {
          const taskKey = cascadePathKey({
            workspace: ws.title,
            project: project.title,
            column: column.title,
            task: task.title,
          });
          const existingTask = index.tasks.get(taskKey);

          if (!existingTask) {
            const created = await createTaskInColumn({
              teamId,
              userId,
              columnId,
              title: task.title,
              notes: task.notes,
              checklist: task.checklist,
            });
            if (created) {
              index.tasks.set(taskKey, {
                id: created.id,
                notes: created.notes,
                checklist: created.checklist,
              });
              stats.createdTasks++;
            }
            continue;
          }

          const needsUpdate = task.notes !== existingTask.notes
            || JSON.stringify(task.checklist) !== JSON.stringify(existingTask.checklist);

          if (needsUpdate) {
            await db.update(teamTaskItems)
              .set({
                notes: task.notes,
                checklist: task.checklist,
                updatedAt: new Date(),
              })
              .where(and(eq(teamTaskItems.id, existingTask.id), eq(teamTaskItems.teamId, teamId)));
            stats.updatedTasks++;
          }
        }
      }
    }
  }

  return stats;
}
