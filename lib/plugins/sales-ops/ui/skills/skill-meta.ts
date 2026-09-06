import {
  BarChart3,
  Brush,
  CalendarClock,
  ClipboardCheck,
  Coins,
  MessageSquareText,
  PenLine,
  Radar,
  Search,
  Sparkles,
  Target,
  Users,
  Wand2,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { RunMode, SkillCategory, SkillIcon } from '../../shared/skills';

/**
 * Mapas visuales del Prompt Studio.
 *
 * Los íconos y los tonos son mapas estáticos a propósito: Tailwind v4 no ve las
 * clases que se arman concatenando (`bg-${color}-100` no existe en el CSS
 * final), así que cada tono va escrito entero. Agregar una categoría es agregar
 * una fila acá y otra en `SKILL_CATEGORIES`.
 */

export const SKILL_ICON_COMPONENTS: Record<SkillIcon, LucideIcon> = {
  sparkles: Sparkles,
  wand: Wand2,
  radar: Radar,
  coins: Coins,
  pen: PenLine,
  search: Search,
  clipboard: ClipboardCheck,
  brush: Brush,
  chart: BarChart3,
  calendar: CalendarClock,
  message: MessageSquareText,
  users: Users,
  zap: Zap,
  target: Target,
};

/** Tono del azulejo del ícono. Suave: la tarjeta se lee por el título, no por el color. */
export const CATEGORY_TONE: Record<SkillCategory, string> = {
  general: 'bg-muted text-foreground',
  auditoria: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  cobro: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  redaccion: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
  radar: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  seguimiento: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  limpieza: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  reporte: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
};

export const RUN_STATUS_LABELS: Record<string, string> = {
  queued: 'En cola',
  in_progress: 'Ejecutando',
  completed: 'Listo',
  failed: 'Falló',
  blocked: 'Bloqueado',
  cancelled: 'Cancelado',
};

/**
 * La etiqueta de una corrida, mirando también si está aprobada.
 *
 * `queued` son dos momentos distintos: sin aprobar espera a una persona ("En
 * revisión"); aprobada espera a un conector ("En cola"). El mapa por status
 * los mezclaba y una corrida que nadie había aprobado se leía como si ya
 * estuviera saliendo. Bloqueada con formulario es "necesita tu criterio".
 */
export function etiquetaDeCorrida(run: { status: string; approved?: boolean; approvedAt?: string | null; humanRequest?: unknown }): string {
  if (run.status === 'queued') return (run.approved ?? Boolean(run.approvedAt)) ? 'En cola' : 'En revisión';
  if (run.status === 'blocked' && run.humanRequest) return 'Necesita tu criterio';
  return RUN_STATUS_LABELS[run.status] ?? run.status;
}

export const RUN_STATUS_TONE: Record<string, string> = {
  queued: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  in_progress: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  failed: 'bg-destructive/10 text-destructive',
  blocked: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground',
};

export const MODE_LABELS: Record<RunMode, string> = { api: 'IA del equipo', queue: 'Conector' };

/** Filtro principal de la vista: el corte que el equipo mira primero. */
export const SKILL_TABS = ['todas', 'rutinas', 'puntuales', 'fijadas'] as const;
export type SkillTab = (typeof SKILL_TABS)[number];

export const SKILL_TAB_LABELS: Record<SkillTab, string> = {
  todas: 'Todas',
  rutinas: 'Rutinas',
  puntuales: 'Puntuales',
  fijadas: 'Fijadas',
};

/**
 * Ejecutar con la IA del equipo (modo `api`) está oculto en la UI.
 *
 * Ese motor corre sin tools —no puede leer el chat ni escribir en WhatsPro—, se
 * come la cuota gratuita del equipo (unas 140 llamadas por día) y falla a la
 * tarde justo cuando más se usa, así que la mitad de las corridas terminaban
 * reencoladas a mano. Todo lo que se lanza desde las acciones rápidas va a la
 * cola de conectores, que ejecutan con su propia cuota y sí tienen tools.
 *
 * Es una decisión de interfaz, no del motor: el modo `api` sigue existiendo en
 * el servidor y en los conectores MCP. Poner esto en `true` lo devuelve a la
 * vista sin tocar nada más.
 */
export const MOSTRAR_MODO_API = false;
