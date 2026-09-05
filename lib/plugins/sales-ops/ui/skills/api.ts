'use client';

import type { RunMode, Skill, SkillCategory, SkillInput, SkillVariable } from '../../shared/skills';
import type { HumanDecisionRequest } from '../../shared/human-decision';
import { SALES_OPS_API } from '../components/format';

/** Cliente del Prompt Studio. Una sola forma de hablar con la API desde la vista. */

export type SkillRun = {
  id: number;
  promptId: number | null;
  promptKey: string;
  promptVersion: number;
  title: string;
  text: string;
  targetKind: string;
  targetId: string;
  targetName: string | null;
  status: string;
  mode: RunMode;
  connector: string;
  variables: Record<string, string>;
  summary: string | null;
  output: string | null;
  createdAt: string;
  completedAt: string | null;
  approvedAt: string | null;
  approvedBy: number | null;
  humanRequest: HumanDecisionRequest | null;
  humanRequestedAt: string | null;
};

export type SkillsPayload = {
  skills: Skill[];
  categories: Array<{ category: SkillCategory; label: string; count: number }>;
  counts: { total: number; routines: number; onDemand: number; withVariables: number };
};

export type Recommendation = { skill: Skill; reason: string; score: number };
export type RecommendedPayload = {
  situation: { chatId: number; gate: string | null; status: string | null; owner: string | null; signals: string[] };
  recommendations: Recommendation[];
};

/** Error de la API con las variables que faltan, si el 422 las trae. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly missing: SkillVariable[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; missing?: SkillVariable[] };
  if (!response.ok) throw new ApiError(String(data?.error ?? `Error ${response.status}`), Array.isArray(data?.missing) ? data.missing : []);
  return data as T;
}

export const saveSkill = (input: SkillInput) => send<Skill>(`${SALES_OPS_API}/prompts`, 'POST', input);

export const retireSkillByKey = (key: string) => send<{ retired: number }>(`${SALES_OPS_API}/prompts?key=${encodeURIComponent(key)}`, 'DELETE');

export const pinSkill = (id: number, pinned: boolean) => send<Skill>(`${SALES_OPS_API}/prompts/${id}`, 'PATCH', { pinned });

export const duplicateSkill = (id: number) => send<Skill>(`${SALES_OPS_API}/prompts/${id}`, 'POST');

export type LaunchPayload = {
  skillId?: number | null;
  text?: string | null;
  title?: string | null;
  targetKind: 'team' | 'chat' | 'batch';
  targetId?: number | null;
  /** batchId cuando `targetKind` es `batch`. */
  targetRef?: string | null;
  variables?: Record<string, string>;
  mode: RunMode;
};

export const launchSkill = (payload: LaunchPayload) => send<{ run: SkillRun; skill: Skill | null }>(`${SALES_OPS_API}/prompts/launch`, 'POST', payload);

export const cancelRun = (id: number) => send<SkillRun>(`${SALES_OPS_API}/prompts/queue/${id}`, 'PATCH', { status: 'cancelled' });

/** Aprueba una corrida que espera en revisión: desde ahí la ve el conector. */
export const approveRun = (id: number) => send<SkillRun>(`${SALES_OPS_API}/prompts/queue/${id}`, 'PATCH', { approved: true });

/** Edita texto y/o título de una corrida que todavía espera en revisión. */
export const editRun = (id: number, patch: { text?: string; title?: string }) => send<SkillRun>(`${SALES_OPS_API}/prompts/queue/${id}`, 'PATCH', patch);

/** Responde una solicitud de criterio humano y devuelve la misma corrida a la cola. */
export const answerRun = (id: number, values: Record<string, string>) =>
  send<SkillRun>(`${SALES_OPS_API}/prompts/queue/${id}`, 'PATCH', { humanResponse: { values } });

/** Elimina una corrida descartada (cancelada, fallida o bloqueada). */
export const deleteRun = (id: number) => send<{ id: number }>(`${SALES_OPS_API}/prompts/queue/${id}`, 'DELETE');

/** Repite una corrida: `api` la corre ya con la IA del equipo, `queue` la deja para un conector. */
export const retryRun = (id: number, mode: 'api' | 'queue') => send<{ run: SkillRun; from: number }>(`${SALES_OPS_API}/prompts/queue/${id}/requeue`, 'POST', { mode });
