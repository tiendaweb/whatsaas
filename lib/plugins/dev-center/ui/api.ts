import type { DevPromptRow, MissionAgent, MissionMode, MissionRow, MissionStatus } from '../shared/types';

/**
 * Cliente HTTP del Centro de Desarrollo. Un solo lugar para las rutas y para
 * la forma de los errores: toda respuesta 4xx/5xx trae `{ error }` y acá se
 * convierte en `Error(mensaje)` para que las pantallas muestren el texto del
 * servidor y no un «Error 409».
 */
export const DEV_CENTER_API = '/api/plugins/dev-center';

export type ProyectoDev = {
  slug: string;
  name: string;
  cwd: string;
  stack: string;
  productionUrl: string;
  defaultBranch: string;
  agents: string[];
  defaultAgent: string;
  maxSessions: number;
  commands: Record<string, string>;
};

export type DevCenterPayload = {
  projects: ProyectoDev[];
  agents: Record<'shell' | 'claude' | 'codex', { name: string; command: string | null }>;
  prompts: DevPromptRow[];
  missions: MissionRow[];
  history: MissionRow[];
  counts: Partial<Record<MissionStatus, number>>;
};

export const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
  return body as T;
};

export async function enviar<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(parsed?.error ?? `Error ${response.status}`));
  return parsed as T;
}

export type NuevaMisionInput = {
  title: string;
  project: string;
  agent: MissionAgent;
  mode: MissionMode;
  prompt: string;
  promptId?: number | null;
  variables?: Record<string, string>;
  priority?: 1 | 2 | 3;
  tags?: string[];
  launch?: boolean;
};

export const crearMision = (input: NuevaMisionInput) => enviar<MissionRow>(`${DEV_CENTER_API}/missions`, 'POST', input);
export const editarMision = (id: number, patch: Record<string, unknown>) => enviar<MissionRow>(`${DEV_CENTER_API}/missions/${id}`, 'PATCH', patch);
export const lanzarMision = (id: number) => enviar<MissionRow>(`${DEV_CENTER_API}/missions/${id}/launch`, 'POST');
export const cancelarMision = (id: number) => enviar<MissionRow>(`${DEV_CENTER_API}/missions/${id}/cancel`, 'POST');

export type PromptInput = {
  title: string;
  body: string;
  description?: string | null;
  agentDefault?: MissionAgent;
  projectDefault?: string | null;
  modeDefault?: MissionMode;
  variables?: Array<{ key: string; label: string; placeholder?: string }>;
  pinned?: boolean;
};
export const crearPrompt = (input: PromptInput) => enviar<DevPromptRow>(`${DEV_CENTER_API}/prompts`, 'POST', input);
export const editarPrompt = (id: number, patch: Partial<PromptInput>) => enviar<DevPromptRow>(`${DEV_CENTER_API}/prompts/${id}`, 'PATCH', patch);
export const borrarPrompt = (id: number) => enviar<{ ok: true }>(`${DEV_CENTER_API}/prompts/${id}`, 'DELETE');
export const sembrarPrompts = () => enviar<{ created: number }>(`${DEV_CENTER_API}/prompts/seed`, 'POST');

/** Las `{{variables}}` que aparecen en un cuerpo, en orden y sin repetir. */
export function variablesDelCuerpo(body: string): string[] {
  const out: string[] = [];
  for (const match of body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) if (!out.includes(match[1])) out.push(match[1]);
  return out;
}

/** «hace 5 min» / «hace 2 h» / «ayer»; con datos sucios devuelve '' en vez de tumbar la pantalla. */
export function haceCuanto(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
