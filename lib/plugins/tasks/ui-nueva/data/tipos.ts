import type { TaskColumn, TaskLabel, TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';

export type Prioridad = 'baja' | 'media' | 'alta';
export type Recurrencia = 'unica' | 'diaria' | 'semanal' | 'mensual';
export type EscrituraEtiquetas = 'conservadora' | 'completa';
export type TasksUi = 'clasico' | 'nuevo';
export type Tema = 'claro' | 'oscuro';
export type NavId =
  | 'bandeja'
  | 'hoy'
  | 'proximas'
  | 'vencidas'
  | 'completadas'
  | 'enCola'
  | 'enfoque'
  | 'produccion'
  | 'metricas'
  | 'ajustes'
  | 'comoUsar'
  | 'espacios';
export type LayoutId = 'lista' | 'calendario' | 'tablero';

export type Subtarea = {
  id: string;
  text: string;
  completed: boolean;
};

export type EtiquetaUnificada = {
  name: string;
  color: string;
  ids: string[];
  projectIds: number[];
  projectNames: string[];
};

export type Tarea = {
  id: number;
  title: string;
  notes: string;
  aiPrompt: string;
  aiNextStep: string;
  aiContextQuestion: string;
  aiContextAnswer: string;
  aiReadyAt: string | null;
  dueDate: string | null;
  completedAt: string | null;
  status: 'open' | 'in_progress' | 'done';
  prioridad: Prioridad;
  recurrencia: Recurrencia;
  etiquetas: { id: string; name: string; color: string }[];
  subtareas: Subtarea[];
  labelIds: string[];
  projectId: number;
  columnId: number;
  workspaceId: number | null;
  proyectoNombre: string;
  workspaceNombre: string;
  order: number;
  projectLabels: TaskLabel[];
  createdBy: number | null;
  assigneeId: number | null;
  /** Otros tableros donde vive la MISMA tarea (tarea espejo/compartida). */
  espejos?: { projectId: number; projectName: string; workspaceName?: string | null }[];
};

export type GrupoProyecto = {
  key: string;
  name: string;
  workspaceId: number;
  workspaceNombre: string;
  color: string | null;
  projectIds: number[];
  totalTasks: number;
  activeTasks: number;
  customerId?: number | null;
  customerStatus?: string | null;
};

export type Universo = {
  workspaces: TaskWorkspace[];
  proyectos: TaskProject[];
  columnas: TaskColumn[];
  tareas: Tarea[];
};

export type Preferencias = {
  tema: Tema;
  acento: string;
  objetivoDiario: number;
  duracionEnfoque: number;
  destinoProjectId: number | null;
  escritura: EscrituraEtiquetas;
  nav: NavId;
  layout: LayoutId;
  workspaceId: number | null;
  projectIds: number[] | null;
  sidebarCollapsed: boolean;
  /** Ancho del sidebar en escritorio, en px. Se arrastra con el borde. */
  sidebarWidth?: number;
  etiquetasConfirmadas: number[];
};

export type CapturaParseada = {
  titulo: string;
  dueDate: string | null;
  prioridad: Prioridad | null;
  recurrencia: Recurrencia;
  etiquetas: string[];
};

export const ACENTOS = [
  '#6366f1',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#60a5fa',
  '#c084fc',
  '#f87171',
] as const;

export const PRIO_IDS = {
  baja: 'prio-low',
  media: 'prio-medium',
  alta: 'prio-high',
} as const;

export const PRIO_COLORES: Record<Prioridad, string> = {
  baja: '#10b981',
  media: '#f59e0b',
  alta: '#f43f5e',
};

export const REC_IDS = {
  diaria: 'rec-daily',
  semanal: 'rec-weekly',
  mensual: 'rec-monthly',
} as const;

export const PRIO_LABELS: Record<Prioridad, { id: string; name: string; color: string }> = {
  baja: { id: 'prio-low', name: 'Baja', color: '#10b981' },
  media: { id: 'prio-medium', name: 'Media', color: '#f59e0b' },
  alta: { id: 'prio-high', name: 'Alta', color: '#f43f5e' },
};

export const REC_LABELS: Record<Exclude<Recurrencia, 'unica'>, { id: string; name: string; color: string }> = {
  diaria: { id: 'rec-daily', name: 'Diaria', color: '#6366f1' },
  semanal: { id: 'rec-weekly', name: 'Semanal', color: '#6366f1' },
  mensual: { id: 'rec-monthly', name: 'Mensual', color: '#6366f1' },
};
