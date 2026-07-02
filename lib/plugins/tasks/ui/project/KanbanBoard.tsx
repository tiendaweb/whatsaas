'use client';

import { FolderKanban } from 'lucide-react';
import { withAppearanceAlpha } from '@/lib/plugins/tasks/client/appearance-color';
import type { Project, TaskItem, TaskLabel } from '@/lib/plugins/tasks/client/types';
import { KanbanColumn } from '@/lib/plugins/tasks/ui/board';
import { TaskOsEmptyState } from '@/lib/plugins/tasks/ui/shared';

export type KanbanBoardProps = {
  project: Project;
  onOpenTask: (item: TaskItem) => void;
  onAddTask: (colId: number, title: string) => Promise<void>;
  onDragStart: (e: React.DragEvent, item: TaskItem) => void;
  onDrop: (e: React.DragEvent, colId: number) => void;
  onDropOnTask: (e: React.DragEvent, item: TaskItem) => void;
  onRenameCol: (colId: number, title: string) => void;
  onColumnDragStart: (e: React.DragEvent, colId: number) => void;
  onColumnDrop: (e: React.DragEvent, colId: number) => void;
  onAddColumn: () => void;
  onEditColumn?: (colId: number) => void;
};

export function KanbanBoard({
  project,
  onOpenTask,
  onAddTask,
  onDragStart,
  onDrop,
  onDropOnTask,
  onRenameCol,
  onColumnDragStart,
  onColumnDrop,
  onAddColumn,
  onEditColumn,
}: KanbanBoardProps) {
  const labels: TaskLabel[] = project.labels;
  const projectTint = withAppearanceAlpha(project.color, 7);

  return (
    <div
      className="flex-1 overflow-x-auto overflow-y-hidden bg-[#141416]"
      style={projectTint ? { backgroundColor: projectTint } : undefined}
    >
      <div className="flex h-full min-h-0 items-stretch gap-4 p-4 md:p-5">
        {project.columns.map((col) => (
          <KanbanColumn
            key={col.id}
            col={col}
            labels={labels}
            onOpenTask={onOpenTask}
            onAddTask={onAddTask}
            onDragStart={onDragStart}
            onDrop={onDrop}
            onDropOnTask={onDropOnTask}
            onRenameCol={onRenameCol}
            onColumnDragStart={onColumnDragStart}
            onColumnDrop={onColumnDrop}
            onEditCol={onEditColumn}
          />
        ))}
        {project.columns.length === 0 && (
          <TaskOsEmptyState
            icon={<FolderKanban className="h-8 w-8 text-white/30" />}
            title="Sin columnas aún"
            action={(
              <button onClick={onAddColumn} className="text-xs text-white/40 underline hover:text-white">
                Agregar primera columna
              </button>
            )}
          />
        )}
      </div>
    </div>
  );
}
