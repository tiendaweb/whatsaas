import type { TaskItem } from '@/lib/plugins/tasks/client/types';

const DAY_MS = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return startOfDay(next);
}

export function daysBetween(start: Date, end: Date): number {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS) + 1;
}

export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.split('T')[0];
}

export function parseDateInput(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return startOfDay(new Date(y, m - 1, d));
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getEffectiveSchedule(task: Pick<TaskItem, 'startDate' | 'endDate' | 'dueDate'>) {
  const start = task.startDate ?? task.dueDate ?? null;
  const end = task.endDate ?? task.dueDate ?? task.startDate ?? null;
  return { start, end };
}

export function hasSchedule(task: Pick<TaskItem, 'startDate' | 'endDate' | 'dueDate'>) {
  const { start, end } = getEffectiveSchedule(task);
  return Boolean(start || end);
}

export function taskOverlapsRange(
  task: Pick<TaskItem, 'startDate' | 'endDate' | 'dueDate'>,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const { start, end } = getEffectiveSchedule(task);
  if (!start && !end) return false;
  const taskStart = startOfDay(new Date(start ?? end!));
  const taskEnd = startOfDay(new Date(end ?? start!));
  return taskStart <= rangeEnd && taskEnd >= rangeStart;
}

export const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = addDays(first, -first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
  return cells;
}

export function getWeekDays(anchor: Date): Date[] {
  const start = addDays(anchor, -anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatRangeLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const same = toISODate(s) === toISODate(e);
  const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return same ? fmt(s) : `${fmt(s)} – ${fmt(e)}`;
}