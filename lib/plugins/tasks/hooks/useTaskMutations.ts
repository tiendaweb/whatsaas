'use client';

import {
  createProject as apiCreateProject,
  createWorkspace as apiCreateWorkspace,
  duplicateProject as apiDuplicateProject,
  moveProjectToWorkspace as apiMoveProjectToWorkspace,
  createColumn as apiCreateColumn,
  convertProjectToTask as apiConvertProjectToTask,
  createProjectTemplate,
  createTaskItem,
  deleteColumn as apiDeleteColumn,
  deleteProject as apiDeleteProject,
  deleteTaskItem,
  patchColumn,
  patchProject,
  patchTaskItem,
  renameWorkspace as apiRenameWorkspace,
  patchWorkspace,
} from '@/lib/plugins/tasks/client/api';
import type { Project, TaskItem, TaskLabel } from '@/lib/plugins/tasks/client/types';

type MutationsOptions = {
  mutate: () => Promise<unknown>;
  selectedWorkspaceId: number | null;
  selectedProject: Project | null;
  openTask: TaskItem | null;
  setSelectedProjectId: (id: number | null) => void;
  setSelectedWorkspaceId: (id: number | null) => void;
};

export function useTaskMutations({
  mutate,
  selectedWorkspaceId,
  selectedProject,
  openTask,
  setSelectedProjectId,
  setSelectedWorkspaceId,
}: MutationsOptions) {
  const refresh = () => mutate();

  return {
    createProject: async (name: string, workspaceId: number) => {
      const project = await apiCreateProject(name, workspaceId);
      await refresh();
      if (project?.id) setSelectedProjectId(project.id);
      return project;
    },
    createColumn: async (projectId: number, title: string) => {
      await apiCreateColumn(projectId, title);
      await refresh();
    },
    createTask: async (columnId: number, title: string, notes = '', dueDate = '') => {
      await createTaskItem({ columnId, title, notes, dueDate: dueDate || null });
      await refresh();
    },
    saveTask: async (updated: Partial<TaskItem>, options: { refresh?: boolean } = {}) => {
      if (!openTask) return;
      await patchTaskItem(openTask.id, updated as any);
      if (options.refresh !== false) await refresh();
    },
    deleteTask: async () => {
      if (!openTask) return;
      await deleteTaskItem(openTask.id);
      await refresh();
    },
    deleteColumn: async (colId: number) => {
      await apiDeleteColumn(colId);
      await refresh();
    },
    renameColumn: async (colId: number, title: string) => {
      await patchColumn(colId, { title });
      await refresh();
    },
    deleteProject: async (projectId: number) => {
      await apiDeleteProject(projectId);
      setSelectedProjectId(null);
      await refresh();
    },
    saveLabels: async (labels: TaskLabel[]) => {
      if (!selectedProject) return;
      await patchProject(selectedProject.id, { labels });
      await refresh();
    },
    createWorkspace: async (name: string) => {
      const workspace = await apiCreateWorkspace(name);
      await refresh();
      if (workspace?.id) setSelectedWorkspaceId(workspace.id);
      return workspace;
    },
    renameWorkspace: async (workspaceId: number, name: string) => {
      if (!name.trim()) return;
      await apiRenameWorkspace(workspaceId, name.trim());
      await refresh();
    },
    renameProject: async (projectId: number, name: string) => {
      if (!name.trim()) return;
      await patchProject(projectId, { name: name.trim() });
      await refresh();
    },
    setWorkspaceAppearance: async (workspaceId: number, patch: { color?: string | null; icon?: string | null }) => {
      await patchWorkspace(workspaceId, patch);
      await refresh();
    },
    setProjectAppearance: async (projectId: number, patch: { color?: string | null; icon?: string | null }) => {
      await patchProject(projectId, patch);
      await refresh();
    },
    setColumnAppearance: async (columnId: number, patch: { color?: string | null; icon?: string | null }) => {
      await patchColumn(columnId, patch);
      await refresh();
    },
    duplicateProject: async (projectId: number) => {
      const project = await apiDuplicateProject(projectId);
      await refresh();
      if (project?.id) setSelectedProjectId(project.id);
      return project;
    },
    moveProjectToWorkspace: async (projectId: number, workspaceId: number) => {
      await apiMoveProjectToWorkspace(projectId, workspaceId);
      setSelectedWorkspaceId(workspaceId);
      setSelectedProjectId(projectId);
      await refresh();
    },
    copyProjectToWorkspace: async (projectId: number, workspaceId: number) => {
      const project = await apiDuplicateProject(projectId, workspaceId);
      await refresh();
      if (project?.workspaceId) setSelectedWorkspaceId(project.workspaceId);
      if (project?.id) setSelectedProjectId(project.id);
      return project;
    },
    convertProjectToTask: async (projectId: number) => {
      await apiConvertProjectToTask(projectId);
      await refresh();
    },
    saveProjectTemplate: async (project: Project, name: string) => {
      if (!name.trim()) return;
      await createProjectTemplate({
        type: 'project',
        name: name.trim(),
        payload: {
          name: project.name,
          labels: project.labels,
          columns: project.columns.map((column) => ({
            title: column.title,
            color: column.color ?? null,
            icon: column.icon ?? null,
            tasks: column.items.map((item) => ({
              title: item.title,
              notes: item.notes,
              checklist: item.checklist,
              labelIds: item.labelIds,
              status: item.status,
              color: item.color,
              icon: item.icon,
            })),
          })),
        },
      });
    },
    selectedWorkspaceId,
    selectedProject,
  };
}
