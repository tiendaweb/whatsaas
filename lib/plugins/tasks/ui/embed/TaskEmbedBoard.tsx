'use client';

import { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Calendar, CheckSquare, FolderKanban, MessageSquare, Plus } from 'lucide-react';
import { getAppearanceBaseColor, withAppearanceAlpha } from '@/lib/plugins/tasks/client/appearance-color';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import { formatDate, isOverdue } from '@/lib/plugins/tasks/client/utils';
import type { TaskColumn, TaskItem, TaskLabel, TaskProject } from '@/lib/plugins/tasks/client/types';
import { KanbanBoard } from '@/lib/plugins/tasks/ui/project/KanbanBoard';
import {
  taskOsBtn,
  taskOsColumn,
  taskOsColumnHeader,
  taskOsMuted,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';
import { createEmbedApi } from './embed-api';
import { EmbedTaskEditor } from './EmbedTaskEditor';

type EmbedAccess = 'read' | 'manage';

type EmbedBoard = {
  access: EmbedAccess;
  title: string;
  projects: TaskProject[];
};

export type TaskEmbedBoardProps = {
  token: string;
  initial: EmbedBoard;
};

// ---------- read-only rendering ----------

function ReadonlyCard({ item, labels }: { item: TaskItem; labels: TaskLabel[] }) {
  const itemLabels = labels.filter((l) => item.labelIds.includes(l.id));
  const done = item.checklist.filter((c) => c.completed).length;
  const total = item.checklist.length;
  const overdue = isOverdue(item.dueDate);
  const completed = item.status === 'done';
  const TaskIcon = resolveTaskIcon(item.icon);
  const accentBase = getAppearanceBaseColor(item.color);
  const accentBg = withAppearanceAlpha(item.color, 7);
  const accentBorder = withAppearanceAlpha(item.color, 27);

  return (
    <div
      className={cn(
        'relative select-none rounded-xl border border-[#2a2a30] bg-[#1a1a1e] p-3.5 shadow-sm',
        completed && 'border-emerald-500/30 bg-emerald-500/10',
      )}
      style={accentBase && !completed ? { borderColor: accentBorder, backgroundColor: accentBg } : undefined}
    >
      {item.coverUrl && (
        <div className="-mx-3 -mt-3 mb-2 overflow-hidden rounded-t">
          <img src={item.coverUrl} alt="" className="h-16 w-full object-cover" />
        </div>
      )}
      {(TaskIcon || accentBase) && (
        <div className="mb-2 flex items-center gap-1.5">
          {TaskIcon && (
            <span
              className="flex h-5 w-5 items-center justify-center rounded"
              style={accentBase ? { color: accentBase, backgroundColor: withAppearanceAlpha(item.color, 13) } : undefined}
            >
              <TaskIcon className="h-3 w-3" />
            </span>
          )}
          {accentBase && !TaskIcon && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentBase }} />}
        </div>
      )}
      {itemLabels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {itemLabels.map((l) => (
            <span
              key={l.id}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <p className={cn('text-sm font-medium leading-snug', completed ? 'text-[#8b8b96] line-through' : taskOsText)}>
        {item.title}
      </p>
      {(total > 0 || item.dueDate || item.commentCount > 0) && (
        <div className={cn('mt-2 flex items-center gap-3 text-[11px]', taskOsMuted)}>
          {total > 0 && (
            <span className={cn('flex items-center gap-1', done === total ? 'text-emerald-400' : undefined)}>
              <CheckSquare className="h-3 w-3" />
              {done}/{total}
            </span>
          )}
          {item.dueDate && (
            <span className={cn('flex items-center gap-1', overdue && 'text-red-400')}>
              <Calendar className="h-3 w-3" />
              {formatDate(item.dueDate)}
            </span>
          )}
          {item.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {item.commentCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ReadonlyColumn({ col, labels }: { col: TaskColumn; labels: TaskLabel[] }) {
  const ColIcon = resolveTaskIcon(col.icon);
  const accentBase = getAppearanceBaseColor(col.color);
  return (
    <div className={taskOsColumn}>
      <div className={taskOsColumnHeader}>
        <div className="flex min-w-0 items-center gap-2">
          {ColIcon ? (
            <ColIcon className="h-3.5 w-3.5 shrink-0" style={accentBase ? { color: accentBase } : undefined} />
          ) : accentBase ? (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accentBase }} />
          ) : null}
          <span className={cn('truncate text-sm font-semibold', taskOsText)}>{col.title}</span>
        </div>
        <span className={cn('shrink-0 text-xs', taskOsMuted)}>{col.items.length}</span>
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto p-2.5">
        {col.items.map((item) => (
          <ReadonlyCard key={`${item.id}-${item.locationId ?? item.columnId}`} item={item} labels={labels} />
        ))}
        {col.items.length === 0 && <p className={cn('px-1 py-2 text-xs', taskOsMuted)}>Sin tareas</p>}
      </div>
    </div>
  );
}

// ---------- board shell (read + manage) ----------

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function TaskEmbedBoard({ token, initial }: TaskEmbedBoardProps) {
  const { data = initial, mutate } = useSWR<EmbedBoard>(`/api/task-embed/${token}`, fetcher, {
    fallbackData: initial,
    revalidateOnFocus: false,
  });
  const manage = data.access === 'manage';
  const projects = data.projects ?? [];

  const api = useMemo(() => createEmbedApi(token), [token]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(projects[0]?.id ?? null);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const draggedTask = useRef<TaskItem | null>(null);
  const draggedCol = useRef<number | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;
  const showTabs = projects.length > 1;

  const refresh = () => {
    void mutate();
  };

  const handlers = {
    onOpenTask: (item: TaskItem) => setEditingTask(item),
    onAddTask: async (colId: number, title: string) => {
      await api.createTask(colId, title);
      refresh();
    },
    onDragStart: (_e: React.DragEvent, item: TaskItem) => {
      draggedTask.current = item;
    },
    onDrop: async (_e: React.DragEvent, colId: number) => {
      const item = draggedTask.current;
      draggedTask.current = null;
      if (!item || item.columnId === colId) return;
      await api.patchTask(item.id, { columnId: colId });
      refresh();
    },
    onDropOnTask: async (_e: React.DragEvent, target: TaskItem) => {
      const dragged = draggedTask.current;
      draggedTask.current = null;
      if (!dragged || dragged.id === target.id || dragged.columnId === target.columnId) return;
      await api.patchTask(dragged.id, { columnId: target.columnId });
      refresh();
    },
    onRenameCol: async (colId: number, title: string) => {
      await api.patchColumn(colId, { title });
      refresh();
    },
    onColumnDragStart: (_e: React.DragEvent, colId: number) => {
      draggedCol.current = colId;
    },
    onColumnDrop: async (_e: React.DragEvent, targetColId: number) => {
      const from = draggedCol.current;
      draggedCol.current = null;
      if (!from || from === targetColId || !activeProject) return;
      const ids = activeProject.columns.map((c) => c.id);
      const fromIdx = ids.indexOf(from);
      const toIdx = ids.indexOf(targetColId);
      if (fromIdx < 0 || toIdx < 0) return;
      ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
      await Promise.all(ids.map((id, i) => api.patchColumn(id, { order: i })));
      refresh();
    },
    onAddColumn: async () => {
      if (!activeProject) return;
      await api.createColumn(activeProject.id, 'Nueva etapa');
      refresh();
    },
  };

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#141416] text-[#e8e8ed]">
      <header className="flex items-center gap-3 border-b border-[#2a2a30] bg-[#1a1a1e] px-4 py-2.5">
        <FolderKanban className="h-4 w-4 text-[#8b8b96]" />
        <h1 className="truncate text-sm font-semibold">{data.title}</h1>
        {manage && activeProject && (
          <button
            type="button"
            onClick={() => void handlers.onAddColumn()}
            className={cn('ml-auto flex items-center gap-1.5 px-2.5 py-1.5 text-xs', taskOsBtn)}
          >
            <Plus className="h-3.5 w-3.5" /> Etapa
          </button>
        )}
      </header>

      {showTabs && (
        <div className="flex gap-1 overflow-x-auto border-b border-[#2a2a30] bg-[#18181b] px-3 py-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => setActiveProjectId(project.id)}
              className={cn(
                'shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                project.id === activeProject?.id
                  ? 'border-[#3b82f6]/35 bg-[#2563eb]/15 text-[#93c5fd]'
                  : 'border-[#2a2a30] bg-[#1a1a1e] text-[#a8a8b3] hover:text-[#e8e8ed]',
              )}
            >
              {project.name}
            </button>
          ))}
        </div>
      )}

      {activeProject ? (
        manage ? (
          <KanbanBoard
            project={activeProject}
            onOpenTask={handlers.onOpenTask}
            onAddTask={handlers.onAddTask}
            onDragStart={handlers.onDragStart}
            onDrop={handlers.onDrop}
            onDropOnTask={handlers.onDropOnTask}
            onRenameCol={handlers.onRenameCol}
            onColumnDragStart={handlers.onColumnDragStart}
            onColumnDrop={handlers.onColumnDrop}
            onAddColumn={handlers.onAddColumn}
          />
        ) : (
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full min-h-0 items-stretch gap-4 p-4">
              {activeProject.columns.map((col) => (
                <ReadonlyColumn key={col.id} col={col} labels={activeProject.labels} />
              ))}
              {activeProject.columns.length === 0 && (
                <p className={cn('p-6 text-sm', taskOsMuted)}>Este proyecto no tiene columnas.</p>
              )}
            </div>
          </div>
        )
      ) : (
        <p className={cn('p-6 text-sm', taskOsMuted)}>No hay proyectos para mostrar.</p>
      )}

      {editingTask && manage && (
        <EmbedTaskEditor
          task={editingTask}
          api={api}
          onChanged={refresh}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
