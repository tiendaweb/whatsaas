'use client';

import { ZONA_NEGOCIO } from '@/lib/time/zona';
import type { ActionRole, ActionStatus, Gate } from '../../shared/taxonomy';

export const QUEUE_ENDPOINT = '/api/plugins/sales-ops/queue';
export const EXPERIMENTS_ENDPOINT = '/api/plugins/sales-ops/experiments';

export const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? String(response.status));
  }
  return response.json();
};

export type ApiError = Error & { code?: string; blockedChats?: Array<{ chatId: number; name: string; batchLabel: string }> };

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error: ApiError = new Error(payload?.error ?? `Error ${response.status}`);
    error.code = payload?.code;
    error.blockedChats = payload?.blockedChats;
    throw error;
  }
  return payload as T;
}

/**
 * Las etiquetas de tipo y estado de acción viven en un solo lugar
 * (`ui/components/format.ts`, que es el que importa la mayoría de las
 * pantallas). Acá se re-exportan con los nombres de siempre para no tocar a los
 * consumidores: antes había dos mapas y la misma tarea decía "Enviado" en la
 * Cola y "Ejecutada" en la ficha.
 */
export { ACTION_KIND_LABELS as KIND_LABELS, ACTION_STATUS_LABELS as STATUS_LABELS, verboEjecutado } from '../components/format';

export const ROLE_LABELS: Record<ActionRole, string> = { noelia: 'Noelia', carlos: 'Carlos', any: 'Cualquiera' };

/** Estado "visible" de un lote a partir del conteo por estado. */
export type BatchPhase = 'proposed' | 'approved' | 'done' | 'closed';

export function batchPhase(byStatus: Partial<Record<ActionStatus, number>>): BatchPhase {
  if ((byStatus.proposed ?? 0) + (byStatus.pending_approval ?? 0) > 0) return 'proposed';
  if ((byStatus.approved ?? 0) + (byStatus.executing ?? 0) > 0) return 'approved';
  if ((byStatus.executed ?? 0) + (byStatus.resulted ?? 0) + (byStatus.failed ?? 0) > 0) return 'done';
  return 'closed';
}

export const PHASE_LABELS: Record<BatchPhase, string> = {
  proposed: 'pendiente de aprobación',
  approved: 'aprobado · falta ejecutar',
  done: 'ejecutado',
  closed: 'cerrado',
};

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', withTime ? { timeZone: ZONA_NEGOCIO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { timeZone: ZONA_NEGOCIO, day: '2-digit', month: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function pct(part: number, total: number): string {
  if (!total) return '—';
  try {
    return new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 0 }).format(part / total);
  } catch {
    return `${Math.round((part / total) * 100)}%`;
  }
}

export function formatUsd(value: number): string {
  try {
    return `USD ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value)}`;
  } catch {
    return `USD ${Math.round(value)}`;
  }
}

export const GATE_OPTIONS: Gate[] = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10'];
