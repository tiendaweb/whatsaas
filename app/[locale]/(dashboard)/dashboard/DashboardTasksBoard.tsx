'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  CircleDot,
  FolderKanban,
  ListChecks,
  ListTodo,
  Loader2,
  Plus,
  Search,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import useSWR from 'swr';
import { z } from 'zod';

import type { Chat } from '@/components/dashboard/ChatListItem';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type TaskStatus = 'open' | 'in_progress' | 'done';
type TaskScope = 'all' | 'contact' | 'team';

type DashboardTaskContact = {
  id: number;
  name: string;
  chatId: number;
  remoteJid: string;
  profilePicUrl: string | null;
};

type DashboardTask = {
  id: number;
  title: string;
  notes: string;
  status: string;
  order: number;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: number;
  projectName: string;
  projectColor: string | null;
  columnId: number;
  columnName: string;
  source: 'contact' | 'team';
  checklistTotal: number;
  checklistDone: number;
  contacts: DashboardTaskContact[];
};

type DashboardTaskProject = {
  id: number;
  name: string;
  color: string | null;
};

type DashboardTasksResponse = {
  enabled: boolean;
  canWrite: boolean;
  tasks: DashboardTask[];
  projects: DashboardTaskProject[];
};

type ContactTaskGroup = {
  contact: DashboardTaskContact;
  tasks: DashboardTask[];
};

type ProjectTaskGroup = {
  project: { id: number; name: string; color: string | null };
  tasks: DashboardTask[];
};

type TaskUpdate = Partial<Pick<DashboardTask, 'title' | 'notes' | 'dueDate' | 'order'>> & {
  taskId: number;
  status?: TaskStatus;
};

const STATUS_ORDER: TaskStatus[] = ['open', 'in_progress', 'done'];
const SCOPE_ORDER: TaskScope[] = ['all', 'contact', 'team'];
const DEFAULT_PROJECT_VALUE = 'default';

function normalizeStatus(status: string): TaskStatus {
  if (status === 'done' || status === 'in_progress') return status;
  return 'open';
}

function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function dashboardTasksFetcher(url: string): Promise<DashboardTasksResponse> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'request_failed');
  return body;
}

async function chatsFetcher(url: string): Promise<Chat[]> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('request_failed');
  return response.json();
}

function TaskBoardLoading() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto bg-muted/35 p-3 lg:grid-cols-3 lg:p-5">
      {STATUS_ORDER.map((status) => (
        <div key={status} className="rounded-xl border border-border bg-card p-3">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
            <div className="h-6 w-8 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="space-y-3">
            <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />
            <div className="h-28 w-full animate-pulse rounded-xl bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DashboardTasksBoard({ viewSwitcher }: { viewSwitcher: React.ReactNode }) {
  const t = useTranslations('DashboardTasks');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedContactId = Number(searchParams.get('contactId')) || null;
  const { data, error, isLoading, mutate } = useSWR<DashboardTasksResponse>('/api/dashboard/tasks', dashboardTasksFetcher);
  const { data: chats = [] } = useSWR<Chat[]>('/api/chats', chatsFetcher);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<TaskScope>('all');
  const [mobileStatus, setMobileStatus] = useState<TaskStatus>('open');
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [editingTask, setEditingTask] = useState<DashboardTask | null>(null);
  const [createContactId, setCreateContactId] = useState<number | null>(null);
  const [createProjectId, setCreateProjectId] = useState<string>(DEFAULT_PROJECT_VALUE);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const didDragRef = useRef(false);

  const taskFormSchema = useMemo(() => z.object({
    title: z.string().trim().min(1, t('title_required')).max(500),
    notes: z.string().max(10_000),
    dueDate: z.string(),
    status: z.enum(['open', 'in_progress', 'done']),
  }), [t]);
  type TaskFormValues = z.infer<typeof taskFormSchema>;

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: { title: '', notes: '', dueDate: '', status: 'open' },
  });

  const contactOptions = useMemo(() => chats
    .filter((chat) => chat.contact?.id)
    .map((chat) => ({
      id: chat.contact!.id,
      name: chat.contact!.name,
      chatId: chat.id,
      profilePicUrl: chat.profilePicUrl,
    })), [chats]);

  const selectedContact = useMemo(
    () => contactOptions.find((contact) => contact.id === selectedContactId) ?? null,
    [contactOptions, selectedContactId],
  );
  const createContact = useMemo(
    () => contactOptions.find((contact) => contact.id === createContactId) ?? null,
    [contactOptions, createContactId],
  );

  const scopeCounts = useMemo(() => {
    const tasks = data?.tasks ?? [];
    return {
      all: tasks.length,
      contact: tasks.filter((task) => task.source === 'contact').length,
      team: tasks.filter((task) => task.source === 'team').length,
    } satisfies Record<TaskScope, number>;
  }, [data?.tasks]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    return (data?.tasks ?? []).filter((task) => {
      if (scope !== 'all' && task.source !== scope) return false;
      if (selectedContactId && !task.contacts.some((contact) => contact.id === selectedContactId)) return false;
      if (!query) return true;
      return [task.title, task.notes, task.projectName, ...task.contacts.map((contact) => contact.name)]
        .some((value) => value.toLocaleLowerCase(locale).includes(query));
    });
  }, [data?.tasks, locale, scope, search, selectedContactId]);

  const tasksByStatus = useMemo(() => Object.fromEntries(
    STATUS_ORDER.map((status) => [
      status,
      visibleTasks
        .filter((task) => normalizeStatus(task.status) === status)
        .sort((a, b) => a.order - b.order || a.id - b.id),
    ]),
  ) as Record<TaskStatus, DashboardTask[]>, [visibleTasks]);

  const groupsByStatus = useMemo(() => Object.fromEntries(
    STATUS_ORDER.map((status) => {
      const contactGroups = new Map<number, ContactTaskGroup>();
      const projectGroups = new Map<number, ProjectTaskGroup>();
      for (const task of tasksByStatus[status]) {
        if (task.source === 'contact') {
          const contact = task.contacts.find((item) => item.id === selectedContactId) ?? task.contacts[0];
          if (!contact) continue;
          const group = contactGroups.get(contact.id) ?? { contact, tasks: [] };
          group.tasks.push(task);
          contactGroups.set(contact.id, group);
        } else {
          const group = projectGroups.get(task.projectId)
            ?? { project: { id: task.projectId, name: task.projectName, color: task.projectColor }, tasks: [] };
          group.tasks.push(task);
          projectGroups.set(task.projectId, group);
        }
      }
      return [status, {
        contacts: [...contactGroups.values()].sort((a, b) => a.contact.name.localeCompare(b.contact.name, locale)),
        projects: [...projectGroups.values()].sort((a, b) => a.project.name.localeCompare(b.project.name, locale)),
      }];
    }),
  ) as Record<TaskStatus, { contacts: ContactTaskGroup[]; projects: ProjectTaskGroup[] }>, [locale, selectedContactId, tasksByStatus]);

  const statusMeta = {
    open: { label: t('status_open'), description: t('status_open_description'), icon: Circle },
    in_progress: { label: t('status_in_progress'), description: t('status_in_progress_description'), icon: CircleDot },
    done: { label: t('status_done'), description: t('status_done_description'), icon: CheckCircle2 },
  } satisfies Record<TaskStatus, { label: string; description: string; icon: typeof Circle }>;

  const scopeMeta = {
    all: { label: t('scope_all'), icon: ListChecks },
    contact: { label: t('scope_contacts'), icon: Users },
    team: { label: t('scope_team'), icon: FolderKanban },
  } satisfies Record<TaskScope, { label: string; icon: typeof ListChecks }>;

  const clearContactFilter = () => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('contactId');
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  const openCreateDialog = () => {
    setEditingTask(null);
    setDialogMode('create');
    setCreateContactId(selectedContactId);
    setCreateProjectId(DEFAULT_PROJECT_VALUE);
    setConfirmingDelete(false);
    form.reset({ title: '', notes: '', dueDate: '', status: 'open' });
  };

  const openEditDialog = (task: DashboardTask) => {
    setEditingTask(task);
    setDialogMode('edit');
    setConfirmingDelete(false);
    form.reset({
      // Título COMPLETO a propósito: el prefijo `RADAR ·` es lo que usa el
      // sistema para agrupar; si el form arrancara con el título limpio, al
      // guardar se perdería.
      title: task.title,
      notes: task.notes,
      dueDate: toDateTimeLocal(task.dueDate),
      status: normalizeStatus(task.status),
    });
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingTask(null);
    setConfirmingDelete(false);
    form.reset();
  };

  const persistUpdates = async (updates: TaskUpdate[]) => {
    const response = await fetch('/api/dashboard/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    if (!response.ok) throw new Error('task_update_failed');
  };

  const submitTask = form.handleSubmit(async (values) => {
    const dueDate = values.dueDate ? new Date(values.dueDate).toISOString() : null;
    try {
      if (dialogMode === 'create') {
        const response = await fetch('/api/dashboard/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: values.title.trim(),
            notes: values.notes,
            dueDate,
            status: values.status,
            contactId: createContactId,
            projectId: !createContactId && createProjectId !== DEFAULT_PROJECT_VALUE
              ? Number(createProjectId)
              : null,
          }),
        });
        if (!response.ok) throw new Error('task_create_failed');
        toast.success(t('created_toast'));
      } else if (dialogMode === 'edit' && editingTask) {
        await persistUpdates([{
          taskId: editingTask.id,
          title: values.title.trim(),
          notes: values.notes,
          dueDate,
          status: values.status,
        }]);
        toast.success(t('updated_toast'));
      }
      closeDialog();
      await mutate();
    } catch {
      toast.error(t(dialogMode === 'create' ? 'create_error_toast' : 'update_error_toast'));
    }
  });

  const deleteTask = async () => {
    if (!editingTask) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch('/api/dashboard/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: editingTask.id }),
      });
      if (!response.ok) throw new Error('task_delete_failed');
      toast.success(t('deleted_toast'));
      closeDialog();
      await mutate();
    } catch {
      toast.error(t('delete_error_toast'));
    } finally {
      setDeleting(false);
    }
  };

  const moveTask = async (taskId: number, targetStatus: TaskStatus, insertBeforeId?: number) => {
    if (!data?.canWrite || savingOrder) return;
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const sourceStatus = normalizeStatus(task.status);
    const withoutTask = data.tasks.filter((item) => item.id !== taskId);
    const targetItems = withoutTask
      .filter((item) => normalizeStatus(item.status) === targetStatus)
      .sort((a, b) => a.order - b.order || a.id - b.id);
    const insertIndex = insertBeforeId ? targetItems.findIndex((item) => item.id === insertBeforeId) : -1;
    targetItems.splice(insertIndex < 0 ? targetItems.length : insertIndex, 0, {
      ...task,
      status: targetStatus,
    });

    const sourceItems = sourceStatus === targetStatus
      ? []
      : withoutTask
          .filter((item) => normalizeStatus(item.status) === sourceStatus)
          .sort((a, b) => a.order - b.order || a.id - b.id);
    const orderedIds = new Set([...targetItems, ...sourceItems].map((item) => item.id));
    const optimisticTasks = data.tasks.map((item) => {
      const targetIndex = targetItems.findIndex((candidate) => candidate.id === item.id);
      if (targetIndex >= 0) return { ...item, status: targetStatus, order: targetIndex };
      const sourceIndex = sourceItems.findIndex((candidate) => candidate.id === item.id);
      if (sourceIndex >= 0) return { ...item, order: sourceIndex };
      return item;
    });
    const updates: TaskUpdate[] = optimisticTasks
      .filter((item) => orderedIds.has(item.id))
      .map((item) => ({
        taskId: item.id,
        order: item.order,
        ...(item.id === taskId ? { status: targetStatus } : {}),
      }));

    setSavingOrder(true);
    await mutate({ ...data, tasks: optimisticTasks }, { revalidate: false });
    try {
      await persistUpdates(updates);
      await mutate();
    } catch {
      await mutate(data, { revalidate: false });
      toast.error(t('reorder_error_toast'));
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDrop = (event: React.DragEvent, status: TaskStatus, insertBeforeId?: number) => {
    event.preventDefault();
    event.stopPropagation();
    const taskId = Number(event.dataTransfer.getData('application/x-whatsaas-task'));
    if (taskId) void moveTask(taskId, status, insertBeforeId);
  };

  const formatDueDate = (value: string) => new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

  const renderTaskCard = (task: DashboardTask, status: TaskStatus) => {
    const overdue = task.dueDate && new Date(task.dueDate).getTime() < Date.now() && status !== 'done';
    const statusIndex = STATUS_ORDER.indexOf(status);
    const prevStatus = STATUS_ORDER[statusIndex - 1];
    const nextStatus = STATUS_ORDER[statusIndex + 1];
    return (
      <div
        key={task.id}
        draggable={Boolean(data?.canWrite)}
        onPointerDown={() => { didDragRef.current = false; }}
        onDragStart={(event) => {
          didDragRef.current = true;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('application/x-whatsaas-task', String(task.id));
        }}
        onDragEnd={() => { window.setTimeout(() => { didDragRef.current = false; }, 0); }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleDrop(event, status, task.id)}
        className={cn(
          'flex min-w-0 items-start gap-2 rounded-md border border-border bg-card px-2.5 py-2 transition-colors hover:border-primary/40',
          data?.canWrite && 'cursor-grab active:cursor-grabbing',
          status === 'done' && 'bg-muted/45',
        )}
      >
        <Checkbox
            className="mt-0.5 h-5 w-5 cursor-pointer rounded-full"
            checked={status === 'done'}
            disabled={!data?.canWrite || savingOrder}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={() => void moveTask(task.id, status === 'done' ? 'open' : 'done')}
            aria-label={t(status === 'done' ? 'reopen_task_label' : 'mark_complete_label', { title: task.title })}
          />
        <button
          type="button"
          draggable={Boolean(data?.canWrite)}
          className="min-w-0 flex-1 cursor-inherit text-left"
          disabled={!data?.canWrite}
          onClick={() => {
            if (!didDragRef.current) openEditDialog(task);
          }}
        >
          <h3 className={cn(
            'flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-5 text-foreground',
            status === 'done' && 'text-muted-foreground line-through',
          )}>
            {isRadarTaskTitle(task.title) && <RadarTag size="xs" />}
            <span className="truncate">{radarTaskTitle(task.title)}</span>
          </h3>
          {task.notes && <p className="truncate text-xs leading-4 text-muted-foreground">{task.notes}</p>}
          {(task.dueDate || task.checklistTotal > 0) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium text-muted-foreground">
              {task.dueDate && (
                <span className={cn('flex items-center gap-1', overdue && 'text-destructive')}>
                  <CalendarClock className="h-3 w-3" />
                  {formatDueDate(task.dueDate)}
                </span>
              )}
              {task.checklistTotal > 0 && (
                <span className={cn(
                  'flex items-center gap-1 tabular-nums',
                  task.checklistDone === task.checklistTotal && 'text-emerald-600 dark:text-emerald-400',
                )}>
                  <ListTodo className="h-3 w-3" />
                  {task.checklistDone}/{task.checklistTotal}
                </span>
              )}
            </span>
          )}
        </button>
        {data?.canWrite && (
          <div className="flex shrink-0 items-center gap-1 self-center lg:hidden">
            <button
              type="button"
              disabled={!prevStatus || savingOrder}
              onClick={() => prevStatus && void moveTask(task.id, prevStatus)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors active:bg-muted disabled:opacity-30"
              aria-label={prevStatus ? t('move_to_status_label', { status: statusMeta[prevStatus].label }) : undefined}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!nextStatus || savingOrder}
              onClick={() => nextStatus && void moveTask(task.id, nextStatus)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors active:bg-muted disabled:opacity-30"
              aria-label={nextStatus ? t('move_to_status_label', { status: statusMeta[nextStatus].label }) : undefined}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderGroupHeader = (icon: React.ReactNode, name: string, count: number) => (
    <div className="flex min-w-0 items-center gap-2 px-1 py-1">
      {icon}
      <h3 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{name}</h3>
      <Badge variant="secondary" className="h-5 min-w-5 px-1.5 tabular-nums">{count}</Badge>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="hidden h-11 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card md:flex">{viewSwitcher}</div>
        <TaskBoardLoading />
      </div>
    );
  }

  if (error || !data) {
    const pluginDisabled = error?.message === 'plugin_disabled';
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="hidden h-11 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card md:flex">{viewSwitcher}</div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/35 p-6 text-center">
          <div className="max-w-md rounded-xl border border-dashed border-border bg-card p-8">
            <ListChecks className="mx-auto h-9 w-9 text-muted-foreground" />
            <h1 className="mt-4 text-lg font-semibold text-foreground">{t(pluginDisabled ? 'plugin_disabled_title' : 'load_error_title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t(pluginDisabled ? 'plugin_disabled_description' : 'load_error_description')}</p>
            {!pluginDisabled && <Button variant="outline" className="mt-5" onClick={() => mutate()}>{t('retry_button')}</Button>}
          </div>
        </div>
      </div>
    );
  }

  const emptyCopy = search
    ? { title: t('empty_search_title'), description: t('empty_search_description') }
    : selectedContact
      ? { title: t('empty_contact_title'), description: t('empty_contact_description') }
      : scope === 'contact'
        ? { title: t('empty_contacts_scope_title'), description: t('empty_contacts_scope_description') }
        : scope === 'team'
          ? { title: t('empty_team_scope_title'), description: t('empty_team_scope_description') }
          : { title: t('empty_title'), description: t('empty_description') };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-dashboard-swipe-lock>
      <div className="hidden h-11 shrink-0 items-stretch overflow-x-auto border-b border-border bg-card md:flex">{viewSwitcher}</div>

      <header className="shrink-0 border-b border-border bg-background px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
              <ListChecks className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-lg font-bold text-foreground sm:text-xl">{t('title')}</h1>
                <Badge variant="secondary" className="tabular-nums">{visibleTasks.length}</Badge>
              </div>
              <p className="hidden text-xs text-muted-foreground md:block">{t('description')}</p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xl sm:justify-end">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('search_placeholder')}
                className="h-10 pl-9"
                aria-label={t('search_label')}
              />
            </div>
            {data.canWrite && (
              <Button className="h-10 shrink-0" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{t('new_task_button')}</span>
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border pt-3">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" role="tablist" aria-label={t('scope_heading')}>
            {SCOPE_ORDER.map((value) => {
              const meta = scopeMeta[value];
              const Icon = meta.icon;
              const active = scope === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setScope(value)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                  <span className={cn(
                    'rounded-full px-1.5 text-[10px] tabular-nums',
                    active ? 'bg-primary-foreground/20' : 'bg-muted',
                  )}>{scopeCounts[value]}</span>
                </button>
              );
            })}
          </div>

          {selectedContact && (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar className="h-7 w-7 border border-border">
                <AvatarImage src={selectedContact.profilePicUrl || ''} alt={selectedContact.name} />
                <AvatarFallback className="bg-muted text-[10px] font-semibold text-foreground">
                  {selectedContact.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                {t('filtered_by_contact', { name: selectedContact.name })}
              </p>
              <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={clearContactFilter}>
                <X className="h-4 w-4" />
                {t('clear_filter_button')}
              </Button>
            </div>
          )}
        </div>
      </header>

      {visibleTasks.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-muted/35 p-6 text-center">
          <div className="max-w-md rounded-xl border border-dashed border-border bg-card p-8">
            <ListChecks className="mx-auto h-9 w-9 text-muted-foreground" />
            <h2 className="mt-4 text-base font-semibold text-foreground">{emptyCopy.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{emptyCopy.description}</p>
            {data.canWrite && !search && (
              <Button className="mt-5" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                {t('create_first_task_button')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/35">
          <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-border bg-background p-1.5 lg:hidden" role="tablist" aria-label={t('status_heading')}>
            {STATUS_ORDER.map((status) => {
              const meta = statusMeta[status];
              const Icon = meta.icon;
              const active = mobileStatus === status;
              return (
                <button
                  key={status}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMobileStatus(status)}
                  className={cn(
                    'flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold transition-colors',
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground active:bg-muted',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{meta.label}</span>
                  <span className={cn(
                    'shrink-0 rounded-full px-1.5 text-[10px] tabular-nums',
                    active ? 'bg-primary-foreground/20' : 'bg-muted',
                  )}>{tasksByStatus[status].length}</span>
                </button>
              );
            })}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-3 overflow-y-auto p-2.5 lg:grid-cols-3 lg:gap-4 lg:p-5">
          {STATUS_ORDER.map((status) => {
            const meta = statusMeta[status];
            const Icon = meta.icon;
            const groups = groupsByStatus[status];
            const hasGroups = groups.contacts.length > 0 || groups.projects.length > 0;
            return (
              <section
                key={status}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, status)}
                className={cn(
                  'min-h-48 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/45',
                  mobileStatus === status ? 'flex' : 'hidden lg:flex',
                )}
              >
                <div className="sticky top-0 z-10 hidden items-start gap-3 border-b border-border bg-card px-3 py-3 lg:flex">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                    <p className="text-xs text-muted-foreground">{meta.description}</p>
                  </div>
                  <span className="text-2xl font-bold tabular-nums text-foreground">{tasksByStatus[status].length}</span>
                </div>

                <div className="flex min-h-32 flex-1 flex-col gap-3 p-1">
                  {hasGroups ? (
                    <>
                      {groups.contacts.map((group) => (
                        <section key={`contact-${group.contact.id}`} className="min-w-0">
                          {renderGroupHeader(
                            <Avatar className="h-6 w-6 border border-border">
                              <AvatarImage src={group.contact.profilePicUrl || ''} alt={group.contact.name} />
                              <AvatarFallback className="bg-background text-[9px] font-semibold text-foreground">
                                {group.contact.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>,
                            group.contact.name,
                            group.tasks.length,
                          )}
                          <div className="space-y-1">
                            {group.tasks.map((task) => renderTaskCard(task, status))}
                          </div>
                        </section>
                      ))}
                      {groups.projects.map((group) => (
                        <section key={`project-${group.project.id}`} className="min-w-0">
                          {renderGroupHeader(
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background"
                              style={group.project.color ? { color: group.project.color } : undefined}
                            >
                              <FolderKanban className="h-3.5 w-3.5" />
                            </span>,
                            group.project.name,
                            group.tasks.length,
                          )}
                          <div className="space-y-1">
                            {group.tasks.map((task) => renderTaskCard(task, status))}
                          </div>
                        </section>
                      ))}
                    </>
                  ) : (
                    <div className="flex min-h-28 flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-background/60 px-4 text-center text-xs text-muted-foreground">
                      <span className="lg:hidden">{t('empty_column_mobile_description')}</span>
                      <span className="hidden lg:inline">{t('empty_column_description')}</span>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
          </div>
        </div>
      )}

      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t(dialogMode === 'create' ? 'create_dialog_title' : 'edit_dialog_title')}</DialogTitle>
            <DialogDescription>
              {dialogMode === 'create'
                ? createContact
                  ? t('create_dialog_description', { name: createContact.name })
                  : t('create_dialog_description_generic')
                : t('edit_dialog_description')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitTask} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="dashboard-task-title">{t('title_label')}</Label>
              <Input
                id="dashboard-task-title"
                autoFocus
                placeholder={t('title_placeholder')}
                aria-invalid={Boolean(form.formState.errors.title)}
                {...form.register('title')}
              />
              {form.formState.errors.title && <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>}
            </div>

            {dialogMode === 'create' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('contact_label')}</Label>
                  <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={contactPickerOpen}
                        className="w-full justify-between font-normal"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{createContact ? createContact.name : t('contact_none')}</span>
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t('contact_search_placeholder')} />
                        <CommandList>
                          <CommandEmpty>{t('contact_search_empty')}</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__none__"
                              onSelect={() => {
                                setCreateContactId(null);
                                setContactPickerOpen(false);
                              }}
                            >
                              <Check className={cn('h-4 w-4', createContactId === null ? 'opacity-100' : 'opacity-0')} />
                              {t('contact_none')}
                            </CommandItem>
                            {contactOptions.map((contact) => (
                              <CommandItem
                                key={contact.id}
                                value={`${contact.name} ${contact.id}`}
                                onSelect={() => {
                                  setCreateContactId(contact.id);
                                  setContactPickerOpen(false);
                                }}
                              >
                                <Check className={cn('h-4 w-4', createContactId === contact.id ? 'opacity-100' : 'opacity-0')} />
                                <Avatar className="h-5 w-5 border border-border">
                                  <AvatarImage src={contact.profilePicUrl || ''} alt={contact.name} />
                                  <AvatarFallback className="bg-muted text-[8px] font-semibold text-foreground">
                                    {contact.name.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="truncate">{contact.name}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>{t('project_label')}</Label>
                  <Select
                    value={createContactId ? DEFAULT_PROJECT_VALUE : createProjectId}
                    onValueChange={setCreateProjectId}
                    disabled={Boolean(createContactId)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_PROJECT_VALUE}>
                        {createContactId ? t('project_contact_option') : t('project_default_option')}
                      </SelectItem>
                      {!createContactId && data.projects.map((project) => (
                        <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="dashboard-task-notes">{t('notes_label')}</Label>
              <Textarea
                id="dashboard-task-notes"
                rows={4}
                placeholder={t('notes_placeholder')}
                {...form.register('notes')}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dashboard-task-due-date">{t('due_date_label')}</Label>
                <Input id="dashboard-task-due-date" type="datetime-local" {...form.register('dueDate')} />
              </div>
              <div className="space-y-2">
                <Label>{t('status_label')}</Label>
                <Select value={form.watch('status')} onValueChange={(value: TaskStatus) => form.setValue('status', value, { shouldDirty: true })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((status) => <SelectItem key={status} value={status}>{statusMeta[status].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              {dialogMode === 'edit' ? (
                <Button
                  type="button"
                  variant={confirmingDelete ? 'destructive' : 'outline'}
                  className={cn(!confirmingDelete && 'text-destructive hover:text-destructive')}
                  onClick={() => void deleteTask()}
                  disabled={deleting || form.formState.isSubmitting}
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {t(confirmingDelete ? 'confirm_delete_button' : 'delete_button')}
                </Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={closeDialog} disabled={form.formState.isSubmitting}>
                  {t('cancel_button')}
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting || deleting}>
                  {form.formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t(dialogMode === 'create' ? 'create_button' : 'save_button')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
