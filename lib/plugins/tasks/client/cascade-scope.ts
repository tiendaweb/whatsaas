import type { TaskItem, TaskProject, TaskWorkspace } from './types';
import {
  parseCascadeDocument,
  serializeCascadeDocument,
  type CascadeDocument,
  type CascadeExportWorkspace,
  type CascadeWorkspace,
} from './cascade-dsl';

export type CascadeScope =
  | { type: 'team' }
  | { type: 'workspace'; workspaceId: number }
  | { type: 'project'; projectId: number }
  | { type: 'column'; columnId: number; projectId: number }
  | { type: 'task'; taskId: number; projectId: number };

export function getCascadeScopeLabel(scope: CascadeScope, ctx?: {
  workspace?: TaskWorkspace | null;
  project?: TaskProject | null;
  task?: TaskItem | null;
  columnTitle?: string | null;
}): string {
  if (scope.type === 'task') return `Tarea: ${ctx?.task?.title ?? scope.taskId}`;
  if (scope.type === 'column') return `Etapa: ${ctx?.columnTitle ?? scope.columnId}`;
  if (scope.type === 'project') return `Proyecto: ${ctx?.project?.name ?? scope.projectId}`;
  if (scope.type === 'workspace') return `Espacio de trabajo: ${ctx?.workspace?.name ?? scope.workspaceId}`;
  return 'Todo el equipo';
}

export function serializeCascadeForScope(
  workspaces: CascadeExportWorkspace[],
  scope: CascadeScope,
): string {
  if (scope.type === 'team') {
    return serializeCascadeDocument(workspaces);
  }

  if (scope.type === 'workspace') {
    const ws = workspaces.find((w) => w.id === scope.workspaceId);
    return ws ? serializeCascadeDocument([ws]) : '';
  }

  if (scope.type === 'project') {
    for (const ws of workspaces) {
      const project = ws.projects.find((p) => p.id === scope.projectId);
      if (project) {
        return serializeCascadeDocument([{ ...ws, projects: [project] }]);
      }
    }
    return '';
  }

  if (scope.type === 'column') {
    for (const ws of workspaces) {
      for (const project of ws.projects) {
        if (project.id !== scope.projectId) continue;
        const column = project.columns.find((c) => 'id' in c && c.id === scope.columnId);
        if (!column) continue;
        return serializeCascadeDocument([{ ...ws, projects: [{ ...project, columns: [column] }] }]);
      }
    }
    return '';
  }

  for (const ws of workspaces) {
    for (const project of ws.projects) {
      if (project.id !== scope.projectId) continue;
      for (const column of project.columns) {
        const item = column.items.find((t) => t && 'id' in t && t.id === scope.taskId);
        if (!item) continue;
        const lines = [`### ${column.title}`, `#### ${item.title}`];
        if (item.notes.trim()) {
          const noteLines = item.notes.split('\n');
          if (noteLines.length === 1) lines.push(`> ${noteLines[0]}`);
          else lines.push(':::notes', ...noteLines, ':::');
        }
        for (const check of item.checklist) {
          lines.push(check.completed ? `- [x] ${check.text}` : `- ${check.text}`);
        }
        return lines.join('\n');
      }
    }
  }
  return '';
}

/** Ajusta el documento parseado al ámbito antes de aplicar. */
export function anchorCascadeDocument(
  doc: CascadeDocument,
  scope: CascadeScope,
  ctx: {
    workspaceName: string;
    projectName?: string;
    columnTitle?: string;
    taskTitle?: string;
  },
): CascadeDocument {
  if (scope.type === 'team') return doc;

  if (scope.type === 'workspace') {
    return {
      workspaces: [{
        title: ctx.workspaceName,
        projects: doc.workspaces.flatMap((ws) => ws.projects),
      }],
    };
  }

  if (scope.type === 'project' && ctx.projectName) {
    const sourceProjects = doc.workspaces.flatMap((ws) => ws.projects);
    const projects = sourceProjects.length === 1
      ? sourceProjects.map((p) => ({ ...p, title: ctx.projectName! }))
      : sourceProjects.filter((p) => p.title === ctx.projectName);

    const anchored: CascadeWorkspace = {
      title: ctx.workspaceName,
      projects,
    };
    return { workspaces: [anchored] };
  }

  if (scope.type === 'column' && ctx.projectName && ctx.columnTitle) {
    const tasks = doc.workspaces.flatMap((ws) =>
      ws.projects.flatMap((p) =>
        p.columns.flatMap((c) => c.tasks),
      ),
    );

    return {
      workspaces: [{
        title: ctx.workspaceName,
        projects: [{
          title: ctx.projectName,
          columns: [{
            title: ctx.columnTitle,
            tasks,
          }],
        }],
      }],
    };
  }

  if (scope.type === 'task' && ctx.projectName && ctx.taskTitle) {
    const columns = doc.workspaces.flatMap((ws) => ws.projects.flatMap((p) => p.columns));
    const tasks = columns.flatMap((c) => c.tasks.map((t) => ({ column: c, task: t })));
    const match = tasks[0];
    if (!match) return { workspaces: [] };

    return {
      workspaces: [{
        title: ctx.workspaceName,
        projects: [{
          title: ctx.projectName,
          columns: [{
            title: match.column.title || ctx.columnTitle || 'Por hacer',
            tasks: [{
              title: match.task.title || ctx.taskTitle,
              notes: match.task.notes,
              checklist: match.task.checklist,
            }],
          }],
        }],
      }],
    };
  }

  return doc;
}

export function parseScopedCascade(raw: string, scope: CascadeScope, ctx: {
  workspaceName: string;
  projectName?: string;
}): CascadeDocument {
  const parsed = parseCascadeDocument(raw);
  return anchorCascadeDocument(parsed, scope, {
    workspaceName: ctx.workspaceName,
    projectName: ctx.projectName,
  });
}
