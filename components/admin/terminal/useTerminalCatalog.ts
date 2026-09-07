'use client';

import useSWR from 'swr';
import type { Catalog } from './tipos';

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
  return body as Catalog;
};

/**
 * Proyectos del registro, conexiones vivas y si el gateway responde. Se
 * refresca cada 15 s: es lo que dice «Gateway conectado» y lo que lista las
 * sesiones de otras pestañas del navegador.
 */
export function useTerminalCatalog() {
  const { data, error, mutate, isLoading } = useSWR<Catalog>('/api/admin/terminal/sessions', fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
  });
  return { catalog: data ?? null, error: error as Error | undefined, refresh: () => void mutate(), isLoading };
}

/** Pide un ticket. Devuelve el ticket o lanza con el mensaje de la API (contraseña incorrecta, tope, etc.). */
export async function pedirTicket(input: { project: string; mode: string; slot: number; password: string; missionId?: number; title?: string }): Promise<string> {
  const response = await fetch('/api/admin/terminal/ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
  return String(body.ticket);
}

/** Mata la sesión tmux de verdad (no sólo la conexión). */
export async function terminarSesion(tmux: string): Promise<boolean> {
  try {
    const response = await fetch('/api/admin/terminal/sessions', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tmux }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
