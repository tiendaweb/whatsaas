'use client';

import { useRef } from 'react';
import {
  patchTaskItem,
  postChecklistSource,
  reorderColumn,
  reorderProject,
} from '@/lib/plugins/tasks/client/api';
import type { TaskItem, TaskProject } from '@/lib/plugins/tasks/client/types';

type DragDropOptions = {
  selectedProject: TaskProject | null;
  projects: TaskProject[];
  mutate: () => Promise<unknown>;
};

export function useTaskDragDrop({ selectedProject, projects, mutate }: DragDropOptions) {
  const dragItem = useRef<TaskItem | null>(null);
  const dragProjectId = useRef<number | null>(null);
  const dragColumnId = useRef<number | null>(null);

  const persistTaskOrder = async (task: TaskItem, toColumnId: number, insertBeforeId?: number) => {
    const targetColumn = selectedProject?.columns.find((c) => c.id === toColumnId);
    if (!targetColumn) return;
    const targetItems = targetColumn.items.filter((i) => i.id !== task.id);
    const insertIndex = insertBeforeId ? targetItems.findIndex((i) => i.id === insertBeforeId) : -1;
    const finalIndex = insertIndex < 0 ? targetItems.length : insertIndex;
    targetItems.splice(finalIndex, 0, { ...task, columnId: toColumnId });
    const sourceColumn = selectedProject?.columns.find((c) => c.id === task.columnId);
    const sourceItems = task.columnId === toColumnId ? [] : (sourceColumn?.items ?? []).filter((i) => i.id !== task.id);
    await Promise.all([
      ...targetItems.map((item, order) => patchTaskItem(item.id, {
        columnId: toColumnId,
        projectId: targetColumn.projectId,
        order,
      })),
      ...sourceItems.map((item, order) => patchTaskItem(item.id, {
        columnId: sourceColumn?.id,
        projectId: sourceColumn?.projectId,
        order,
      })),
    ]);
  };

  const handleDragStart = (e: React.DragEvent, item: TaskItem) => {
    dragItem.current = item;
    dragColumnId.current = null;
    dragProjectId.current = null;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, colId: number) => {
    e.preventDefault();
    const item = dragItem.current;
    if (!item || dragColumnId.current || dragProjectId.current) return;
    dragItem.current = null;
    await persistTaskOrder(item, colId);
    await mutate();
  };

  const handleDropOnTask = async (e: React.DragEvent, target: TaskItem) => {
    e.preventDefault();
    e.stopPropagation();
    const item = dragItem.current;
    if (!item || item.id === target.id || dragColumnId.current || dragProjectId.current) return;
    dragItem.current = null;
    await postChecklistSource(target.id, item.id);
    await mutate();
  };

  const handleProjectDragStart = (e: React.DragEvent, projectId: number) => {
    dragProjectId.current = projectId;
    dragColumnId.current = null;
    dragItem.current = null;
    e.dataTransfer.effectAllowed = 'move';
  };

  const reorderProjects = async (targetProjectId: number) => {
    const projectId = dragProjectId.current;
    if (!projectId || projectId === targetProjectId) return;
    dragProjectId.current = null;
    const ordered = [...projects];
    const sourceIndex = ordered.findIndex((p) => p.id === projectId);
    const targetIndex = ordered.findIndex((p) => p.id === targetProjectId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    await Promise.all(ordered.map((project, order) => reorderProject(project.id, order)));
    await mutate();
  };

  const handleColumnDragStart = (e: React.DragEvent, colId: number) => {
    dragColumnId.current = colId;
    dragProjectId.current = null;
    dragItem.current = null;
    e.dataTransfer.effectAllowed = 'move';
  };

  const reorderColumns = async (_e: React.DragEvent, targetColId: number) => {
    const colId = dragColumnId.current;
    if (!selectedProject || !colId || colId === targetColId) return;
    dragColumnId.current = null;
    const ordered = [...selectedProject.columns];
    const sourceIndex = ordered.findIndex((c) => c.id === colId);
    const targetIndex = ordered.findIndex((c) => c.id === targetColId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, moved);
    await Promise.all(ordered.map((column, order) => reorderColumn(column.id, order)));
    await mutate();
  };

  return {
    handleDragStart,
    handleDrop,
    handleDropOnTask,
    handleProjectDragStart,
    reorderProjects,
    handleColumnDragStart,
    reorderColumns,
  };
}