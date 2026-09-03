'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Calendar, CheckSquare, Edit3, FolderKanban, Loader2, MessageSquare, Plus, Trash2, X } from 'lucide-react';
import { getAppearanceBaseColor, withAppearanceAlpha } from '@/lib/plugins/tasks/client/appearance-color';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import { formatDate, isOverdue } from '@/lib/plugins/tasks/client/utils';
import type { TaskColumn, TaskItem, TaskLabel, TaskProject } from '@/lib/plugins/tasks/client/types';
import { KanbanBoard } from '@/lib/plugins/tasks/ui/project/KanbanBoard';
import {
  taskOsBtn,
  taskOsBtnActive,
  taskOsColumn,
  taskOsColumnHeader,
  taskOsInput,
  taskOsMuted,
  taskOsPanel,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';
import { createEmbedApi } from './embed-api';
import { EmbedTaskEditor } from './EmbedTaskEditor';

type EmbedAccess = 'read' | 'manage';

type EmbedBoard = {
  access: EmbedAccess;
  scope: { type: 'project'; projectId: number } | { type: 'workspace'; workspaceId: number };
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
  const [showNewTask, setShowNewTask] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [renamingProject, setRenamingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [busyMessage, setBusyMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const draggedTask = useRef<TaskItem | null>(null);
  const draggedCol = useRef<number | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;
  const showTabs = projects.length > 1;
  const canManageProjects = manage && data.scope.type === 'workspace';

  useEffect(() => {
    if (!activeProject) return;
    setProjectNameDraft(activeProject.name);
    setRenamingProject(false);
  }, [activeProject?.id, activeProject?.name]);

  const refresh = () => {
    void mutate();
  };

  const runAction = async (message: string, action: () => Promise<void>) => {
    setBusyMessage(message);
    setErrorMessage('');
    try {
      await action();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo completar la acción.');
    } finally {
      setBusyMessage('');
    }
  };

  const createProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    await runAction('Creando proyecto...', async () => {
      const project = await api.createProject(name);
      setNewProjectName('');
      setActiveProjectId(project.id);
      await mutate();
    });
  };

  const saveProjectName = async () => {
    if (!activeProject) return;
    const name = projectNameDraft.trim();
    setRenamingProject(false);
    if (!name || name === activeProject.name) {
      setProjectNameDraft(activeProject.name);
      return;
    }
    await runAction('Guardando proyecto...', async () => {
      await api.patchProject(activeProject.id, { name });
      await mutate();
    });
  };

  const deleteProject = async () => {
    if (!activeProject || !canManageProjects) return;
    if (!window.confirm(`¿Eliminar "${activeProject.name}" y sus tareas?`)) return;
    await runAction('Eliminando proyecto...', async () => {
      await api.deleteProject(activeProject.id);
      setActiveProjectId(null);
      await mutate();
    });
  };

  const handlers = {
    onOpenTask: (item: TaskItem) => setEditingTask(item),
    onAddTask: async (colId: number, title: string) => {
      await runAction('Creando tarea...', async () => {
        await api.createTask(colId, title);
        await mutate();
      });
    },
    onDragStart: (_e: React.DragEvent, item: TaskItem) => {
      draggedTask.current = item;
    },
    onDrop: async (_e: React.DragEvent, colId: number) => {
      const item = draggedTask.current;
      draggedTask.current = null;
      if (!item || item.columnId === colId) return;
      await runAction('Moviendo tarea...', async () => {
        await api.patchTask(item.id, { columnId: colId });
        await mutate();
      });
    },
    onDropOnTask: async (_e: React.DragEvent, target: TaskItem) => {
      const dragged = draggedTask.current;
      draggedTask.current = null;
      if (!dragged || dragged.id === target.id || dragged.columnId === target.columnId) return;
      await runAction('Moviendo tarea...', async () => {
        await api.patchTask(dragged.id, { columnId: target.columnId });
        await mutate();
      });
    },
    onRenameCol: async (colId: number, title: string) => {
      await runAction('Guardando etapa...', async () => {
        await api.patchColumn(colId, { title });
        await mutate();
      });
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
      await runAction('Reordenando etapas...', async () => {
        await Promise.all(ids.map((id, i) => api.patchColumn(id, { order: i })));
        await mutate();
      });
    },
    onAddColumn: async () => {
      if (!activeProject) return;
      await runAction('Creando etapa...', async () => {
        await api.createColumn(activeProject.id, 'Nueva etapa');
        await mutate();
      });
    },
  };

  return (
    <div className="flex h-screen min-h-0 flex-col bg-[#141416] text-[#e8e8ed]">
      <header className="flex items-center gap-3 border-b border-[#2a2a30] bg-[#1a1a1e] px-4 py-2.5">
        <FolderKanban className="h-4 w-4 text-[#8b8b96]" />
        {renamingProject && activeProject ? (
          <input
            autoFocus
            value={projectNameDraft}
            onChange={(e) => setProjectNameDraft(e.target.value)}
            onBlur={() => void saveProjectName()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveProjectName();
              if (e.key === 'Escape') {
                setProjectNameDraft(activeProject.name);
                setRenamingProject(false);
              }
            }}
            className="min-w-0 flex-1 border-b border-[#3a3a42] bg-transparent text-sm font-semibold outline-none"
          />
        ) : (
          <h1 className="truncate text-sm font-semibold">{activeProject?.name ?? data.title}</h1>
        )}
        {busyMessage && (
          <span className={cn('ml-auto hidden items-center gap-1 text-[11px] sm:flex', taskOsMuted)}>
            <Loader2 className="h-3 w-3 animate-spin" />
            {busyMessage}
          </span>
        )}
        {manage && activeProject && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowNewTask(true)}
              className={cn('flex items-center gap-1.5 px-2.5 py-1.5 text-xs', taskOsBtn)}
            >
              <Plus className="h-3.5 w-3.5" /> Tarea
            </button>
            <button
              type="button"
              onClick={() => void handlers.onAddColumn()}
              className={cn('hidden items-center gap-1.5 px-2.5 py-1.5 text-xs sm:flex', taskOsBtn)}
            >
              <Plus className="h-3.5 w-3.5" /> Etapa
            </button>
            <button
              type="button"
              onClick={() => setRenamingProject(true)}
              title="Renombrar proyecto"
              className={cn('hidden h-8 w-8 items-center justify-center sm:flex', taskOsBtn)}
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
            {canManageProjects && (
              <button
                type="button"
                onClick={() => void deleteProject()}
                title="Eliminar proyecto"
                className={cn('hidden h-8 w-8 items-center justify-center text-red-300 sm:flex', taskOsBtn)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </header>

      {errorMessage && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {errorMessage}
        </div>
      )}

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

      {canManageProjects && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void createProject();
          }}
          className="flex gap-2 border-b border-[#2a2a30] bg-[#18181b] px-3 py-2"
        >
          <input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Nuevo proyecto..."
            className="min-w-0 flex-1 rounded-lg border border-[#2a2a30] bg-[#141416] px-3 py-2 text-xs outline-none focus:border-[#3b82f6]/50"
          />
          <button
            type="submit"
            disabled={!newProjectName.trim() || Boolean(busyMessage)}
            className={cn('flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-40', taskOsBtn)}
          >
            <Plus className="h-3.5 w-3.5" /> Proyecto
          </button>
        </form>
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

      {showNewTask && activeProject && manage && (
        <EmbedNewTaskDialog
          projects={projects}
          activeProjectId={activeProject.id}
          api={api}
          onCreated={(task, projectId) => {
            setActiveProjectId(projectId);
            setShowNewTask(false);
            setEditingTask(task);
            void mutate();
          }}
          onClose={() => setShowNewTask(false)}
        />
      )}
    </div>
  );
}

function EmbedNewTaskDialog({
  projects,
  activeProjectId,
  api,
  onCreated,
  onClose,
}: {
  projects: TaskProject[];
  activeProjectId: number;
  api: ReturnType<typeof createEmbedApi>;
  onCreated: (task: TaskItem, projectId: number) => void;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(activeProjectId);
  const selectedProject = projects.find((project) => project.id === projectId) ?? projects[0] ?? null;
  const [columnId, setColumnId] = useState<number | null>(selectedProject?.columns[0]?.id ?? null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setColumnId(selectedProject?.columns[0]?.id ?? null);
  }, [selectedProject?.id]);

  const submit = async () => {
    const cleanTitle = title.trim();
    if (!selectedProject || !cleanTitle) return;
    setSaving(true);
    setError('');
    try {
      let targetColumnId = columnId;
      if (!targetColumnId) {
        const column = await api.createColumn(selectedProject.id, 'Por hacer') as { id: number };
        targetColumnId = column.id;
      }
      const task = await api.createTask(targetColumnId, cleanTitle) as TaskItem;
      if (notes.trim()) {
        await api.patchTask(task.id, { notes: notes.trim() });
        task.notes = notes.trim();
      }
      onCreated(task, selectedProject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarea.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className={cn('w-full max-w-md rounded-xl border p-5 shadow-2xl', taskOsPanel)} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className={cn('text-base font-semibold', taskOsText)}>Nueva tarea</h2>
            <p className={cn('mt-0.5 text-xs', taskOsMuted)}>Se crea directamente en esta vista pública.</p>
          </div>
          <button type="button" onClick={onClose} className={cn('flex h-8 w-8 items-center justify-center', taskOsBtn)}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="Título de la tarea"
            className={cn('w-full px-3 py-2 text-sm', taskOsInput)}
          />

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas opcionales"
            rows={3}
            className={cn('w-full resize-none px-3 py-2 text-sm', taskOsInput)}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={cn('text-xs font-medium', taskOsMuted)}>Proyecto
              <select
                value={projectId}
                onChange={(e) => setProjectId(Number(e.target.value))}
                className={cn('mt-1 w-full px-3 py-2 text-sm', taskOsInput)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label className={cn('text-xs font-medium', taskOsMuted)}>Etapa
              <select
                value={columnId ?? ''}
                onChange={(e) => setColumnId(e.target.value ? Number(e.target.value) : null)}
                className={cn('mt-1 w-full px-3 py-2 text-sm', taskOsInput)}
              >
                {selectedProject?.columns.map((column) => (
                  <option key={column.id} value={column.id}>{column.title}</option>
                ))}
                {!selectedProject?.columns.length && <option value="">Crear etapa Por hacer</option>}
              </select>
            </label>
          </div>

          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-[#2a2a30] pt-3">
          <button type="button" onClick={onClose} className={cn('px-4 py-2 text-xs', taskOsBtn)}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!title.trim() || saving}
            className={cn('flex items-center gap-2 px-4 py-2 text-xs font-medium disabled:opacity-50', taskOsBtnActive)}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Crear tarea
          </button>
        </div>
      </div>
    </div>
  );
}
