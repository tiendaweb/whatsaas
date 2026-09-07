/**
 * Centro de Desarrollo: contrato compartido entre servidor, pantalla y tools.
 *
 * Una MISIÓN es un pedido de trabajo técnico sobre un proyecto del registro
 * (`config/terminal-projects.json`) que se ejecuta de una de dos maneras:
 *  - `claude` / `codex`: en una terminal del admin, dentro de tmux; el prompt
 *    se tipea en la sesión al abrirla (Fase 5 del plan, modo Misión IA).
 *  - `connector`: se encola como corrida en `team_prompt_runs` (la misma cola
 *    que el Command Center comercial) y la toma un conector de IA desde
 *    `whatspro_work_queue`, cerrándola con `whatspro_sales_prompt_result`.
 *
 * El estado de una misión de conector se LEE de la corrida: la misión guarda
 * `promptRunId` y no compite con ella.
 */

/**
 * Cinco agentes, dos canales. `claude` y `codex` son la TERMINAL del servidor
 * (el prompt se tipea en tmux). `claude_desktop`, `codex_desktop` y `connector`
 * son clientes MCP: la misión se encola en `team_prompt_runs` y la toma quien
 * pregunte por trabajo con `whatspro_work_queue` / `whatspro_dev_missions`;
 * `forAgent` dice para quién es, y cada escritorio filtra las suyas.
 */
export const MISSION_AGENTS = ['claude', 'codex', 'claude_desktop', 'codex_desktop', 'connector'] as const;
export type MissionAgent = (typeof MISSION_AGENTS)[number];
export const MISSION_AGENT_META: Record<MissionAgent, { label: string; corto: string; ayuda: string; terminal: boolean; mcp: boolean }> = {
  claude: { label: 'Claude Code (terminal del servidor)', corto: 'Claude · terminal', ayuda: 'Abre una terminal en el proyecto con Claude Code y le tipea la misión.', terminal: true, mcp: false },
  codex: { label: 'Codex (terminal del servidor)', corto: 'Codex · terminal', ayuda: 'Abre una terminal en el proyecto con Codex y le tipea la misión.', terminal: true, mcp: false },
  claude_desktop: { label: 'Claude Desktop (MCP)', corto: 'Claude Desktop', ayuda: 'La misión queda en la cola para Claude Desktop conectado por MCP: la toma con whatspro_dev_missions, trabaja con las tools y la cierra con whatspro_dev_mission_manage.', terminal: false, mcp: true },
  codex_desktop: { label: 'Codex de escritorio (MCP)', corto: 'Codex Desktop', ayuda: 'La misión queda en la cola para Codex de escritorio conectado por MCP. Mismo circuito que Claude Desktop.', terminal: false, mcp: true },
  connector: { label: 'Cualquier conector de IA (MCP)', corto: 'Conector', ayuda: 'La toma el próximo conector que pregunte por trabajo (Claude, ChatGPT, Grok). Sin terminal: trabaja con las tools de WhatsPro y AAPP SPACE.', terminal: false, mcp: true },
};
export const esAgenteTerminal = (a: MissionAgent) => MISSION_AGENT_META[a].terminal;
export const esAgenteMcp = (a: MissionAgent) => MISSION_AGENT_META[a].mcp;
/** El modo de terminal que corresponde a un agente (los MCP no tienen). */
export const modoTerminalDe = (a: MissionAgent): 'claude' | 'codex' | null => (a === 'claude' ? 'claude' : a === 'codex' ? 'codex' : null);

export const MISSION_MODES = ['analizar', 'editar', 'probar', 'desplegar'] as const;
export type MissionMode = (typeof MISSION_MODES)[number];
export const MISSION_MODE_META: Record<MissionMode, { label: string; ayuda: string }> = {
  analizar: { label: 'Analizar', ayuda: 'Leer, diagnosticar y proponer. No toca archivos.' },
  editar: { label: 'Editar', ayuda: 'Cambiar código o configuración. Sin desplegar.' },
  probar: { label: 'Probar', ayuda: 'Correr tests, smokes y verificaciones.' },
  desplegar: { label: 'Desplegar', ayuda: 'Build + despliegue. Sólo con el trabajo ya probado.' },
};

export const MISSION_STATUSES = ['draft', 'queued', 'running', 'blocked', 'completed', 'failed', 'cancelled'] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];
export const MISSION_STATUS_META: Record<MissionStatus, { label: string; abierta: boolean }> = {
  draft: { label: 'Borrador', abierta: true },
  queued: { label: 'En cola', abierta: true },
  running: { label: 'En curso', abierta: true },
  blocked: { label: 'Bloqueada', abierta: true },
  completed: { label: 'Completada', abierta: false },
  failed: { label: 'Falló', abierta: false },
  cancelled: { label: 'Cancelada', abierta: false },
};
export const MISSION_STATUS_ORDER: MissionStatus[] = ['running', 'blocked', 'queued', 'draft', 'completed', 'failed', 'cancelled'];

/** Caminos permitidos. Una misión de conector cambia de estado por su corrida; a mano sólo se cancela o se cierra. */
export const MISSION_TRANSITIONS: Record<MissionStatus, readonly MissionStatus[]> = {
  draft: ['queued', 'running', 'cancelled'],
  queued: ['running', 'blocked', 'completed', 'failed', 'cancelled'],
  running: ['blocked', 'completed', 'failed', 'cancelled'],
  blocked: ['running', 'completed', 'failed', 'cancelled'],
  completed: ['running'],
  failed: ['queued', 'running'],
  cancelled: ['draft'],
};

export const esMissionAgent = (v: unknown): v is MissionAgent => typeof v === 'string' && (MISSION_AGENTS as readonly string[]).includes(v);
export const esMissionMode = (v: unknown): v is MissionMode => typeof v === 'string' && (MISSION_MODES as readonly string[]).includes(v);
export const esMissionStatus = (v: unknown): v is MissionStatus => typeof v === 'string' && (MISSION_STATUSES as readonly string[]).includes(v);

export type MissionRow = {
  id: number;
  project: string;
  projectName: string;
  agent: MissionAgent;
  mode: MissionMode;
  title: string;
  prompt: string;
  status: MissionStatus;
  priority: number;
  promptId: number | null;
  promptRunId: number | null;
  /** Estado de la corrida del conector, si la hay: `queued` (esperando conector), `in_progress`, `completed`, `blocked`, `failed`, `cancelled`. */
  runStatus: string | null;
  runSummary: string | null;
  tmuxName: string | null;
  resultSummary: string | null;
  tags: string[];
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromptVariable = { key: string; label: string; placeholder?: string };
export type DevPromptRow = {
  id: number;
  key: string;
  title: string;
  body: string;
  description: string | null;
  agentDefault: MissionAgent;
  projectDefault: string | null;
  modeDefault: MissionMode;
  variables: PromptVariable[];
  pinned: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  updatedAt: string;
};

/** `{{clave}}` → valor. Lo que no viene queda tal cual, a la vista, para no mandar un prompt con huecos silenciosos. */
export function rellenarPrompt(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (all, key: string) => (values[key] != null && values[key] !== '' ? values[key] : all));
}
