/** Tipos compartidos del Calendario (servidor y navegador). */

export const EVENT_KINDS = ['meeting', 'call', 'task', 'reminder', 'other'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_STATUSES = ['scheduled', 'completed', 'canceled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const RECURRENCES = ['none', 'daily', 'weekly', 'monthly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const EVENT_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#38bdf8', '#a855f7', '#ef4444'] as const;

export type EventoRow = {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  kind: EventKind;
  subtype: string | null;
  status: EventStatus;
  notes: string;
  location: string | null;
  color: string | null;
  recurrence: Recurrence;
  recurrenceUntil: string | null;
  reminderMinutes: number[];
  attendees: string[];
  contactId: number | null;
  contactName: string | null;
  chatId: number | null;
  customerId: number | null;
  customerName: string | null;
  relatedUserId: number | null;
  relatedUserName: string | null;
  outcome: string;
  nextAction: string;
  externalSource: string | null;
  /** Instancia de una serie: la fecha de esta repetición (la fila es la misma). */
  ocurrencia?: string;
  participants: Array<{ id: number; userId: number | null; contactId: number | null; role: string; responseStatus: string }>;
};

/**
 * Para qué es la reunión o la llamada. Es lo que decide qué notas se toman y a
 * quién le importa: una de venta la mira el Command Center, una de entrega la
 * mira Producción.
 */
export const PROPOSITOS = ['venta', 'soporte', 'entrega', 'onboarding', 'seguimiento', 'interna'] as const;
export type Proposito = (typeof PROPOSITOS)[number];

export const PROPOSITO_META: Record<Proposito, { label: string; emoji: string; color: string }> = {
  venta: { label: 'Venta', emoji: '💰', color: '#22c55e' },
  soporte: { label: 'Soporte', emoji: '🛟', color: '#38bdf8' },
  entrega: { label: 'Entrega', emoji: '📦', color: '#f59e0b' },
  onboarding: { label: 'Alta / Onboarding', emoji: '🚀', color: '#a855f7' },
  seguimiento: { label: 'Seguimiento', emoji: '🔁', color: '#6366f1' },
  interna: { label: 'Interna', emoji: '🏠', color: '#ec4899' },
};

export const esProposito = (v: unknown): v is Proposito => typeof v === 'string' && (PROPOSITOS as readonly string[]).includes(v);

/** Atajos de creación: lo que el equipo agenda todo el tiempo, en un toque. */
export const PLANTILLAS: Array<{ id: string; label: string; kind: EventKind; proposito: Proposito; minutos: number }> = [
  { id: 'call-venta', label: 'Llamada de venta', kind: 'call', proposito: 'venta', minutos: 30 },
  { id: 'demo', label: 'Demo / presentación', kind: 'meeting', proposito: 'venta', minutos: 45 },
  { id: 'soporte', label: 'Soporte', kind: 'call', proposito: 'soporte', minutos: 30 },
  { id: 'entrega', label: 'Entrega al cliente', kind: 'meeting', proposito: 'entrega', minutos: 60 },
  { id: 'onboarding', label: 'Alta de cliente', kind: 'meeting', proposito: 'onboarding', minutos: 60 },
  { id: 'seguimiento', label: 'Seguimiento', kind: 'call', proposito: 'seguimiento', minutos: 15 },
  { id: 'interna', label: 'Reunión interna', kind: 'meeting', proposito: 'interna', minutos: 45 },
];

export const KIND_META: Record<EventKind, { label: string; emoji: string }> = {
  meeting: { label: 'Reunión', emoji: '🤝' },
  call: { label: 'Llamada', emoji: '📞' },
  task: { label: 'Tarea', emoji: '✅' },
  reminder: { label: 'Recordatorio', emoji: '🔔' },
  other: { label: 'Otro', emoji: '📌' },
};

export const STATUS_META: Record<EventStatus, { label: string }> = {
  scheduled: { label: 'Agendado' },
  completed: { label: 'Hecho' },
  canceled: { label: 'Cancelado' },
};

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: 'Una vez',
  daily: 'Todos los días',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
};

/** `2026-09-02` en hora local (no UTC: `toISOString` corre el día de madrugada). */
export function claveDia(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Un evento (o su ocurrencia) al día que le toca. */
export function diaDelEvento(e: EventoRow): string {
  return claveDia(new Date(e.ocurrencia ?? e.startsAt));
}

/**
 * Link para guardar el evento en Google Calendar.
 *
 * Es el camino sin OAuth: abre el formulario de Google ya completo y la persona
 * confirma. Google avisa con sus propios recordatorios, que es lo que se quiere
 * cuando el aviso tiene que llegar aunque WhatsPro esté cerrado.
 */
export function googleCalendarUrl(e: Pick<EventoRow, 'title' | 'startsAt' | 'endsAt' | 'allDay' | 'notes' | 'location'> & { ocurrencia?: string }): string {
  const inicio = new Date(e.ocurrencia ?? e.startsAt);
  const duracion = new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime();
  const fin = new Date(inicio.getTime() + (Number.isFinite(duracion) && duracion > 0 ? duracion : 3600000));
  const stampUtc = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}T${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00Z`;
  const stampDia = (d: Date) => claveDia(d).replace(/-/g, '');
  const dates = e.allDay
    ? `${stampDia(inicio)}/${stampDia(new Date(inicio.getTime() + 86400000))}`
    : `${stampUtc(inicio)}/${stampUtc(fin)}`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates });
  if (e.notes) p.set('details', e.notes.slice(0, 900));
  if (e.location) p.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
