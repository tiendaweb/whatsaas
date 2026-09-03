'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowRightLeft,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  ExternalLink,
  FileCode2,
  FileText,
  FolderKanban,
  LayoutTemplate,
  ListChecks,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Network,
  PanelRight,
  Paperclip,
  Palette,
  Plus,
  Trash2,
  UserCircle,
  X,
} from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { getPrimaryLinkedContactId, getTaskNavigation, resolveTaskIcon } from '@/lib/plugins/tasks/client';
import {
  createTaskComment,
  createTaskTemplate,
  deleteTaskComment,
  deleteTaskDependency,
  deleteTaskRelation,
  getTaskCommentsEndpoint,
  getTaskDetailsEndpoint,
  copyTaskToLocation,
  moveTaskToLocation,
  patchTaskItem,
  postTaskEndpoint,
  shareTaskToLocation,
  taskOsFetcher,
} from '@/lib/plugins/tasks/client/api';
import type {
  ChecklistItemWithSource,
  PickerAction,
  Project,
  TaskComment,
  TaskDependency,
  TaskDetails,
  TaskItem,
  TaskRelation,
  Workspace,
} from '@/lib/plugins/tasks/client/types';
import { formatDate, isOverdue, nanoid } from '@/lib/plugins/tasks/client/utils';
import { MediaManager } from '@/lib/plugins/tasks/ui/media';
import { ContactPickerModal, TaskLinkPickerModal, TaskQuickLinkBar } from '@/lib/plugins/tasks/ui/picker';
import { TaskOsBottomDock } from '@/lib/plugins/tasks/ui/shared/TaskOsBottomDock';
import { TaskOsConfirmDialog, TaskOsIconDock, TaskOsInputDialog, TaskOsMarkdown } from '@/lib/plugins/tasks/ui/shared';
import { LocationActionModal, type TransferMode } from '@/lib/plugins/tasks/ui/shared/TaskTransferModals';
import { taskOsBtnActive } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { ContactInspectorPanel } from './ContactInspectorPanel';
import { TaskNotesEditor } from './TaskNotesEditor';
import { TaskRelationsPanel } from './TaskRelationsPanel';
import { TaskAppearanceModal } from './TaskAppearanceModal';
import { taskOsBtn, taskOsMuted, taskOsPanel } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { TaskOsWindow } from './TaskOsWindow';
import { cn } from '@/lib/utils';

export type TaskModalProps = {
  item: TaskItem;
  project: Project;
  workspaces: Workspace[];
  onClose: () => void;
  onSave: (updated: Partial<TaskItem>, options?: { refresh?: boolean }) => Promise<void>;
  onDelete: () => Promise<void>;
  onRefresh: () => void;
  onNavigateTask?: (taskId: number) => void;
  onNavigateProject?: (projectId: number) => void;
  onNavigateWorkspace?: (workspaceId: number) => void;
  onOpenCascadeEditor?: () => void;
};

type TabId = 'details' | 'checklists' | 'profile' | 'calendar' | 'inspector' | 'relations' | 'media' | 'comments';
type DockId = TabId | 'cascade';

const QUICK_ACTIONS = [
  { path: (id: number) => `/api/plugins/tasks/items/${id}/duplicate`, label: 'Duplicar', icon: Copy },
  { path: (id: number) => `/api/plugins/tasks/items/${id}/convert-to-project`, label: 'A proyecto', icon: FolderKanban },
  { path: (id: number) => `/api/plugins/tasks/items/${id}/checklist-to-tasks`, label: 'Checklist → tareas', icon: CheckSquare },
] as const;

export function TaskModal({
  item,
  project,
  workspaces,
  onClose,
  onSave,
  onDelete,
  onRefresh,
  onNavigateTask,
  onNavigateProject,
  onNavigateWorkspace,
  onOpenCascadeEditor,
}: TaskModalProps) {
  const router = useRouter();
  // Título COMPLETO (con el prefijo `RADAR ·` si lo trae): las tarjetas lo
  // muestran limpio, pero si el editor arrancara limpio se perdería al guardar.
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  const [checklist, setChecklist] = useState<ChecklistItemWithSource[]>(item.checklist);
  const [labelIds, setLabelIds] = useState<string[]>(item.labelIds);
  const [startDate, setStartDate] = useState(item.startDate ? item.startDate.split('T')[0] : '');
  const [endDate, setEndDate] = useState(item.endDate ? item.endDate.split('T')[0] : (item.dueDate ? item.dueDate.split('T')[0] : ''));
  const [dueDate, setDueDate] = useState(item.dueDate ? item.dueDate.split('T')[0] : '');
  const [status, setStatus] = useState(item.status ?? 'open');
  const [parentTaskId, setParentTaskId] = useState<number | null>(item.parentTaskId);
  const [color, setColor] = useState<string | null>(item.color ?? null);
  const [icon, setIcon] = useState<string | null>(item.icon ?? null);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<TabId>('details');
  const [linkPickerAction, setLinkPickerAction] = useState<PickerAction | null>(null);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [showLocationAction, setShowLocationAction] = useState(false);

  const [showActions, setShowActions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTemplateInput, setShowTemplateInput] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [inspectorContactId, setInspectorContactId] = useState<number | null>(null);
  const [asideView, setAsideView] = useState<'contact' | 'relations'>('relations');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const initialSaveSkipped = useRef(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const latestSaveRef = useRef<{ payload: Partial<TaskItem>; signature: string } | null>(null);
  const lastSavedSignatureRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const deleteInProgressRef = useRef(false);


  const columnTitle = project.columns.find((c) => c.id === item.columnId)?.title ?? '—';
  const navigation = getTaskNavigation(project, item);
  const TaskIcon = resolveTaskIcon(icon);

  const { data: comments = [], mutate: mutateComments } = useSWR<TaskComment[]>(
    getTaskCommentsEndpoint(item.id),
    taskOsFetcher,
  );
  const { data: details, mutate: mutateDetails } = useSWR<TaskDetails>(
    getTaskDetailsEndpoint(item.id),
    taskOsFetcher,
  );

  const primaryContactId = getPrimaryLinkedContactId(item.id, details);

  const relationCount = (details?.relations?.length ?? 0)
    + (details?.dependencies?.length ?? 0)
    + (details?.dependents?.length ?? 0)
    + (details?.locations?.length ?? 0)
    + (parentTaskId ? 1 : 0);

  const done = checklist.filter((c) => c.completed).length;
  const total = checklist.length;

  const dockItems = useMemo(() => {
    const items: Array<{ id: DockId; label: string; icon: typeof FileText; badge?: number }> = [
      { id: 'details', label: 'Resumen', icon: FileText },
      { id: 'checklists', label: 'Checklist', icon: ListChecks, badge: total },
      { id: 'profile', label: 'Perfil', icon: UserCircle },
      { id: 'calendar', label: 'Calendario', icon: CalendarDays },
      { id: 'inspector', label: 'Inspector', icon: PanelRight, badge: relationCount },
      { id: 'relations', label: 'Enlaces', icon: Network, badge: relationCount },
      { id: 'media', label: 'Archivos', icon: Paperclip },
      { id: 'comments', label: 'Comentarios', icon: MessageSquare, badge: comments.length },
    ];
    if (onOpenCascadeEditor) {
      items.push({ id: 'cascade', label: 'Editor cascada', icon: FileCode2 });
    }
    return items;
  }, [relationCount, comments.length, total, onOpenCascadeEditor]);

  const handleDockChange = (id: DockId) => {
    if (id === 'cascade') {
      onOpenCascadeEditor?.();
      return;
    }
    setTab(id);
  };

  const buildPayload = (): Partial<TaskItem> => ({
    title: title.trim() || item.title,
    notes,
    checklist,
    labelIds,
    startDate: startDate || null,
    endDate: endDate || null,
    dueDate: endDate || dueDate || null,
    status,
    parentTaskId,
    color,
    icon,
  });

  const payload = useMemo(
    () => buildPayload(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, notes, checklist, labelIds, startDate, endDate, dueDate, status, parentTaskId, color, icon, item.title],
  );
  const payloadSignature = useMemo(() => JSON.stringify(payload), [payload]);

  useEffect(() => {
    latestSaveRef.current = { payload, signature: payloadSignature };
  }, [payload, payloadSignature]);

  const saveNow = async (options: { refresh?: boolean } = {}) => {
    if (deleteInProgressRef.current) return;

    const queued = saveQueueRef.current.then(async () => {
      if (deleteInProgressRef.current) return;

      const latest = latestSaveRef.current;
      if (!latest || lastSavedSignatureRef.current === latest.signature) {
        if (options.refresh) onRefresh();
        return;
      }

      setSaving(true);
      try {
        await onSave(latest.payload, { refresh: false });
        lastSavedSignatureRef.current = latest.signature;
        setLastSavedAt(new Date());
        if (options.refresh) onRefresh();
      } catch (error) {
        console.error('Failed to save task', error);
      } finally {
        setSaving(false);
      }
    });

    saveQueueRef.current = queued.catch(() => undefined);
    await queued;
  };

  useEffect(() => {
    if (!initialSaveSkipped.current) {
      initialSaveSkipped.current = true;
      lastSavedSignatureRef.current = payloadSignature;
      return;
    }
    const timer = window.setTimeout(() => { void saveNow(); }, 650);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadSignature]);

  useEffect(() => {
    const onMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
    setInspectorContactId(primaryContactId);
    setAsideView(primaryContactId && onMobile ? 'contact' : 'relations');
    setTab(primaryContactId && onMobile ? 'inspector' : 'details');
  }, [item.id, primaryContactId]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const syncTab = () => {
      if (mq.matches && tab === 'inspector') setTab('details');
    };
    syncTab();
    mq.addEventListener('change', syncTab);
    return () => mq.removeEventListener('change', syncTab);
  }, [tab]);

  useEffect(() => {
    if (!showActions) return;
    const close = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showActions]);

  const handleClose = async () => {
    await saveNow({ refresh: true });
    onClose();
  };

  const handleDelete = async () => {
    deleteInProgressRef.current = true;
    latestSaveRef.current = null;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
    onClose();
  };

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    setChecklist((prev) => [...prev, { id: nanoid(), text: newCheckItem.trim(), completed: false }]);
    setNewCheckItem('');
  };

  const toggleCheck = (id: string) => {
    setChecklist((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, completed: !c.completed } : c));
      if (next.length > 0 && next.every((c) => c.completed)) setStatus('done');
      if (next.some((c) => !c.completed) && status === 'done') setStatus('open');
      return next;
    });
  };

  const removeCheck = (id: string) => setChecklist((prev) => prev.filter((c) => c.id !== id));

  const toggleLabel = (id: string) => {
    setLabelIds((prev) => (prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]));
  };

  const sendComment = async () => {
    if (!commentText.trim()) return;
    await createTaskComment(item.id, commentText.trim());
    setCommentText('');
    mutateComments();
  };

  const deleteComment = async (commentId: number) => {
    await deleteTaskComment(item.id, commentId);
    mutateComments();
  };

  const overdue = isOverdue(endDate || dueDate || null);

  const navigateTask = async (taskId: number | null) => {
    if (!taskId || !onNavigateTask) return;
    await saveNow();
    onNavigateTask(taskId);
    onRefresh();
  };

  const navigateProject = async (projectId: number) => {
    if (!onNavigateProject) return;
    await saveNow();
    onNavigateProject(projectId);
    onClose();
    onRefresh();
  };

  const navigateWorkspace = async (workspaceId: number) => {
    if (!onNavigateWorkspace) return;
    await saveNow();
    onNavigateWorkspace(workspaceId);
    onClose();
    onRefresh();
  };

  const runTaskAction = async (path: string, body?: Record<string, unknown>) => {
    await saveNow();
    await postTaskEndpoint(path, body);
    onRefresh();
    mutateDetails();
  };

  const runLocationAction = async (input: { mode: TransferMode; projectId: number; columnId: number }) => {
    await saveNow();
    if (input.mode === 'move') {
      await moveTaskToLocation(item.id, input.projectId, input.columnId);
    } else if (input.mode === 'copy') {
      await copyTaskToLocation(item.id, input.projectId, input.columnId);
    } else {
      await shareTaskToLocation(item.id, input.projectId, input.columnId);
    }
    mutateDetails();
    onRefresh();
    if (input.mode === 'move') {
      onClose();
    }
  };

  const handlePickTask = async (task: TaskItem, action: PickerAction) => {
    if (action === 'parent_task') {
      setParentTaskId(task.id);
      await saveNow();
      await onSave({ parentTaskId: task.id }, { refresh: false });
      onRefresh();
      mutateDetails();
    } else if (action === 'dependency') {
      await runTaskAction('/api/plugins/tasks/dependencies', { taskId: item.id, dependsOnTaskId: task.id });
    } else if (action === 'checklist_source') {
      await runTaskAction(`/api/plugins/tasks/items/${item.id}/checklist-source`, { sourceTaskId: task.id });
    } else {
      await runTaskAction('/api/plugins/tasks/relations', {
        sourceType: 'task', sourceId: item.id, targetType: 'task', targetId: task.id, relationType: 'related',
      });
    }
  };

  const handlePickProject = async (targetProject: Project, action: PickerAction) => {
    if (action === 'share_project') {
      await runTaskAction(`/api/plugins/tasks/items/${item.id}/share`, { projectId: targetProject.id });
    } else {
      await runTaskAction('/api/plugins/tasks/relations', {
        sourceType: 'task', sourceId: item.id, targetType: 'project', targetId: targetProject.id, relationType: 'related',
      });
    }
  };

  const handlePickWorkspace = async (workspace: Workspace) => {
    await runTaskAction('/api/plugins/tasks/relations', {
      sourceType: 'task', sourceId: item.id, targetType: 'workspace', targetId: workspace.id, relationType: 'related',
    });
  };

  const relateContact = async (contactId: number) => {
    await runTaskAction('/api/plugins/tasks/relations', {
      sourceType: 'task', sourceId: item.id, targetType: 'contact', targetId: contactId, relationType: 'related',
    });
    setShowActions(false);
    setInspectorContactId(contactId);
  };

  const removeRelation = async (relation: TaskRelation) => {
    await deleteTaskRelation(relation.id);
    if (
      inspectorContactId
      && (
        (relation.sourceType === 'contact' && relation.sourceId === inspectorContactId)
        || (relation.targetType === 'contact' && relation.targetId === inspectorContactId)
      )
    ) {
      setInspectorContactId(null);
      setAsideView('relations');
    }
    mutateDetails();
    onRefresh();
  };

  const removeDependency = async (dependency: TaskDependency) => {
    await deleteTaskDependency(dependency.id);
    mutateDetails();
    onRefresh();
  };

  const clearParentTask = async () => {
    setParentTaskId(null);
    await onSave({ parentTaskId: null }, { refresh: false });
    mutateDetails();
    onRefresh();
  };

  const openContactInspector = (contactId: number) => {
    setInspectorContactId(contactId);
    setAsideView('contact');
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setTab('inspector');
    }
  };

  const saveTaskTemplate = async (name: string) => {
    await saveNow();
    await createTaskTemplate({
      type: 'task',
      name,
      payload: {
        title: title.trim() || item.title,
        notes,
        checklist,
        labelIds,
        startDate: startDate || null,
        endDate: endDate || null,
        dueDate: endDate || dueDate || null,
        color,
        icon,
      },
    });
    setShowActions(false);
  };

  const windowStatus = saving ? (
    <span className="flex items-center gap-1 text-[10px] text-[#8b8b96]">
      <Loader2 className="h-3 w-3 animate-spin" />
      Guardando
    </span>
  ) : lastSavedAt ? (
    <span className="text-[10px] text-[#5c5c66]">
      {lastSavedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
    </span>
  ) : null;
  const showDesktopAside = tab === 'details' || tab === 'inspector';

  return (
    <div className="fixed inset-0 z-50" onClick={(e) => e.target === e.currentTarget && void handleClose()}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={() => void handleClose()} />

      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <TaskOsWindow
          title={title.trim() || item.title || 'Tarea'}
          subtitle={`${project.name} · ${columnTitle}`}
          status={windowStatus}
          actions={(
            <>
              <div className="mr-1 flex items-center gap-0.5 border-r border-[#2a2a30] pr-2">
                <IconBtn
                  onClick={() => void navigateTask(navigation.prevTaskId)}
                  disabled={!navigation.prevTaskId}
                  title="Tarea anterior"
                >
                  <ChevronUp className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  onClick={() => void navigateTask(navigation.nextTaskId)}
                  disabled={!navigation.nextTaskId}
                  title="Tarea siguiente"
                >
                  <ChevronDown className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  onClick={() => void navigateTask(navigation.prevColumnTaskId)}
                  disabled={!navigation.prevColumnTaskId}
                  title="Etapa anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  onClick={() => void navigateTask(navigation.nextColumnTaskId)}
                  disabled={!navigation.nextColumnTaskId}
                  title="Etapa siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleting}
                  danger
                  title="Eliminar tarea"
                >
                  <Trash2 className="h-4 w-4" />
                </IconBtn>
              </div>
              <IconBtn
                onClick={() => setStatus(status === 'done' ? 'open' : 'done')}
                active={status === 'done'}
                title={status === 'done' ? 'Reabrir' : 'Completar'}
              >
                <CheckCircle2 className="h-4 w-4" />
              </IconBtn>
              <IconBtn onClick={() => void handleClose()} title="Cerrar">
                <X className="h-4 w-4" />
              </IconBtn>
            </>
          )}
        >
        <div className="flex min-h-0 flex-1 flex-col">
        <div className={cn(
          'grid min-h-0 flex-1 grid-cols-1',
          showDesktopAside ? 'lg:grid-cols-[auto_minmax(0,1fr)_320px]' : 'lg:grid-cols-[auto_minmax(0,1fr)]',
        )}>
          <TaskOsIconDock items={dockItems} active={tab} onChange={handleDockChange} className="hidden lg:flex" />

          <main className="min-h-0 overflow-y-auto bg-[#141416] p-4 sm:p-5 lg:p-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-start gap-3">
              <button
                type="button"
                title="Icono y color (opcional)"
                onClick={() => setShowAppearanceModal(true)}
                className={cn(
                  'mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a2a30] transition-colors hover:border-[#3a3a42] hover:bg-[#1e1e22]',
                )}
                style={color ? { backgroundColor: `${color}33`, borderColor: `${color}55` } : undefined}
              >
                {TaskIcon ? (
                  <TaskIcon className="h-4 w-4" style={color ? { color } : undefined} />
                ) : (
                  <Palette className="h-4 w-4 text-[#5c5c66]" />
                )}
              </button>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold leading-tight text-[#f0f0f5] outline-none placeholder:text-[#5c5c66]"
                placeholder="Sin título"
              />
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-2">
              <StatusToggle status={status} onChange={setStatus} />
              {project.labels.length > 0 && project.labels.map((l) => {
                const active = labelIds.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLabel(l.id)}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[10px] font-medium transition-all',
                      active ? 'text-white' : 'border border-[#2a2a30] text-[#6b6b76] hover:text-[#a8a8b3]',
                    )}
                    style={active ? { backgroundColor: `${l.color}bb` } : undefined}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>

          <div className="animate-in fade-in duration-200">
            {tab === 'details' && (
              <div className="space-y-6">
                {/* Contenido / Notas */}
                <div>
                  <div className={cn('mb-1.5 text-[11px] font-medium uppercase tracking-widest', taskOsMuted)}>Contenido</div>
                  <TaskNotesEditor value={notes} onChange={setNotes} />
                </div>

                {/* Checklists directamente en el resumen */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className={cn('text-[11px] font-medium', taskOsMuted)}>Checklist</span>
                    {total > 0 && <span className="text-[10px] text-white/25">{Math.round((done / total) * 100)}%</span>}
                  </div>
                  {checklist.length > 0 && (
                    <ul className="mb-2 space-y-0.5">
                      {checklist.map((c) => (
                        <li key={c.id} className="group/ci flex items-start gap-2.5 rounded-lg py-1.5 pr-1 hover:bg-white/[0.04]">
                          <button type="button" onClick={() => toggleCheck(c.id)} className="mt-0.5 shrink-0">
                            <span className={cn('flex h-4 w-4 items-center justify-center rounded border', c.completed ? 'border-emerald-500 bg-emerald-500' : 'border-white/25')}>
                              {c.completed && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                            </span>
                          </button>
                          <span className={cn('min-w-0 flex-1 text-sm', c.completed && 'line-through text-white/30')}>{c.text}</span>
                          <button type="button" onClick={() => removeCheck(c.id)} className="shrink-0 opacity-0 group-hover/ci:opacity-100"><X className="h-3.5 w-3.5" /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-2">
                    <input value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCheckItem()} placeholder="Nuevo ítem..." className="min-w-0 flex-1 border-b border-white/10 bg-transparent py-1.5 text-sm outline-none" />
                    <button type="button" onClick={addCheckItem} className="rounded-lg p-1.5 hover:bg-white/8"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>

                {/* Información debajo: relaciones, dependencias, media, usuario relacionado, etc. */}
                <div className="space-y-4 border-t border-[#2a2a30] pt-4 lg:hidden">
                  <div className={cn('text-[11px] font-medium uppercase tracking-widest', taskOsMuted)}>Información y relaciones</div>

                  {/* Usuario / Contacto relacionado */}
                  {primaryContactId && details && (
                    <div className={cn(taskOsPanel, 'p-3')}>
                      <div className="flex items-center gap-2 text-xs">
                        <UserCircle className="h-4 w-4" />
                        <span className="font-medium">Contacto relacionado</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openContactInspector(primaryContactId)}
                        className="mt-1 text-xs text-[#93c5fd] hover:underline"
                      >
                        Ver detalles del contacto
                      </button>
                    </div>
                  )}

                  {/* Relaciones y dependencias */}
                  <div className={cn(taskOsPanel, 'p-3 space-y-2')}>
                    <div className="flex items-center gap-2 text-xs">
                      <Network className="h-4 w-4" />
                      <span className="font-medium">Relaciones ({relationCount})</span>
                    </div>
                    <TaskRelationsPanel
                      taskId={item.id}
                      parentTaskId={parentTaskId}
                      workspaces={workspaces}
                      details={details}
                      compact
                      editable
                      onOpenTask={(taskId) => void navigateTask(taskId)}
                      onOpenProject={(projectId) => void navigateProject(projectId)}
                      onOpenWorkspace={(workspaceId) => void navigateWorkspace(workspaceId)}
                      onOpenContact={openContactInspector}
                      onRemoveRelation={(relation) => void removeRelation(relation)}
                      onRemoveDependency={(dependency) => void removeDependency(dependency)}
                      onClearParent={() => void clearParentTask()}
                    />
                  </div>

                  {/* Dependencias específicas */}
                  {(details?.dependencies?.length || details?.dependents?.length) ? (
                    <div className={cn(taskOsPanel, 'p-3 text-xs')}>
                      <div className="font-medium mb-1">Dependencias</div>
                      <div className={taskOsMuted}>
                        Depende de: {details?.dependencies?.length || 0} · Bloquea a: {details?.dependents?.length || 0}
                      </div>
                    </div>
                  ) : null}

                  {/* Archivos */}
                  <div className={cn(taskOsPanel, 'p-3 text-xs')}>
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      <span className="font-medium">Archivos</span>
                      <span className={cn('ml-auto', taskOsMuted)}>{details?.media?.length || 0} archivos</span>
                    </div>
                    {(details?.media?.length ?? 0) > 0 && (
                      <div className="mt-2 text-[11px] text-[#93c5fd] cursor-pointer" onClick={() => setTab('media')}>
                        Ver y gestionar archivos adjuntos →
                      </div>
                    )}
                  </div>

                  {/* Ubicaciones / Etapas relacionadas */}
                  <button
                    type="button"
                    onClick={() => setShowLocationAction(true)}
                    className={cn('flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs', taskOsBtn)}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    Mover / copiar / compartir
                  </button>

                  {details?.locations && details.locations.length > 1 && (
                    <div className={cn(taskOsPanel, 'p-3 text-xs')}>
                      <div className="font-medium mb-1">Ubicaciones en proyectos</div>
                      <div className={taskOsMuted}>{details.locations.length} ubicaciones</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'checklists' && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <span className={cn('text-[11px] font-medium', taskOsMuted)}>Checklist</span>
                  {total > 0 && <span className="text-[10px] text-white/25">{Math.round((done / total) * 100)}%</span>}
                </div>
                {checklist.length > 0 && (
                  <ul className="mb-2 space-y-0.5">
                    {checklist.map((c) => (
                      <li key={c.id} className="group/ci flex items-start gap-2.5 rounded-lg py-1.5 pr-1 hover:bg-white/[0.04]">
                        <button type="button" onClick={() => toggleCheck(c.id)} className="mt-0.5 shrink-0">
                          <span className={cn('flex h-4 w-4 items-center justify-center rounded border', c.completed ? 'border-emerald-500 bg-emerald-500' : 'border-white/25')}>
                            {c.completed && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                          </span>
                        </button>
                        <span className={cn('min-w-0 flex-1 text-sm', c.completed && 'line-through text-white/30')}>{c.text}</span>
                        <button type="button" onClick={() => removeCheck(c.id)} className="shrink-0 opacity-0 group-hover/ci:opacity-100"><X className="h-3.5 w-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <input value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCheckItem()} placeholder="Nuevo ítem..." className="min-w-0 flex-1 border-b border-white/10 bg-transparent py-1.5 text-sm outline-none" />
                  <button type="button" onClick={addCheckItem} className="rounded-lg p-1.5 hover:bg-white/8"><Plus className="h-4 w-4" /></button>
                </div>
              </section>
            )}

            {tab === 'profile' && (
              <div className="space-y-4">
                <div className={cn(taskOsPanel, 'flex items-center gap-3 p-4')}>
                  {TaskIcon ? <TaskIcon className="h-8 w-8" style={{ color: color ?? undefined }} /> : <UserCircle className="h-8 w-8 text-[#6b6b76]" />}
                  <div>
                    <p className="text-lg font-semibold">{title.trim() || item.title}</p>
                    <p className={cn('text-xs', taskOsMuted)}>{project.name} · {columnTitle}</p>
                  </div>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between"><dt className={taskOsMuted}>Estado</dt><dd>{status === 'done' ? 'Hecha' : 'Abierta'}</dd></div>
                  <div className="flex justify-between"><dt className={taskOsMuted}>Checklist</dt><dd>{done}/{total}</dd></div>
                </dl>
                {(item as any).coverUrl && (
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <img src={(item as any).coverUrl} alt="Portada" className="max-h-40 w-full object-cover" />
                  </div>
                )}
                {notes && <TaskOsMarkdown content={notes.slice(0, 600)} className="text-sm" />}
              </div>
            )}

            {tab === 'calendar' && (
              <div className="mx-auto max-w-md space-y-4">
                <div className="flex flex-wrap gap-3">
                  <label className="flex flex-1 flex-col gap-1 text-xs text-[#6b6b76]">Inicio
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-[#2a2a30] bg-[#141416] px-2 py-2 [color-scheme:dark]" />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-xs text-[#6b6b76]">Fin
                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setDueDate(e.target.value); }} className="rounded-lg border border-[#2a2a30] bg-[#141416] px-2 py-2 [color-scheme:dark]" />
                  </label>
                </div>
                <button type="button" onClick={() => void saveNow()} className={cn('w-full py-2.5 text-sm', taskOsBtnActive)}>Guardar fechas</button>
                <button type="button" onClick={() => router.push(`/plugins/calendar?task=${item.id}`)} className={cn('flex w-full items-center justify-center gap-2 py-2.5 text-sm', taskOsBtn)}>
                  <ExternalLink className="h-4 w-4" /> Abrir en Calendario
                </button>
              </div>
            )}

            {tab === 'inspector' && (
              <div className="flex min-h-0 flex-col gap-4">
                {asideView === 'contact' && inspectorContactId ? (
                  <ContactInspectorPanel
                    contactId={inspectorContactId}
                    onBack={() => setAsideView('relations')}
                  />
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-medium text-[#c8c8d0]">Inspector</p>
                      <p className="text-[10px] text-[#5c5c66]">
                        {primaryContactId ? 'Contacto vinculado' : `${relationCount} vínculo${relationCount === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {primaryContactId && (
                      <button
                        type="button"
                        onClick={() => {
                          setInspectorContactId(primaryContactId);
                          setAsideView('contact');
                        }}
                        className={cn('w-full px-2.5 py-1.5 text-left text-[11px]', taskOsBtn)}
                      >
                        Ver contacto y campos CRM
                      </button>
                    )}
                    <TaskRelationsPanel
                      taskId={item.id}
                      parentTaskId={parentTaskId}
                      workspaces={workspaces}
                      details={details}
                      compact
                      editable
                      onOpenTask={(taskId) => void navigateTask(taskId)}
                      onOpenProject={(projectId) => void navigateProject(projectId)}
                      onOpenWorkspace={(workspaceId) => void navigateWorkspace(workspaceId)}
                      onOpenContact={openContactInspector}
                      onRemoveRelation={(relation) => void removeRelation(relation)}
                      onRemoveDependency={(dependency) => void removeDependency(dependency)}
                      onClearParent={() => void clearParentTask()}
                    />
                  </>
                )}
              </div>
            )}

            {tab === 'relations' && (
              <div className="space-y-5">
                <TaskRelationsPanel
                  taskId={item.id}
                  parentTaskId={parentTaskId}
                  workspaces={workspaces}
                  details={details}
                  editable
                  onOpenTask={(taskId) => void navigateTask(taskId)}
                  onOpenProject={(projectId) => void navigateProject(projectId)}
                  onOpenWorkspace={(workspaceId) => void navigateWorkspace(workspaceId)}
                  onOpenContact={openContactInspector}
                  onRemoveRelation={(relation) => void removeRelation(relation)}
                  onRemoveDependency={(dependency) => void removeDependency(dependency)}
                  onClearParent={() => void clearParentTask()}
                />

                <div className={cn(taskOsPanel, 'space-y-4 p-4')}>
                  <TaskQuickLinkBar
                    onLinkContact={() => setShowContactPicker(true)}
                    onPickAction={(action) => setLinkPickerAction(action)}
                  />

                  <div>
                    <p className={cn('mb-2 text-[10px] font-medium uppercase tracking-wider', taskOsMuted)}>Herramientas</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLocationAction(true)}
                        className={cn('flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]', taskOsBtn)}
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        Ubicación
                      </button>
                      {QUICK_ACTIONS.map(({ path, label, icon: Icon }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => void runTaskAction(path(item.id))}
                          className={cn('flex items-center gap-1.5 px-2.5 py-1.5 text-[11px]', taskOsBtn)}
                        >
                          <Icon className="h-3 w-3" />
                          {label}
                        </button>
                      ))}
                      <div className="relative" ref={actionsRef}>
                        <button
                          type="button"
                          onClick={() => setShowActions((v) => !v)}
                          className={cn('flex items-center gap-1 px-2 py-1.5 text-[11px]', taskOsBtn)}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                          Más
                        </button>
                        {showActions && (
                          <div className={cn('absolute left-0 top-full z-10 mt-1 min-w-[10rem] rounded-lg border py-1 shadow-xl', taskOsPanel)}>
                            <button type="button" onClick={() => { setShowTemplateInput(true); setShowActions(false); }} className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[#222228]', taskOsMuted, 'hover:text-[#e8e8ed]')}>
                              <LayoutTemplate className="h-3 w-3" /> Guardar plantilla
                            </button>
                            <button
                              type="button"
                              onClick={() => { setShowDeleteConfirm(true); setShowActions(false); }}
                              disabled={deleting}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-400/80 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                            >
                              <Trash2 className="h-3 w-3" /> Eliminar tarea
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'media' && (
              <MediaManager
                ownerType="task"
                ownerId={item.id}
                onSetCover={async (mid) => {
                  try {
                    await patchTaskItem(item.id, { coverMediaId: mid } as any);
                    // The cover will be visible on next task open or refresh
                  } catch (e) {
                    console.error('Failed to set cover', e);
                  }
                }}
              />
            )}

            {tab === 'comments' && (
              <div className="space-y-3">
                {comments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-white/25">Sin comentarios</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="group/cm flex gap-2.5">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-[10px] text-white/40">U</div>
                      <div className="min-w-0 flex-1">
                        <TaskOsMarkdown content={c.text} className="text-sm" />
                        <p className="mt-0.5 text-[10px] text-white/25">
                          {new Date(c.createdAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteComment(c.id)}
                        className="shrink-0 self-start text-white/0 transition-all group-hover/cm:text-white/20 hover:!text-red-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
                <div className="flex gap-2 border-t border-white/[0.06] pt-3">
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void sendComment()}
                    placeholder="Escribe un comentario..."
                    className="min-w-0 flex-1 border-b border-white/10 bg-transparent py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/25"
                  />
                  <button
                    type="button"
                    onClick={() => void sendComment()}
                    disabled={!commentText.trim()}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-30"
                  >
                    Enviar
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
          </main>

          <aside className={cn('hidden min-h-0 flex-col border-l border-[#2a2a30] bg-[#18181b] lg:flex', !showDesktopAside && 'lg:hidden')}>
            {asideView === 'contact' && inspectorContactId ? (
              <ContactInspectorPanel
                contactId={inspectorContactId}
                onBack={() => setAsideView('relations')}
              />
            ) : (
              <>
                <div className="border-b border-[#2a2a30] px-4 py-3">
                  <p className="text-xs font-medium text-[#c8c8d0]">{tab === 'details' ? 'Resumen' : 'Inspector'}</p>
                  <p className="text-[10px] text-[#5c5c66]">
                    {primaryContactId ? 'Contacto vinculado' : `${relationCount} vínculo${relationCount === 1 ? '' : 's'}`}
                  </p>
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {tab === 'details' && (
                    <div className={cn(taskOsPanel, 'space-y-2 p-3 text-xs')}>
                      <div className="flex items-center justify-between gap-3">
                        <span className={taskOsMuted}>Estado</span>
                        <span className={status === 'done' ? 'text-emerald-300' : 'text-[#93c5fd]'}>
                          {status === 'done' ? 'Hecha' : 'Abierta'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className={taskOsMuted}>Proyecto</span>
                        <button
                          type="button"
                          onClick={() => void navigateProject(project.id)}
                          className="min-w-0 truncate text-right text-[#c8c8d0] hover:text-[#93c5fd]"
                        >
                          {project.name}
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className={taskOsMuted}>Etapa</span>
                        <span className="min-w-0 truncate text-right text-[#c8c8d0]">{columnTitle}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowLocationAction(true)}
                        className={cn('mt-2 flex w-full items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px]', taskOsBtn)}
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        Mover / copiar / compartir
                      </button>
                      <div className="flex items-center justify-between gap-3">
                        <span className={taskOsMuted}>Checklist</span>
                        <span className="text-[#c8c8d0]">{done}/{total}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className={taskOsMuted}>Fecha</span>
                        <span className={cn('text-right', overdue ? 'text-red-300' : 'text-[#c8c8d0]')}>
                          {formatDate(endDate || dueDate || null) ?? 'Sin fecha'}
                        </span>
                      </div>
                    </div>
                  )}
                  {primaryContactId && (
                    <button
                      type="button"
                      onClick={() => {
                        setInspectorContactId(primaryContactId);
                        setAsideView('contact');
                      }}
                      className={cn('mb-3 w-full px-2.5 py-1.5 text-left text-[11px]', taskOsBtn)}
                    >
                      Ver contacto y campos CRM
                    </button>
                  )}
                  <TaskRelationsPanel
                    taskId={item.id}
                    parentTaskId={parentTaskId}
                    workspaces={workspaces}
                    details={details}
                    compact
                    editable
                    onOpenTask={(taskId) => void navigateTask(taskId)}
                    onOpenProject={(projectId) => void navigateProject(projectId)}
                    onOpenWorkspace={(workspaceId) => void navigateWorkspace(workspaceId)}
                    onOpenContact={openContactInspector}
                    onRemoveRelation={(relation) => void removeRelation(relation)}
                    onRemoveDependency={(dependency) => void removeDependency(dependency)}
                    onClearParent={() => void clearParentTask()}
                  />
                  <div className={cn(taskOsPanel, 'p-3')}>
                    <TaskQuickLinkBar
                      onLinkContact={() => setShowContactPicker(true)}
                      onPickAction={(action) => setLinkPickerAction(action)}
                    />
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
        <TaskOsBottomDock
          items={dockItems.map(({ id, label, icon, badge }) => ({ id, label, icon, badge }))}
          active={tab}
          onChange={handleDockChange}
        />
        </div>
        </TaskOsWindow>
      </div>

      <TaskOsConfirmDialog
        open={showDeleteConfirm}
        title="Eliminar tarea"
        description={`¿Eliminar "${title.trim() || item.title}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={handleDelete}
        onClose={() => setShowDeleteConfirm(false)}
      />

      <TaskOsInputDialog
        open={showTemplateInput}
        title="Guardar plantilla de tarea"
        description="La plantilla incluirá título, notas, checklist y etiquetas actuales."
        defaultValue={title.trim() || item.title}
        placeholder="Nombre de la plantilla..."
        submitLabel="Guardar plantilla"
        onSubmit={saveTaskTemplate}
        onClose={() => setShowTemplateInput(false)}
      />

      <ContactPickerModal
        open={showContactPicker}
        onSelect={relateContact}
        onClose={() => setShowContactPicker(false)}
      />

      <TaskAppearanceModal
        open={showAppearanceModal}
        color={color}
        icon={icon}
        onColorChange={setColor}
        onIconChange={setIcon}
        onClose={() => setShowAppearanceModal(false)}
      />

      {showLocationAction && (
        <LocationActionModal
          title="Ubicación de tarea"
          subtitle={title.trim() || item.title}
          workspaces={workspaces}
          defaultProjectId={project.id}
          sourceProjectId={project.id}
          sourceColumnId={item.columnId}
          modes={['move', 'copy', 'share']}
          onClose={() => setShowLocationAction(false)}
          onSubmit={runLocationAction}
        />
      )}

      {linkPickerAction && (
        <TaskLinkPickerModal
          open
          action={linkPickerAction}
          currentTaskId={item.id}
          currentProject={project}
          workspaces={workspaces}
          onClose={() => setLinkPickerAction(null)}
          onPickTask={(task) => { if (linkPickerAction) void handlePickTask(task, linkPickerAction); }}
          onPickProject={(targetProject) => { if (linkPickerAction) void handlePickProject(targetProject, linkPickerAction); }}
          onPickWorkspace={(workspace) => { void handlePickWorkspace(workspace); }}
        />
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'rounded-md p-1.5 transition-colors',
        active && 'text-emerald-400',
        danger && 'text-[#6b6b76] hover:text-red-400',
        !active && !danger && 'text-[#6b6b76] hover:bg-[#2a2a30] hover:text-[#d4d4dc]',
        disabled && 'pointer-events-none opacity-30',
      )}
    >
      {children}
    </button>
  );
}

function StatusToggle({ status, onChange }: { status: string; onChange: (s: 'open' | 'done') => void }) {
  return (
    <div className="flex rounded-md border border-[#2a2a30] bg-[#1a1a1e] p-0.5">
      {(['open', 'done'] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn(
            'rounded px-2.5 py-1 text-[11px] font-medium transition-all',
            status === s
              ? s === 'done' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[#2563eb]/20 text-[#93c5fd]'
              : 'text-[#6b6b76] hover:text-[#a8a8b3]',
          )}
        >
          {s === 'open' ? 'Abierta' : 'Hecha'}
        </button>
      ))}
    </div>
  );
}
