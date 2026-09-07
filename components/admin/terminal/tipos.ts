/**
 * Tipos compartidos por las piezas de la terminal del admin.
 *
 * Están aparte para que la app «Centro de Desarrollo» pueda importar el
 * contrato (`TerminalAutoOpen`, `TerminalOpenedInfo`) sin arrastrar xterm ni
 * ningún componente cliente.
 */

export type Mode = 'shell' | 'claude' | 'codex';

export type Project = {
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

/** Una conexión viva en el gateway (un navegador enganchado a una sesión tmux). */
export type LiveSession = {
  sessionId: string;
  project: string;
  mode: Mode;
  slot: number;
  tmux: string;
  title?: string | null;
  mission?: number | null;
  connectedAt: number;
  connectedFor?: number;
};

export type Catalog = {
  projects: Project[];
  agents: Record<Mode, { name: string; command: string | null }>;
  sessions: LiveSession[];
  gatewayOk: boolean;
};

export type TabStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type Tab = {
  id: string;
  project: string;
  mode: Mode;
  slot: number;
  title: string;
  status: TabStatus;
  detail?: string;
  /** Ticket sin usar todavía; el panel lo consume una sola vez y lo recuerda. */
  ticket: string | null;
  /** Texto que se tipea al conectar (misiones). Se manda UNA vez por pestaña. */
  initialInput?: string;
  missionId?: number;
  /** Nombre de la sesión tmux, cuando el gateway ya lo confirmó. */
  tmux?: string;
};

/**
 * Pedido de la app para abrir una terminal ya prellenada. `key` distinta =
 * pedido nuevo; la misma `key` no vuelve a abrir nada aunque el componente se
 * re-renderice.
 */
export type TerminalAutoOpen = {
  key: string;
  project: string;
  mode: Mode;
  initialInput?: string;
  missionId?: number;
  title?: string;
};

export type TerminalOpenedInfo = { missionId?: number; tmux: string; project: string; mode: string; slot: number };

export const MODE_LABEL: Record<Mode, string> = { shell: 'Shell', claude: 'Claude Code', codex: 'Codex' };

export const STATUS_LABEL: Record<TabStatus, string> = {
  connecting: 'Conectando',
  connected: 'Conectada',
  disconnected: 'Desconectada',
  error: 'Con error',
};
