'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  FolderKanban,
  GripVertical,
  Link as LinkIcon,
  ListChecks,
  LayoutGrid,
  MessageCircle,
  NotebookText,
  Plus,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';

type AgendaItem = { _recordId: string; time: string; task: string; done: boolean };
type ClientItem = { _recordId: string; name: string; status: string; notes: string; contacted: boolean; phone?: string };
type PaymentItem = { _recordId: string; concept: string; amount: string; currency: string; dueDate: string; paid: boolean };
type DomainItem = { _recordId: string; domain: string; client: string; status: string; dueDate: string; done: boolean };
type BusinessProject = { _recordId: string; name: string; backgroundUrl: string; tags: { id: string; name: string; color: string }[]; order: number; clientId?: string };
type BusinessColumn = { _recordId: string; projectId: string; title: string; order: number };
type BusinessTask = { _recordId: string; projectId: string; columnId: string; title: string; notes: string; tagIds: string[]; checklist: { id: string; text: string; completed: boolean }[]; comments: { id: string; text: string; createdAt: string }[]; dueDate: string; startDate?: string; status?: string; order: number; createdAt: string; updatedAt: string; clientId?: string };
type NotebookNote = { _recordId: string; title: string; body: string; tag: string; pinned: boolean; linkedTaskId: string; createdAt: string; updatedAt: string };
type DashboardWidgetKey = 'projects' | 'recentClients' | 'quickAdd' | 'week' | 'todayTasks' | 'agenda' | 'deadlines' | 'notes';
type DashboardWidgetSize = 'sm' | 'md' | 'lg' | 'xl';
type DashboardWidget = { _recordId: string; key: DashboardWidgetKey; title: string; size: DashboardWidgetSize; cols: number; rows: number; visible: boolean; order: number };
type RecentChat = { id: number; remoteJid: string; name?: string | null; lastMessageText?: string | null; lastMessageTimestamp?: string | null; contact?: { name?: string | null } | null; instanceId?: number | null };
type Tab = 'today' | 'board' | 'calendar' | 'notes' | 'videos' | 'agenda' | 'clients' | 'sales' | 'links' | 'home' | 'growth' | 'whiteboard';

const DEFAULT_DASHBOARD_WIDGETS: Omit<DashboardWidget, '_recordId'>[] = [
  { key: 'projects', title: 'Resumen de proyectos', size: 'lg', cols: 6, rows: 2, visible: true, order: 0 },
  { key: 'recentClients', title: 'Ultimos clientes', size: 'md', cols: 4, rows: 2, visible: true, order: 1 },
  { key: 'quickAdd', title: 'Agregar rapido', size: 'md', cols: 4, rows: 2, visible: true, order: 2 },
  { key: 'week', title: 'Semana completa', size: 'xl', cols: 12, rows: 3, visible: true, order: 3 },
  { key: 'todayTasks', title: 'Tareas de hoy', size: 'md', cols: 4, rows: 2, visible: true, order: 4 },
  { key: 'agenda', title: 'Agenda', size: 'sm', cols: 3, rows: 2, visible: true, order: 5 },
  { key: 'deadlines', title: 'Vencimientos', size: 'sm', cols: 3, rows: 2, visible: true, order: 6 },
  { key: 'notes', title: 'Notas', size: 'md', cols: 4, rows: 2, visible: true, order: 7 },
];

function todayKey() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function dateKey(date: Date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function isOverdue(value: string) {
  const date = parseDate(value);
  return Boolean(date && dateKey(date) < todayKey());
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={'bw-liquid-panel rounded-2xl border shadow-sm ' + className}>{children}</section>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/36 bg-white/22 p-6 text-center text-sm font-semibold text-zinc-600 backdrop-blur-xl">{children}</div>;
}

export function TodayView({
  agenda,
  tasks,
  columns,
  payments,
  domains,
  notes,
  projects,
  clients,
  recentChats,
  widgets,
  onUpdateWidget,
  onMoveWidget,
  onReorderWidgets,
  onQuickAdd,
  onToggleAgenda,
  onOpenTask,
  onToggleTaskDone,
  onSelectTab,
}: {
  agenda: AgendaItem[];
  tasks: BusinessTask[];
  columns: BusinessColumn[];
  payments: PaymentItem[];
  domains: DomainItem[];
  notes: NotebookNote[];
  projects: BusinessProject[];
  clients: ClientItem[];
  recentChats: RecentChat[];
  widgets: DashboardWidget[];
  onUpdateWidget: (id: string, patch: Partial<DashboardWidget>) => void;
  onMoveWidget: (id: string, direction: -1 | 1) => void;
  onReorderWidgets?: (reordered: DashboardWidget[]) => void;
  onQuickAdd: (type: 'task' | 'note' | 'agenda', title: string, date?: string) => void;
  onToggleAgenda: (id: string) => void;
  onOpenTask: (id: string) => void;
  onToggleTaskDone: (task: BusinessTask) => void;
  onSelectTab: (tab: Tab) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDate, setQuickDate] = useState(todayKey());
  const [quickType, setQuickType] = useState<'task' | 'note' | 'agenda'>('task');
  const dailyAgenda = agenda.slice(0, 6);
  const dueTasks = tasks.filter((t) => t.dueDate === todayKey() || (t.dueDate && isOverdue(t.dueDate)));
  const pendingTasks = dueTasks.filter((task) => {
    const col = columns.find((c) => c._recordId === task.columnId);
    return !(col?.title.toLowerCase().includes('hecho') || col?.title.toLowerCase().includes('done'));
  });
  const agendaDone = dailyAgenda.filter((item) => item.done).length;
  const agendaPct = dailyAgenda.length ? Math.round((agendaDone / dailyAgenda.length) * 100) : 0;
  const upcomingCount = payments.length + domains.length;
  const timeLabel = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const allWidgets = widgets.length
    ? widgets
    : DEFAULT_DASHBOARD_WIDGETS.map((widget, order) => ({ ...widget, _recordId: widget.key, order }));
  const visibleWidgets = allWidgets.filter((widget) => widget.visible).sort((a, b) => a.order - b.order);
  const widgetSizeClass: Record<DashboardWidgetSize, string> = {
    sm: 'col-span-1 sm:col-span-1 md:col-span-1 lg:col-span-2 xl:col-span-3 2xl:col-span-2',
    md: 'col-span-1 sm:col-span-1 md:col-span-2 lg:col-span-3 xl:col-span-4 2xl:col-span-3',
    lg: 'col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-6 2xl:col-span-4',
    xl: 'col-span-1 sm:col-span-2 md:col-span-4 lg:col-span-6 xl:col-span-12 2xl:col-span-6',
  };
  const appShortcuts: Array<{ tab: Tab; label: string; icon: React.ComponentType<{ className?: string }>; value: string; cls: string }> = [
    { tab: 'agenda', label: 'Agenda', icon: ClipboardList, value: `${agenda.length}`, cls: 'from-rose-400 to-pink-600' },
    { tab: 'board', label: 'Proyectos', icon: FolderKanban, value: `${projects.length}`, cls: 'from-sky-400 to-blue-600' },
    { tab: 'clients', label: 'Clientes', icon: Users, value: 'CRM', cls: 'from-violet-400 to-fuchsia-600' },
    { tab: 'sales', label: 'Ventas', icon: TrendingUp, value: `${upcomingCount}`, cls: 'from-emerald-400 to-teal-600' },
    { tab: 'calendar', label: 'Calendario', icon: CalendarDays, value: 'Hoy', cls: 'from-amber-300 to-orange-500' },
    { tab: 'notes', label: 'Notas', icon: NotebookText, value: `${notes.length}`, cls: 'from-yellow-300 to-amber-500' },
    { tab: 'links', label: 'Links', icon: LinkIcon, value: 'Web', cls: 'from-cyan-400 to-indigo-500' },
    { tab: 'whiteboard', label: 'Pizarra', icon: LayoutGrid, value: 'Canvas', cls: 'from-fuchsia-400 to-rose-600' },
    { tab: 'growth', label: 'Metas', icon: Sparkles, value: 'Yo', cls: 'from-lime-300 to-emerald-500' },
  ];
  const doneColumnIds = new Set(columns.filter((column) => /hecho|done/i.test(column.title)).map((column) => column._recordId));
  const projectSummaries = projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project._recordId);
    const done = projectTasks.filter((task) => doneColumnIds.has(task.columnId)).length;
    const overdue = projectTasks.filter((task) => task.dueDate && isOverdue(task.dueDate) && !doneColumnIds.has(task.columnId)).length;
    const linkedClient = project.clientId ? clients.find((client) => client._recordId === project.clientId) : null;
    return {
      project,
      total: projectTasks.length,
      done,
      overdue,
      progress: projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0,
      linkedClient,
    };
  });
  const weekDays = useMemo(() => {
    const start = new Date();
    const day = start.getDay();
    start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 sm:gap-5">
      <section className="relative overflow-hidden rounded-[1.5rem] border border-white/24 bg-zinc-950/24 px-4 py-5 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)] backdrop-blur-xl sm:rounded-[2rem] md:px-7 md:py-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-rose-500/10 via-transparent to-black/24" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-white/70">Inicio</p>
            <h2 className="mt-1 text-5xl font-black leading-none tracking-normal text-white min-[380px]:text-6xl sm:text-7xl">{timeLabel}</h2>
            <p className="mt-3 text-sm font-semibold capitalize text-white/82 md:text-base">{dateLabel}</p>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 md:w-auto md:min-w-[360px]">
            <HomeGlassStat label="Tareas" value={pendingTasks.length} icon={CheckCircle2} />
            <HomeGlassStat label="Agenda" value={`${agendaPct}%`} icon={ClipboardList} />
            <HomeGlassStat label="Vence" value={upcomingCount} icon={CalendarDays} />
          </div>
        </div>
      </section>

      <Panel className="p-3 sm:p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase text-zinc-500">Apps</p>
            <h2 className="text-xl font-black text-zinc-950">Business Woman OS</h2>
          </div>
          <button
            onClick={() => setShowWidgetSettings((value) => !value)}
            className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/32 px-3 py-1.5 text-xs font-black text-zinc-700 backdrop-blur-xl"
          >
            <Settings className="h-3.5 w-3.5" />
            Widgets
          </button>
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-4 min-[380px]:grid-cols-4 sm:grid-cols-6 lg:grid-cols-9 xl:grid-cols-9">
          {appShortcuts.map((app) => (
            <HomeAppIcon key={app.tab} {...app} onClick={() => onSelectTab(app.tab)} />
          ))}
        </div>
        {showWidgetSettings && (
          <div className="mt-5 rounded-2xl border border-white/35 bg-white/28 p-3 backdrop-blur-xl">
            <p className="mb-2 text-xs font-black uppercase text-zinc-500">Mostrar u ocultar widgets</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {allWidgets.map((widget) => (
                <button
                  key={widget._recordId}
                  onClick={() => onUpdateWidget(widget._recordId, { visible: !widget.visible })}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-black ${widget.visible ? 'bg-white/46 text-zinc-800' : 'bg-white/16 text-zinc-500'}`}
                >
                  <span className="min-w-0 truncate">{widget.title}</span>
                  {widget.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <DragDropContext onDragEnd={(result) => {
        if (!result.destination || !onReorderWidgets) return;
        if (result.source.index === result.destination.index) return;
        const reordered = [...visibleWidgets];
        const [moved] = reordered.splice(result.source.index, 1);
        reordered.splice(result.destination.index, 0, moved);
        onReorderWidgets(reordered);
      }}>
        <Droppable droppableId="dashboard-widgets">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              data-widget-grid
              className="bw-widget-grid grid min-w-0 gap-4 xl:gap-5"
            >
              {visibleWidgets.map((widget, index) => (
                <Draggable key={widget._recordId} draggableId={widget._recordId} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`bw-widget-shell group relative min-w-0 ${snapshot.isDragging ? 'opacity-90 ring-2 ring-rose-400 rounded-2xl' : ''}`}
                      style={{
                        ...provided.draggableProps.style,
                        '--bw-widget-cols': Math.min(widget.cols, 12),
                        '--bw-widget-rows': widget.rows,
                        '--bw-widget-min-height': `${Math.max(1, widget.rows) * 132}px`,
                      } as unknown as CSSProperties}
                    >
                      <DashboardWidgetCard
                        widget={widget}
                        agenda={dailyAgenda}
                        tasks={tasks}
                        pendingTasks={pendingTasks}
                        columns={columns}
                        payments={payments}
                        domains={domains}
                        notes={notes}
                        projectSummaries={projectSummaries}
                        recentChats={recentChats}
                        weekDays={weekDays}
                        quickTitle={quickTitle}
                        quickDate={quickDate}
                        quickType={quickType}
                        onQuickTitleChange={setQuickTitle}
                        onQuickDateChange={setQuickDate}
                        onQuickTypeChange={setQuickType}
                        onQuickAdd={() => {
                          onQuickAdd(quickType, quickTitle, quickDate);
                          setQuickTitle('');
                        }}
                        onAddTask={(title, date) => onQuickAdd('task', title, date)}
                        onToggleAgenda={onToggleAgenda}
                        onOpenTask={onOpenTask}
                        onToggleTaskDone={onToggleTaskDone}
                        onSelectTab={onSelectTab}
                        onUpdateWidget={onUpdateWidget}
                        onMoveWidget={onMoveWidget}
                        dragHandleProps={provided.dragHandleProps}
                      />
                      <WidgetResizeHandle
                        onResizeCols={(delta) => {
                          const newCols = Math.max(1, Math.min(12, widget.cols + delta));
                          onUpdateWidget(widget._recordId, { cols: newCols });
                        }}
                        onResizeRows={(delta) => {
                          const newRows = Math.max(1, Math.min(8, widget.rows + delta));
                          onUpdateWidget(widget._recordId, { rows: newRows });
                        }}
                      />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}

type ProjectSummary = {
  project: BusinessProject;
  total: number;
  done: number;
  overdue: number;
  progress: number;
  linkedClient: ClientItem | null | undefined;
};

function DashboardWidgetCard({
  widget,
  agenda,
  tasks,
  pendingTasks,
  columns,
  payments,
  domains,
  notes,
  projectSummaries,
  recentChats,
  weekDays,
  quickTitle,
  quickDate,
  quickType,
  onQuickTitleChange,
  onQuickDateChange,
  onQuickTypeChange,
  onQuickAdd,
  onAddTask,
  onToggleAgenda,
  onOpenTask,
  onToggleTaskDone,
  onSelectTab,
  onUpdateWidget,
  onMoveWidget,
  dragHandleProps,
}: {
  widget: DashboardWidget;
  agenda: AgendaItem[];
  tasks: BusinessTask[];
  pendingTasks: BusinessTask[];
  columns: BusinessColumn[];
  payments: PaymentItem[];
  domains: DomainItem[];
  notes: NotebookNote[];
  projectSummaries: ProjectSummary[];
  recentChats: RecentChat[];
  weekDays: Date[];
  quickTitle: string;
  quickDate: string;
  quickType: 'task' | 'note' | 'agenda';
  onQuickTitleChange: (value: string) => void;
  onQuickDateChange: (value: string) => void;
  onQuickTypeChange: (value: 'task' | 'note' | 'agenda') => void;
  onQuickAdd: () => void;
  onAddTask: (title: string, date: string) => void;
  onToggleAgenda: (id: string) => void;
  onOpenTask: (id: string) => void;
  onToggleTaskDone: (task: BusinessTask) => void;
  onSelectTab: (tab: Tab) => void;
  onUpdateWidget: (id: string, patch: Partial<DashboardWidget>) => void;
  onMoveWidget: (id: string, direction: -1 | 1) => void;
  dragHandleProps?: any;
}) {
  const [weekAddDate, setWeekAddDate] = useState<string | null>(null);
  const [weekAddTitle, setWeekAddTitle] = useState('');
  const header = <WidgetHeader widget={widget} dragHandleProps={dragHandleProps} />;

  if (widget.key === 'projects') {
    return (
      <Panel className="p-4">
        {header}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {projectSummaries.slice(0, 4).map((summary) => (
            <button key={summary.project._recordId} onClick={() => onSelectTab('board')} className="min-w-0 rounded-2xl border border-white/30 bg-white/24 p-3 text-left backdrop-blur-xl transition hover:bg-white/38">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-zinc-950">{summary.project.name}</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                    {summary.total} tareas {summary.linkedClient ? `- ${summary.linkedClient.name}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-black text-rose-600">{summary.progress}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200/70">
                <div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-pink-500" style={{ width: `${summary.progress}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-zinc-500">
                <span>{summary.done} completadas</span>
                <span className={summary.overdue ? 'text-red-600' : ''}>{summary.overdue} vencidas</span>
              </div>
            </button>
          ))}
          {!projectSummaries.length && <EmptyState>Crea proyectos para ver el resumen.</EmptyState>}
        </div>
      </Panel>
    );
  }

  if (widget.key === 'recentClients') {
    return (
      <Panel className="p-4">
        {header}
        <div className="space-y-2">
          {recentChats.slice(0, 5).map((chat) => {
            const displayName = chat.contact?.name || chat.name || chat.remoteJid.split('@')[0];
            return (
              <div key={chat.id ?? chat.remoteJid} className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/30 bg-white/22 p-3 backdrop-blur-xl">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-sm font-black text-white">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-zinc-950">{displayName}</p>
                  <p className="truncate text-xs font-semibold text-zinc-500">{chat.lastMessageText || 'Sin vista previa'}</p>
                </div>
                <a href={`/dashboard/chat/${encodeURIComponent((chat.remoteJid || '').split('@')[0])}${chat.instanceId ? `?instanceId=${chat.instanceId}` : ''}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white shadow-sm" title="Abrir chat">
                  <MessageCircle className="h-4 w-4" />
                </a>
              </div>
            );
          })}
          {!recentChats.length && <EmptyState>Sin chats recientes para mostrar.</EmptyState>}
        </div>
      </Panel>
    );
  }

  if (widget.key === 'quickAdd') {
    return (
      <Panel className="p-4">
        {header}
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white/24 p-1 backdrop-blur-xl">
            {(['task', 'note', 'agenda'] as const).map((type) => (
              <button key={type} onClick={() => onQuickTypeChange(type)} className={`rounded-xl px-2 py-2 text-xs font-black transition ${quickType === type ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-white/46'}`}>
                {type === 'task' ? 'Tarea' : type === 'note' ? 'Nota' : 'Agenda'}
              </button>
            ))}
          </div>
          <input
            value={quickTitle}
            onChange={(event) => onQuickTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onQuickAdd();
            }}
            placeholder="Escribe y agrega rapido"
            className="w-full rounded-2xl border px-3 py-2.5 text-sm"
          />
          {quickType === 'task' && <input type="date" value={quickDate} onChange={(event) => onQuickDateChange(event.target.value)} className="w-full rounded-2xl border px-3 py-2.5 text-sm" />}
          <button onClick={onQuickAdd} disabled={!quickTitle.trim()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-4 py-3 text-sm font-black text-white shadow-lg disabled:opacity-45">
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </div>
      </Panel>
    );
  }

  if (widget.key === 'week') {
    return (
      <Panel className="p-4">
        {header}
        <div className="grid min-w-0 gap-2 md:grid-cols-7">
          {weekDays.map((day) => {
            const key = dateKey(day);
            const dayTasks = tasks.filter((task) => task.dueDate === key).slice(0, 4);
            const dayNotes = notes.filter((note) => note.updatedAt.slice(0, 10) === key).slice(0, 2);
            const isToday = key === todayKey();
            const isAdding = weekAddDate === key;
            return (
              <div key={key} className={`min-h-[150px] rounded-2xl border p-2.5 backdrop-blur-xl ${isToday ? 'border-rose-200/60 bg-rose-50/42' : 'border-white/30 bg-white/20'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase text-zinc-500">{day.toLocaleDateString('es-ES', { weekday: 'short' })}</p>
                    <p className="text-lg font-black text-zinc-950">{day.getDate()}</p>
                  </div>
                  <button
                    onClick={() => { setWeekAddDate(isAdding ? null : key); setWeekAddTitle(''); }}
                    className={`flex h-7 w-7 items-center justify-center rounded-xl transition ${isAdding ? 'bg-rose-500 text-white' : 'bg-white/55 text-rose-600 hover:bg-rose-100'}`}
                    title="Nueva tarea"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isAdding && (
                  <div className="mb-2 flex gap-1">
                    <input
                      autoFocus
                      value={weekAddTitle}
                      onChange={(e) => setWeekAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && weekAddTitle.trim()) {
                          onAddTask(weekAddTitle.trim(), key);
                          setWeekAddTitle('');
                          setWeekAddDate(null);
                        }
                        if (e.key === 'Escape') { setWeekAddDate(null); setWeekAddTitle(''); }
                      }}
                      placeholder="Tarea..."
                      className="min-w-0 flex-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                    <button
                      onClick={() => {
                        if (weekAddTitle.trim()) { onAddTask(weekAddTitle.trim(), key); setWeekAddTitle(''); setWeekAddDate(null); }
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-500 text-white"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <div className="space-y-1.5">
                  {dayTasks.map((task) => (
                    <button key={task._recordId} onClick={() => onOpenTask(task._recordId)} className="block w-full truncate rounded-lg bg-white/62 px-2 py-1.5 text-left text-[11px] font-bold text-zinc-700">
                      {task.title}
                    </button>
                  ))}
                  {dayNotes.map((note) => (
                    <button key={note._recordId} onClick={() => onSelectTab('notes')} className="block w-full truncate rounded-lg bg-amber-50 px-2 py-1.5 text-left text-[11px] font-bold text-amber-700">
                      {note.title}
                    </button>
                  ))}
                  {!dayTasks.length && !dayNotes.length && !isAdding && <p className="pt-4 text-center text-[11px] font-semibold text-zinc-400">Libre</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    );
  }

  if (widget.key === 'todayTasks') {
    return (
      <Panel className="p-4">
        {header}
        <div className="space-y-2">
          {pendingTasks.slice(0, 5).map((task) => {
            const col = columns.find((c) => c._recordId === task.columnId);
            return (
              <div key={task._recordId} className="flex min-w-0 items-start gap-3 rounded-2xl border border-white/30 bg-white/22 p-3 backdrop-blur-xl">
                <button onClick={() => onToggleTaskDone(task)} className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-500 hover:text-white" title="Completar">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => onOpenTask(task._recordId)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-black text-zinc-950">{task.title}</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">{col?.title ?? 'Sin etapa'} {task.dueDate ? `- ${formatDate(task.dueDate)}` : ''}</p>
                </button>
              </div>
            );
          })}
          {!pendingTasks.length && <EmptyState>No hay tareas vencidas o para hoy.</EmptyState>}
        </div>
      </Panel>
    );
  }

  if (widget.key === 'agenda') {
    return (
      <Panel className="p-4">
        {header}
        <div className="space-y-2">
          {agenda.map((item) => (
            <button key={item._recordId} onClick={() => onToggleAgenda(item._recordId)} className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-white/30 bg-white/22 px-3 py-2.5 text-left backdrop-blur-xl transition hover:bg-white/36">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-white/70 bg-white/40'}`}>{item.done && <Check className="h-3 w-3" />}</span>
              <span className="w-12 text-xs font-black text-rose-600">{item.time}</span>
              <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${item.done ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>{item.task}</span>
            </button>
          ))}
          {!agenda.length && <EmptyState>Agrega actividades en Agenda.</EmptyState>}
        </div>
      </Panel>
    );
  }

  if (widget.key === 'deadlines') {
    return (
      <Panel className="p-4">
        {header}
        <div className="space-y-2 text-sm">
          {[...payments.map((p) => ({ id: p._recordId, title: p.concept, date: p.dueDate, type: 'Pago' })), ...domains.map((d) => ({ id: d._recordId, title: d.domain, date: d.dueDate, type: 'Dominio' }))].slice(0, 5).map((item) => (
            <div key={`${item.type}-${item.id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/30 bg-white/22 px-3 py-2.5 backdrop-blur-xl">
              <span className="min-w-0 truncate font-semibold text-zinc-800">{item.type}: {item.title}</span>
              <span className="shrink-0 text-xs font-black text-zinc-500">{formatDate(item.date)}</span>
            </div>
          ))}
          {!payments.length && !domains.length && <EmptyState>Sin vencimientos en los proximos 7 dias.</EmptyState>}
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="p-4">
      {header}
      <div className="space-y-2">
        {notes.map((note) => (
          <div key={note._recordId} className="rounded-2xl border border-amber-100/60 bg-amber-50/52 px-3 py-2.5 text-sm backdrop-blur-xl">
            <p className="truncate font-black text-zinc-950">{note.title}</p>
            <p className="line-clamp-2 text-zinc-600">{note.body}</p>
          </div>
        ))}
        {!notes.length && <EmptyState>Fija notas importantes para verlas aqui.</EmptyState>}
      </div>
    </Panel>
  );
}

function WidgetResizeHandle({
  onResizeCols,
  onResizeRows,
}: {
  onResizeCols: (delta: number) => void;
  onResizeRows: (delta: number) => void;
}) {
  const startX = useRef(0);
  const startY = useRef(0);
  const currentColDelta = useRef(0);
  const currentRowDelta = useRef(0);

  function handleMouseDown(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    startX.current = e.clientX;
    startY.current = e.clientY;
    currentColDelta.current = 0;
    currentRowDelta.current = 0;

    function handleMouseMove(ev: MouseEvent) {
      const grid = document.querySelector('[data-widget-grid]') as HTMLElement | null;
      const containerWidth = grid?.offsetWidth ?? 900;
      const colWidth = containerWidth / 12;
      const deltaX = ev.clientX - startX.current;
      const deltaY = ev.clientY - startY.current;
      const newColDelta = Math.round(deltaX / colWidth);
      const newRowDelta = Math.round(deltaY / 112);
      if (newColDelta !== currentColDelta.current) {
        onResizeCols(newColDelta - currentColDelta.current);
        currentColDelta.current = newColDelta;
      }
      if (newRowDelta !== currentRowDelta.current) {
        onResizeRows(newRowDelta - currentRowDelta.current);
        currentRowDelta.current = newRowDelta;
      }
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute bottom-2 right-2 z-10 hidden h-7 w-7 cursor-nwse-resize items-center justify-center rounded-lg bg-white/75 opacity-0 shadow-sm backdrop-blur-xl transition group-hover:opacity-100 hover:bg-white md:flex"
      title="Arrastrar para cambiar ancho y alto"
    >
      <GripVertical className="h-3.5 w-3.5 rotate-90 text-zinc-500" />
    </div>
  );
}

function WidgetHeader({
  widget,
  dragHandleProps,
}: {
  widget: DashboardWidget;
  dragHandleProps?: any;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {dragHandleProps && (
        <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-white/30" title="Arrastrar para reordenar">
          <GripVertical className="h-4 w-4 text-zinc-400" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase text-zinc-500">Widget</p>
        <h2 className="truncate text-lg font-black text-zinc-950 sm:text-xl">{widget.title}</h2>
      </div>
    </div>
  );
}

function HomeGlassStat({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/12 px-2 py-3 text-center shadow-sm backdrop-blur-xl sm:rounded-3xl sm:px-3">
      <Icon className="mx-auto h-5 w-5 text-white/88" />
      <p className="mt-2 text-xl font-black leading-none text-white sm:text-2xl">{value}</p>
      <p className="mt-1 truncate text-[10px] font-bold uppercase text-white/64">{label}</p>
    </div>
  );
}

function HomeAppIcon({
  label,
  icon: Icon,
  value,
  cls,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  cls: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="group flex min-w-0 flex-col items-center gap-2 text-center">
      <span className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${cls} text-white shadow-lg shadow-zinc-950/15 transition group-hover:-translate-y-0.5 group-hover:shadow-xl`}>
        <Icon className="h-7 w-7" />
        <span className="absolute -right-1 -top-1 rounded-full border border-white/80 bg-white px-1.5 py-0.5 text-[9px] font-black leading-none text-zinc-800 shadow-sm">
          {value}
        </span>
      </span>
      <span className="w-full truncate px-1 text-[11px] font-black text-zinc-800">{label}</span>
    </button>
  );
}
