'use client';

import type { EventoRow } from '../../shared/tipos';

export const CAL_API = '/api/plugins/calendar/agenda';

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: init?.body ? { 'Content-Type': 'application/json' } : undefined });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((body as { error?: string })?.error ?? `Error ${res.status}`));
  return body as T;
}

export function fetchEventos(from: Date, to: Date, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), ...extra });
  return pedir<{ events: EventoRow[] }>(`${CAL_API}?${p.toString()}`);
}

export type EventoInputUI = Partial<Omit<EventoRow, 'id' | 'participants'>> & { startsAt: string; endsAt: string; title: string; validateOverlap?: boolean };

export function crearEvento(input: EventoInputUI) {
  return pedir<{ event: EventoRow }>(CAL_API, { method: 'POST', body: JSON.stringify(input) });
}

export function editarEvento(id: number, patch: Partial<EventoInputUI>) {
  return pedir<{ event: EventoRow }>(CAL_API, { method: 'PATCH', body: JSON.stringify({ id, ...patch }) });
}

export function borrarEvento(id: number) {
  return pedir<{ ok: boolean }>(`${CAL_API}?id=${id}`, { method: 'DELETE' });
}
