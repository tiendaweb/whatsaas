import type { TaskItem, TaskProject, TaskWorkspace } from './types';

export type ResolvedTask = {
  task: TaskItem;
  project: TaskProject;
  workspace: TaskWorkspace;
  columnTitle: string;
};

export type TaskEntityIndex = {
  findTask: (taskId: number) => ResolvedTask | null;
  findProject: (projectId: number) => { project: TaskProject; workspace: TaskWorkspace } | null;
  findWorkspace: (workspaceId: number) => TaskWorkspace | null;
};

export function buildTaskEntityIndex(workspaces: TaskWorkspace[]): TaskEntityIndex {
  const taskMap = new Map<number, ResolvedTask>();
  const projectMap = new Map<number, { project: TaskProject; workspace: TaskWorkspace }>();

  for (const workspace of workspaces) {
    for (const project of workspace.projects) {
      projectMap.set(project.id, { project, workspace });
      for (const column of project.columns) {
        for (const task of column.items) {
          taskMap.set(task.id, { task, project, workspace, columnTitle: column.title });
        }
      }
    }
  }

  return {
    findTask: (taskId) => taskMap.get(taskId) ?? null,
    findProject: (projectId) => projectMap.get(projectId) ?? null,
    findWorkspace: (workspaceId) => workspaces.find((w) => w.id === workspaceId) ?? null,
  };
}