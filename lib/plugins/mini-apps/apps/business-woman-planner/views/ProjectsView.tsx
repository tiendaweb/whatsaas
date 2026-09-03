'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableProvidedDragHandleProps,
  type DraggableProvidedDraggableProps,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronDown,
  Edit3,
  FolderKanban,
  GanttChart,
  GripVertical,
  ListChecks,
  Menu,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

type ClientItem = { _recordId: string; name: string; status: string; notes: string; contacted: boolean; phone?: string };
type TaskTag = { id: string; name: string; color: string };
type ChecklistItem = { id: string; text: string; completed: boolean };
type TaskComment = { id: string; text: string; createdAt: string };
type BusinessProject = { _recordId: string; name: string; backgroundUrl: string; tags: TaskTag[]; order: number; workspaceId?: number | null; clientId?: string };
type ChecklistTemplate = { _recordId: string; name: string; items: ChecklistItem[] };
type BusinessColumn = { _recordId: string; projectId: string; title: string; order: number };
type TasksWorkspace = { id: number; name: string; order: number; projects: unknown[] };
type BusinessTask = {
  _recordId: string;
  projectId: string;
  columnId: string;
  title: string;
  notes: string;
  tagIds: string[];
  checklist: ChecklistItem[];
  comments: TaskComment[];
  dueDate: string;
  startDate?: string;
  status?: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  clientId?: string;
};
type CreateTaskOptions = { openTask?: boolean };

function nanoid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-white/70 hover:text-zinc-950"
    >
      {children}
    </button>
  );
}

// Exportado para reusar en el bloque `kanban` del tema custom
// (theme/ui/blocks/BwKanbanBlockView.tsx) — mismo componente, sin tocar su
// lógica: columnas apiladas verticalmente con tareas arrastrables, ya
// pensado para caber en poco ancho (funciona bien embebido en un widget).
export function TimelineView({
  tasks,
  columns,
  project,
  clients,
  onOpenTask,
  onMoveTask,
}: {
  tasks: BusinessTask[];
  columns: BusinessColumn[];
  project: BusinessProject;
  clients: ClientItem[];
  onOpenTask: (id: string) => void;
  onMoveTask: (taskId: string, columnId: string, insertBeforeId?: string) => void;
}) {
  const projectTasks = tasks.filter((task) => task.projectId === project._recordId);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, BusinessTask[]>();
    columns.forEach((column) => {
      map.set(column._recordId, projectTasks.filter((task) => task.columnId === column._recordId).sort((a, b) => a.order - b.order));
    });
    return map;
  }, [columns, projectTasks]);

  function handleDragEnd(result: DropResult) {
    const { destination, draggableId, source } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const destinationTasks = tasksByColumn.get(destination.droppableId) ?? [];
    const orderedDestination = destinationTasks.filter((task) => task._recordId !== draggableId);
    const insertBeforeId = orderedDestination[destination.index]?._recordId;
    onMoveTask(draggableId, destination.droppableId, insertBeforeId);
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="bw-timeline-flow min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-4 md:py-3">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-rose-600">Flujo de trabajo</p>
            <p className="truncate text-xs font-semibold text-zinc-700">Arrastra tareas para ordenar el proyecto sin fechas ni horarios.</p>
          </div>
          <span className="shrink-0 rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-black text-white">{projectTasks.length}</span>
        </div>

        <div className="grid gap-2">
          {columns.map((column, columnIndex) => {
            const colTasks = tasksByColumn.get(column._recordId) ?? [];
            return (
              <Droppable key={column._recordId} droppableId={column._recordId} type="BUSINESS_FLOW_TASK">
                {(provided, snapshot) => (
                  <section
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`rounded-xl border px-2 py-2 backdrop-blur-[2px] transition ${
                      snapshot.isDraggingOver ? 'border-rose-300 bg-rose-50/24' : 'border-white/24 bg-white/[0.06]'
                    }`}
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-[11px] font-black text-white">{columnIndex + 1}</span>
                      <p className="min-w-0 flex-1 truncate text-sm font-black text-zinc-950">{column.title}</p>
                      <span className="rounded-full bg-white/28 px-2 py-0.5 text-[10px] font-black text-rose-700">{colTasks.length}</span>
                    </div>

                    <div className="grid gap-1">
                      {colTasks.map((task, taskIndex) => {
                        const linkedClient = task.clientId ? clients.find((c) => c._recordId === task.clientId) : null;
                        const tag = project.tags.find((item) => task.tagIds.includes(item.id));

                        return (
                          <Draggable key={task._recordId} draggableId={task._recordId} index={taskIndex}>
                            {(dragProvided, dragSnapshot) => (
                              <button
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                type="button"
                                onClick={() => onOpenTask(task._recordId)}
                                className={`group flex min-h-10 w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition active:scale-[0.99] ${
                                  dragSnapshot.isDragging ? 'border-rose-300 bg-white/78 shadow-lg backdrop-blur-md' : 'border-white/22 bg-white/[0.08] hover:border-rose-200/70 hover:bg-white/[0.16]'
                                }`}
                              >
                                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-rose-300 group-hover:text-rose-500" />
                                <span className="w-5 shrink-0 text-center text-[10px] font-black text-rose-600">{taskIndex + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-950">{task.title}</span>
                                {tag && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />}
                                {linkedClient && <span className="hidden max-w-[120px] truncate text-[10px] font-bold text-zinc-500 sm:inline">{linkedClient.name}</span>}
                              </button>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                      {!colTasks.length && (
                        <div className="rounded-lg border border-dashed border-white/28 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-zinc-600">
                          Suelta una tarea aqui.
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </Droppable>
            );
          })}
        </div>
      </div>
    </DragDropContext>
  );
}

export function BoardView({
  projects,
  selectedProject,
  columns,
  tasks,
  clients,
  checklistTemplates,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onUpdateProject,
  onCreateColumn,
  onRenameColumn,
  onDeleteColumn,
  onReorderColumns,
  onCreateTask,
  onOpenTask,
  onMoveTask,
  onChecklistTemplatesChange,
  onBack,
  backgroundStyle,
  workspaces = [],
  selectedWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
  onReorderWorkspaces,
  onReorderProjects,
  onOpenMenu,
}: {
  projects: BusinessProject[];
  selectedProject: BusinessProject;
  columns: BusinessColumn[];
  tasks: BusinessTask[];
  clients: ClientItem[];
  checklistTemplates: ChecklistTemplate[];
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, backgroundUrl?: string) => void;
  onDeleteProject: (id: string) => void;
  onUpdateProject: (id: string, patch: Partial<BusinessProject>) => void;
  onCreateColumn: (title: string) => void;
  onRenameColumn: (id: string, title: string) => void;
  onDeleteColumn: (id: string) => void;
  onReorderColumns: (orderedIds: string[]) => void;
  onCreateTask: (columnId: string, title: string, options?: CreateTaskOptions) => void;
  onOpenTask: (id: string) => void;
  onMoveTask: (taskId: string, columnId: string, insertBeforeId?: string) => void;
  onChecklistTemplatesChange: (items: ChecklistTemplate[]) => void;
  onBack: () => void;
  backgroundStyle: React.CSSProperties;
  workspaces?: TasksWorkspace[];
  selectedWorkspaceId?: number | null;
  onSelectWorkspace?: (id: number | null) => void;
  onCreateWorkspace?: (name: string) => void;
  onRenameWorkspace?: (id: number, name: string) => void;
  onDeleteWorkspace?: (id: number) => void;
  onReorderWorkspaces?: (orderedIds: number[]) => void;
  onReorderProjects?: (orderedIds: string[]) => void;
  onOpenMenu?: () => void;
}) {
  const [newProject, setNewProject] = useState('');
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [view, setView] = useState<'kanban' | 'timeline'>('kanban');
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [moveProjectOpen, setMoveProjectOpen] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(selectedProject.name);
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskColumnId, setQuickTaskColumnId] = useState('');
  const [boardFilter, setBoardFilter] = useState('');
  const quickTaskInputRef = useRef<HTMLInputElement>(null);

  const taskCountByProject = useMemo(() => {
    const counts = new Map<string, number>();
    tasks.forEach((task) => counts.set(task.projectId, (counts.get(task.projectId) ?? 0) + 1));
    return counts;
  }, [tasks]);

  const selectedLinkedClient = selectedProject.clientId ? clients.find((c) => c._recordId === selectedProject.clientId) : null;
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null;
  const orderedWorkspaces = [...workspaces].sort((a, b) => a.order - b.order);
  const orderedProjects = [...projects].sort((a, b) => a.order - b.order);
  const selectedProjectTasks = tasks.filter((task) => task.projectId === selectedProject._recordId);
  const doneColumnIds = new Set(columns.filter((column) => /hecho|done/i.test(column.title)).map((column) => column._recordId));
  const doneTasks = selectedProjectTasks.filter((task) => task.status === 'done' || doneColumnIds.has(task.columnId)).length;
  const progress = selectedProjectTasks.length ? Math.round((doneTasks / selectedProjectTasks.length) * 100) : 0;

  useEffect(() => setProjectNameDraft(selectedProject.name), [selectedProject._recordId, selectedProject.name]);
  useEffect(() => {
    setEditingProjectName(false);
  }, [selectedProject._recordId]);
  useEffect(() => {
    if (!quickTaskOpen) return;
    window.requestAnimationFrame(() => quickTaskInputRef.current?.focus());
  }, [quickTaskOpen, quickTaskColumnId]);

  function submitCreateProject() {
    if (!newProject.trim()) return;
    onCreateProject(newProject);
    setNewProject('');
    setCreateProjectOpen(false);
  }

  function submitCreateWorkspace() {
    const name = newWorkspaceName.trim();
    if (!name) return;
    onCreateWorkspace?.(name);
    setNewWorkspaceName('');
  }

  function submitQuickTask() {
    const title = quickTaskTitle.trim();
    const colId = quickTaskColumnId || columns[0]?._recordId;
    if (!title || !colId) return;
    onCreateTask(colId, title, { openTask: false });
    setQuickTaskTitle('');
    window.requestAnimationFrame(() => quickTaskInputRef.current?.focus());
  }

  function saveProjectName() {
    setEditingProjectName(false);
    const name = projectNameDraft.trim();
    if (name && name !== selectedProject.name) onUpdateProject(selectedProject._recordId, { name });
    if (!name) setProjectNameDraft(selectedProject.name);
  }

  function moveWorkspace(workspaceId: number, direction: -1 | 1) {
    const ordered = [...workspaces].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((workspace) => workspace.id === workspaceId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const [moved] = ordered.splice(index, 1);
    if (!moved) return;
    ordered.splice(target, 0, moved);
    onReorderWorkspaces?.(ordered.map((workspace) => workspace.id));
  }

  function moveProject(projectId: string, direction: -1 | 1) {
    const ordered = [...projects].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((project) => project._recordId === projectId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const [moved] = ordered.splice(index, 1);
    if (!moved) return;
    ordered.splice(target, 0, moved);
    onReorderProjects?.(ordered.map((project) => project._recordId));
  }

  const filteredTasksByColumn = useMemo(() => {
    const query = boardFilter.trim().toLowerCase();
    const map = new Map<string, BusinessTask[]>();
    columns.forEach((column) => {
      map.set(
        column._recordId,
        tasks
          .filter((task) => {
            if (task.columnId !== column._recordId) return false;
            if (!query) return true;
            const clientName = clients.find((client) => client._recordId === task.clientId)?.name ?? '';
            return task.title.toLowerCase().includes(query) || clientName.toLowerCase().includes(query);
          })
          .sort((a, b) => a.order - b.order),
      );
    });
    return map;
  }, [boardFilter, clients, columns, tasks]);

  function handleBoardDragEnd(result: DropResult) {
    const { destination, draggableId, source, type } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'BUSINESS_COLUMN') {
      const ordered = [...columns];
      const [moved] = ordered.splice(source.index, 1);
      if (!moved) return;
      ordered.splice(destination.index, 0, moved);
      onReorderColumns(ordered.map((column) => column._recordId));
      return;
    }

    if (type === 'BUSINESS_TASK') {
      const destinationTasks = filteredTasksByColumn.get(destination.droppableId) ?? [];
      const orderedDestination = destinationTasks.filter((task) => task._recordId !== draggableId);
      const insertBeforeId = orderedDestination[destination.index]?._recordId;
      onMoveTask(draggableId, destination.droppableId, insertBeforeId);
    }
  }

  return (
    <div className="relative flex h-full min-h-[100dvh] flex-col overflow-hidden text-zinc-950" style={backgroundStyle}>
      <section
        className="bw-board-shell bw-project-board-shell flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="relative z-[80] shrink-0 overflow-visible border-b border-white/12 bg-black/[0.06] px-2 py-1 backdrop-blur-[2px] md:px-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap">
            {onOpenMenu && (
              <button
                type="button"
                onClick={onOpenMenu}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/18 bg-white/[0.08] text-zinc-800 transition hover:bg-white/30"
                title="Abrir menú de Business Woman"
                aria-label="Abrir menú"
              >
                <Menu className="h-4 w-4 text-rose-500" />
              </button>
            )}
            {workspaces.length > 0 && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setWorkspaceMenuOpen((open) => !open)}
                  className="flex h-9 max-w-[42vw] items-center gap-1.5 rounded-lg border border-white/18 bg-white/[0.08] px-2 text-xs font-bold text-zinc-800 transition hover:bg-white/30 sm:max-w-[220px]"
                  title="Cambiar espacio de trabajo"
                >
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                  <span className="truncate">{selectedWorkspaceId ? selectedWorkspace?.name ?? 'Espacio de trabajo' : 'Todos'}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>

                {workspaceMenuOpen && (
                  <div className="absolute left-0 top-10 z-[130] w-[min(92vw,340px)] overflow-hidden rounded-2xl border border-white/45 bg-white/95 p-2 text-zinc-950 shadow-2xl backdrop-blur-xl">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectWorkspace?.(null);
                        setWorkspaceMenuOpen(false);
                      }}
                      className={`mb-1 flex min-h-[40px] w-full items-center justify-between rounded-xl px-3 text-left text-sm font-bold ${!selectedWorkspaceId ? 'bg-rose-500 text-white' : 'hover:bg-rose-50'}`}
                    >
                      Todos los espacios
                      <span className="text-xs opacity-70">{projects.length}</span>
                    </button>

                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {orderedWorkspaces.map((workspace, index) => {
                        const count = projects.filter((project) => project.workspaceId === workspace.id).length;
                        return (
                          <div key={workspace.id} className={`rounded-xl ${workspace.id === selectedWorkspaceId ? 'bg-rose-50' : 'bg-white'}`}>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectWorkspace?.(workspace.id);
                                setWorkspaceMenuOpen(false);
                              }}
                              className="flex min-h-[40px] w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-bold hover:bg-rose-50"
                            >
                              <span className="truncate">{workspace.name}</span>
                              <span className="shrink-0 text-xs text-zinc-400">{count}</span>
                            </button>
                            <div className="flex items-center gap-1 px-2 pb-2">
                              <button type="button" disabled={index === 0} onClick={() => moveWorkspace(workspace.id, -1)} className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-500 hover:bg-white disabled:opacity-30">Subir</button>
                              <button type="button" disabled={index === orderedWorkspaces.length - 1} onClick={() => moveWorkspace(workspace.id, 1)} className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-500 hover:bg-white disabled:opacity-30">Bajar</button>
                              <button
                                type="button"
                                onClick={() => {
                                  const name = window.prompt('Nombre del workspace', workspace.name);
                                  if (name?.trim()) onRenameWorkspace?.(workspace.id, name.trim());
                                }}
                                className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-500 hover:bg-white"
                              >
                                Renombrar
                              </button>
                              {orderedWorkspaces.length > 1 && (
                                <button type="button" onClick={() => onDeleteWorkspace?.(workspace.id)} className="ml-auto rounded-lg px-2 py-1 text-xs font-bold text-red-500 hover:bg-red-50">Eliminar</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitCreateWorkspace();
                      }}
                      className="mt-2 flex gap-2 border-t border-zinc-100 pt-2"
                    >
                      <input
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        placeholder="Nuevo workspace"
                        className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-rose-300"
                      />
                      <button type="submit" disabled={!newWorkspaceName.trim()} className="rounded-xl bg-rose-500 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                        Crear
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* Current project */}
            {editingProjectName ? (
              <input
                autoFocus
                value={projectNameDraft}
                onChange={(e) => setProjectNameDraft(e.target.value)}
                onBlur={saveProjectName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveProjectName();
                  if (e.key === 'Escape') {
                    setProjectNameDraft(selectedProject.name);
                    setEditingProjectName(false);
                  }
                }}
                className="bw-project-name-control h-9 min-w-[120px] flex-1 rounded-none border-0 bg-transparent px-1 text-sm font-black text-zinc-950 outline-none"
              />
            ) : (
              <div className="relative flex h-9 min-w-0 flex-1 items-center gap-1.5 px-1 text-sm font-black text-zinc-950">
                <button type="button" onClick={() => setProjectMenuOpen((open) => !open)} className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 py-1 text-left transition hover:bg-white/25">
                  <FolderKanban className="h-4 w-4 shrink-0 text-rose-500" />
                  <span className="truncate">{selectedProject.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                </button>
                {projectMenuOpen && (
                  <div className="absolute left-0 top-10 z-[130] w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/45 bg-white/95 p-2 text-zinc-950 shadow-2xl backdrop-blur-xl">
                    <div className="max-h-72 space-y-1 overflow-y-auto">
                      {orderedProjects.map((project, index) => (
                        <div key={project._recordId} className={`rounded-xl ${project._recordId === selectedProject._recordId ? 'bg-rose-50' : 'bg-white'}`}>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectProject(project._recordId);
                              setProjectMenuOpen(false);
                            }}
                            className="flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm font-bold hover:bg-rose-50"
                          >
                            <span className="truncate">{project.name}</span>
                            <span className="shrink-0 text-xs text-zinc-400">{taskCountByProject.get(project._recordId) ?? 0}</span>
                          </button>
                          <div className="flex items-center gap-1 px-2 pb-2">
                            <button type="button" disabled={index === 0} onClick={() => moveProject(project._recordId, -1)} className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-500 hover:bg-white disabled:opacity-30">Subir</button>
                            <button type="button" disabled={index === orderedProjects.length - 1} onClick={() => moveProject(project._recordId, 1)} className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-500 hover:bg-white disabled:opacity-30">Bajar</button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => { setProjectMenuOpen(false); setCreateProjectOpen(true); }} className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50 text-sm font-black text-rose-600">
                      <Plus className="h-4 w-4" /> Nuevo proyecto
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="hidden min-w-0 items-center gap-2 text-[11px] font-semibold text-zinc-600 xl:flex">
              <span>{taskCountByProject.get(selectedProject._recordId) ?? 0} tareas</span>
              <span className="h-1 w-1 rounded-full bg-zinc-300" />
              <span>{progress}% avance</span>
              {selectedLinkedClient && (
                <>
                  <span className="h-1 w-1 rounded-full bg-zinc-300" />
                  <span className="truncate">Cliente: {selectedLinkedClient.name}</span>
                </>
              )}
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setCreateProjectOpen(true)}
                title="Nuevo proyecto"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/28 bg-white/20 text-zinc-700 transition hover:border-rose-200 hover:bg-rose-50/70 hover:text-rose-600 active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setEditingProjectName(true)}
                title="Renombrar proyecto"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/28 bg-white/20 text-zinc-600 transition hover:border-rose-200 hover:bg-rose-50/70 hover:text-rose-600"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              {workspaces.length > 1 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMoveProjectOpen((open) => !open)}
                    title="Mover proyecto a workspace"
                    className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/28 bg-white/20 text-zinc-600 transition hover:border-rose-200 hover:bg-rose-50/70 hover:text-rose-600 sm:flex"
                  >
                    <Briefcase className="h-4 w-4" />
                  </button>
                  {moveProjectOpen && (
                    <div className="absolute right-0 top-10 z-[130] w-64 overflow-hidden rounded-2xl border border-white/45 bg-white/95 p-2 text-zinc-950 shadow-2xl backdrop-blur-xl">
                      <p className="px-2 pb-2 text-[11px] font-black uppercase tracking-wide text-zinc-400">Mover a workspace</p>
                      {orderedWorkspaces.map((workspace) => (
                        <button
                          key={workspace.id}
                          type="button"
                          onClick={() => {
                            onUpdateProject(selectedProject._recordId, { workspaceId: workspace.id });
                            onSelectWorkspace?.(workspace.id);
                            setMoveProjectOpen(false);
                          }}
                          className={`flex min-h-[38px] w-full items-center justify-between rounded-xl px-3 text-left text-sm font-bold ${workspace.id === selectedProject.workspaceId ? 'bg-rose-500 text-white' : 'hover:bg-rose-50'}`}
                        >
                          <span className="truncate">{workspace.name}</span>
                          {workspace.id === selectedProject.workspaceId && <Check className="h-3.5 w-3.5" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowTemplateManager((value) => !value)}
                title="Plantillas de checklist"
                className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border transition sm:flex ${showTemplateManager ? 'border-rose-500 bg-rose-500 text-white' : 'border-white/28 bg-white/20 text-zinc-600 hover:border-rose-200 hover:bg-rose-50/70 hover:text-rose-600'}`}
              >
                <ListChecks className="h-4 w-4" />
              </button>
              <input
                value={boardFilter}
                onChange={(e) => setBoardFilter(e.target.value)}
                placeholder="Filtrar"
                className="hidden h-9 w-28 rounded-full border border-white/28 bg-white/20 px-3 text-xs font-semibold text-zinc-950 placeholder:text-zinc-500 outline-none focus:border-rose-300 lg:block"
              />
              <div className="flex rounded-full border border-white/28 bg-white/20 p-0.5">
                <button
                  onClick={() => setView('kanban')}
                  title="Vista tablero"
                  className={`flex h-8 min-w-8 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold transition active:scale-95 ${view === 'kanban' ? 'bg-rose-500 text-white' : 'text-zinc-600 hover:text-rose-600'}`}
                >
                  <FolderKanban className="h-4 w-4" />
                  <span className="hidden md:inline">Tablero</span>
                </button>
                <button
                  onClick={() => setView('timeline')}
                  title="Línea de tiempo"
                  className={`flex h-8 min-w-8 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold transition active:scale-95 ${view === 'timeline' ? 'bg-rose-500 text-white' : 'text-zinc-600 hover:text-rose-600'}`}
                >
                  <GanttChart className="h-4 w-4" />
                  <span className="hidden md:inline">Flujo</span>
                </button>
              </div>
              {view === 'kanban' && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickTaskColumnId(columns[0]?._recordId || '');
                    setQuickTaskTitle('');
                    setQuickTaskOpen(true);
                  }}
                  title="Nueva tarea"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-500 text-white transition hover:bg-rose-600 active:scale-95"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-600 lg:hidden">
            <span>{taskCountByProject.get(selectedProject._recordId) ?? 0} tareas</span>
            <span>{progress}% avance</span>
            {selectedLinkedClient && <span className="truncate">Cliente: {selectedLinkedClient.name}</span>}
            <input
              value={boardFilter}
              onChange={(e) => setBoardFilter(e.target.value)}
              placeholder="Filtrar tareas..."
              className="ml-auto h-8 w-32 rounded-full border border-white/28 bg-white/20 px-3 text-xs text-zinc-950 placeholder:text-zinc-500 md:w-48"
            />
          </div>

          {showTemplateManager && (
            <ChecklistTemplateManager
              templates={checklistTemplates}
              onChange={onChecklistTemplatesChange}
            />
          )}

          {quickTaskOpen && (
            <div className="bw-content fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setQuickTaskOpen(false)}>
              <div className="bw-liquid-panel w-full max-w-md rounded-t-3xl md:rounded-2xl border border-white/45 p-4 shadow-2xl">
                <div className="text-sm font-black mb-2">Nueva tarea</div>
                <input
                  ref={quickTaskInputRef}
                  autoFocus
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitQuickTask();
                    }
                  }}
                  placeholder="Título de la tarea"
                  className="w-full rounded-xl border border-white/30 bg-white/80 px-3 py-2 text-sm mb-2"
                />
                <select
                  value={quickTaskColumnId}
                  onChange={(e) => setQuickTaskColumnId(e.target.value)}
                  className="w-full rounded-xl border border-white/30 bg-white/80 px-3 py-2 text-sm mb-3"
                >
                  {columns.map(c => <option key={c._recordId} value={c._recordId}>{c.title}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setQuickTaskOpen(false)} className="flex-1 py-2 rounded-xl border">Cancelar</button>
                  <button onClick={submitQuickTask} className="flex-1 py-2 rounded-xl bg-rose-500 text-white">Crear</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {view === 'kanban' ? (
          <DragDropContext onDragEnd={handleBoardDragEnd}>
            <Droppable droppableId="business-woman-columns" direction="horizontal" type="BUSINESS_COLUMN">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="bw-board-main-scroll flex min-h-0 flex-1 gap-2.5 overflow-x-auto px-2 py-2.5 md:px-4 md:py-3 snap-x snap-mandatory scroll-smooth [-webkit-overflow-scrolling:touch] lg:gap-3"
                >
                  {columns.map((column, index) => (
                    <Draggable key={column._recordId} draggableId={column._recordId} index={index}>
                      {(dragProvided, dragSnapshot) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className="snap-start"
                        >
                          <KanbanColumn
                            column={column}
                            tasks={filteredTasksByColumn.get(column._recordId) ?? []}
                            project={selectedProject}
                            clients={clients}
                            dragHandleProps={dragProvided.dragHandleProps}
                            isDragging={dragSnapshot.isDragging}
                            onRename={onRenameColumn}
                            onDelete={onDeleteColumn}
                            onCreateTask={onCreateTask}
                            onOpenTask={onOpenTask}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                  <div className="flex h-full w-16 shrink-0 items-start justify-center pt-10 snap-start md:w-20">
                    <button
                      type="button"
                      onClick={() => onCreateColumn('Nueva etapa')}
                      title="Agregar etapa"
                      aria-label="Agregar etapa"
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-200/80 bg-rose-500 text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-600 active:scale-95"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          <TimelineView
            tasks={tasks}
            columns={columns}
            project={selectedProject}
            clients={clients}
            onOpenTask={onOpenTask}
            onMoveTask={onMoveTask}
          />
        )}
      </section>

      {createProjectOpen && (
        <div
          className="bw-content fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xl"
          onClick={(e) => e.target === e.currentTarget && setCreateProjectOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitCreateProject();
            }}
            className="bw-liquid-panel w-full max-w-md overflow-hidden rounded-2xl border border-white/45 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/45 bg-white/30 px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Nuevo proyecto</p>
                <h3 className="text-xl font-black text-zinc-950">Crear proyecto</h3>
              </div>
              <IconButton title="Cerrar" onClick={() => setCreateProjectOpen(false)}>
                <X className="h-5 w-5" />
              </IconButton>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase text-zinc-500">Nombre</label>
                <input
                  autoFocus
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  placeholder="Nuevo proyecto"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-400"
                />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-white/45 bg-white/30 p-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCreateProjectOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-500 transition hover:bg-white/60"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!newProject.trim()}
                className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-rose-600 disabled:opacity-40"
              >
                Crear proyecto
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ChecklistTemplateManager({
  templates,
  onChange,
}: {
  templates: ChecklistTemplate[];
  onChange: (items: ChecklistTemplate[]) => void;
}) {
  const [name, setName] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [editingId, setEditingId] = useState('');

  function reset() {
    setName('');
    setItemsText('');
    setEditingId('');
  }

  function save() {
    const items = itemsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ id: nanoid(), text, completed: false }));
    if (!name.trim() || !items.length) return;
    if (editingId) {
      onChange(templates.map((template) => (template._recordId === editingId ? { ...template, name: name.trim(), items } : template)));
    } else {
      onChange([...templates, { _recordId: nanoid(), name: name.trim(), items }]);
    }
    reset();
  }

  return (
    <div className="mt-3 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm lg:grid-cols-[1fr_320px]">
      <div>
        <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-zinc-500">Gestor de plantillas de checklist</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {templates.map((template) => (
            <div key={template._recordId} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-zinc-950">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{template.name}</p>
                  <p className="text-[11px] font-semibold text-zinc-500">{template.items.length} pasos</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingId(template._recordId);
                      setName(template.name);
                      setItemsText(template.items.map((item) => item.text).join('\n'));
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-zinc-600"
                    title="Editar"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onChange(templates.filter((item) => item._recordId !== template._recordId))}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <ul className="mt-2 space-y-1 text-xs font-semibold text-zinc-500">
                {template.items.slice(0, 3).map((item) => <li key={item.id} className="truncate">- {item.text}</li>)}
              </ul>
            </div>
          ))}
          {!templates.length && <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-zinc-500">Aun no hay plantillas.</div>}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
        <p className="mb-2 text-sm font-black text-zinc-950">{editingId ? 'Editar plantilla' : 'Nueva plantilla'}</p>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" className="mb-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
        <textarea value={itemsText} onChange={(event) => setItemsText(event.target.value)} rows={6} placeholder="Un paso por linea" className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm" />
        <div className="mt-2 flex gap-2">
          {editingId && <button onClick={reset} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-zinc-600">Cancelar</button>}
          <button onClick={save} className="flex-1 rounded-xl bg-rose-500 px-3 py-2 text-sm font-black text-white">
            {editingId ? 'Guardar cambios' : 'Crear plantilla'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  tasks,
  project,
  clients,
  dragHandleProps,
  isDragging,
  onRename,
  onDelete,
  onCreateTask,
  onOpenTask,
}: {
  column: BusinessColumn;
  tasks: BusinessTask[];
  project: BusinessProject;
  clients: ClientItem[];
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  isDragging?: boolean;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onCreateTask: (columnId: string, title: string, options?: CreateTaskOptions) => void;
  onOpenTask: (id: string) => void;
}) {
  const [newTask, setNewTask] = useState('');
  const [title, setTitle] = useState(column.title);
  const newTaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setTitle(column.title), [column.title]);

  function submitNewTask() {
    const cleanTitle = newTask.trim();
    if (!cleanTitle) {
      newTaskInputRef.current?.focus();
      return;
    }
    onCreateTask(column._recordId, cleanTitle, { openTask: false });
    setNewTask('');
    window.requestAnimationFrame(() => newTaskInputRef.current?.focus());
  }

  return (
    <div
      className={`bw-kanban-column flex h-full w-[86vw] max-w-[330px] shrink-0 flex-col rounded-xl border px-2 py-2 transition sm:w-64 md:w-72 lg:w-80 ${
        isDragging ? 'border-rose-300 bg-rose-50/28 shadow-xl shadow-rose-500/12' : 'border-white/24 bg-white/[0.06]'
      }`}
    >
      <div className="flex items-center gap-1.5 pb-1.5">
        <button
          type="button"
          {...(dragHandleProps ?? {})}
          className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-full text-rose-300 transition hover:bg-rose-50/70 hover:text-rose-500 active:cursor-grabbing"
          title="Arrastrar etapa"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== column.title && onRename(column._recordId, title.trim())}
          className="bw-inline-title-input min-w-0 flex-1 border-0 bg-transparent px-0 text-sm font-black text-zinc-950 outline-none"
        />
        <span className="rounded-full bg-white/24 px-2 py-0.5 text-[10px] font-black text-rose-700">{tasks.length}</span>
        <IconButton title="Eliminar etapa" onClick={() => onDelete(column._recordId)}>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>

      <Droppable droppableId={column._recordId} type="BUSINESS_TASK">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`min-h-0 flex-1 overflow-y-auto rounded-lg transition ${snapshot.isDraggingOver ? 'bg-rose-50/30' : ''}`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task._recordId} draggableId={task._recordId} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <TaskCard
                    task={task}
                    project={project}
                    clients={clients}
                    dragHandleProps={dragProvided.dragHandleProps}
                    draggableProps={dragProvided.draggableProps}
                    innerRef={dragProvided.innerRef}
                    isDragging={dragSnapshot.isDragging}
                    onOpen={onOpenTask}
                  />
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      <div className="pt-2">
        <div className="flex gap-1.5">
          <input
            ref={newTaskInputRef}
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitNewTask();
              }
            }}
            placeholder="Nueva tarea"
            className="min-w-0 flex-1 rounded-full border border-white/30 bg-white/18 px-3 py-1.5 text-xs font-semibold text-zinc-950 placeholder:text-zinc-500 outline-none focus:border-rose-300"
          />
          <button
            onClick={submitNewTask}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  project,
  clients,
  dragHandleProps,
  draggableProps,
  innerRef,
  isDragging,
  onOpen,
}: {
  task: BusinessTask;
  project: BusinessProject;
  clients: ClientItem[];
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  draggableProps: DraggableProvidedDraggableProps;
  innerRef: (element?: HTMLElement | null) => void;
  isDragging?: boolean;
  onOpen: (id: string) => void;
}) {
  const tags = project.tags.filter((tag) => task.tagIds.includes(tag.id));
  const completed = task.checklist.filter((item) => item.completed).length;
  const linkedClient = task.clientId ? clients.find((c) => c._recordId === task.clientId) : null;
  return (
    <button
      ref={innerRef}
      {...draggableProps}
      onClick={() => onOpen(task._recordId)}
      className={`mb-1 flex min-h-10 w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition active:scale-[0.99] ${
        isDragging ? 'border-rose-300 bg-white/78 shadow-lg backdrop-blur-md' : 'border-white/22 bg-white/[0.08] hover:border-rose-200/70 hover:bg-white/[0.16]'
      }`}
    >
      <span {...(dragHandleProps ?? {})} className="flex h-6 w-5 shrink-0 cursor-grab items-center justify-center text-rose-300">
        <GripVertical className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-950">{task.title}</span>
      {tags.length > 0 && (
        <div className="flex shrink-0 gap-1">
          {tags.map((tag) => (
            <span key={tag.id} className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} title={tag.name} />
          ))}
        </div>
      )}
      {task.checklist.length > 0 && <span className="shrink-0 text-[10px] font-black text-zinc-500">{completed}/{task.checklist.length}</span>}
      {task.comments.length > 0 && <span className="shrink-0 text-[10px] font-black text-zinc-500">{task.comments.length}</span>}
      {linkedClient && <span className="hidden max-w-[76px] shrink-0 truncate rounded-full bg-rose-100/70 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 sm:inline">{linkedClient.name}</span>}
    </button>
  );
}
