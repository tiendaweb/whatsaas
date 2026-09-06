'use client';

import type { CrmFix } from '../../shared/crm-fix';
import { SALES_OPS_API } from '../components/format';
import type { SkillRun } from '../skills/api';

/** Cliente HTTP del Focus. Dos llamadas, una por botón. */

export type FocusRunResponse =
  | { ok: true; mode: 'texto'; text: string; reason: string | null; provider: string; model: string }
  /** Texto más fecha y hora local (`YYYY-MM-DDTHH:mm`): baja al editor con la fecha puesta. */
  | { ok: true; mode: 'programar'; text: string; when: string; reason: string | null; provider: string; model: string }
  /** Corrección de CRM validada contra el catálogo: la pantalla la muestra y la persona la aplica. */
  | { ok: true; mode: 'crm'; fix: CrmFix; steps: string[]; skipped: string[]; reason: string | null; provider: string; model: string }
  | { ok: true; mode: 'conector'; reason: string; provider: string; model: string };

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(String(data?.error ?? `Error ${res.status}`));
  return data as T;
}

/** "Ejecutar ahora": la IA del equipo redacta, programa o propone CRM, o dice que hace falta un conector. */
export const ejecutarAhora = (input: { chatId: number; prompt: string; message?: string | null; name?: string | null }) =>
  post<FocusRunResponse>(`${SALES_OPS_API}/focus/run`, input);

/** Aplica al CRM la corrección que propuso "Ejecutar ahora" (mismo camino que el botón de la ficha). */
export const aplicarCrmPropuesto = (chatId: number, fix: CrmFix) =>
  post<{ applied: string[]; skipped: string[] }>(`${SALES_OPS_API}/contacts/${chatId}/crm/apply`, { fix: { stage: fix.stage, add_tags: fix.addTags, remove_tags: fix.removeTags, fields: fix.fields, reason: fix.reason } });

/**
 * "Listo para conector": deja el pedido en la cola, ya aprobado (lo escribió una
 * persona identificada; el conector no aprueba nada solo).
 */
export const dejarParaConector = (input: { chatId: number; text: string; title: string }) =>
  post<SkillRun>(`${SALES_OPS_API}/prompts/queue`, {
    text: input.text,
    title: input.title.slice(0, 160),
    targetKind: 'chat',
    targetId: input.chatId,
    mode: 'queue',
  });
