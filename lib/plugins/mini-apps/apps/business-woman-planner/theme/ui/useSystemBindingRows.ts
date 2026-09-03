'use client';

import useSWR from 'swr';
import type { BwSystemBinding } from '../shared/schema';

const APP_SLUG = 'business-woman-planner';

type QueryResponse = { ok: true; rows: Array<Record<string, unknown>>; count: number } | { ok: false; message: string };

async function fetcher([, binding]: [string, BwSystemBinding]): Promise<QueryResponse> {
  const response = await fetch(`/api/mini-apps/${APP_SLUG}/theme/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ binding }),
  });
  if (!response.ok && response.status !== 200) return { ok: false, message: `Error ${response.status}` };
  return response.json();
}

/**
 * Trae las filas de un binding `kind: "system"` (datos reales de WhatsPro).
 * `binding: null` desactiva el pedido (patrón estándar de SWR para fetching
 * condicional) — así un mismo componente puede llamar este hook siempre, sin
 * violar las reglas de hooks, aunque el bloque use un binding `local`.
 */
export function useSystemBindingRows(binding: BwSystemBinding | null) {
  const key: [string, BwSystemBinding] | null = binding ? [`bw-system-binding:${JSON.stringify(binding)}`, binding] : null;
  const { data, isLoading } = useSWR(key, fetcher);

  if (!binding) return { rows: [] as Array<Record<string, unknown>>, loading: false, error: null as string | null };
  if (isLoading || !data) return { rows: [] as Array<Record<string, unknown>>, loading: true, error: null as string | null };
  if (!data.ok) return { rows: [], loading: false, error: data.message };
  return { rows: data.rows, loading: false, error: null as string | null };
}
