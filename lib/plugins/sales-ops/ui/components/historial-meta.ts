import { EyeOff, Flag, History, ListChecks, Radar, SendHorizontal, Sparkles, UserSquare2, Wand2, type LucideIcon } from 'lucide-react';
import type { HistoryEntry } from '../../shared/api-types';

export type HistorialKind = HistoryEntry['kind'];

/**
 * Ícono, tono y nombre de cada familia de evento auditado.
 *
 * Estaba adentro de la ficha, pero el Muro dibuja exactamente los mismos
 * eventos: duplicar los mapas garantizaba que en dos meses "envío" fuera verde
 * en un lado y azul en el otro para el mismo hecho.
 *
 * Los tonos son literales completos porque Tailwind no ve clases armadas por
 * concatenación.
 */
export const HISTORIAL_ICONOS: Record<HistorialKind, LucideIcon> = {
  analisis: Sparkles,
  manual: Flag,
  radar: Radar,
  prompt: Wand2,
  cola: ListChecks,
  envio: SendHorizontal,
  crm: UserSquare2,
  skill: Wand2,
  limpieza: EyeOff,
  otro: History,
};

export const HISTORIAL_TONOS: Record<HistorialKind, string> = {
  analisis: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200',
  manual: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  radar: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200',
  prompt: 'bg-primary/10 text-primary',
  cola: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  envio: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  crm: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200',
  skill: 'bg-primary/10 text-primary',
  limpieza: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
  otro: 'bg-muted text-muted-foreground',
};

/** Nombre corto de la familia, para los filtros del Muro. */
export const HISTORIAL_KIND_LABELS: Record<HistorialKind, string> = {
  analisis: 'Análisis',
  manual: 'A mano',
  radar: 'Radar',
  prompt: 'Prompts',
  cola: 'Cola',
  envio: 'Envíos',
  crm: 'CRM',
  skill: 'Skills',
  limpieza: 'Limpieza',
  otro: 'Otros',
};
