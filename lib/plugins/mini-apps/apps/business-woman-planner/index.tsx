'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background as FlowBackground,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge as FlowEdge,
  type EdgeChange,
  type Node as FlowNode,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeftRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  FolderKanban,
  GanttChart,
  GripVertical,
  Handshake,
  Home,
  ImageIcon,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  Link as LinkIcon,
  ListChecks,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Minimize2,
  Moon,
  Menu,
  NotebookText,
  Palette,
  Paperclip,
  Phone,
  Pin,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Star,
  Sun,
  TrendingUp,
  Trash2,
  UploadCloud,
  Users,
  Video,
  X,
} from 'lucide-react';
import { BusinessWomanScopedStyles } from './components/BusinessWomanScopedStyles';
import { TodayView } from './views/TodayView';
import { BoardView } from './views/ProjectsView';
import { ClientsView } from './components/ClientsView';
import { AgendaView } from './views/AgendaView';
import { GrowthView } from './views/GrowthView';
import { ChecklistView } from './views/ChecklistView';
import { CalendarView } from './views/CalendarView';
import { VideosView } from './views/VideosView';
import { SalesView } from './views/SalesView';
import { LinksView } from './views/LinksView';
import { NotesView } from './views/NotesView';
import { WhiteboardView } from './views/WhiteboardView';
import { getSafeAvatarSrc } from '@/lib/avatar-url';
import { Panel, SectionHeader, IconButton, EmptyState } from './components/shared';
import { useBusinessTheme } from './theme/ui/useBusinessTheme';
import { BusinessThemeShell } from './theme/ui/BusinessThemeShell';
// Additional views (Calendar, Notes, Sales, Links, Whiteboard, Videos) remain inline for now or can be extracted in the same pattern for scalability. The key pages (Today, Projects/Board, Clients, Agenda, Growth, Checklist/Home) are now individual components.

const APP_SLUG = 'business-woman-planner';

function nanoid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function normalizeBusinessWomanPhone(value?: string | null) {
  return (value ?? '').replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/[^\d]/g, '');
}

type AgendaItem = { _recordId: string; time: string; task: string; done: boolean };
type ClientItem = { _recordId: string; name: string; status: string; notes: string; contacted: boolean; phone?: string };
type FunnelStage = { id: number; name: string; emoji: string | null };
type CustomField = { id: number; key: string; name: string; type: 'text' | 'boolean'; position: number };
type CRMContact = {
  id: number; name: string; phone: string | null; notes: string | null;
  profilePicUrl?: string | null;
  funnelStage?: { id: number; name: string; emoji?: string | null } | null;
  instanceName?: string | null;
  remoteJid?: string | null;
  instanceId?: number | null;
  assignedUser?: { id: number; name: string; email: string } | null;
  tags?: { id: number; name: string; color: string }[];
  customData?: Record<string, any>;
};
type CustomerInternalNote = {
  id: string;
  text: string | null;
  timestamp: string;
  participantName?: string | null;
};
type CustomerAttachment = {
  id: number;
  url: string;
  fileName: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
};
type CustomerActivity = {
  internalNotes: CustomerInternalNote[];
  attachments: CustomerAttachment[];
  error?: string;
};
type WaContact = { remoteJid: string; name: string; isGroup: boolean; alreadyImported: boolean };
type Instance = { id: number; instanceName: string };
type TeamMember = { id: number; name: string; email: string };
type ClientProduct = {
  _recordId: string;
  clientId: string;
  name: string;
  category: string;
  frequency: string;
  amount: number;
  currency: string;
  status: string;
  startDate: string;
  notes: string;
};
type SaleItem = { _recordId: string; client: string; amount: string; currency: string; status: string; paid: boolean; clientId?: string; date?: string; description?: string; category?: string };
type PaymentItem = { _recordId: string; concept: string; amount: string; currency: string; dueDate: string; paid: boolean };
type DomainItem = { _recordId: string; domain: string; client: string; status: string; dueDate: string; done: boolean };
type LinkItem = { _recordId: string; url: string; title: string; description: string; group: string; clientId: string; createdAt: string };
type LinkGroup = { _recordId: string; name: string; color: string; emoji: string };
type HomeItem = { _recordId: string; task: string; done: boolean };
type GrowthItem = { _recordId: string; goal: string; progress: number; done: boolean };
type PanelCard = { _recordId: string; key: string; title: string; subtitle: string; pill: string };
type Daypart = 'madrugada' | 'amanecer' | 'manana' | 'mediodia' | 'tarde' | 'noche';
type BackgroundMode = 'manual' | 'daypart';
type BackgroundSettings = {
  _recordId: string;
  mode: BackgroundMode;
  selectedBackgroundId: string;
  customUrl: string;
};
type BackgroundPreset = {
  id: string;
  label: string;
  description: string;
  daypart?: Daypart;
  url: string;
  sourceUrl: string;
  position?: string;
};

type TaskTag = { id: string; name: string; color: string };
type ChecklistItem = { id: string; text: string; completed: boolean };
type TaskComment = { id: string; text: string; createdAt: string };
type BusinessProject = {
  _recordId: string;
  name: string;
  backgroundUrl: string;
  tags: TaskTag[];
  order: number;
  workspaceId?: number | null;
  clientId?: string;
  color?: string | null;
  icon?: string | null;
};
type ChecklistTemplate = { _recordId: string; name: string; items: ChecklistItem[] };
type BusinessColumn = {
  _recordId: string;
  projectId: string;
  title: string;
  order: number;
  color?: string | null;
  icon?: string | null;
};
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
  endDate?: string;
  status?: string;
  completedAt?: string | null;
  parentTaskId?: number | null;
  commentCount?: number;
  order: number;
  createdAt: string;
  updatedAt: string;
  clientId?: string;
  color?: string | null;
  icon?: string | null;
  coverUrl?: string | null;
  coverMediaId?: number | null;
};
type CreateTaskOptions = { openTask?: boolean };
type NotebookNote = {
  _recordId: string;
  title: string;
  body: string;
  tag: string;
  color?: string;
  pinned: boolean;
  linkedTaskId: string;
  createdAt: string;
  updatedAt: string;
};
type VideoItem = {
  _recordId: string;
  url: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  authorName: string;
  notes: string;
  tags: string;
  createdAt: string;
};
type DashboardWidgetKey =
  | 'projects'
  | 'recentClients'
  | 'quickAdd'
  | 'week'
  | 'todayTasks'
  | 'agenda'
  | 'deadlines'
  | 'notes';
type DashboardWidgetSize = 'sm' | 'md' | 'lg' | 'xl';
type DashboardWidget = {
  _recordId: string;
  key: DashboardWidgetKey;
  title: string;
  size: DashboardWidgetSize;
  cols: number;
  rows: number;
  visible: boolean;
  order: number;
};
type RecentChat = {
  id: number;
  remoteJid: string;
  name?: string | null;
  lastMessageText?: string | null;
  lastMessageTimestamp?: string | null;
  contact?: { name?: string | null } | null;
  instanceId?: number | null;
};
type WhiteboardCanvas = { _recordId: string; title: string; createdAt: string; updatedAt: string };
type WhiteboardNodeType = 'note' | 'task' | 'link' | 'client' | 'project' | 'canvas' | 'drawing' | 'custom';
type WhiteboardNode = {
  _recordId: string;
  canvasId: string;
  type: WhiteboardNodeType;
  title: string;
  body: string;
  url?: string;
  refId?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: string;
};
type WhiteboardEdge = { _recordId: string; canvasId: string; source: string; target: string; label?: string };
type BusinessWomanSettings = {
  _recordId: string;
  syncTasksEnabled: boolean;
  syncMode: 'bidirectional';
  syncLastRunAt?: string;
  lastProjectId?: string;
  lastWorkspaceId?: number | null;
};
type TaskSyncMappingKind = 'project' | 'column' | 'task';
type TaskSyncMapping = {
  _recordId: string;
  kind: TaskSyncMappingKind;
  businessId: string;
  taskOsId: number;
  updatedAt: string;
};
type TasksPluginLabel = { id: string; name: string; color: string };
type TasksPluginChecklistItem = { id: string; text: string; completed: boolean };
type TasksPluginItem = {
  id: number;
  title: string;
  notes: string;
  labelIds: string[];
  checklist: TasksPluginChecklistItem[];
  dueDate: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string;
  completedAt?: string | null;
  parentTaskId?: number | null;
  columnId: number;
  projectId: number;
  order: number;
  commentCount?: number;
  updatedAt?: string | null;
  color?: string | null;
  icon?: string | null;
  coverMediaId?: number | null;
  coverUrl?: string | null;
};
type TasksPluginColumn = { id: number; title: string; order: number; items: TasksPluginItem[]; updatedAt?: string | null };
type TasksPluginProject = {
  id: number;
  workspaceId?: number | null;
  name: string;
  backgroundUrl: string | null;
  labels: TasksPluginLabel[];
  order: number;
  columns: TasksPluginColumn[];
  updatedAt?: string | null;
};
type TasksWorkspace = { id: number; name: string; order: number; projects: TasksPluginProject[] };

type TasksPluginRelation = {
  id: number;
  sourceType: string;
  sourceId: number;
  targetType: string;
  targetId: number;
  relationType: string;
};
type TasksPluginDependency = {
  id: number;
  taskId: number;
  dependsOnTaskId: number;
};
type TasksPluginLocation = {
  id: number;
  projectId: number;
  columnId: number;
  isPrimary: boolean;
};
type TasksPluginMedia = {
  id: number | string;
  url: string;
  fileName: string;
  mimeType?: string | null;
  size?: number | null;
  inheritedFrom?: string;
};
type TasksPluginDetails = {
  relations: TasksPluginRelation[];
  dependencies: TasksPluginDependency[];
  dependents: TasksPluginDependency[];
  locations: TasksPluginLocation[];
  media: TasksPluginMedia[];
};
type TasksPluginComment = {
  id: number;
  text: string;
  createdAt: string;
};

type Tab =
  | 'today'
  | 'board'
  | 'calendar'
  | 'notes'
  | 'videos'
  | 'agenda'
  | 'clients'
  | 'sales'
  | 'links'
  | 'home'
  | 'growth'
  | 'whiteboard';

const DEFAULT_TAGS: TaskTag[] = [
  { id: 'tag-pending', name: 'Pendiente', color: '#3b82f6' },
  { id: 'tag-priority', name: 'Importante', color: '#ef4444' },
  { id: 'tag-client', name: 'Cliente', color: '#f59e0b' },
  { id: 'tag-personal', name: 'Personal', color: '#10b981' },
];

const DEFAULT_AGENDA: Omit<AgendaItem, '_recordId'>[] = [
  { time: '06:00', task: 'Meditacion y gratitud', done: false },
  { time: '07:00', task: 'Ejercicio o caminata', done: false },
  { time: '08:00', task: 'Revision de mensajes y correos', done: false },
  { time: '09:00', task: 'Bloques de trabajo profundo', done: false },
  { time: '10:30', task: 'Llamada con cliente VIP', done: false },
  { time: '11:00', task: 'Seguimiento a clientes', done: false },
  { time: '14:00', task: 'Reuniones o llamadas', done: false },
  { time: '18:00', task: 'Revision del dia y planificacion', done: false },
];

const DEFAULT_CLIENTS: Omit<ClientItem, '_recordId'>[] = [
  { name: 'Maria Gonzalez', status: 'activo', notes: 'Interesada en plan premium', contacted: false },
  { name: 'Carlos Ruiz', status: 'potencial', notes: 'Llamar esta semana', contacted: false },
  { name: 'Ana Martinez', status: 'seguimiento', notes: 'Enviar propuesta actualizada', contacted: false },
  { name: 'Luis Perez', status: 'cerrado', notes: 'Cliente fidelizado, renueva julio', contacted: false },
];

const DEFAULT_SALES: Omit<SaleItem, '_recordId'>[] = [
  { client: 'Maria Gonzalez', amount: '350', currency: 'USD', status: 'en_proceso', paid: false, date: todayKey(), description: 'Servicio de diseño web', category: 'Servicios' },
  { client: 'Ana Martinez', amount: '180', currency: 'USD', status: 'pendiente', paid: false, date: todayKey(), description: 'Consultoría mensual', category: 'Consultoría' },
  { client: 'Luis Perez', amount: '500', currency: 'USD', status: 'cobrado', paid: true, date: todayKey(), description: 'Mantenimiento plan premium', category: 'Servicios' },
];

const DEFAULT_PAYMENTS: Omit<PaymentItem, '_recordId'>[] = [
  { concept: 'Hosting servidor VPS', amount: '45', currency: 'USD', dueDate: '', paid: false },
  { concept: 'Renovacion dominio cliente', amount: '15', currency: 'USD', dueDate: '', paid: false },
  { concept: 'Suscripcion herramientas diseno', amount: '29', currency: 'USD', dueDate: '', paid: false },
];

const DEFAULT_DOMAINS: Omit<DomainItem, '_recordId'>[] = [
  { domain: 'miempresa.com', client: 'Propio', status: 'activo', dueDate: '', done: false },
  { domain: 'clienteuno.net', client: 'Maria Gonzalez', status: 'por_renovar', dueDate: '', done: false },
  { domain: 'tienda-online.com', client: 'Carlos Ruiz', status: 'pendiente', dueDate: '', done: false },
];

const DEFAULT_HOME: Omit<HomeItem, '_recordId'>[] = [
  { task: 'Organizar oficina en casa', done: false },
  { task: 'Pagar servicios del mes', done: false },
  { task: 'Planificar menu semanal', done: false },
  { task: 'Revisar presupuesto familiar', done: false },
];

const DEFAULT_GROWTH: Omit<GrowthItem, '_recordId'>[] = [
  { goal: 'Terminar curso de marketing digital', progress: 60, done: false },
  { goal: 'Leer 2 libros de negocios este mes', progress: 50, done: false },
  { goal: 'Alcanzar 1000 seguidores en Instagram', progress: 75, done: false },
  { goal: 'Certificacion en gestion de proyectos', progress: 20, done: false },
];

const DEFAULT_LINK_GROUPS: LinkGroup[] = [
  { _recordId: 'lg-tools', name: 'Herramientas', color: '#6366f1', emoji: '🛠️' },
  { _recordId: 'lg-clients', name: 'Clientes', color: '#ec4899', emoji: '👥' },
  { _recordId: 'lg-resources', name: 'Recursos', color: '#f59e0b', emoji: '📚' },
];

const DEFAULT_PANEL: Omit<PanelCard, '_recordId'>[] = [
  { key: 'ejecutivo', title: 'Bloque Ejecutivo', subtitle: 'Mis prioridades de negocios', pill: 'Negocios' },
  { key: 'familiar', title: 'Bloque Familiar', subtitle: 'Tiempo y hogar en equilibrio', pill: 'Familia' },
  { key: 'crecimiento', title: 'Bloque Crecimiento', subtitle: 'Mi evolucion personal', pill: 'Yo' },
];

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

function makeDefaultCanvas(): WhiteboardCanvas {
  const now = new Date().toISOString();
  return { _recordId: 'canvas-main', title: 'Pizarra principal', createdAt: now, updatedAt: now };
}

const PEXELS_IMAGE_PARAMS = '?auto=compress&cs=tinysrgb&w=1920';

const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'dawn-focus',
    label: 'Amanecer',
    description: 'Luz suave para iniciar con claridad.',
    daypart: 'amanecer',
    url: `https://images.pexels.com/photos/1323550/pexels-photo-1323550.jpeg${PEXELS_IMAGE_PARAMS}`,
    sourceUrl: 'https://www.pexels.com/photo/1323550/',
    position: 'center',
  },
  {
    id: 'morning-office',
    label: 'Manana',
    description: 'Espacio profesional y energia limpia.',
    daypart: 'manana',
    url: `https://images.pexels.com/photos/3769021/pexels-photo-3769021.jpeg${PEXELS_IMAGE_PARAMS}`,
    sourceUrl: 'https://www.pexels.com/photo/3769021/',
    position: 'center',
  },
  {
    id: 'midday-strategy',
    label: 'Mediodia',
    description: 'Paisaje luminoso para la energia del mediodia.',
    daypart: 'mediodia',
    url: `https://images.pexels.com/photos/417173/pexels-photo-417173.jpeg${PEXELS_IMAGE_PARAMS}`,
    sourceUrl: 'https://www.pexels.com/photo/417173/',
    position: 'center',
  },
  {
    id: 'afternoon-calm',
    label: 'Tarde',
    description: 'Calma visual para cerrar tareas.',
    daypart: 'tarde',
    url: `https://images.pexels.com/photos/461940/pexels-photo-461940.jpeg${PEXELS_IMAGE_PARAMS}`,
    sourceUrl: 'https://www.pexels.com/photo/461940/',
    position: 'center',
  },
  {
    id: 'night-city',
    label: 'Noche',
    description: 'Foco nocturno con ambiente urbano.',
    daypart: 'noche',
    url: `https://images.pexels.com/photos/355465/pexels-photo-355465.jpeg${PEXELS_IMAGE_PARAMS}`,
    sourceUrl: 'https://www.pexels.com/photo/355465/',
    position: 'center',
  },
  {
    id: 'late-night-stars',
    label: 'Madrugada',
    description: 'Cielo profundo para trabajo silencioso.',
    daypart: 'madrugada',
    url: `https://images.pexels.com/photos/572897/pexels-photo-572897.jpeg${PEXELS_IMAGE_PARAMS}`,
    sourceUrl: 'https://www.pexels.com/photo/572897/',
    position: 'center',
  },
  {
    id: 'vision-mountains',
    label: 'Vision',
    description: 'Paisaje amplio para planificar metas.',
    url: `https://images.pexels.com/photos/414171/pexels-photo-414171.jpeg${PEXELS_IMAGE_PARAMS}`,
    sourceUrl: 'https://www.pexels.com/photo/414171/',
    position: 'center',
  },
  {
    id: 'creative-desk',
    label: 'Creativa',
    description: 'Mesa de trabajo para ideas y contenido.',
    url: `https://images.pexels.com/photos/3171837/pexels-photo-3171837.jpeg${PEXELS_IMAGE_PARAMS}`,
    sourceUrl: 'https://www.pexels.com/photo/3171837/',
    position: 'center',
  },
];

const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  _recordId: 'background-settings',
  mode: 'manual',
  selectedBackgroundId: 'dawn-focus',
  customUrl: '',
};

const DEFAULT_BUSINESS_WOMAN_SETTINGS: BusinessWomanSettings = {
  _recordId: 'business-woman-settings',
  syncTasksEnabled: true,
  syncMode: 'bidirectional',
  lastProjectId: '',
  lastWorkspaceId: null,
};

const DAYPART_LABELS: Record<Daypart, string> = {
  madrugada: 'Madrugada',
  amanecer: 'Amanecer',
  manana: 'Manana',
  mediodia: 'Mediodia',
  tarde: 'Tarde',
  noche: 'Noche',
};

const STATUS_CLS: Record<string, string> = {
  potencial: 'bg-blue-50 text-blue-700 border-blue-200',
  activo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  seguimiento: 'bg-amber-50 text-amber-700 border-amber-200',
  cerrado: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
  en_proceso: 'bg-blue-50 text-blue-700 border-blue-200',
  cobrado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  por_renovar: 'bg-orange-50 text-orange-700 border-orange-200',
  vencido: 'bg-red-50 text-red-700 border-red-200',
};

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; emoji: string }[] = [
  { id: 'today',    label: 'Inicio',      icon: Home,          emoji: '🏠' },
  { id: 'clients',  label: 'Clientes',    icon: Users,         emoji: '👥' },
  { id: 'sales',    label: 'Ventas',      icon: TrendingUp,    emoji: '💰' },
  { id: 'links',    label: 'Links',       icon: LinkIcon,      emoji: '🔗' },
  { id: 'board',    label: 'Proyectos',   icon: FolderKanban,  emoji: '📋' },
  { id: 'whiteboard', label: 'Pizarra',    icon: LayoutGrid,    emoji: '⬚' },
  { id: 'calendar', label: 'Calendario',  icon: CalendarDays,  emoji: '📅' },
  { id: 'notes',    label: 'Notas',       icon: NotebookText,  emoji: '📝' },
  { id: 'agenda',   label: 'Agenda',      icon: ClipboardList, emoji: '⏰' },
  { id: 'videos',   label: 'Videos',      icon: Video,         emoji: '🎬' },
  { id: 'home',     label: 'Casa',        icon: ListChecks,    emoji: '🏡' },
  { id: 'growth',   label: 'Crecimiento', icon: LayoutDashboard, emoji: '🌱' },
];

const PRIMARY_MOBILE_TABS: Tab[] = ['today', 'clients', 'board', 'whiteboard'];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));
function isValidTab(value: string | undefined | null): value is Tab {
  return Boolean(value) && VALID_TABS.has(value as string);
}

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
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string) {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isOverdue(value: string) {
  const date = parseDate(value);
  return Boolean(date && dateKey(date) < todayKey());
}

function isNextSevenDays(value: string) {
  const date = parseDate(value);
  if (!date) return false;
  const now = parseDate(todayKey())!;
  const limit = new Date(now);
  limit.setDate(limit.getDate() + 7);
  return date >= now && date <= limit;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord<T extends Record<string, unknown>>(value: unknown): Partial<T> {
  return value && typeof value === 'object' ? (value as Partial<T>) : {};
}

function normalizeDashboardWidget(value: unknown, index: number): DashboardWidget {
  const widget = asRecord<DashboardWidget>(value);
  const fallback = DEFAULT_DASHBOARD_WIDGETS[index] ?? DEFAULT_DASHBOARD_WIDGETS[0];
  const validKeys = new Set(DEFAULT_DASHBOARD_WIDGETS.map((item) => item.key));
  const validSizes: DashboardWidgetSize[] = ['sm', 'md', 'lg', 'xl'];
  const key = validKeys.has(widget.key as DashboardWidgetKey) ? (widget.key as DashboardWidgetKey) : fallback.key;
  const sizeToColsDefault: Record<DashboardWidgetSize, number> = { sm: 3, md: 4, lg: 6, xl: 12 };
  const sizeToRowsDefault: Record<DashboardWidgetSize, number> = { sm: 2, md: 2, lg: 2, xl: 3 };
  const size = validSizes.includes(widget.size as DashboardWidgetSize) ? (widget.size as DashboardWidgetSize) : fallback.size;
  const rawCols = asNumber((widget as any).cols, sizeToColsDefault[size]);
  const rawRows = asNumber((widget as any).rows, sizeToRowsDefault[size]);
  return {
    _recordId: asString(widget._recordId, nanoid()),
    key,
    title: asString(widget.title, DEFAULT_DASHBOARD_WIDGETS.find((item) => item.key === key)?.title ?? fallback.title),
    size,
    cols: Math.max(1, Math.min(12, rawCols)),
    rows: Math.max(1, Math.min(8, rawRows)),
    visible: asBoolean(widget.visible, true),
    order: asNumber(widget.order, index),
  };
}

function normalizeCanvas(value: unknown, index: number): WhiteboardCanvas {
  const canvas = asRecord<WhiteboardCanvas>(value);
  const now = new Date().toISOString();
  return {
    _recordId: asString(canvas._recordId, index === 0 ? 'canvas-main' : nanoid()),
    title: asString(canvas.title, index === 0 ? 'Pizarra principal' : `Lienzo ${index + 1}`),
    createdAt: asString(canvas.createdAt, now),
    updatedAt: asString(canvas.updatedAt, now),
  };
}

function normalizeCanvasNode(value: unknown): WhiteboardNode {
  const node = asRecord<WhiteboardNode>(value);
  const validTypes: WhiteboardNodeType[] = ['note', 'task', 'link', 'client', 'project', 'canvas', 'drawing', 'custom'];
  return {
    _recordId: asString(node._recordId, nanoid()),
    canvasId: asString(node.canvasId, 'canvas-main'),
    type: validTypes.includes(node.type as WhiteboardNodeType) ? (node.type as WhiteboardNodeType) : 'note',
    title: asString(node.title, 'Nuevo nodo'),
    body: asString(node.body),
    url: asString(node.url),
    refId: asString(node.refId),
    x: asNumber(node.x, 120),
    y: asNumber(node.y, 120),
    width: asNumber(node.width, 220),
    height: asNumber(node.height, 120),
    color: asString(node.color, '#f43f5e'),
  };
}

function normalizeCanvasEdge(value: unknown): WhiteboardEdge {
  const edge = asRecord<WhiteboardEdge>(value);
  return {
    _recordId: asString(edge._recordId, nanoid()),
    canvasId: asString(edge.canvasId, 'canvas-main'),
    source: asString(edge.source),
    target: asString(edge.target),
    label: asString(edge.label),
  };
}

function normalizeTag(value: unknown, index: number): TaskTag {
  const tag = asRecord<TaskTag>(value);
  return {
    id: asString(tag.id, `tag-${index}-${nanoid()}`),
    name: asString(tag.name, 'Etiqueta'),
    color: asString(tag.color, DEFAULT_TAGS[index % DEFAULT_TAGS.length]?.color ?? '#3b82f6'),
  };
}

function normalizeProject(value: unknown, index: number): BusinessProject {
  const project = asRecord<BusinessProject>(value);
  const rawTags = asArray<unknown>(project.tags);
  return {
    _recordId: asString(project._recordId, `project-${index}-${nanoid()}`),
    name: asString(project.name, `Proyecto ${index + 1}`),
    backgroundUrl: asString(project.backgroundUrl),
    tags: rawTags.length
      ? rawTags.map(normalizeTag)
      : DEFAULT_TAGS.map((tag) => ({ ...tag, id: `${tag.id}-${project._recordId || index}` })),
    order: asNumber(project.order, index),
    ...(project.workspaceId !== undefined ? { workspaceId: project.workspaceId as number | null } : {}),
    ...(project.clientId ? { clientId: project.clientId as string } : {}),
  };
}

function normalizeColumn(value: unknown, index: number, fallbackProjectId: string): BusinessColumn {
  const column = asRecord<BusinessColumn>(value);
  return {
    _recordId: asString(column._recordId, `column-${index}-${nanoid()}`),
    projectId: asString(column.projectId, fallbackProjectId),
    title: asString(column.title, 'Etapa'),
    order: asNumber(column.order, index),
  };
}

function normalizeChecklistItem(value: unknown, index: number): ChecklistItem {
  const item = asRecord<ChecklistItem>(value);
  return {
    id: asString(item.id, `check-${index}-${nanoid()}`),
    text: asString(item.text, 'Paso'),
    completed: asBoolean(item.completed),
  };
}

function normalizeComment(value: unknown, index: number): TaskComment {
  const comment = asRecord<TaskComment>(value);
  return {
    id: asString(comment.id, `comment-${index}-${nanoid()}`),
    text: asString(comment.text),
    createdAt: asString(comment.createdAt, new Date().toISOString()),
  };
}

function normalizeTask(value: unknown, index: number, fallbackProjectId: string, fallbackColumnId: string): BusinessTask {
  const task = asRecord<BusinessTask>(value);
  const now = new Date().toISOString();
  return {
    _recordId: asString(task._recordId, `task-${index}-${nanoid()}`),
    projectId: asString(task.projectId, fallbackProjectId),
    columnId: asString(task.columnId, fallbackColumnId),
    title: asString(task.title, 'Tarea sin titulo'),
    notes: asString(task.notes),
    tagIds: asArray<unknown>(task.tagIds).filter((id): id is string => typeof id === 'string'),
    checklist: asArray<unknown>(task.checklist).map(normalizeChecklistItem),
    comments: asArray<unknown>(task.comments).map(normalizeComment),
    dueDate: asString(task.dueDate),
    startDate: asString(task.startDate),
    endDate: asString(task.endDate),
    status: asString(task.status, 'open'),
    completedAt: task.completedAt === undefined ? null : asString(task.completedAt),
    parentTaskId: task.parentTaskId === undefined || task.parentTaskId === null ? null : asNumber(task.parentTaskId),
    commentCount: asNumber(task.commentCount),
    order: asNumber(task.order, index),
    createdAt: asString(task.createdAt, now),
    updatedAt: asString(task.updatedAt, now),
    ...(task.clientId ? { clientId: task.clientId as string } : {}),
    ...(task.color !== undefined ? { color: task.color ?? null } : {}),
    ...(task.icon !== undefined ? { icon: task.icon ?? null } : {}),
    ...(task.coverUrl !== undefined ? { coverUrl: task.coverUrl ?? null } : {}),
    ...(task.coverMediaId !== undefined ? { coverMediaId: task.coverMediaId ?? null } : {}),
  };
}

function normalizeNote(value: unknown, index: number): NotebookNote {
  const note = asRecord<NotebookNote>(value);
  const now = new Date().toISOString();
  return {
    _recordId: asString(note._recordId, `note-${index}-${nanoid()}`),
    title: asString(note.title, 'Nota sin titulo'),
    body: asString(note.body),
    tag: asString(note.tag, 'General'),
    color: asString(note.color),
    pinned: asBoolean(note.pinned),
    linkedTaskId: asString(note.linkedTaskId),
    createdAt: asString(note.createdAt, now),
    updatedAt: asString(note.updatedAt, now),
  };
}

function normalizeVideo(value: unknown, index: number): VideoItem {
  const video = asRecord<VideoItem>(value);
  return {
    _recordId: asString(video._recordId, `video-${index}-${nanoid()}`),
    url: asString(video.url),
    videoId: asString(video.videoId),
    title: asString(video.title, 'Video de YouTube'),
    thumbnailUrl: asString(video.thumbnailUrl),
    authorName: asString(video.authorName),
    notes: asString(video.notes),
    tags: asString(video.tags),
    createdAt: asString(video.createdAt, new Date().toISOString()),
  };
}

function normalizeBackgroundSettings(value: unknown): BackgroundSettings {
  const settings = asRecord<BackgroundSettings>(value);
  const mode = settings.mode === 'daypart' ? 'daypart' : 'manual';
  const requestedBackgroundId = asString(settings.selectedBackgroundId, DEFAULT_BACKGROUND_SETTINGS.selectedBackgroundId);
  const selected = requestedBackgroundId === 'custom' || BACKGROUND_PRESETS.some((preset) => preset.id === requestedBackgroundId)
    ? requestedBackgroundId
    : DEFAULT_BACKGROUND_SETTINGS.selectedBackgroundId;

  return {
    _recordId: asString(settings._recordId, DEFAULT_BACKGROUND_SETTINGS._recordId),
    mode,
    selectedBackgroundId: selected,
    customUrl: asString(settings.customUrl),
  };
}

function normalizeBusinessWomanSettings(value: unknown): BusinessWomanSettings {
  const settings = asRecord<BusinessWomanSettings>(value);
  return {
    _recordId: asString(settings._recordId, DEFAULT_BUSINESS_WOMAN_SETTINGS._recordId),
    syncTasksEnabled: true,
    syncMode: 'bidirectional',
    ...(settings.syncLastRunAt ? { syncLastRunAt: asString(settings.syncLastRunAt) } : {}),
    lastProjectId: asString(settings.lastProjectId),
    lastWorkspaceId: settings.lastWorkspaceId === undefined || settings.lastWorkspaceId === null ? null : asNumber(settings.lastWorkspaceId),
  };
}

function normalizeTaskSyncMapping(value: unknown): TaskSyncMapping {
  const mapping = asRecord<TaskSyncMapping>(value);
  const kind: TaskSyncMappingKind =
    mapping.kind === 'project' || mapping.kind === 'column' || mapping.kind === 'task' ? mapping.kind : 'task';
  return {
    _recordId: asString(mapping._recordId, `task-sync-${kind}-${nanoid()}`),
    kind,
    businessId: asString(mapping.businessId),
    taskOsId: asNumber(mapping.taskOsId),
    updatedAt: asString(mapping.updatedAt, new Date().toISOString()),
  };
}

function parseRemoteDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shouldRemoteWin(localUpdatedAt?: string, remoteUpdatedAt?: string | null) {
  const remote = parseRemoteDate(remoteUpdatedAt);
  const local = parseRemoteDate(localUpdatedAt);
  if (!remote) return false;
  if (!local) return true;
  return remote.getTime() > local.getTime();
}

function normalizeTasksPluginProjects(value: unknown): TasksPluginProject[] {
  const rawInput = asArray<unknown>(value);
  const rawProjects = rawInput.some((item) => Array.isArray(asRecord<{ projects?: unknown[] }>(item).projects))
    ? rawInput.flatMap((workspace) => {
        const workspaceRecord = asRecord<{ id?: number; projects?: unknown[] }>(workspace);
        return asArray<unknown>(workspaceRecord.projects).map((project) => ({
          ...asRecord<Record<string, unknown>>(project),
          workspaceId: asNumber(workspaceRecord.id),
        }));
      })
    : rawInput;
  return rawProjects.map((projectValue, projectIndex) => {
    const project = asRecord<TasksPluginProject>(projectValue);
    const projectId = asNumber(project.id);
    const labels = asArray<unknown>(project.labels).map((labelValue, labelIndex) => {
      const label = asRecord<TasksPluginLabel>(labelValue);
      return {
        id: asString(label.id, `label-${projectId}-${labelIndex}`),
        name: asString(label.name, 'Etiqueta'),
        color: asString(label.color, DEFAULT_TAGS[labelIndex % DEFAULT_TAGS.length]?.color ?? '#ec4899'),
      };
    });
    return {
      id: projectId,
      workspaceId: project.workspaceId === undefined || project.workspaceId === null ? null : asNumber(project.workspaceId),
      name: asString(project.name, `Proyecto ${projectIndex + 1}`),
      backgroundUrl: project.backgroundUrl ? asString(project.backgroundUrl) : null,
      labels,
      order: asNumber(project.order, projectIndex),
      updatedAt: project.updatedAt ? asString(project.updatedAt) : null,
      columns: asArray<unknown>(project.columns).map((columnValue, columnIndex) => {
        const column = asRecord<TasksPluginColumn>(columnValue);
        const columnId = asNumber(column.id);
        return {
          id: columnId,
          title: asString(column.title, `Etapa ${columnIndex + 1}`),
          order: asNumber(column.order, columnIndex),
          updatedAt: column.updatedAt ? asString(column.updatedAt) : null,
          items: asArray<unknown>(column.items).map((itemValue, itemIndex) => {
            const item = asRecord<TasksPluginItem>(itemValue);
            return {
              id: asNumber(item.id),
              title: asString(item.title, `Tarea ${itemIndex + 1}`),
              notes: asString(item.notes),
              labelIds: asArray<unknown>(item.labelIds).filter((id): id is string => typeof id === 'string'),
              checklist: asArray<unknown>(item.checklist).map(normalizeChecklistItem),
              dueDate: item.dueDate ? asString(item.dueDate) : null,
              startDate: item.startDate ? asString(item.startDate) : null,
              endDate: item.endDate ? asString(item.endDate) : null,
              status: asString(item.status, 'open'),
              completedAt: item.completedAt ? asString(item.completedAt) : null,
              parentTaskId: item.parentTaskId === undefined || item.parentTaskId === null ? null : asNumber(item.parentTaskId),
              columnId,
              projectId,
              order: asNumber(item.order, itemIndex),
              commentCount: asNumber(item.commentCount),
              updatedAt: item.updatedAt ? asString(item.updatedAt) : null,
              color: item.color ?? null,
              icon: item.icon ?? null,
              coverMediaId: item.coverMediaId ?? null,
              coverUrl: item.coverUrl ?? null,
            };
          }),
        };
      }),
    };
  }).filter((project) => project.id > 0);
}

function taskOsDateToBusiness(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return dateKey(date);
}

const TASK_OS_PROJECT_PREFIX = 'tasks-os-project-';
const TASK_OS_COLUMN_PREFIX = 'tasks-os-column-';
const TASK_OS_TASK_PREFIX = 'tasks-os-task-';

function taskOsBusinessId(prefix: string, id: number) {
  return `${prefix}${id}`;
}

function taskOsIdFromBusinessId(value: string, prefix: string) {
  if (!value.startsWith(prefix)) return null;
  const id = Number(value.slice(prefix.length));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function businessDateToTaskOs(value?: string | null) {
  return value ? value : null;
}

function taskPatchToRemote(task: TasksPluginItem, patch: Partial<BusinessTask>, remoteColumnId?: number): TasksPluginItem {
  return {
    ...task,
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(patch.tagIds !== undefined && { labelIds: patch.tagIds }),
    ...(patch.checklist !== undefined && { checklist: patch.checklist }),
    ...(patch.dueDate !== undefined && { dueDate: businessDateToTaskOs(patch.dueDate) }),
    ...(patch.startDate !== undefined && { startDate: businessDateToTaskOs(patch.startDate) }),
    ...(patch.endDate !== undefined && { endDate: businessDateToTaskOs(patch.endDate) }),
    ...(patch.status !== undefined && { status: patch.status, completedAt: patch.status === 'done' ? new Date().toISOString() : null }),
    ...(patch.parentTaskId !== undefined && { parentTaskId: patch.parentTaskId }),
    ...(patch.color !== undefined && { color: patch.color ?? null }),
    ...(patch.icon !== undefined && { icon: patch.icon ?? null }),
    ...(patch.coverMediaId !== undefined && { coverMediaId: patch.coverMediaId ?? null }),
    ...(patch.order !== undefined && { order: patch.order }),
    ...(remoteColumnId !== undefined && { columnId: remoteColumnId }),
    updatedAt: new Date().toISOString(),
  };
}

function tasksOsProjectToBusiness(project: TasksPluginProject): BusinessProject {
  return {
    _recordId: taskOsBusinessId(TASK_OS_PROJECT_PREFIX, project.id),
    name: project.name,
    backgroundUrl: project.backgroundUrl ?? '',
    tags: project.labels.length
      ? project.labels
      : DEFAULT_TAGS.map((tag) => ({ ...tag, id: `${tag.id}-${project.id}` })),
    order: project.order,
    workspaceId: project.workspaceId ?? null,
    color: (project as any).color ?? null,
    icon: (project as any).icon ?? null,
  };
}

function tasksOsColumnToBusiness(column: TasksPluginColumn, projectId: number): BusinessColumn {
  return {
    _recordId: taskOsBusinessId(TASK_OS_COLUMN_PREFIX, column.id),
    projectId: taskOsBusinessId(TASK_OS_PROJECT_PREFIX, projectId),
    title: column.title,
    order: column.order,
    color: (column as any).color ?? null,
    icon: (column as any).icon ?? null,
  };
}

function tasksOsTaskToBusiness(task: TasksPluginItem): BusinessTask {
  return {
    _recordId: taskOsBusinessId(TASK_OS_TASK_PREFIX, task.id),
    projectId: taskOsBusinessId(TASK_OS_PROJECT_PREFIX, task.projectId),
    columnId: taskOsBusinessId(TASK_OS_COLUMN_PREFIX, task.columnId),
    title: task.title,
    notes: task.notes,
    tagIds: task.labelIds,
    checklist: task.checklist.map(normalizeChecklistItem),
    comments: [],
    dueDate: taskOsDateToBusiness(task.dueDate),
    startDate: taskOsDateToBusiness(task.startDate ?? null),
    endDate: taskOsDateToBusiness(task.endDate ?? null),
    status: task.status ?? 'open',
    completedAt: task.completedAt ?? null,
    parentTaskId: task.parentTaskId ?? null,
    commentCount: task.commentCount ?? 0,
    order: task.order,
    createdAt: task.updatedAt ?? new Date().toISOString(),
    updatedAt: task.updatedAt ?? new Date().toISOString(),
    color: task.color ?? null,
    icon: task.icon ?? null,
    coverMediaId: task.coverMediaId ?? null,
    coverUrl: task.coverUrl ?? null,
  };
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function getCurrentDaypart(date = new Date()): Daypart {
  const hour = date.getHours();
  if (hour < 5) return 'madrugada';
  if (hour < 7) return 'amanecer';
  if (hour < 11) return 'manana';
  if (hour < 14) return 'mediodia';
  if (hour < 19) return 'tarde';
  return 'noche';
}

function getActiveBackground(settings: BackgroundSettings, daypart: Daypart): BackgroundPreset {
  if (settings.mode === 'daypart') {
    return BACKGROUND_PRESETS.find((preset) => preset.daypart === daypart) ?? BACKGROUND_PRESETS[0];
  }

  if (settings.selectedBackgroundId === 'custom' && settings.customUrl.trim()) {
    return {
      id: 'custom',
      label: 'Personalizado',
      description: 'URL elegida por ti.',
      url: settings.customUrl.trim(),
      sourceUrl: settings.customUrl.trim(),
      position: 'center',
    };
  }

  return BACKGROUND_PRESETS.find((preset) => preset.id === settings.selectedBackgroundId) ?? BACKGROUND_PRESETS[0];
}

function useMiniAppData(slug: string) {
  const [data, setData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadSucceeded, setLoadSucceeded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [savingError, setSavingError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const saveQueues = useRef<Map<string, Promise<void>>>(new Map());

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setLoadSucceeded(false);
    setLoadError('');
    fetch(`/api/mini-apps/${slug}/data`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`Error loading mini-app data (${r.status})`);
        return r.json();
      })
      .then((raw: Record<string, any[]>) => {
        if (!mounted) return;
        const norm: Record<string, any[]> = {};
        for (const [col, recs] of Object.entries(raw)) {
          norm[col] = recs.map((r: any) => ({ ...r.data, _recordId: r.recordId }));
        }
        setData(norm);
        setLoadSucceeded(true);
      })
      .catch(() => {
        if (mounted) setLoadError('No se pudieron cargar los datos guardados. No se realizó ningún cambio.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [reloadToken, slug]);

  const saveCollection = useCallback(
    (collection: string, items: any[]) => {
      if (!loadSucceeded) {
        setSavingError('No se guardó el cambio porque los datos originales todavía no se cargaron.');
        return Promise.resolve();
      }
      const previousSave = saveQueues.current.get(collection) ?? Promise.resolve();
      const nextSave = previousSave.catch(() => undefined).then(async () => {
        const response = await fetch(`/api/mini-apps/${slug}/data/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection,
            records: items.map((i) => ({ recordId: i._recordId || nanoid(), data: i })),
          }),
        });
        if (!response.ok) throw new Error(`Save failed (${response.status})`);
        setSavingError('');
      }).catch(() => {
        setSavingError('No se pudo guardar el ultimo cambio. Revisa la conexion e intenta de nuevo.');
      });

      saveQueues.current.set(collection, nextSave);
      void nextSave.finally(() => {
        if (saveQueues.current.get(collection) === nextSave) saveQueues.current.delete(collection);
      });
      return nextSave;
    },
    [loadSucceeded, slug],
  );

  const retryLoad = useCallback(() => setReloadToken((value) => value + 1), []);

  return { data, loading, loadSucceeded, loadError, retryLoad, savingError, saveCollection, setData };
}

export function BusinessWomanPlanner({ initialView }: { initialView?: string } = {}) {
  const { data, loading, loadSucceeded, loadError, retryLoad, savingError, saveCollection, setData } = useMiniAppData(APP_SLUG);
  // Tema custom: ver la rama de render al final del componente (justo antes
  // del `return` de la UI clásica). El hook se llama acá, incondicional,
  // porque más abajo hay `return` tempranos (loading/error) y las reglas de
  // hooks exigen que TODOS se ejecuten siempre en el mismo orden.
  const { mode: businessThemeMode, definition: businessThemeDefinition, switchMode: switchBusinessThemeMode } = useBusinessTheme(APP_SLUG);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const targetClientPhone = searchParams.get('clientPhone') || '';
  const seeded = useRef(false);
  const dragTaskId = useRef<string | null>(null);
  const appRef = useRef<HTMLDivElement>(null);
  const restoredLastProject = useRef(false);

  // URL como fuente de verdad del tab activo: cada vista tiene su propia ruta
  // .../mini-apps/business-woman-planner/<vista>. Así los botones hacen navegación
  // real (cambia la URL, recargable, compartible, atrás/adelante del navegador).
  const basePath = useMemo(() => {
    const marker = '/business-woman-planner';
    const idx = pathname.indexOf(marker);
    return idx === -1 ? pathname : pathname.slice(0, idx + marker.length);
  }, [pathname]);
  const urlView = useMemo(() => {
    const rest = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : '';
    return rest.replace(/^\/+/, '').split('/')[0] || '';
  }, [pathname, basePath]);
  const activeTab: Tab = isValidTab(urlView)
    ? urlView
    : isValidTab(initialView)
      ? initialView
      : 'today';
  const setActiveTab = useCallback(
    (tab: Tab) => {
      router.push(`${basePath}/${tab}`);
    },
    [basePath, router],
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [clientsPreferredMode, setClientsPreferredMode] = useState<'local' | 'crm'>('local');
  const [tasksPluginAvailable, setTasksPluginAvailable] = useState(false);
  const [tasksWorkspaces, setTasksWorkspaces] = useState<TasksWorkspace[]>([]);
  const [selectedTaskWorkspaceId, setSelectedTaskWorkspaceId] = useState<number | null>(null);
  const [syncingTasks, setSyncingTasks] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => {
    if (!targetClientPhone) return;
    setActiveTab('clients');
    setClientsPreferredMode('local');
  }, [targetClientPhone]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  function toggleFullscreen() {
    if (!isFullscreen) {
      appRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(todayKey());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [noteSearch, setNoteSearch] = useState('');
  const [videoSearch, setVideoSearch] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [currentDaypart, setCurrentDaypart] = useState<Daypart>(() => getCurrentDaypart());
  const [recentChats, setRecentChats] = useState<RecentChat[]>([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState('canvas-main');

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDaypart(getCurrentDaypart()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch('/api/chats', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []))
      .then((items: RecentChat[]) => {
        if (mounted) setRecentChats(Array.isArray(items) ? items.slice(0, 8) : []);
      })
      .catch(() => {
        if (mounted) setRecentChats([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch('/api/plugins/tasks/workspaces', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Tasks OS respondio ${response.status}`);
        return response.json();
      })
      .then((value) => {
        if (!mounted) return;
        const nextWorkspaces = asArray<unknown>(value)
          .map((item) => {
            const workspace = asRecord<TasksWorkspace>(item);
            return {
              id: asNumber(workspace.id),
              name: asString(workspace.name, 'Principal'),
              order: asNumber(workspace.order),
              projects: normalizeTasksPluginProjects(asArray<unknown>(workspace.projects)),
            };
          })
          .filter((workspace) => workspace.id > 0)
          .sort((a, b) => a.order - b.order);
        setTasksPluginAvailable(nextWorkspaces.length > 0);
        setTasksWorkspaces(nextWorkspaces);
        setSelectedTaskWorkspaceId((current) => current ?? nextWorkspaces[0]?.id ?? null);
      })
      .catch(() => {
        if (!mounted) return;
        setTasksPluginAvailable(false);
        setTasksWorkspaces([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const agenda = (data.agenda ?? []) as AgendaItem[];
  const clients = (data.clients ?? []) as ClientItem[];
  const clientProducts = (data.clientProducts ?? []) as ClientProduct[];
  const sales = (data.sales ?? []) as SaleItem[];
  const payments = (data.payments ?? []) as PaymentItem[];
  const domains = (data.domains ?? []) as DomainItem[];
  const links = (data.links ?? []) as LinkItem[];
  const linkGroups = (data.linkGroups ?? []) as LinkGroup[];
  const checklistTemplates = (data.checklistTemplates ?? []) as ChecklistTemplate[];
  const dashboardWidgets = asArray<unknown>(data.dashboardWidgets)
    .map(normalizeDashboardWidget)
    .sort((a, b) => a.order - b.order);
  const canvases = asArray<unknown>(data.canvases)
    .map(normalizeCanvas)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const canvasNodes = asArray<unknown>(data.canvasNodes).map(normalizeCanvasNode);
  const canvasEdges = asArray<unknown>(data.canvasEdges).map(normalizeCanvasEdge).filter((edge) => edge.source && edge.target);
  const home = (data.home ?? []) as HomeItem[];
  const growth = (data.growth ?? []) as GrowthItem[];
  const panelCards = (data.panel ?? []) as PanelCard[];
  const localProjects = asArray<Partial<BusinessProject>>(data.projects)
    .map(normalizeProject)
    .sort((a, b) => a.order - b.order);
  const fallbackProjectId = localProjects[0]?._recordId ?? 'project-main';
  const localColumns = asArray<Partial<BusinessColumn>>(data.columns)
    .map((column, index) => normalizeColumn(column, index, fallbackProjectId))
    .sort((a, b) => a.order - b.order);
  const fallbackColumnId = localColumns.find((column) => column.projectId === fallbackProjectId)?._recordId ?? 'column-backlog';
  const localTasks = asArray<Partial<BusinessTask>>(data.tasks)
    .map((task, index) => normalizeTask(task, index, fallbackProjectId, fallbackColumnId))
    .sort((a, b) => a.order - b.order);
  const liveTasksOsBoard = useMemo(() => {
    const remoteProjects = normalizeTasksPluginProjects(tasksWorkspaces);
    return {
      projects: remoteProjects.map(tasksOsProjectToBusiness).sort((a, b) => a.order - b.order),
      columns: remoteProjects.flatMap((project) => project.columns.map((column) => tasksOsColumnToBusiness(column, project.id))).sort((a, b) => a.order - b.order),
      tasks: remoteProjects.flatMap((project) => project.columns.flatMap((column) => column.items.map(tasksOsTaskToBusiness))).sort((a, b) => a.order - b.order),
    };
  }, [tasksWorkspaces]);
  const usingTasksOsLive = tasksPluginAvailable && tasksWorkspaces.length > 0;
  const projects = usingTasksOsLive ? liveTasksOsBoard.projects : localProjects;
  const columns = usingTasksOsLive ? liveTasksOsBoard.columns : localColumns;
  const tasks = usingTasksOsLive ? liveTasksOsBoard.tasks : localTasks;
  const notes = asArray<Partial<NotebookNote>>(data.notes)
    .map(normalizeNote)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  const videos = asArray<Partial<VideoItem>>(data.videos)
    .map(normalizeVideo)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const backgroundSettingsItems = asArray<unknown>(data.backgroundSettings);
  const backgroundSettings = normalizeBackgroundSettings(backgroundSettingsItems[0]);
  const businessWomanSettings = normalizeBusinessWomanSettings(asArray<unknown>(data.businessWomanSettings)[0]);
  const taskSyncMappings = asArray<unknown>(data.taskSyncMappings)
    .map(normalizeTaskSyncMapping)
    .filter((mapping) => mapping.businessId && mapping.taskOsId > 0);

  const projectsRef = useRef<BusinessProject[]>([]);
  const columnsRef = useRef<BusinessColumn[]>([]);
  const tasksRef = useRef<BusinessTask[]>([]);
  const taskSyncMappingsRef = useRef<TaskSyncMapping[]>([]);
  const businessWomanSettingsRef = useRef<BusinessWomanSettings>(DEFAULT_BUSINESS_WOMAN_SETTINGS);

  useEffect(() => {
    projectsRef.current = projects;
    columnsRef.current = columns;
    tasksRef.current = tasks;
    taskSyncMappingsRef.current = taskSyncMappings;
    businessWomanSettingsRef.current = businessWomanSettings;
  }, [projects, columns, tasks, taskSyncMappings, businessWomanSettings, tasksPluginAvailable]);

  useEffect(() => {
    if (loading || !loadSucceeded || seeded.current) return;
    seeded.current = true;

    const initial: Record<string, any[]> = {};
    if (!agenda.length) initial.agenda = DEFAULT_AGENDA.map((d) => ({ ...d, _recordId: nanoid() }));
    if (!clients.length) initial.clients = DEFAULT_CLIENTS.map((d) => ({ ...d, _recordId: nanoid() }));
    if (!sales.length) initial.sales = DEFAULT_SALES.map((d) => ({ ...d, _recordId: nanoid() }));
    if (!payments.length) initial.payments = DEFAULT_PAYMENTS.map((d) => ({ ...d, _recordId: nanoid() }));
    if (!domains.length) initial.domains = DEFAULT_DOMAINS.map((d) => ({ ...d, _recordId: nanoid() }));
    if (!home.length) initial.home = DEFAULT_HOME.map((d) => ({ ...d, _recordId: nanoid() }));
    if (!growth.length) initial.growth = DEFAULT_GROWTH.map((d) => ({ ...d, _recordId: nanoid() }));
    if (!panelCards.length) initial.panel = DEFAULT_PANEL.map((d) => ({ ...d, _recordId: nanoid() }));
    if (!dashboardWidgets.length) initial.dashboardWidgets = DEFAULT_DASHBOARD_WIDGETS.map((d) => ({ ...d, _recordId: nanoid() }));
    if (!notes.length) {
      const now = new Date().toISOString();
      initial.notes = [
        {
          _recordId: 'note-start',
          title: 'Ideas rapidas',
          body: 'Guarda aqui decisiones, ideas de contenido, enlaces y notas que luego puedes convertir en tareas.',
          tag: 'General',
          pinned: true,
          linkedTaskId: '',
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
    if (!videos.length) initial.videos = [];
    if (!links.length) initial.links = [];
    if (!linkGroups.length) initial.linkGroups = DEFAULT_LINK_GROUPS;
    if (!checklistTemplates.length) initial.checklistTemplates = [];
    if (!canvases.length) initial.canvases = [makeDefaultCanvas()];
    if (!canvasNodes.length) initial.canvasNodes = [];
    if (!canvasEdges.length) initial.canvasEdges = [];
    if (!backgroundSettingsItems.length) initial.backgroundSettings = [DEFAULT_BACKGROUND_SETTINGS];
    if (!data.businessWomanSettings?.length) initial.businessWomanSettings = [DEFAULT_BUSINESS_WOMAN_SETTINGS];
    if (!data.taskSyncMappings?.length) initial.taskSyncMappings = [];

    if (Object.keys(initial).length) {
      setData((prev) => ({ ...prev, ...initial }));
      for (const [collection, items] of Object.entries(initial)) {
        void saveCollection(collection, items);
      }
    }
  }, [loadSucceeded, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!projects.length) return;

    if (!restoredLastProject.current) {
      const preferred = projects.find((project) => project._recordId === businessWomanSettings.lastProjectId)
        ?? (businessWomanSettings.lastWorkspaceId
          ? projects.find((project) => project.workspaceId === businessWomanSettings.lastWorkspaceId)
          : null)
        ?? projects[0];
      restoredLastProject.current = true;
      if (preferred) {
        setSelectedProjectId(preferred._recordId);
        if (preferred.workspaceId !== undefined) setSelectedTaskWorkspaceId(preferred.workspaceId ?? null);
      }
      return;
    }

    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0]._recordId);
    if (selectedProjectId && !projects.some((p) => p._recordId === selectedProjectId)) {
      const fallback = projects.find((project) => project.workspaceId === selectedTaskWorkspaceId) ?? projects[0];
      setSelectedProjectId(fallback?._recordId ?? '');
    }
  }, [businessWomanSettings.lastProjectId, businessWomanSettings.lastWorkspaceId, projects, selectedProjectId, selectedTaskWorkspaceId]);

  useEffect(() => {
    if (!selectedTaskWorkspaceId) return;
    const firstInWorkspace = projects.find((project) => project.workspaceId === selectedTaskWorkspaceId);
    if (firstInWorkspace && !projects.some((project) => project._recordId === selectedProjectId && project.workspaceId === selectedTaskWorkspaceId)) {
      setSelectedProjectId(firstInWorkspace._recordId);
    }
  }, [projects, selectedProjectId, selectedTaskWorkspaceId]);

  useEffect(() => {
    if (!canvases.length) return;
    if (!selectedCanvasId || !canvases.some((canvas) => canvas._recordId === selectedCanvasId)) {
      setSelectedCanvasId(canvases[0]._recordId);
    }
  }, [canvases, selectedCanvasId]);

  const workspaceProjects = selectedTaskWorkspaceId
    ? projects.filter((project) => project.workspaceId === selectedTaskWorkspaceId)
    : projects;
  const selectedProject = workspaceProjects.find((p) => p._recordId === selectedProjectId) ?? workspaceProjects[0] ?? projects[0] ?? null;
  const selectedProjectColumns = selectedProject ? columns.filter((c) => c.projectId === selectedProject._recordId) : [];
  const selectedTask = tasks.find((t) => t._recordId === selectedTaskId) ?? null;
  const selectedTaskProject = selectedTask ? projects.find((project) => project._recordId === selectedTask.projectId) ?? selectedProject : null;

  const setCollection = useCallback(
    (collection: string, items: any[]) => {
      if (usingTasksOsLive && (collection === 'projects' || collection === 'columns' || collection === 'tasks')) {
        void saveCollection(collection, items); // may no-op server
        if (collection === 'projects' || collection === 'columns' || collection === 'tasks') scheduleTasksSync();
        return;
      }
      setData((prev) => ({ ...prev, [collection]: items }));
      void saveCollection(collection, items);
      if (collection === 'projects' || collection === 'columns' || collection === 'tasks') scheduleTasksSync();
    },
    [saveCollection, setData, usingTasksOsLive],
  );

  const setCollections = useCallback(
    (collections: Record<string, any[]>, options?: { skipTasksSync?: boolean }) => {
      setData((prev) => ({ ...prev, ...collections }));
      for (const [collection, items] of Object.entries(collections)) {
        void saveCollection(collection, items);
      }
      if (!options?.skipTasksSync && (collections.projects || collections.columns || collections.tasks)) scheduleTasksSync();
    },
    [saveCollection, setData],
  );

  useEffect(() => {
    if (!selectedProjectId || !projects.length) return;
    const project = projects.find((item) => item._recordId === selectedProjectId);
    const nextWorkspaceId = project?.workspaceId ?? selectedTaskWorkspaceId ?? null;
    if (
      businessWomanSettings.lastProjectId === selectedProjectId
      && (businessWomanSettings.lastWorkspaceId ?? null) === nextWorkspaceId
    ) {
      return;
    }

    const next = normalizeBusinessWomanSettings({
      ...businessWomanSettings,
      syncTasksEnabled: true,
      lastProjectId: selectedProjectId,
      lastWorkspaceId: nextWorkspaceId,
    });
    businessWomanSettingsRef.current = next;
    setCollection('businessWomanSettings', [next]);
  }, [businessWomanSettings, projects, selectedProjectId, selectedTaskWorkspaceId, setCollection]);

  useEffect(() => {
    if (usingTasksOsLive || !selectedTaskWorkspaceId || !projects.some((project) => project.workspaceId === undefined || project.workspaceId === null)) return;
    setCollection(
      'projects',
      projects.map((project) =>
        project.workspaceId === undefined || project.workspaceId === null
          ? { ...project, workspaceId: selectedTaskWorkspaceId }
          : project,
      ),
    );
  }, [projects, selectedTaskWorkspaceId, setCollection, usingTasksOsLive]);

  function scheduleTasksSync(_delay = 900) {
    // La integración actual edita Tasks OS directamente. No se publica el
    // estado local legado porque podría reintroducir proyectos y tareas viejas.
  }

  const updateBackgroundSettings = useCallback(
    (patch: Partial<BackgroundSettings>) => {
      const next: BackgroundSettings = normalizeBackgroundSettings({ ...backgroundSettings, ...patch });
      setCollection('backgroundSettings', [next]);
    },
    [backgroundSettings, setCollection],
  );

  function updateBusinessWomanSettings(patch: Partial<BusinessWomanSettings>) {
    const next = normalizeBusinessWomanSettings({ ...businessWomanSettingsRef.current, ...patch, syncTasksEnabled: true });
    setCollection('businessWomanSettings', [next]);
    businessWomanSettingsRef.current = next;
    scheduleTasksSync(120);
  }

  async function tasksPluginRequest<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      setTasksPluginAvailable(false);
      throw new Error(`Tasks OS respondio ${response.status}`);
    }
    setTasksPluginAvailable(true);
    return response.json() as Promise<T>;
  }

  async function refreshTasksWorkspaces(preferredWorkspaceId?: number | null) {
    const value = await tasksPluginRequest<unknown>('/api/plugins/tasks/workspaces', { cache: 'no-store' });
    const nextWorkspaces = asArray<unknown>(value)
      .map((item) => {
        const workspace = asRecord<TasksWorkspace>(item);
        return {
          id: asNumber(workspace.id),
          name: asString(workspace.name, 'Principal'),
          order: asNumber(workspace.order),
          projects: normalizeTasksPluginProjects(asArray<unknown>(workspace.projects)),
        };
      })
      .filter((workspace) => workspace.id > 0)
      .sort((a, b) => a.order - b.order);

    setTasksWorkspaces(nextWorkspaces);
    setSelectedTaskWorkspaceId((current) => {
      if (preferredWorkspaceId && nextWorkspaces.some((workspace) => workspace.id === preferredWorkspaceId)) return preferredWorkspaceId;
      if (current && nextWorkspaces.some((workspace) => workspace.id === current)) return current;
      return nextWorkspaces[0]?.id ?? null;
    });
    return nextWorkspaces;
  }

  function patchLiveTaskInWorkspaces(taskId: string, patch: Partial<BusinessTask>) {
    const taskOsId = taskOsIdFromBusinessId(taskId, TASK_OS_TASK_PREFIX);
    if (!taskOsId) return;
    const remoteColumnId = patch.columnId ? taskOsIdFromBusinessId(patch.columnId, TASK_OS_COLUMN_PREFIX) ?? undefined : undefined;

    setTasksWorkspaces((current) => {
      let movedTask: TasksPluginItem | null = null;
      const withoutTask = current.map((workspace) => ({
        ...workspace,
        projects: workspace.projects.map((project) => ({
          ...project,
          columns: project.columns.map((column) => {
            const items = column.items.filter((item) => {
              if (item.id !== taskOsId) return true;
              movedTask = taskPatchToRemote(item, patch, remoteColumnId);
              return remoteColumnId === undefined;
            });
            if (remoteColumnId === undefined && movedTask && column.items.some((item) => item.id === taskOsId)) {
              return { ...column, items: column.items.map((item) => (item.id === taskOsId ? movedTask! : item)) };
            }
            return { ...column, items };
          }),
        })),
      }));

      if (!remoteColumnId || !movedTask) return withoutTask;

      return withoutTask.map((workspace) => ({
        ...workspace,
        projects: workspace.projects.map((project) => ({
          ...project,
          columns: project.columns.map((column) => {
            if (column.id !== remoteColumnId || !movedTask) return column;
            const nextItems = [...column.items];
            const insertAt = patch.order !== undefined ? Math.max(0, Math.min(Number(patch.order), nextItems.length)) : nextItems.length;
            nextItems.splice(insertAt, 0, { ...movedTask, projectId: project.id, columnId: column.id });
            return {
              ...column,
              items: nextItems.map((item, order) => ({ ...item, order })),
            };
          }),
        })),
      }));
    });
  }

  function removeLiveTaskFromWorkspaces(taskId: string) {
    const taskOsId = taskOsIdFromBusinessId(taskId, TASK_OS_TASK_PREFIX);
    if (!taskOsId) return;
    setTasksWorkspaces((current) => current.map((workspace) => ({
      ...workspace,
      projects: workspace.projects.map((project) => ({
        ...project,
        columns: project.columns.map((column) => ({
          ...column,
          items: column.items.filter((item) => item.id !== taskOsId).map((item, order) => ({ ...item, order })),
        })),
      })),
    })));
  }

  async function readTasksOsProjects() {
    const raw = await tasksPluginRequest<unknown>('/api/plugins/tasks', { cache: 'no-store' });
    return normalizeTasksPluginProjects(raw);
  }

  function mappingFor(mappings: TaskSyncMapping[], kind: TaskSyncMappingKind, businessId: string) {
    return mappings.find((mapping) => mapping.kind === kind && mapping.businessId === businessId);
  }

  function mappingForTaskOs(mappings: TaskSyncMapping[], kind: TaskSyncMappingKind, taskOsId: number) {
    return mappings.find((mapping) => mapping.kind === kind && mapping.taskOsId === taskOsId);
  }

  function upsertMapping(mappings: TaskSyncMapping[], kind: TaskSyncMappingKind, businessId: string, taskOsId: number, updatedAt = new Date().toISOString()) {
    const existing = mappings.find((mapping) => mapping.kind === kind && (mapping.businessId === businessId || mapping.taskOsId === taskOsId));
    if (existing) {
      existing.businessId = businessId;
      existing.taskOsId = taskOsId;
      existing.updatedAt = updatedAt;
      return existing;
    }
    const mapping: TaskSyncMapping = {
      _recordId: `task-sync-${kind}-${businessId}`,
      kind,
      businessId,
      taskOsId,
      updatedAt,
    };
    mappings.push(mapping);
    return mapping;
  }

  async function deleteSyncedTasksOsEntity(kind: TaskSyncMappingKind, businessId: string, childBusinessIds: string[] = []) {
    const mapping = mappingFor(taskSyncMappingsRef.current, kind, businessId);
    if (!mapping) return;
    const endpoint =
      kind === 'project'
        ? `/api/plugins/tasks/projects/${mapping.taskOsId}`
        : kind === 'column'
          ? `/api/plugins/tasks/columns/${mapping.taskOsId}`
          : `/api/plugins/tasks/items/${mapping.taskOsId}`;
    try {
      await tasksPluginRequest<{ ok: boolean }>(endpoint, { method: 'DELETE' });
      const removeIds = new Set([businessId, ...childBusinessIds]);
      const nextMappings = taskSyncMappingsRef.current.filter((item) => !removeIds.has(item.businessId));
      taskSyncMappingsRef.current = nextMappings;
      setCollection('taskSyncMappings', nextMappings);
      setSyncMessage('Eliminado tambien en Tasks OS');
    } catch {
      setSyncMessage('No se pudo eliminar en Tasks OS');
    } finally {
      window.setTimeout(() => setSyncMessage(''), 3200);
    }
  }

  function reconcileTasksOsIntoBusiness(
    snapshot: TasksPluginProject[],
    sourceProjects: BusinessProject[],
    sourceColumns: BusinessColumn[],
    sourceTasks: BusinessTask[],
    sourceMappings: TaskSyncMapping[],
  ) {
    const nextProjects = [...sourceProjects];
    const nextColumns = [...sourceColumns];
    const nextTasks = [...sourceTasks];
    const nextMappings = [...sourceMappings];

    for (const remoteProject of snapshot) {
      const projectMapping = mappingForTaskOs(nextMappings, 'project', remoteProject.id);
      const businessProjectId = projectMapping?.businessId || `tasks-os-project-${remoteProject.id}`;
      const tags = remoteProject.labels.length ? remoteProject.labels : DEFAULT_TAGS.map((tag) => ({ ...tag, id: `${tag.id}-${businessProjectId}` }));
      const localProjectIndex = nextProjects.findIndex((project) => project._recordId === businessProjectId);
      if (!projectMapping) upsertMapping(nextMappings, 'project', businessProjectId, remoteProject.id, remoteProject.updatedAt ?? new Date().toISOString());
      if (localProjectIndex < 0) {
        nextProjects.push({
          _recordId: businessProjectId,
          name: remoteProject.name,
          backgroundUrl: remoteProject.backgroundUrl ?? '',
          tags,
          order: remoteProject.order,
          workspaceId: remoteProject.workspaceId ?? null,
        });
      } else if (shouldRemoteWin(projectMapping?.updatedAt, remoteProject.updatedAt)) {
        nextProjects[localProjectIndex] = {
          ...nextProjects[localProjectIndex],
          name: remoteProject.name,
          backgroundUrl: remoteProject.backgroundUrl ?? '',
          tags,
          order: remoteProject.order,
          workspaceId: remoteProject.workspaceId ?? null,
        };
        upsertMapping(nextMappings, 'project', businessProjectId, remoteProject.id, remoteProject.updatedAt ?? new Date().toISOString());
      }

      for (const remoteColumn of remoteProject.columns) {
        const columnMapping = mappingForTaskOs(nextMappings, 'column', remoteColumn.id);
        const businessColumnId = columnMapping?.businessId || `tasks-os-column-${remoteColumn.id}`;
        const localColumnIndex = nextColumns.findIndex((column) => column._recordId === businessColumnId);
        if (!columnMapping) upsertMapping(nextMappings, 'column', businessColumnId, remoteColumn.id, remoteColumn.updatedAt ?? new Date().toISOString());
        if (localColumnIndex < 0) {
          nextColumns.push({
            _recordId: businessColumnId,
            projectId: businessProjectId,
            title: remoteColumn.title,
            order: remoteColumn.order,
          });
        } else if (shouldRemoteWin(columnMapping?.updatedAt, remoteColumn.updatedAt)) {
          nextColumns[localColumnIndex] = {
            ...nextColumns[localColumnIndex],
            projectId: businessProjectId,
            title: remoteColumn.title,
            order: remoteColumn.order,
          };
          upsertMapping(nextMappings, 'column', businessColumnId, remoteColumn.id, remoteColumn.updatedAt ?? new Date().toISOString());
        }

        for (const remoteTask of remoteColumn.items) {
          const taskMapping = mappingForTaskOs(nextMappings, 'task', remoteTask.id);
          const businessTaskId = taskMapping?.businessId || `tasks-os-task-${remoteTask.id}`;
          const localTaskIndex = nextTasks.findIndex((task) => task._recordId === businessTaskId);
          const taskPayload: BusinessTask = {
            _recordId: businessTaskId,
            projectId: businessProjectId,
            columnId: businessColumnId,
            title: remoteTask.title,
            notes: remoteTask.notes,
            tagIds: remoteTask.labelIds,
            checklist: remoteTask.checklist.map(normalizeChecklistItem),
            comments: [],
            dueDate: taskOsDateToBusiness(remoteTask.dueDate),
            order: remoteTask.order,
            createdAt: remoteTask.updatedAt ?? new Date().toISOString(),
            updatedAt: remoteTask.updatedAt ?? new Date().toISOString(),
          };
          if (!taskMapping) upsertMapping(nextMappings, 'task', businessTaskId, remoteTask.id, remoteTask.updatedAt ?? taskPayload.updatedAt);
          if (localTaskIndex < 0) {
            nextTasks.push(taskPayload);
          } else if (shouldRemoteWin(nextTasks[localTaskIndex].updatedAt, remoteTask.updatedAt)) {
            nextTasks[localTaskIndex] = {
              ...nextTasks[localTaskIndex],
              ...taskPayload,
              createdAt: nextTasks[localTaskIndex].createdAt,
            };
            upsertMapping(nextMappings, 'task', businessTaskId, remoteTask.id, remoteTask.updatedAt ?? taskPayload.updatedAt);
          }
        }
      }
    }

    return { nextProjects, nextColumns, nextTasks, nextMappings };
  }

  async function pushBusinessWomanToTasksOs(
    nextProjects: BusinessProject[],
    nextColumns: BusinessColumn[],
    nextTasks: BusinessTask[],
    nextMappings: TaskSyncMapping[],
  ) {
    const syncStamp = new Date().toISOString();
    const orderedProjects = [...nextProjects].sort((a, b) => a.order - b.order);

    for (const project of orderedProjects) {
      let projectMapping = mappingFor(nextMappings, 'project', project._recordId);
      if (!projectMapping) {
        const created = await tasksPluginRequest<TasksPluginProject>('/api/plugins/tasks', {
          method: 'POST',
          body: JSON.stringify({ name: project.name, backgroundUrl: project.backgroundUrl || null, workspaceId: project.workspaceId ?? undefined }),
        });
        projectMapping = upsertMapping(nextMappings, 'project', project._recordId, created.id, syncStamp);

        const refreshed = await readTasksOsProjects();
        const createdProject = refreshed.find((item) => item.id === created.id);
        const createdColumns = [...(createdProject?.columns ?? [])].sort((a, b) => a.order - b.order);
        const businessColumns = nextColumns.filter((column) => column.projectId === project._recordId).sort((a, b) => a.order - b.order);
        for (const [index, column] of businessColumns.entries()) {
          const remoteColumn = createdColumns[index];
          if (remoteColumn) {
            await tasksPluginRequest<TasksPluginColumn>(`/api/plugins/tasks/columns/${remoteColumn.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ title: column.title, order: column.order }),
            });
            upsertMapping(nextMappings, 'column', column._recordId, remoteColumn.id, syncStamp);
          }
        }
      } else {
        await tasksPluginRequest<TasksPluginProject>(`/api/plugins/tasks/projects/${projectMapping.taskOsId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: project.name,
            backgroundUrl: project.backgroundUrl || null,
            labels: project.tags,
            order: project.order,
            workspaceId: project.workspaceId ?? undefined,
          }),
        });
        projectMapping.updatedAt = syncStamp;
      }
    }

    const orderedColumns = [...nextColumns].sort((a, b) => a.order - b.order);
    for (const column of orderedColumns) {
      const projectMapping = mappingFor(nextMappings, 'project', column.projectId);
      if (!projectMapping) continue;
      let columnMapping = mappingFor(nextMappings, 'column', column._recordId);
      if (!columnMapping) {
        const created = await tasksPluginRequest<TasksPluginColumn>('/api/plugins/tasks/columns', {
          method: 'POST',
          body: JSON.stringify({ projectId: projectMapping.taskOsId, title: column.title }),
        });
        columnMapping = upsertMapping(nextMappings, 'column', column._recordId, created.id, syncStamp);
      }
      await tasksPluginRequest<TasksPluginColumn>(`/api/plugins/tasks/columns/${columnMapping.taskOsId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: column.title, order: column.order }),
      });
      columnMapping.updatedAt = syncStamp;
    }

    const orderedTasks = [...nextTasks].sort((a, b) => a.order - b.order);
    for (const task of orderedTasks) {
      const columnMapping = mappingFor(nextMappings, 'column', task.columnId);
      if (!columnMapping) continue;
      let taskMapping = mappingFor(nextMappings, 'task', task._recordId);
      const payload = {
        title: task.title,
        notes: task.notes,
        labelIds: task.tagIds,
        checklist: task.checklist,
        dueDate: task.dueDate || null,
        columnId: columnMapping.taskOsId,
        order: task.order,
      };
      if (!taskMapping) {
        const created = await tasksPluginRequest<TasksPluginItem>('/api/plugins/tasks/items', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        taskMapping = upsertMapping(nextMappings, 'task', task._recordId, created.id, syncStamp);
      } else {
        await tasksPluginRequest<TasksPluginItem>(`/api/plugins/tasks/items/${taskMapping.taskOsId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        taskMapping.updatedAt = syncStamp;
      }
    }
  }

  async function runFullTasksSync(source: 'manual' | 'auto' = 'manual') {
    if (syncingTasks) return;
    setSyncingTasks(true);
    setSyncMessage(source === 'manual' ? 'Sincronizando con Tasks OS...' : 'Sincronizando cambios...');
    try {
      const snapshot = await readTasksOsProjects();
      const reconciled = reconcileTasksOsIntoBusiness(
        snapshot,
        projectsRef.current,
        columnsRef.current,
        tasksRef.current,
        taskSyncMappingsRef.current,
      );
      await pushBusinessWomanToTasksOs(reconciled.nextProjects, reconciled.nextColumns, reconciled.nextTasks, reconciled.nextMappings);

      const settings = normalizeBusinessWomanSettings({
        ...businessWomanSettingsRef.current,
        syncLastRunAt: new Date().toISOString(),
      });
      projectsRef.current = reconciled.nextProjects;
      columnsRef.current = reconciled.nextColumns;
      tasksRef.current = reconciled.nextTasks;
      taskSyncMappingsRef.current = reconciled.nextMappings;
      businessWomanSettingsRef.current = settings;
      setCollections(
        {
          projects: reconciled.nextProjects,
          columns: reconciled.nextColumns,
          tasks: reconciled.nextTasks,
          taskSyncMappings: reconciled.nextMappings,
          businessWomanSettings: [settings],
        },
        { skipTasksSync: true },
      );
      setSyncMessage('Sincronizado con Tasks OS');
    } catch {
      setSyncMessage('No se pudo sincronizar con Tasks OS');
    } finally {
      setSyncingTasks(false);
      window.setTimeout(() => setSyncMessage(''), 3200);
    }
  }

  const activeBackground = useMemo(
    () => getActiveBackground(backgroundSettings, currentDaypart),
    [backgroundSettings, currentDaypart],
  );

  const contentBackgroundStyle = useMemo<React.CSSProperties>(
    () => ({
      backgroundImage: `linear-gradient(135deg, rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.32)), url("${activeBackground.url}")`,
      backgroundPosition: activeBackground.position ?? 'center',
      backgroundSize: 'cover',
    }),
    [activeBackground],
  );

  const progressPct = useMemo(() => {
    const simpleTotal = agenda.length + home.length + growth.length;
    const simpleDone = agenda.filter((a) => a.done).length + home.filter((h) => h.done).length + growth.filter((g) => g.done).length;
    const taskTotal = tasks.length;
    const taskDone = tasks.filter((t) => {
      const col = columns.find((c) => c._recordId === t.columnId);
      return t.status === 'done' || col?.title.toLowerCase().includes('hecho') || col?.title.toLowerCase().includes('done');
    }).length;
    const total = simpleTotal + taskTotal;
    return total > 0 ? Math.round(((simpleDone + taskDone) / total) * 100) : 0;
  }, [agenda, home, growth, tasks, columns]);

  const todayTasks = tasks.filter((t) => t.dueDate === todayKey());
  const overdueTasks = tasks.filter((t) => t.dueDate && isOverdue(t.dueDate));
  const upcomingPayments = payments.filter((p) => !p.paid && isNextSevenDays(p.dueDate));
  const upcomingDomains = domains.filter((d) => !d.done && isNextSevenDays(d.dueDate));
  const pinnedNotes = notes.filter((n) => n.pinned).slice(0, 4);

  function exportData() {
    const payload = {
      agenda,
      clients,
      clientProducts,
      sales,
      payments,
      domains,
      links,
      linkGroups,
      checklistTemplates,
      dashboardWidgets,
      home,
      growth,
      panel: panelCards,
      projects,
      columns,
      tasks,
      notes,
      videos,
      canvases,
      canvasNodes,
      canvasEdges,
      backgroundSettings: [backgroundSettings],
      businessWomanSettings: [businessWomanSettings],
      taskSyncMappings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `business-woman-${todayKey()}.json`,
    });
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as Record<string, any[]>;
      const allowedCollections = [
        'agenda',
        'clients',
        'clientProducts',
        'sales',
        'payments',
        'domains',
        'links',
        'linkGroups',
        'checklistTemplates',
        'dashboardWidgets',
        'home',
        'growth',
        'panel',
        'projects',
        'columns',
        'tasks',
        'notes',
        'videos',
        'canvases',
        'canvasNodes',
        'canvasEdges',
        'backgroundSettings',
        'businessWomanSettings',
        'taskSyncMappings',
      ];
      const imported: Record<string, any[]> = {};

      for (const collection of allowedCollections) {
        if (!Array.isArray(parsed[collection])) continue;
        imported[collection] = parsed[collection].map((item) => ({ ...item, _recordId: item._recordId || nanoid() }));
      }

      if (Object.keys(imported).length) setCollections(imported);
    } catch {
      alert('Archivo invalido.');
    } finally {
      event.target.value = '';
    }
  }

  function resetDailyChecks() {
    if (!confirm('Reiniciar checks diarios de agenda, casa, crecimiento y clientes?')) return;
    setCollections({
      agenda: agenda.map((item) => ({ ...item, done: false })),
      home: home.map((item) => ({ ...item, done: false })),
      growth: growth.map((item) => ({ ...item, done: false })),
      clients: clients.map((item) => ({ ...item, contacted: false })),
    });
  }

  async function replaceTask(taskId: string, patch: Partial<BusinessTask>) {
    if (usingTasksOsLive) {
      const taskOsId = taskOsIdFromBusinessId(taskId, TASK_OS_TASK_PREFIX);
      if (!taskOsId) return;
      const columnId = patch.columnId ? taskOsIdFromBusinessId(patch.columnId, TASK_OS_COLUMN_PREFIX) : undefined;
      patchLiveTaskInWorkspaces(taskId, patch);
      await tasksPluginRequest<TasksPluginItem>(`/api/plugins/tasks/items/${taskOsId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.notes !== undefined && { notes: patch.notes }),
          ...(patch.tagIds !== undefined && { labelIds: patch.tagIds }),
          ...(patch.checklist !== undefined && { checklist: patch.checklist }),
          ...(patch.dueDate !== undefined && { dueDate: patch.dueDate || null }),
          ...(patch.startDate !== undefined && { startDate: patch.startDate || null }),
          ...(patch.endDate !== undefined && { endDate: patch.endDate || null }),
          ...(patch.status !== undefined && { status: patch.status }),
          ...(patch.parentTaskId !== undefined && { parentTaskId: patch.parentTaskId }),
          ...(patch.color !== undefined && { color: patch.color ?? null }),
          ...(patch.icon !== undefined && { icon: patch.icon ?? null }),
          ...(patch.coverMediaId !== undefined && { coverMediaId: patch.coverMediaId ?? null }),
          ...(columnId !== undefined && { columnId }),
          ...(patch.order !== undefined && { order: patch.order }),
        }),
      });
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      return;
    }
    const now = new Date().toISOString();
    setCollection(
      'tasks',
      tasks.map((t) => (t._recordId === taskId ? { ...t, ...patch, updatedAt: now } : t)),
    );
  }

  async function createTask(columnId: string, title: string, dueDate = '', notesText = '', options: CreateTaskOptions = {}) {
    if (!selectedProject || !title.trim()) return;
    if (usingTasksOsLive) {
      const taskOsColumnId = taskOsIdFromBusinessId(columnId, TASK_OS_COLUMN_PREFIX);
      if (!taskOsColumnId) return;
      const created = await tasksPluginRequest<TasksPluginItem>('/api/plugins/tasks/items', {
        method: 'POST',
        body: JSON.stringify({
          columnId: taskOsColumnId,
          title: title.trim(),
          notes: notesText,
          dueDate: dueDate || null,
        }),
      });
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      if (options.openTask !== false) setSelectedTaskId(taskOsBusinessId(TASK_OS_TASK_PREFIX, created.id));
      return;
    }
    const now = new Date().toISOString();
    const nextOrder = tasks.filter((t) => t.columnId === columnId).length;
    const item: BusinessTask = {
      _recordId: nanoid(),
      projectId: selectedProject._recordId,
      columnId,
      title: title.trim(),
      notes: notesText,
      tagIds: [],
      checklist: [],
      comments: [],
      dueDate,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    };
    setCollection('tasks', [...tasks, item]);
    if (options.openTask !== false) setSelectedTaskId(item._recordId);
  }

  async function copyTaskToProject(task: BusinessTask, targetProjectId: string) {
    const targetColumn = columns.find((c) => c.projectId === targetProjectId);
    if (!targetColumn) return;
    if (usingTasksOsLive) {
      await createTask(targetColumn._recordId, task.title, task.dueDate, task.notes, { openTask: false });
      return;
    }
    const sourceProject = projects.find((p) => p._recordId === task.projectId);
    const targetProject = projects.find((p) => p._recordId === targetProjectId);
    const sourceTagNames = sourceProject?.tags.filter((tag) => task.tagIds.includes(tag.id)).map((tag) => tag.name) ?? [];
    const mappedTagIds = targetProject?.tags.filter((tag) => sourceTagNames.includes(tag.name)).map((tag) => tag.id) ?? [];
    const now = new Date().toISOString();
    const copy: BusinessTask = {
      ...task,
      _recordId: nanoid(),
      projectId: targetProjectId,
      columnId: targetColumn._recordId,
      tagIds: mappedTagIds,
      comments: [],
      order: tasks.filter((t) => t.columnId === targetColumn._recordId).length,
      createdAt: now,
      updatedAt: now,
    };
    setCollection('tasks', [...tasks, copy]);
  }

  async function deleteTask(taskId: string) {
    if (usingTasksOsLive) {
      const taskOsId = taskOsIdFromBusinessId(taskId, TASK_OS_TASK_PREFIX);
      if (!taskOsId) return;
      removeLiveTaskFromWorkspaces(taskId);
      await tasksPluginRequest<{ ok: boolean }>(`/api/plugins/tasks/items/${taskOsId}`, { method: 'DELETE' });
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      return;
    }
    void deleteSyncedTasksOsEntity('task', taskId);
    setCollection('tasks', tasks.filter((task) => task._recordId !== taskId));
  }

  async function moveTaskToProject(task: BusinessTask, targetProjectId: string) {
    const targetColumn = columns.find((c) => c.projectId === targetProjectId);
    if (!targetColumn) return;
    if (usingTasksOsLive) {
      await replaceTask(task._recordId, {
        columnId: targetColumn._recordId,
        order: tasks.filter((t) => t.columnId === targetColumn._recordId).length,
      });
      return;
    }
    replaceTask(task._recordId, {
      projectId: targetProjectId,
      columnId: targetColumn._recordId,
      tagIds: [],
      order: tasks.filter((t) => t.columnId === targetColumn._recordId).length,
    });
  }

  async function createProject(name: string, backgroundUrl = '', clientId = '') {
    if (!name.trim()) return;
    if (usingTasksOsLive) {
      const created = await tasksPluginRequest<TasksPluginProject>('/api/plugins/tasks', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), backgroundUrl: backgroundUrl || null, workspaceId: selectedTaskWorkspaceId ?? undefined }),
      });
      await refreshTasksWorkspaces(selectedTaskWorkspaceId ?? created.workspaceId ?? null);
      setSelectedProjectId(taskOsBusinessId(TASK_OS_PROJECT_PREFIX, created.id));
      return;
    }
    const projectId = nanoid();
    const newProject: BusinessProject = {
      _recordId: projectId,
      name: name.trim(),
      backgroundUrl,
      tags: DEFAULT_TAGS.map((tag) => ({ ...tag, id: `${tag.id}-${projectId}` })),
      order: projects.length,
      workspaceId: selectedTaskWorkspaceId,
      ...(clientId ? { clientId } : {}),
    };
    const newColumns: BusinessColumn[] = ['Pendiente', 'Haciendo', 'Hecho'].map((title, order) => ({
      _recordId: nanoid(),
      projectId,
      title,
      order,
    }));
    setCollections({ projects: [...projects, newProject], columns: [...columns, ...newColumns] });
    setSelectedProjectId(projectId);
  }

  async function updateProject(projectId: string, patch: Partial<BusinessProject>) {
    if (usingTasksOsLive) {
      const taskOsProjectId = taskOsIdFromBusinessId(projectId, TASK_OS_PROJECT_PREFIX);
      if (!taskOsProjectId) return;
      await tasksPluginRequest<TasksPluginProject>(`/api/plugins/tasks/projects/${taskOsProjectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.backgroundUrl !== undefined && { backgroundUrl: patch.backgroundUrl || null }),
          ...(patch.tags !== undefined && { labels: patch.tags }),
          ...(patch.order !== undefined && { order: patch.order }),
          ...(patch.workspaceId !== undefined && { workspaceId: patch.workspaceId }),
        }),
      });
      await refreshTasksWorkspaces(patch.workspaceId ?? selectedTaskWorkspaceId);
      return;
    }
    setCollection('projects', projects.map((p) => (p._recordId === projectId ? { ...p, ...patch } : p)));
  }

  async function reorderProjects(orderedProjectIds: string[]) {
    if (usingTasksOsLive) {
      await Promise.all(
        orderedProjectIds.map((projectId, order) => {
          const taskOsProjectId = taskOsIdFromBusinessId(projectId, TASK_OS_PROJECT_PREFIX);
          if (!taskOsProjectId) return Promise.resolve();
          return tasksPluginRequest<TasksPluginProject>(`/api/plugins/tasks/projects/${taskOsProjectId}`, {
            method: 'PATCH',
            body: JSON.stringify({ order }),
          });
        }),
      );
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      return;
    }
    const orderById = new Map(orderedProjectIds.map((projectId, order) => [projectId, order]));
    const reordered = projects.map((project) => {
      const order = orderById.get(project._recordId);
      return order === undefined ? project : { ...project, order };
    });
    setCollection('projects', reordered);
  }

  async function createTasksWorkspace(name: string) {
    if (!name.trim()) return;
    try {
      const workspace = await tasksPluginRequest<TasksWorkspace>('/api/plugins/tasks/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      await refreshTasksWorkspaces(workspace.id);
      setSyncMessage('Espacio de trabajo creado en Tasks OS');
    } catch {
      setSyncMessage('No se pudo crear el espacio de trabajo');
    } finally {
      window.setTimeout(() => setSyncMessage(''), 3200);
    }
  }

  async function renameTasksWorkspace(workspaceId: number, name: string) {
    if (!name.trim()) return;
    try {
      await tasksPluginRequest<TasksWorkspace>(`/api/plugins/tasks/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      await refreshTasksWorkspaces(workspaceId);
      setSyncMessage('Espacio de trabajo renombrado en Tasks OS');
    } catch {
      setSyncMessage('No se pudo renombrar el espacio de trabajo');
    } finally {
      window.setTimeout(() => setSyncMessage(''), 3200);
    }
  }

  async function deleteTasksWorkspace(workspaceId: number) {
    if (!confirm('¿Eliminar este espacio de trabajo? Sus proyectos se moverán al siguiente espacio disponible.')) return;
    try {
      const result = await tasksPluginRequest<{ ok: boolean; replacementWorkspaceId: number }>(`/api/plugins/tasks/workspaces/${workspaceId}`, {
        method: 'DELETE',
      });
      const replacementWorkspaceId = result.replacementWorkspaceId;
      await refreshTasksWorkspaces(replacementWorkspaceId);
      setSyncMessage('Espacio de trabajo eliminado en Tasks OS');
    } catch {
      setSyncMessage('No se pudo eliminar el espacio de trabajo');
    } finally {
      window.setTimeout(() => setSyncMessage(''), 3200);
    }
  }

  async function reorderTasksWorkspaces(orderedWorkspaceIds: number[]) {
    const orderById = new Map(orderedWorkspaceIds.map((workspaceId, order) => [workspaceId, order]));
    const optimistic = tasksWorkspaces
      .map((workspace) => ({ ...workspace, order: orderById.get(workspace.id) ?? workspace.order }))
      .sort((a, b) => a.order - b.order);
    setTasksWorkspaces(optimistic);

    try {
      await Promise.all(
        optimistic.map((workspace) =>
          tasksPluginRequest<TasksWorkspace>(`/api/plugins/tasks/workspaces/${workspace.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ order: workspace.order }),
          }),
        ),
      );
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      setSyncMessage('Espacios de trabajo reordenados en Tasks OS');
    } catch {
      setSyncMessage('No se pudieron reordenar los espacios de trabajo');
    } finally {
      window.setTimeout(() => setSyncMessage(''), 3200);
    }
  }

  async function deleteProject(projectId: string) {
    if (!confirm('Eliminar este proyecto tambien eliminara sus etapas y tareas.')) return;
    if (usingTasksOsLive) {
      const taskOsProjectId = taskOsIdFromBusinessId(projectId, TASK_OS_PROJECT_PREFIX);
      if (!taskOsProjectId) return;
      await tasksPluginRequest<{ ok: boolean }>(`/api/plugins/tasks/projects/${taskOsProjectId}`, { method: 'DELETE' });
      setSelectedProjectId('');
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      return;
    }
    const projectColumns = columns.filter((c) => c.projectId === projectId).map((c) => c._recordId);
    const childIds = [
      ...projectColumns,
      ...tasks.filter((t) => t.projectId === projectId || projectColumns.includes(t.columnId)).map((t) => t._recordId),
    ];
    void deleteSyncedTasksOsEntity('project', projectId, childIds);
    setCollections({
      projects: projects.filter((p) => p._recordId !== projectId),
      columns: columns.filter((c) => c.projectId !== projectId),
      tasks: tasks.filter((t) => t.projectId !== projectId && !projectColumns.includes(t.columnId)),
    }, { skipTasksSync: true });
  }

  async function createColumn(title: string) {
    if (!selectedProject || !title.trim()) return;
    if (usingTasksOsLive) {
      const taskOsProjectId = taskOsIdFromBusinessId(selectedProject._recordId, TASK_OS_PROJECT_PREFIX);
      if (!taskOsProjectId) return;
      await tasksPluginRequest<TasksPluginColumn>('/api/plugins/tasks/columns', {
        method: 'POST',
        body: JSON.stringify({ projectId: taskOsProjectId, title: title.trim() }),
      });
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      return;
    }
    const newColumn: BusinessColumn = {
      _recordId: nanoid(),
      projectId: selectedProject._recordId,
      title: title.trim(),
      order: selectedProjectColumns.length,
    };
    setCollection('columns', [...columns, newColumn]);
  }

  async function deleteColumn(columnId: string) {
    if (!confirm('Eliminar esta etapa tambien eliminara sus tareas.')) return;
    if (usingTasksOsLive) {
      const taskOsColumnId = taskOsIdFromBusinessId(columnId, TASK_OS_COLUMN_PREFIX);
      if (!taskOsColumnId) return;
      await tasksPluginRequest<{ ok: boolean }>(`/api/plugins/tasks/columns/${taskOsColumnId}`, { method: 'DELETE' });
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      return;
    }
    const childIds = tasks.filter((t) => t.columnId === columnId).map((t) => t._recordId);
    void deleteSyncedTasksOsEntity('column', columnId, childIds);
    setCollections({
      columns: columns.filter((c) => c._recordId !== columnId),
      tasks: tasks.filter((t) => t.columnId !== columnId),
    }, { skipTasksSync: true });
  }

  function moveColumn(columnId: string, direction: -1 | 1) {
    if (!selectedProject) return;
    const scoped = [...selectedProjectColumns];
    const index = scoped.findIndex((c) => c._recordId === columnId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= scoped.length) return;
    const [moved] = scoped.splice(index, 1);
    scoped.splice(target, 0, moved);
    const reordered = scoped.map((c, order) => ({ ...c, order }));
    setCollection(
      'columns',
      columns.map((c) => reordered.find((r) => r._recordId === c._recordId) ?? c),
    );
  }

  function reorderColumn(columnId: string, targetColumnId: string) {
    if (!selectedProject || columnId === targetColumnId) return;
    const scoped = [...selectedProjectColumns];
    const fromIndex = scoped.findIndex((c) => c._recordId === columnId);
    const toIndex = scoped.findIndex((c) => c._recordId === targetColumnId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = scoped.splice(fromIndex, 1);
    scoped.splice(toIndex, 0, moved);
    const reordered = scoped.map((c, order) => ({ ...c, order }));
    setCollection(
      'columns',
      columns.map((c) => reordered.find((r) => r._recordId === c._recordId) ?? c),
    );
  }

  async function renameColumn(columnId: string, title: string) {
    if (usingTasksOsLive) {
      const taskOsColumnId = taskOsIdFromBusinessId(columnId, TASK_OS_COLUMN_PREFIX);
      if (!taskOsColumnId) return;
      await tasksPluginRequest<TasksPluginColumn>(`/api/plugins/tasks/columns/${taskOsColumnId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      return;
    }
    setCollection('columns', columns.map((c) => (c._recordId === columnId ? { ...c, title } : c)));
  }

  async function reorderColumns(orderedColumnIds: string[]) {
    if (usingTasksOsLive) {
      await Promise.all(
        orderedColumnIds.map((columnId, order) => {
          const taskOsColumnId = taskOsIdFromBusinessId(columnId, TASK_OS_COLUMN_PREFIX);
          if (!taskOsColumnId) return Promise.resolve();
          return tasksPluginRequest<TasksPluginColumn>(`/api/plugins/tasks/columns/${taskOsColumnId}`, {
            method: 'PATCH',
            body: JSON.stringify({ order }),
          });
        }),
      );
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      return;
    }
    if (!selectedProject) return;
    const orderById = new Map(orderedColumnIds.map((columnId, order) => [columnId, order]));
    const reordered = selectedProjectColumns
      .filter((column) => orderById.has(column._recordId))
      .map((column) => ({ ...column, order: orderById.get(column._recordId) ?? column.order }));
    setCollection(
      'columns',
      columns.map((column) => reordered.find((item) => item._recordId === column._recordId) ?? column),
    );
  }

  async function moveTaskOnBoard(taskId: string, toColumnId: string, insertBeforeId?: string) {
    const taskToMove = tasks.find((t) => t._recordId === taskId);
    if (!taskToMove) return;
    const columnTasks = tasks
      .filter((t) => t.columnId === toColumnId && t._recordId !== taskId)
      .sort((a, b) => a.order - b.order);
    const insertIdx = insertBeforeId
      ? columnTasks.findIndex((t) => t._recordId === insertBeforeId)
      : -1;
    const finalIdx = insertIdx < 0 ? columnTasks.length : insertIdx;
    columnTasks.splice(finalIdx, 0, { ...taskToMove, columnId: toColumnId });
    const reorderMap = new Map(columnTasks.map((t, i) => [t._recordId, i]));

    if (usingTasksOsLive) {
      const toTaskOsColumnId = taskOsIdFromBusinessId(toColumnId, TASK_OS_COLUMN_PREFIX);
      if (!toTaskOsColumnId) return;
      patchLiveTaskInWorkspaces(taskId, { columnId: toColumnId, order: finalIdx });
      await Promise.all(
        columnTasks.map((task) => {
          const taskOsId = taskOsIdFromBusinessId(task._recordId, TASK_OS_TASK_PREFIX);
          if (!taskOsId) return Promise.resolve();
          return tasksPluginRequest<TasksPluginItem>(`/api/plugins/tasks/items/${taskOsId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              columnId: task._recordId === taskId ? toTaskOsColumnId : undefined,
              order: reorderMap.get(task._recordId) ?? task.order,
            }),
          });
        }),
      );
      await refreshTasksWorkspaces(selectedTaskWorkspaceId);
      return;
    }

    const now = new Date().toISOString();
    setCollection('tasks', tasks.map((t) => {
      if (t._recordId === taskId) return { ...taskToMove, columnId: toColumnId, order: reorderMap.get(taskId) ?? finalIdx, updatedAt: now };
      const newOrder = reorderMap.get(t._recordId);
      return newOrder !== undefined ? { ...t, order: newOrder } : t;
    }));
  }

  function addNote(title: string, body: string, tag: string, linkedTaskId = '', color = '') {
    if (!title.trim() && !body.trim()) return;
    const now = new Date().toISOString();
    const note: NotebookNote = {
      _recordId: nanoid(),
      title: title.trim() || 'Nota sin titulo',
      body: body.trim(),
      tag: tag.trim() || 'General',
      color,
      linkedTaskId,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
    setCollection('notes', [note, ...notes]);
  }

  function noteToTask(note: NotebookNote) {
    const targetColumn = selectedProjectColumns[0] ?? columns.find((c) => c.projectId === selectedProject?._recordId);
    if (!selectedProject || !targetColumn) return;
    createTask(targetColumn._recordId, note.title, '', note.body);
  }

  function updateDashboardWidget(id: string, patch: Partial<DashboardWidget>) {
    setCollection('dashboardWidgets', dashboardWidgets.map((widget) => (widget._recordId === id ? { ...widget, ...patch } : widget)));
  }

  function moveDashboardWidget(id: string, direction: -1 | 1) {
    const ordered = [...dashboardWidgets].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((widget) => widget._recordId === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    setCollection('dashboardWidgets', ordered.map((widget, order) => ({ ...widget, order })));
  }

  const reorderDashboardWidgets = useCallback((reordered: DashboardWidget[]) => {
    // reordered is the new visible order; merge back with full list preserving hidden
    const full = [...dashboardWidgets].sort((a, b) => a.order - b.order);
    const visibleIds = new Set(reordered.map(w => w._recordId));
    const newVisible = reordered.map((w, i) => ({ ...w, order: i }));
    const hidden = full.filter(w => !visibleIds.has(w._recordId)).map((w, i) => ({ ...w, order: reordered.length + i }));
    setCollection('dashboardWidgets', [...newVisible, ...hidden]);
  }, [dashboardWidgets, setCollection]);

  function handleQuickAdd(type: 'task' | 'note' | 'agenda', title: string, date = '') {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (type === 'note') {
      addNote(cleanTitle, '', 'Dashboard');
      return;
    }
    if (type === 'agenda') {
      setCollection('agenda', [...agenda, { _recordId: nanoid(), time: '09:00', task: cleanTitle, done: false }]);
      return;
    }
    const targetColumn = selectedProjectColumns[0] ?? columns.find((c) => c.projectId === selectedProject?._recordId);
    if (targetColumn) createTask(targetColumn._recordId, cleanTitle, date || todayKey());
  }

  function saveChecklistTemplates(items: ChecklistTemplate[]) {
    setCollection('checklistTemplates', items);
  }

  function createCanvas(title: string) {
    const cleanTitle = title.trim() || `Lienzo ${canvases.length + 1}`;
    const now = new Date().toISOString();
    const canvas: WhiteboardCanvas = { _recordId: nanoid(), title: cleanTitle, createdAt: now, updatedAt: now };
    setCollection('canvases', [...canvases, canvas]);
    setSelectedCanvasId(canvas._recordId);
  }

  function updateCanvas(id: string, patch: Partial<WhiteboardCanvas>) {
    const now = new Date().toISOString();
    setCollection('canvases', canvases.map((canvas) => (canvas._recordId === id ? { ...canvas, ...patch, updatedAt: now } : canvas)));
  }

  function deleteCanvas(id: string) {
    if (canvases.length <= 1) return;
    if (!confirm('Eliminar este lienzo tambien eliminara sus nodos y conexiones.')) return;
    const nextCanvases = canvases.filter((canvas) => canvas._recordId !== id);
    setCollections({
      canvases: nextCanvases,
      canvasNodes: canvasNodes.filter((node) => node.canvasId !== id),
      canvasEdges: canvasEdges.filter((edge) => edge.canvasId !== id),
    });
    setSelectedCanvasId(nextCanvases[0]?._recordId ?? 'canvas-main');
  }

  function createCanvasNode(type: WhiteboardNodeType, seed?: Partial<WhiteboardNode>) {
    const canvasId = selectedCanvasId || canvases[0]?._recordId || 'canvas-main';
    const labels: Record<WhiteboardNodeType, string> = {
      note: 'Nota',
      task: 'Tarea',
      link: 'Link',
      client: 'Cliente',
      project: 'Proyecto',
      canvas: 'Otro lienzo',
      drawing: 'Dibujo',
      custom: 'Bloque',
    };
    const node: WhiteboardNode = {
      _recordId: nanoid(),
      canvasId,
      type,
      title: seed?.title?.trim() || labels[type],
      body: seed?.body ?? '',
      url: seed?.url ?? '',
      refId: seed?.refId ?? '',
      x: seed?.x ?? 120 + (canvasNodes.filter((item) => item.canvasId === canvasId).length % 4) * 36,
      y: seed?.y ?? 120 + (canvasNodes.filter((item) => item.canvasId === canvasId).length % 6) * 42,
      width: seed?.width ?? 220,
      height: seed?.height ?? 120,
      color: seed?.color ?? (type === 'task' ? '#ec4899' : type === 'client' ? '#8b5cf6' : type === 'link' ? '#0ea5e9' : '#f43f5e'),
    };
    setCollection('canvasNodes', [...canvasNodes, node]);
  }

  function updateCanvasNode(id: string, patch: Partial<WhiteboardNode>) {
    setCollection('canvasNodes', canvasNodes.map((node) => (node._recordId === id ? { ...node, ...patch } : node)));
  }

  function deleteCanvasNode(id: string) {
    setCollections({
      canvasNodes: canvasNodes.filter((node) => node._recordId !== id),
      canvasEdges: canvasEdges.filter((edge) => edge.source !== id && edge.target !== id),
    });
  }

  function saveCanvasEdges(items: WhiteboardEdge[]) {
    setCollection('canvasEdges', items);
  }

  function buildCalendarDays() {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }

  const calendarItems = useMemo(() => {
    const grouped: Record<string, Array<{ id: string; title: string; type: string }>> = {};
    const add = (key: string, item: { id: string; title: string; type: string }) => {
      if (!key) return;
      grouped[key] = [...(grouped[key] ?? []), item];
    };
    tasks.forEach((task) => add(task.dueDate, { id: task._recordId, title: task.title, type: 'task' }));
    payments.filter((p) => !p.paid).forEach((p) => add(p.dueDate, { id: p._recordId, title: p.concept, type: 'payment' }));
    domains.filter((d) => !d.done).forEach((d) => add(d.dueDate, { id: d._recordId, title: d.domain, type: 'domain' }));
    return grouped;
  }, [tasks, payments, domains]);

  const commandTabs = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    const entries = TABS.filter((tab) => !query || tab.label.toLowerCase().includes(query) || tab.id.includes(query));
    return entries.length ? entries : TABS;
  }, [commandQuery]);

  useEffect(() => {
    setCommandIndex(0);
  }, [commandQuery]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCommandOpen(false);
        return;
      }
      if (event.key !== '/' || isTypingTarget(event.target)) return;
      if (!window.matchMedia('(min-width: 768px)').matches) return;
      event.preventDefault();
      setCommandQuery('');
      setCommandIndex(0);
      setCommandOpen(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="h-full min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  if (!loadSucceeded) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-black">No se pudieron cargar tus datos</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            {loadError || 'La aplicación detuvo la carga para proteger la información guardada.'}
          </p>
          <button
            type="button"
            onClick={retryLoad}
            className="mt-5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200"
          >
            Volver a intentar
          </button>
        </div>
      </div>
    );
  }

  const activeTabMeta = TABS.find((t) => t.id === activeTab);

  const tabContent = (
    <>
      {savingError && (
        <div className="mb-4 rounded-xl border border-red-200/70 bg-red-50/80 px-3 py-2 text-sm font-semibold text-red-700 backdrop-blur-xl">{savingError}</div>
      )}
      {activeTab === 'today' && (
        <TodayView
          agenda={agenda}
          tasks={tasks}
          columns={columns}
          payments={upcomingPayments}
          domains={upcomingDomains}
          notes={pinnedNotes}
          projects={projects}
          clients={clients}
          recentChats={recentChats}
          widgets={dashboardWidgets}
          onUpdateWidget={updateDashboardWidget}
          onMoveWidget={moveDashboardWidget}
          onReorderWidgets={reorderDashboardWidgets}
          onQuickAdd={handleQuickAdd}
          onToggleAgenda={(id) => setCollection('agenda', agenda.map((a) => (a._recordId === id ? { ...a, done: !a.done } : a)))}
          onOpenTask={setSelectedTaskId}
          onToggleTaskDone={(task) => {
            const doneColumn = columns.find((c) => c.projectId === task.projectId && c.title.toLowerCase().includes('hecho'));
            replaceTask(task._recordId, {
              status: task.status === 'done' ? 'open' : 'done',
              ...(task.status === 'done' || !doneColumn ? {} : { columnId: doneColumn._recordId }),
            });
          }}
          onSelectTab={setActiveTab}
        />
      )}
      {activeTab === 'board' && selectedProject && (
        <BoardView
          projects={workspaceProjects}
          selectedProject={selectedProject}
          columns={selectedProjectColumns}
          tasks={tasks}
          clients={clients}
          checklistTemplates={checklistTemplates}
          onSelectProject={setSelectedProjectId}
          onCreateProject={createProject}
          onDeleteProject={deleteProject}
          onUpdateProject={updateProject}
          onCreateColumn={createColumn}
          onRenameColumn={renameColumn}
          onDeleteColumn={deleteColumn}
          onReorderColumns={reorderColumns}
          onCreateTask={(columnId, title, options) => createTask(columnId, title, '', '', options)}
          onOpenTask={setSelectedTaskId}
          onChecklistTemplatesChange={saveChecklistTemplates}
          onBack={() => setActiveTab('today')}
          onOpenMenu={() => setLauncherOpen(true)}
          workspaces={tasksWorkspaces}
          selectedWorkspaceId={selectedTaskWorkspaceId}
          onSelectWorkspace={(id: any) => { if (id == null) setSelectedTaskWorkspaceId(null); else setSelectedTaskWorkspaceId(id); }}
          onCreateWorkspace={createTasksWorkspace}
          onRenameWorkspace={renameTasksWorkspace}
          onDeleteWorkspace={deleteTasksWorkspace}
          onReorderWorkspaces={reorderTasksWorkspaces}
          onReorderProjects={reorderProjects}
          backgroundStyle={{
            backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,241,247,0.05)), url("${activeBackground.url}")`,
            backgroundPosition: activeBackground.position ?? 'center',
            backgroundSize: 'cover',
          }}
          onMoveTask={moveTaskOnBoard}
        />
      )}
      {activeTab === 'calendar' && (
        <CalendarView
          month={calendarMonth}
          selectedDate={selectedCalendarDate}
          days={buildCalendarDays()}
          items={calendarItems}
          selectedItems={calendarItems[selectedCalendarDate] ?? []}
          onPrev={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
          onNext={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
          onSelectDate={setSelectedCalendarDate}
          onCreateTask={(title) => {
            const targetColumn = selectedProjectColumns[0] ?? columns.find((c) => c.projectId === selectedProject?._recordId);
            if (targetColumn) createTask(targetColumn._recordId, title, selectedCalendarDate);
          }}
          onOpenTask={setSelectedTaskId}
        />
      )}
      {activeTab === 'notes' && (
        <NotesView
          notes={notes}
          tasks={tasks}
          query={noteSearch}
          onQueryChange={setNoteSearch}
          onAddNote={addNote}
          onCreateNote={(note) => setCollection('notes', [note, ...notes])}
          onUpdateNote={(id, patch) => {
            const now = new Date().toISOString();
            setCollection('notes', notes.map((n) => (n._recordId === id ? { ...n, ...patch, updatedAt: now } : n)));
          }}
          onDeleteNote={(id) => setCollection('notes', notes.filter((n) => n._recordId !== id))}
          onNoteToTask={noteToTask}
        />
      )}
      {activeTab === 'videos' && (
        <VideosView
          videos={videos}
          query={videoSearch}
          selectedVideoId={selectedVideoId}
          onQueryChange={setVideoSearch}
          onSelectVideo={setSelectedVideoId}
          onAddVideo={(video) => setCollection('videos', [video, ...videos])}
          onUpdateVideo={(id, patch) => setCollection('videos', videos.map((v) => (v._recordId === id ? { ...v, ...patch } : v)))}
          onDeleteVideo={(id) => setCollection('videos', videos.filter((v) => v._recordId !== id))}
        />
      )}
      {activeTab === 'agenda' && (
        <AgendaView agenda={agenda} onChange={(items) => setCollection('agenda', items)} backgroundStyle={contentBackgroundStyle} />
      )}
      {activeTab === 'clients' && (
        <ClientsView
          clients={clients}
          onChange={(items) => setCollection('clients', items)}
          clientProducts={clientProducts}
          onProductsChange={(items) => setCollection('clientProducts', items)}
          backgroundStyle={contentBackgroundStyle}
          preferredMode={clientsPreferredMode}
          targetClientPhone={targetClientPhone}
        />
      )}
      {activeTab === 'sales' && (
        <SalesView
          sales={sales}
          payments={payments}
          domains={domains}
          clients={clients}
          onSalesChange={(items: any) => setCollection('sales', items)}
          onPaymentsChange={(items: any) => setCollection('payments', items)}
          onDomainsChange={(items: any) => setCollection('domains', items)}
        />
      )}
      {activeTab === 'links' && (
        <LinksView
          links={links}
          linkGroups={linkGroups}
          clients={clients}
          onLinksChange={(items: any) => setCollection('links', items)}
          onGroupsChange={(items: any) => setCollection('linkGroups', items)}
        />
      )}
      {activeTab === 'home' && (
        <ChecklistView
          title="Casa y hogar"
          placeholder="Tarea del hogar"
          items={home as any}
          textKey="task"
          onChange={(items) => setCollection('home', items as any)}
        />
      )}
      {activeTab === 'growth' && (
        <GrowthView growth={growth} onChange={(items) => setCollection('growth', items)} />
      )}
      {activeTab === 'whiteboard' && (
        <WhiteboardView
          canvases={canvases.length ? canvases : [makeDefaultCanvas()]}
          selectedCanvasId={selectedCanvasId}
          nodes={canvasNodes}
          edges={canvasEdges}
          tasks={tasks}
          projects={projects}
          clients={clients}
          onSelectCanvas={setSelectedCanvasId}
          onCreateCanvas={createCanvas}
          onUpdateCanvas={updateCanvas}
          onDeleteCanvas={deleteCanvas}
          onCreateNode={createCanvasNode}
          onUpdateNode={updateCanvasNode}
          onDeleteNode={deleteCanvasNode}
          onEdgesChange={saveCanvasEdges}
          onSelectTab={setActiveTab}
        />
      )}
    </>
  );

  // La ficha de tarea: se computa UNA vez acá (antes de la rama de tema, que
  // hace un `return` temprano) para poder mostrarla tanto en el tema clásico
  // como en el custom — es un `createPortal` a document.body, así que da lo
  // mismo desde qué árbol se monte.
  const taskModal = selectedTask && selectedTaskProject && (
    <BusinessWomanTaskModal
      task={selectedTask}
      project={selectedTaskProject}
      projects={projects}
      columns={columns}
      tasks={tasks}
      workspaces={tasksWorkspaces}
      clients={clients}
      onClose={() => setSelectedTaskId('')}
      onSave={(patch) => replaceTask(selectedTask._recordId, patch)}
      onDelete={async () => {
        if (!confirm('¿Eliminar esta tarea?')) return;
        await deleteTask(selectedTask._recordId);
        setSelectedTaskId('');
      }}
      onOpenTask={setSelectedTaskId}
      onOpenProject={(projectId) => {
        setSelectedProjectId(projectId);
        setActiveTab('board');
      }}
      onSelectWorkspace={(workspaceId) => setSelectedTaskWorkspaceId(workspaceId)}
      onRefresh={() => {
        refreshTasksWorkspaces(selectedTaskWorkspaceId).catch(() => {});
      }}
    />
  );

  // ── Tema "custom" ─────────────────────────────────────────────────────
  // El tema clásico de acá abajo NO CAMBIA ni una línea. Si el equipo activó
  // el modo custom (por MCP o desde el interruptor de abajo) y ya tiene una
  // definición, el menú/las vistas nuevas las arma un conector — pero las 12
  // vistas clásicas (`tabContent`, recién armado arriba) se siguen
  // reutilizando tal cual, con los mismos datos y los mismos mutadores.
  if (businessThemeMode === 'custom' && businessThemeDefinition) {
    return (
      <BusinessThemeShell
        definition={businessThemeDefinition}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        tabContent={tabContent}
        data={{ agenda, clients, sales, payments, domains, links, notes, videos, growth, home }}
        onMutate={(collection, items) => setCollection(collection, items)}
        appRef={appRef}
        backgroundStyle={contentBackgroundStyle}
        onSwitchToClassic={() => switchBusinessThemeMode('default')}
        overlay={taskModal}
        boardContext={{
          projects,
          columns,
          tasks,
          clients,
          onCreateTask: (columnId, title) => createTask(columnId, title, '', '', { openTask: false }),
          onMoveTask: moveTaskOnBoard,
          onOpenTask: setSelectedTaskId,
        }}
      />
    );
  }

  return (
    <div ref={appRef} className="flex h-full min-h-screen flex-col text-zinc-950">
      <BusinessWomanScopedStyles />

      {/* ══════════════════════════════════════════
          COLUMNA PRINCIPAL
      ══════════════════════════════════════════ */}
      <div className="bw-content flex flex-1 flex-col min-h-0 md:min-h-screen overflow-hidden bg-slate-950" style={contentBackgroundStyle}>

        {/* ── MOBILE HEADER ── */}
        {activeTab !== 'board' && <header className="shrink-0 overflow-visible md:hidden">
          <div className="border-b border-white/20 bg-white/15 px-4 shadow-[0_12px_40px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
            {/* Top row: brand + actions */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-600 shadow-lg ring-2 ring-white/30">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-white/60 leading-none mb-0.5">Mi espacio</p>
                  <p className="text-[15px] font-black leading-none text-white">Business Woman</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {overdueTasks.length > 0 && (
                  <span className="flex h-7 items-center gap-1 rounded-full bg-red-400/90 px-2 text-[10px] font-bold text-white">
                    ⚠️ {overdueTasks.length}
                  </span>
                )}
                <span className="flex h-7 items-center rounded-full bg-white/20 px-2.5 text-[10px] font-bold text-white">
                  {progressPct}%
                </span>
                <BackgroundSelector
                  settings={backgroundSettings}
                  activeBackground={activeBackground}
                  currentDaypart={currentDaypart}
                  compact
                  onChange={updateBackgroundSettings}
                />
                <button
                  onClick={() => setLauncherOpen(true)}
                  className="hidden h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition hover:bg-white/30 active:scale-95"
                  aria-label="Abrir menú"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white transition hover:bg-white/30 active:scale-95"
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {/* Bottom row: active tab pill + today count */}
            <div className="flex items-center gap-2 pb-3">
              <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
                <span className="text-sm leading-none">{activeTabMeta?.emoji}</span>
                <span className="text-[11px] font-bold leading-none text-white">{activeTabMeta?.label}</span>
              </div>
              {todayTasks.length > 0 && (
                <div className="flex items-center rounded-full bg-white/10 px-2.5 py-1">
                  <span className="text-[10px] font-semibold text-white/70">{todayTasks.length} hoy</span>
                </div>
              )}
              {savingError && (
                <div className="flex items-center rounded-full bg-red-500/60 px-2.5 py-1">
                  <span className="text-[10px] font-semibold text-white">Error al guardar</span>
                </div>
              )}
            </div>
          </div>
        </header>}

        {/* ── DESKTOP TOP BAR ── */}
        {activeTab !== 'board' && <div className="hidden md:flex shrink-0 items-center justify-between border-b border-white/45 bg-white/88 px-6 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-600 shadow-lg ring-2 ring-white/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="text-xl font-black text-zinc-900">
                {activeTabMeta?.emoji} {activeTabMeta?.label}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {overdueTasks.length > 0 && (
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600">
                ⚠️ {overdueTasks.length} vencidas
              </span>
            )}
            <span className="rounded-full border border-pink-100 bg-pink-50 px-3 py-1.5 text-xs font-bold text-rose-600">
              {progressPct}% completado
            </span>
            <span className="rounded-full border border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-600">
              {todayTasks.length} tareas hoy
            </span>
            <BackgroundSelector
              settings={backgroundSettings}
              activeBackground={activeBackground}
              currentDaypart={currentDaypart}
              onChange={updateBackgroundSettings}
            />
            <button onClick={exportData} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-zinc-700 transition hover:bg-white/40" title="Exportar datos">
              <Send className="h-4 w-4" />
            </button>
            <a href="/dashboard" className="flex h-8 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-xs font-bold text-white transition hover:bg-[#20BA5A]">
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          </div>
        </div>}

        {/* ── DESKTOP TAB NAV ── */}
        {/* Desktop Tab Nav - Professional feminine style with pink/rose accents */}
        {activeTab !== 'board' && <div className="hidden md:flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/20 bg-white/5 px-3 py-2 backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-2xl px-4 py-2 text-sm font-semibold transition-all active:scale-[0.985] ${active ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>}

        {/* ── CONTENT ── */}
        <main className={`relative flex-1 ${activeTab === 'board' ? 'min-h-0 overflow-hidden' : 'overflow-y-auto'}`}>
          {activeTab !== 'board' && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/12 via-transparent to-rose-950/12" />}
          <div className={activeTab === 'board' ? 'relative h-full min-h-0' : 'relative min-h-full p-4 pb-16 md:pb-6 md:p-6'}>
            {tabContent}
          </div>
        </main>

        {/* ── MOBILE BOTTOM NAV (primary tabs) ── */}
        {activeTab !== 'board' && <nav className="md:hidden shrink-0 border-t border-white/15 bg-zinc-950/90 backdrop-blur-xl px-1 py-1 z-30">
          <div className="grid grid-cols-4">
            {PRIMARY_MOBILE_TABS.map((tabId) => {
              const tab = TABS.find((t) => t.id === tabId)!;
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    if (tab.id === 'clients') setClientsPreferredMode('local');
                  }}
                  className={`flex flex-col items-center gap-0.5 rounded-2xl py-1.5 active:scale-95 transition ${active ? 'text-white' : 'text-white/65'}`}
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${active ? 'bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-500 shadow-md ring-1 ring-white/30' : 'bg-white/10'}`}>
                    <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-white/80'}`} />
                  </div>
                  <span className={`text-[10px] font-bold ${active ? 'text-white' : 'text-white/70'}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>}
      </div>

      {activeTab !== 'board' && <button
        type="button"
        onClick={() => setLauncherOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-16 w-16 items-center justify-center rounded-[24px] bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-600 text-white shadow-[0_18px_45px_rgba(219,39,119,0.38)] ring-4 ring-white/40 transition hover:scale-[1.03] active:scale-95"
        aria-label="Abrir launcher Business Woman"
      >
        <LayoutGrid className="h-7 w-7" />
      </button>}

      {launcherOpen && (
        <div className="bw-content fixed inset-0 z-50" style={contentBackgroundStyle}>
          <button
            type="button"
            onClick={() => setLauncherOpen(false)}
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
            aria-label="Cerrar menú"
          />
          <div className="absolute inset-x-3 bottom-3 max-h-[min(760px,calc(100dvh-24px))] overflow-y-auto rounded-[32px] border border-white/25 bg-zinc-950/90 px-4 pb-5 pt-4 text-white shadow-[0_28px_80px_rgba(15,23,42,0.42)] backdrop-blur-2xl md:left-auto md:right-6 md:w-[520px]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-600 shadow-lg ring-2 ring-white/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">Menú rápido</p>
                  <p className="truncate text-base font-black text-white">Business Woman</p>
                </div>
              </div>
              <button
                onClick={() => setLauncherOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 text-white active:bg-white/20"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                href="/dashboard"
                className="flex items-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white shadow-lg active:scale-[0.98]"
              >
                <MessageCircle className="h-4 w-4" />
                Escritorio
              </a>
              <button
                onClick={() => {
                  setActiveTab('clients');
                  setClientsPreferredMode('crm');
                  setLauncherOpen(false);
                }}
                className="flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-sm font-bold text-white active:bg-white/20"
              >
                <LayoutGrid className="h-4 w-4" />
                CRM
              </button>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-white/45">Secciones</p>
              <div className="grid grid-cols-3 gap-2">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        if (tab.id === 'clients') setClientsPreferredMode('local');
                        setLauncherOpen(false);
                      }}
                      className={`flex flex-col items-center gap-2 rounded-3xl px-2 py-4 transition-all active:scale-95 ${active ? 'bg-white/28 shadow-xl' : 'bg-white/12 hover:bg-white/18'}`}
                    >
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${active ? 'bg-white' : 'bg-white/18'}`}>
                        <Icon className={`h-6 w-6 ${active ? 'text-rose-500' : 'text-white'}`} />
                      </div>
                      <span className="text-[11px] font-bold leading-tight text-center text-white">{tab.label}</span>
                      {active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-white/12 bg-white/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">Tasks OS en vivo</p>
                  <p className="mt-1 text-xs font-medium text-white/58">
                    Proyectos, workspaces, etapas y tareas se leen y editan directamente en Tasks OS.
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${usingTasksOsLive ? 'bg-emerald-400/16 text-emerald-100' : 'bg-amber-400/16 text-amber-100'}`}>
                  {usingTasksOsLive ? 'En vivo' : 'No conectado'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className={`rounded-full px-2.5 py-1 ${tasksPluginAvailable ? 'bg-emerald-400/16 text-emerald-100' : 'bg-amber-400/16 text-amber-100'}`}>
                  {tasksPluginAvailable ? 'Tasks OS activo' : 'Tasks OS no activo'}
                </span>
                {syncMessage && <span className="rounded-full bg-pink-400/16 px-2.5 py-1 text-pink-100">{syncMessage}</span>}
              </div>
              <button
                type="button"
                disabled={!tasksPluginAvailable || syncingTasks}
                onClick={() => {
                  setSyncingTasks(true);
                  refreshTasksWorkspaces(selectedTaskWorkspaceId)
                    .then(() => setSyncMessage('Datos recargados desde Tasks OS'))
                    .catch(() => setSyncMessage('No se pudo recargar Tasks OS'))
                    .finally(() => {
                      setSyncingTasks(false);
                      window.setTimeout(() => setSyncMessage(''), 3200);
                    });
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/14 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RefreshCw className={`h-4 w-4 ${syncingTasks ? 'animate-spin' : ''}`} />
                Recargar datos
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  exportData();
                  setLauncherOpen(false);
                }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-white/14 px-4 py-3 text-sm font-semibold text-white active:bg-white/20"
              >
                <Send className="h-4 w-4" />
                Exportar
              </button>
              <button
                onClick={() => {
                  toggleFullscreen();
                  setLauncherOpen(false);
                }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-white/14 px-4 py-3 text-sm font-semibold text-white active:bg-white/20"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                {isFullscreen ? 'Salir' : 'Fullscreen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {commandOpen && (
        <div className="bw-content fixed inset-0 z-50 hidden items-start justify-center bg-zinc-950/35 px-4 pt-[12vh] backdrop-blur-sm md:flex">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Cerrar busqueda"
            onClick={() => setCommandOpen(false)}
          />
          <div className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-white/45 bg-white/88 shadow-[0_28px_90px_rgba(15,23,42,0.28)] backdrop-blur-2xl">
            <div className="flex items-center gap-3 border-b border-pink-100/80 px-4 py-3">
              <Search className="h-5 w-5 text-rose-500" />
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setCommandIndex((index) => Math.min(index + 1, commandTabs.length - 1));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setCommandIndex((index) => Math.max(index - 1, 0));
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    const tab = commandTabs[commandIndex];
                    if (!tab) return;
                    setActiveTab(tab.id);
                    if (tab.id === 'clients') setClientsPreferredMode('local');
                    setCommandOpen(false);
                  }
                }}
                placeholder="Buscar en Business Woman..."
                className="h-11 flex-1 border-0 bg-transparent text-base font-bold text-zinc-900 placeholder:text-zinc-400 focus:ring-0"
              />
              <span className="rounded-full border border-pink-100 bg-pink-50 px-2.5 py-1 text-[11px] font-black text-rose-500">/</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {commandTabs.map((tab, index) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                const selected = commandIndex === index;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onMouseEnter={() => setCommandIndex(index)}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id === 'clients') setClientsPreferredMode('local');
                      setCommandOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${selected ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-200/50' : 'text-zinc-700 hover:bg-pink-50'} `}
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${selected ? 'bg-white/20' : 'bg-pink-50 text-rose-500'}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-black">{tab.label}</span>
                      <span className={`block text-xs font-semibold ${selected ? 'text-white/70' : 'text-zinc-400'}`}>
                        {active ? 'Seccion actual' : 'Abrir seccion'}
                      </span>
                    </span>
                    {active && <Check className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {taskModal}
    </div>
  );
}

function BusinessWomanTaskModal({
  task,
  project,
  projects,
  columns,
  tasks,
  workspaces,
  clients,
  onClose,
  onSave,
  onDelete,
  onOpenTask,
  onOpenProject,
  onSelectWorkspace,
  onRefresh,
}: {
  task: BusinessTask;
  project: BusinessProject;
  projects: BusinessProject[];
  columns: BusinessColumn[];
  tasks: BusinessTask[];
  workspaces: TasksWorkspace[];
  clients: ClientItem[];
  onClose: () => void;
  onSave: (patch: Partial<BusinessTask>) => Promise<void>;
  onDelete: () => Promise<void>;
  onOpenTask: (taskId: string) => void;
  onOpenProject: (projectId: string) => void;
  onSelectWorkspace: (workspaceId: number | null) => void;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [tagIds, setTagIds] = useState<string[]>(task.tagIds);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [startDate, setStartDate] = useState(task.startDate ?? '');
  const [endDate, setEndDate] = useState(task.endDate ?? '');
  const [status, setStatus] = useState(task.status ?? 'open');
  const [columnId, setColumnId] = useState(task.columnId);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [details, setDetails] = useState<TasksPluginDetails | null>(null);
  const [comments, setComments] = useState<TasksPluginComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [relationTaskId, setRelationTaskId] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const lastSavedRef = useRef('');
  const saveTimerRef = useRef<number | null>(null);

  const taskOsId = taskOsIdFromBusinessId(task._recordId, TASK_OS_TASK_PREFIX);
  const activeProject = projects.find((item) => item._recordId === (columns.find((column) => column._recordId === columnId)?.projectId ?? project._recordId)) ?? project;
  const activeColumns = columns.filter((column) => column.projectId === activeProject._recordId).sort((a, b) => a.order - b.order);
  const selectedClient = task.clientId ? clients.find((client) => client._recordId === task.clientId) : null;
  const done = checklist.filter((item) => item.completed).length;
  const relationCount = (details?.relations.length ?? 0) + (details?.dependencies.length ?? 0) + (details?.dependents.length ?? 0) + (details?.locations.length ?? 0) + (task.parentTaskId ? 1 : 0);

  const buildPatch = useCallback((): Partial<BusinessTask> => ({
    title: title.trim() || task.title,
    notes,
    tagIds,
    checklist,
    dueDate,
    startDate,
    endDate,
    status,
    columnId,
  }), [checklist, columnId, dueDate, endDate, notes, startDate, status, tagIds, task.title, title]);

  const loadDetails = useCallback(async () => {
    if (!taskOsId) return;
    setDetailsLoading(true);
    try {
      const [detailsResponse, commentsResponse] = await Promise.all([
        fetch(`/api/plugins/tasks/items/${taskOsId}/details`, { cache: 'no-store' }),
        fetch(`/api/plugins/tasks/items/${taskOsId}/comments`, { cache: 'no-store' }),
      ]);
      if (detailsResponse.ok) setDetails(await detailsResponse.json());
      if (commentsResponse.ok) setComments(await commentsResponse.json());
    } finally {
      setDetailsLoading(false);
    }
  }, [taskOsId]);

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes);
    setTagIds(task.tagIds);
    setChecklist(task.checklist);
    setDueDate(task.dueDate ?? '');
    setStartDate(task.startDate ?? '');
    setEndDate(task.endDate ?? '');
    setStatus(task.status ?? 'open');
    setColumnId(task.columnId);
    lastSavedRef.current = JSON.stringify({
      title: task.title,
      notes: task.notes,
      tagIds: task.tagIds,
      checklist: task.checklist,
      dueDate: task.dueDate ?? '',
      startDate: task.startDate ?? '',
      endDate: task.endDate ?? '',
      status: task.status ?? 'open',
      columnId: task.columnId,
    });
    void loadDetails();
  }, [loadDetails, task]);

  const patchSignature = useMemo(() => JSON.stringify(buildPatch()), [buildPatch]);

  useEffect(() => {
    if (patchSignature === lastSavedRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      setSaving(true);
      try {
        const patch = buildPatch();
        await onSave(patch);
        lastSavedRef.current = JSON.stringify(patch);
      } finally {
        setSaving(false);
      }
    }, 550);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [buildPatch, onSave, patchSignature]);

  const saveNow = async () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const patch = buildPatch();
    if (JSON.stringify(patch) === lastSavedRef.current) return;
    setSaving(true);
    try {
      await onSave(patch);
      lastSavedRef.current = JSON.stringify(patch);
    } finally {
      setSaving(false);
    }
  };

  const addChecklistItem = () => {
    const text = newCheckItem.trim();
    if (!text) return;
    setChecklist((items) => [...items, { id: nanoid(), text, completed: false }]);
    setNewCheckItem('');
  };

  const toggleChecklistItem = (id: string) => {
    setChecklist((items) => {
      const next = items.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item));
      if (next.length > 0 && next.every((item) => item.completed)) setStatus('done');
      if (next.some((item) => !item.completed) && status === 'done') setStatus('open');
      return next;
    });
  };

  const sendComment = async () => {
    if (!taskOsId || !commentText.trim()) return;
    const response = await fetch(`/api/plugins/tasks/items/${taskOsId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: commentText.trim() }),
    });
    if (response.ok) {
      setCommentText('');
      await loadDetails();
      onRefresh();
    }
  };

  const deleteComment = async (commentId: number) => {
    if (!taskOsId) return;
    const response = await fetch(`/api/plugins/tasks/items/${taskOsId}/comments/${commentId}`, { method: 'DELETE' });
    if (response.ok) {
      await loadDetails();
      onRefresh();
    }
  };

  const addRelatedTask = async () => {
    if (!taskOsId || !relationTaskId) return;
    const targetId = taskOsIdFromBusinessId(relationTaskId, TASK_OS_TASK_PREFIX);
    if (!targetId || targetId === taskOsId) return;
    const response = await fetch('/api/plugins/tasks/relations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceType: 'task', sourceId: taskOsId, targetType: 'task', targetId, relationType: 'related' }),
    });
    if (response.ok) {
      setRelationTaskId('');
      await loadDetails();
    }
  };

  const removeRelation = async (relationId: number) => {
    const response = await fetch(`/api/plugins/tasks/relations/${relationId}`, { method: 'DELETE' });
    if (response.ok) await loadDetails();
  };

  const removeDependency = async (dependencyId: number) => {
    const response = await fetch(`/api/plugins/tasks/dependencies/${dependencyId}`, { method: 'DELETE' });
    if (response.ok) await loadDetails();
  };

  const navigateRelation = async (type: string, id: number) => {
    await saveNow();
    if (type === 'task') {
      const businessId = taskOsBusinessId(TASK_OS_TASK_PREFIX, id);
      if (tasks.some((item) => item._recordId === businessId)) onOpenTask(businessId);
      return;
    }
    if (type === 'project') {
      const businessId = taskOsBusinessId(TASK_OS_PROJECT_PREFIX, id);
      if (projects.some((item) => item._recordId === businessId)) {
        onOpenProject(businessId);
        onClose();
      }
      return;
    }
    if (type === 'workspace') {
      onSelectWorkspace(id);
      onClose();
    }
  };

  const relationLabel = (type: string, id: number) => {
    if (type === 'task') return tasks.find((item) => item._recordId === taskOsBusinessId(TASK_OS_TASK_PREFIX, id))?.title ?? `Tarea #${id}`;
    if (type === 'project') return projects.find((item) => item._recordId === taskOsBusinessId(TASK_OS_PROJECT_PREFIX, id))?.name ?? `Proyecto #${id}`;
    if (type === 'workspace') return workspaces.find((item) => item.id === id)?.name ?? `Espacio de trabajo #${id}`;
    if (type === 'contact') return `Contacto #${id}`;
    return `${type} #${id}`;
  };

  const projectOptions = [...projects].sort((a, b) => a.order - b.order);
  const peerRelations = details?.relations.map((relation) => {
    const sourceIsCurrent = relation.sourceType === 'task' && relation.sourceId === taskOsId;
    return {
      relation,
      peerType: sourceIsCurrent ? relation.targetType : relation.sourceType,
      peerId: sourceIsCurrent ? relation.targetId : relation.sourceId,
    };
  }) ?? [];

  return (
    <div className="bw-content fixed inset-0 z-[90] flex items-end justify-center bg-zinc-950/50 p-0 backdrop-blur-md sm:items-center sm:p-4" onClick={(event) => event.target === event.currentTarget && void saveNow().then(onClose)}>
      <div className="flex h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[28px] border border-white/60 bg-white/92 text-zinc-950 shadow-[0_30px_90px_rgba(15,23,42,0.30)] backdrop-blur-2xl sm:h-[86vh] sm:rounded-[32px]">
        <header className="flex shrink-0 items-center gap-2 border-b border-pink-100/80 bg-white/70 px-4 py-3">
          <button
            type="button"
            onClick={() => setStatus(status === 'done' ? 'open' : 'done')}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition ${status === 'done' ? 'bg-emerald-500 text-white' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'}`}
            title={status === 'done' ? 'Reabrir tarea' : 'Marcar completa'}
          >
            <CheckCircle2 className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full border-0 bg-transparent text-lg font-black text-zinc-950 shadow-none outline-none sm:text-2xl"
              placeholder="Tarea sin titulo"
            />
            <p className="truncate text-xs font-semibold text-zinc-500">{project.name} · {activeColumns.find((column) => column._recordId === columnId)?.title ?? 'Etapa'}</p>
          </div>
          <span className="hidden rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-black text-rose-500 sm:inline">
            {saving ? 'Guardando...' : 'Sincronizado'}
          </span>
          <button type="button" onClick={() => void onDelete()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-red-500 hover:bg-red-50" title="Eliminar tarea">
            <Trash2 className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => void saveNow().then(onClose)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-zinc-500 hover:bg-zinc-100" title="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="min-h-0 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
            {task.coverUrl && (
              <div className="overflow-hidden rounded-3xl border border-white/70 bg-rose-50">
                <img src={task.coverUrl} alt="" className="max-h-56 w-full object-cover" />
              </div>
            )}

            <section className="rounded-3xl border border-white/70 bg-white/76 p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Contenido</p>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${status === 'done' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {status === 'done' ? 'Completa' : 'Abierta'}
                </span>
              </div>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={8}
                placeholder="Notas, contexto, links o decisiones..."
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm leading-relaxed text-zinc-800"
              />
            </section>

            <section className="rounded-3xl border border-white/70 bg-white/76 p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Checklist</p>
                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-black text-zinc-500">{done}/{checklist.length}</span>
              </div>
              <div className="space-y-1.5">
                {checklist.map((item) => (
                  <div key={item.id} className="group flex items-start gap-2 rounded-2xl px-2 py-2 hover:bg-rose-50/70">
                    <button type="button" onClick={() => toggleChecklistItem(item.id)} className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border ${item.completed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-300 bg-white text-transparent'}`}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <span className={`min-w-0 flex-1 text-sm font-semibold ${item.completed ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>{item.text}</span>
                    <button type="button" onClick={() => setChecklist((items) => items.filter((entry) => entry.id !== item.id))} className="rounded-lg p-1 text-zinc-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {!checklist.length && <p className="rounded-2xl border border-dashed border-zinc-200 px-3 py-5 text-center text-sm font-semibold text-zinc-400">Sin checklist todavía.</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={newCheckItem}
                  onChange={(event) => setNewCheckItem(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addChecklistItem();
                    }
                  }}
                  placeholder="Nuevo paso..."
                  className="min-w-0 flex-1 rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                />
                <button type="button" onClick={addChecklistItem} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500 text-white">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </section>

            <section className="grid gap-3 rounded-3xl border border-white/70 bg-white/76 p-4 shadow-sm sm:grid-cols-3">
              <label className="text-xs font-black uppercase tracking-wide text-zinc-500">Inicio
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-black uppercase tracking-wide text-zinc-500">Fin
                <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setDueDate(event.target.value); }} className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-black uppercase tracking-wide text-zinc-500">Vencimiento
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm" />
              </label>
            </section>

            <section className="rounded-3xl border border-white/70 bg-white/76 p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-rose-500" />
                <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Comentarios</p>
              </div>
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="group flex gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-sm font-semibold text-zinc-800">{comment.text}</p>
                      <p className="mt-1 text-[10px] font-bold text-zinc-400">{new Date(comment.createdAt).toLocaleString('es-ES')}</p>
                    </div>
                    <button type="button" onClick={() => void deleteComment(comment.id)} className="self-start rounded-lg p-1 text-zinc-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {!comments.length && <p className="rounded-2xl border border-dashed border-zinc-200 px-3 py-5 text-center text-sm font-semibold text-zinc-400">Sin comentarios.</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={commentText} onChange={(event) => setCommentText(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void sendComment()} placeholder="Escribe un comentario..." className="min-w-0 flex-1 rounded-2xl border border-zinc-200 px-3 py-2 text-sm" />
                <button type="button" onClick={() => void sendComment()} disabled={!commentText.trim()} className="rounded-2xl bg-zinc-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40">Enviar</button>
              </div>
            </section>
          </main>

          <aside className="min-h-0 overflow-y-auto border-t border-pink-100/80 bg-white/74 p-4 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <section className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-zinc-500">Información</p>
                <div className="space-y-3">
                  <label className="block text-xs font-black uppercase tracking-wide text-zinc-500">Proyecto
                    <select
                      value={activeProject._recordId}
                      onChange={(event) => {
                        const targetProject = projects.find((item) => item._recordId === event.target.value);
                        const firstColumn = columns.find((column) => column.projectId === event.target.value);
                        if (!targetProject || !firstColumn) return;
                        setColumnId(firstColumn._recordId);
                        onOpenProject(targetProject._recordId);
                      }}
                      className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm"
                    >
                      {projectOptions.map((item) => <option key={item._recordId} value={item._recordId}>{item.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-black uppercase tracking-wide text-zinc-500">Etapa
                    <select value={columnId} onChange={(event) => setColumnId(event.target.value)} className="mt-1 w-full rounded-2xl border border-zinc-200 px-3 py-2 text-sm">
                      {activeColumns.map((column) => <option key={column._recordId} value={column._recordId}>{column.title}</option>)}
                    </select>
                  </label>
                  {selectedClient && (
                    <div className="rounded-2xl bg-rose-50 px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-wide text-rose-500">Cliente</p>
                      <p className="truncate text-sm font-black text-zinc-900">{selectedClient.name}</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-zinc-500">Etiquetas</p>
                <div className="flex flex-wrap gap-2">
                  {activeProject.tags.map((tag) => {
                    const active = tagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setTagIds((ids) => (ids.includes(tag.id) ? ids.filter((id) => id !== tag.id) : [...ids, tag.id]))}
                        className={`rounded-full border px-3 py-1 text-xs font-black transition ${active ? 'border-transparent text-white' : 'border-zinc-200 bg-white text-zinc-500 hover:border-rose-200'}`}
                        style={active ? { backgroundColor: tag.color } : undefined}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                  {!activeProject.tags.length && <p className="text-sm font-semibold text-zinc-400">Sin etiquetas configuradas.</p>}
                </div>
              </section>

              <section className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Relaciones</p>
                  <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[10px] font-black text-rose-500">{relationCount}</span>
                </div>
                {detailsLoading && <p className="text-sm font-semibold text-zinc-400">Cargando relaciones...</p>}
                <div className="space-y-2">
                  {peerRelations.map(({ relation, peerType, peerId }) => (
                    <div key={relation.id} className="group flex items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                      <button type="button" onClick={() => void navigateRelation(peerType, peerId)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-black text-zinc-800">{relationLabel(peerType, peerId)}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{peerType} · {relation.relationType}</p>
                      </button>
                      <button type="button" onClick={() => void removeRelation(relation.id)} className="rounded-lg p-1 text-zinc-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {details?.dependencies.map((dependency) => (
                    <div key={`dep-${dependency.id}`} className="group flex items-center gap-2 rounded-2xl bg-orange-50 px-3 py-2">
                      <button type="button" onClick={() => void navigateRelation('task', dependency.dependsOnTaskId)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-black text-zinc-800">{relationLabel('task', dependency.dependsOnTaskId)}</p>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-orange-500">Depende de</p>
                      </button>
                      <button type="button" onClick={() => void removeDependency(dependency.id)} className="rounded-lg p-1 text-orange-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {details?.dependents.map((dependency) => (
                    <button key={`blocked-${dependency.id}`} type="button" onClick={() => void navigateRelation('task', dependency.taskId)} className="w-full rounded-2xl bg-pink-50 px-3 py-2 text-left">
                      <p className="truncate text-sm font-black text-zinc-800">{relationLabel('task', dependency.taskId)}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-rose-500">Depende de esta tarea</p>
                    </button>
                  ))}
                  {peerRelations.length === 0 && !details?.dependencies.length && !details?.dependents.length && <p className="rounded-2xl border border-dashed border-zinc-200 px-3 py-5 text-center text-sm font-semibold text-zinc-400">Sin relaciones.</p>}
                </div>
                <div className="mt-3 flex gap-2">
                  <select value={relationTaskId} onChange={(event) => setRelationTaskId(event.target.value)} className="min-w-0 flex-1 rounded-2xl border border-zinc-200 px-3 py-2 text-sm">
                    <option value="">Vincular tarea...</option>
                    {tasks.filter((item) => item._recordId !== task._recordId).map((item) => <option key={item._recordId} value={item._recordId}>{item.title}</option>)}
                  </select>
                  <button type="button" onClick={() => void addRelatedTask()} disabled={!relationTaskId} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-500 text-white disabled:opacity-40">
                    <LinkIcon className="h-4 w-4" />
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-rose-500" />
                  <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Archivos</p>
                </div>
                <div className="space-y-2">
                  {details?.media.map((item) => (
                    <a key={String(item.id)} href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2 text-sm font-bold text-zinc-700 hover:bg-rose-50">
                      <Paperclip className="h-4 w-4 shrink-0 text-rose-400" />
                      <span className="min-w-0 flex-1 truncate">{item.fileName}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ))}
                  {!details?.media.length && <p className="rounded-2xl border border-dashed border-zinc-200 px-3 py-5 text-center text-sm font-semibold text-zinc-400">Sin archivos adjuntos.</p>}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function BackgroundSelector({
  settings,
  activeBackground,
  currentDaypart,
  compact = false,
  onChange,
}: {
  settings: BackgroundSettings;
  activeBackground: BackgroundPreset;
  currentDaypart: Daypart;
  compact?: boolean;
  onChange: (patch: Partial<BackgroundSettings>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState(settings.customUrl);
  const DaypartIcon = currentDaypart === 'noche' || currentDaypart === 'madrugada' ? Moon : Sun;

  useEffect(() => setCustomUrl(settings.customUrl), [settings.customUrl]);

  function selectPreset(id: string) {
    onChange({ mode: 'manual', selectedBackgroundId: id });
  }

  function applyCustomUrl() {
    const trimmed = customUrl.trim();
    if (!trimmed) return;
    onChange({ mode: 'manual', selectedBackgroundId: 'custom', customUrl: trimmed });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Cambiar fondo"
        className={`inline-flex items-center justify-center gap-2 rounded-xl border text-sm font-bold shadow-sm backdrop-blur-xl transition ${compact ? 'h-8 w-8 border-white/35 bg-white/25 px-0 text-white hover:bg-white/35' : 'border-white/60 bg-white/70 px-3 py-2 text-zinc-800 hover:bg-white/85'}`}
      >
        <Palette className="h-4 w-4" />
        {!compact && <span>Fondo</span>}
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[min(92vw,500px)] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-white/45 bg-white text-zinc-900 shadow-[0_28px_90px_rgba(15,23,42,0.4)]">
          <div className="border-b border-white/50 bg-white/45 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black">Fondos inspiradores</p>
                <p className="text-xs font-medium text-zinc-500">Imagenes libres de uso de Pexels.</p>
              </div>
              <a
                href="https://www.pexels.com/license/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-white/60 bg-white/55 px-2 py-1 text-[11px] font-bold text-zinc-600 hover:bg-white"
              >
                Licencia
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-white/45 p-1">
              <button
                type="button"
                onClick={() => onChange({ mode: 'manual' })}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition ${settings.mode === 'manual' ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-white/70'}`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Manual
              </button>
              <button
                type="button"
                onClick={() => onChange({ mode: 'daypart' })}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition ${settings.mode === 'daypart' ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-white/70'}`}
              >
                <Clock3 className="h-3.5 w-3.5" />
                Por horario
              </button>
            </div>
          </div>

          <div className="max-h-[68vh] overflow-y-auto p-4">
            <div className="mb-3 flex items-center justify-between rounded-xl border border-white/55 bg-white/55 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-zinc-900">{activeBackground.label}</p>
                <p className="truncate text-[11px] font-medium text-zinc-500">{activeBackground.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-600">
                <DaypartIcon className="h-3 w-3" />
                {DAYPART_LABELS[currentDaypart]}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {BACKGROUND_PRESETS.map((preset) => {
                const active = settings.mode === 'manual'
                  ? settings.selectedBackgroundId === preset.id
                  : preset.daypart === currentDaypart;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectPreset(preset.id)}
                    className={`group overflow-hidden rounded-xl border text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${active ? 'border-rose-400 ring-2 ring-rose-300/60' : 'border-white/55'}`}
                  >
                    <div
                      className="relative h-24 bg-cover bg-center"
                      style={{ backgroundImage: `linear-gradient(0deg, rgba(15,23,42,0.28), rgba(15,23,42,0.08)), url("${preset.url}")` }}
                    >
                      {preset.daypart && (
                        <span className="absolute left-2 top-2 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-zinc-700 backdrop-blur">
                          {DAYPART_LABELS[preset.daypart]}
                        </span>
                      )}
                    </div>
                    <div className="bg-white/78 px-3 py-2 backdrop-blur">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-black text-zinc-900">{preset.label}</p>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-rose-500" />}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-snug text-zinc-500">{preset.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-white/55 bg-white/55 p-3">
              <label className="text-xs font-black uppercase text-zinc-500">URL personalizada</label>
              <div className="mt-2 flex gap-2">
                <input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://..."
                  className="min-w-0 flex-1 rounded-lg border border-white/60 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={applyCustomUrl}
                  className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                  disabled={!customUrl.trim()}
                >
                  Usar
                </button>
              </div>
            </div>
          </div>
        </div>
        </>,
        document.body
      )}
    </div>
  );
}

// Shared UI extracted to components/shared.tsx (Panel, SectionHeader, IconButton, etc.)
// Old inline definitions removed for separation.

// WhiteboardView extracted to views/WhiteboardView.tsx (individual complex page/component)

export default BusinessWomanPlanner;
