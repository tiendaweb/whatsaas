'use client';

import { useRef, useState } from 'react';
import { GripVertical, Pencil, Plus } from 'lucide-react';
import { getAppearanceBaseColor, withAppearanceAlpha } from '@/lib/plugins/tasks/client/appearance-color';
import type { Column, TaskItem, TaskLabel } from '@/lib/plugins/tasks/client/types';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import {
  taskOsBorder,
  taskOsBtn,
  taskOsColumn,
  taskOsColumnHeader,
  taskOsInput,
  taskOsMuted,
  taskOsMutedDim,
  taskOsText,
  taskOsTextSecondary,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';
import { TaskCard } from './TaskCard';

export type KanbanColumnProps = {
  col: Column;
  labels: TaskLabel[];
  onOpenTask: (item: TaskItem) => void;
  onAddTask: (colId: number, title: string) => Promise<void>;
  onDragStart: (e: React.DragEvent, item: TaskItem) => void;
  onDrop: (e: React.DragEvent, colId: number) => void;
  onDropOnTask: (e: React.DragEvent, item: TaskItem) => void;
  onRenameCol: (colId: number, title: string) => void;
  onColumnDragStart: (e: React.DragEvent, colId: number) => void;
  onColumnDrop: (e: React.DragEvent, colId: number) => void;
  onEditCol?: (colId: number) => void;
};

export function KanbanColumn({
  col,
  labels,
  onOpenTask,
  onAddTask,
  onDragStart,
  onDrop,
  onDropOnTask,
  onRenameCol,
  onColumnDragStart,
  onColumnDrop,
  onEditCol,
}: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(col.title);
  const [newTask, setNewTask] = useState('');
  const newTaskRef = useRef<HTMLInputElement>(null);
  const baseColor = getAppearanceBaseColor(col.color);
  const columnTint = withAppearanceAlpha(col.color, 18);
  const columnBorder = withAppearanceAlpha(col.color, 40);
  const columnBg = withAppearanceAlpha(col.color, 6);

  const handleRename = () => {
    if (title.trim() && title.trim() !== col.title) onRenameCol(col.id, title.trim());
    setEditing(false);
  };

  const submitTask = async () => {
    const cleanTitle = newTask.trim();
    if (!cleanTitle) {
      newTaskRef.current?.focus();
      return;
    }
    await onAddTask(col.id, cleanTitle);
    setNewTask('');
    window.requestAnimationFrame(() => newTaskRef.current?.focus());
  };

  return (
    <div
      className={cn(
        taskOsColumn,
        'transition-all rounded-2xl overflow-hidden shadow-sm',
        dragOver && 'border-[#3b82f6]/50 bg-[#1c1c22] ring-1 ring-[#3b82f6]/20',
      )}
      style={baseColor ? { backgroundColor: columnBg, borderLeft: `4px solid ${baseColor}` } : undefined}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        onColumnDrop(e, col.id);
        onDrop(e, col.id);
      }}
    >
      <div
        className={taskOsColumnHeader}
        style={baseColor ? { backgroundColor: columnTint, borderColor: columnBorder } : undefined}
      >
        <button
          type="button"
          draggable
          onDragStart={(e) => onColumnDragStart(e, col.id)}
          className={cn('mr-1 cursor-grab active:cursor-grabbing', taskOsMutedDim, 'hover:text-[#a8a8b3]')}
          title="Reordenar etapa"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {editing ? (
          <input
            autoFocus
            className={cn('w-full border-b bg-transparent text-sm font-semibold outline-none', taskOsBorder, taskOsText)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn('flex items-center gap-1 text-sm font-semibold', taskOsTextSecondary, 'hover:text-[#e8e8ed]')}
          >
            {(() => { const I = resolveTaskIcon(col.icon); return I ? <I className="h-3.5 w-3.5 shrink-0" style={baseColor ? { color: baseColor } : undefined} /> : null; })()}
            <span>{col.title}</span>
          </button>
        )}
        <div className="flex items-center gap-1">
          <span className={cn('font-mono text-xs', taskOsMuted)}>{col.items.length}</span>
          {onEditCol && (
            <button
              type="button"
              onClick={() => onEditCol(col.id)}
              className={cn('ml-1 rounded-md p-1 transition-colors hover:bg-[#222228] hover:text-[#93c5fd]', taskOsMutedDim)}
              title="Editar etapa (icono, color, cascada)"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {col.items.map((item) => (
          <TaskCard
            key={item.id}
            item={item}
            labels={labels}
            onOpen={onOpenTask}
            onDragStart={onDragStart}
            onDropOnTask={onDropOnTask}
          />
        ))}
      </div>

      <div className={cn('border-t p-2.5', taskOsBorder)}>
        <div className="flex items-center gap-2">
          <input
            ref={newTaskRef}
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitTask();
              }
            }}
            placeholder="Nueva tarea..."
            className={cn('min-w-0 flex-1 px-3 py-2 text-sm', taskOsInput)}
          />
          <button
            type="button"
            onClick={() => void submitTask()}
            className={cn('flex h-9 w-9 shrink-0 items-center justify-center', taskOsBtn)}
            title="Agregar tarea"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
