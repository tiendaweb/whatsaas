import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * La puerta del Developer Command Center (terminales del admin).
 *
 * No es un rol: es una LISTA BLANCA de emails, cerrada por defecto. Hoy sólo
 * noelia@whatspro.uno. Ser `admin` de la plataforma no alcanza y ser `owner`
 * no hace falta: la terminal es root sobre el servidor de producción, y eso
 * se da persona por persona, no por rol. La lista vive en
 * `TERMINAL_ALLOWED_EMAILS` (coma-separada) y el gateway tiene la suya propia
 * con el mismo valor: dos verificaciones independientes.
 *
 * Y nunca a un usuario impersonado: un admin que "entra como Noelia" desde
 * el panel no hereda su terminal.
 */
export const TERMINAL_ALLOWED_EMAILS: ReadonlySet<string> = new Set(
  (process.env.TERMINAL_ALLOWED_EMAILS || 'noelia@whatspro.uno').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);

export function isTerminalOperator(user: { email?: string | null; deletedAt?: Date | null } | null | undefined): boolean {
  if (!user?.email || user.deletedAt) return false;
  return TERMINAL_ALLOWED_EMAILS.has(user.email.toLowerCase());
}

// ── Registro de proyectos (config/terminal-projects.json) ────────────────────

export type TerminalProject = {
  slug: string;
  name: string;
  server: string;
  connection: 'local-pty';
  cwd: string;
  defaultBranch: string;
  productionUrl: string;
  stack: string;
  commands: Record<string, string>;
  agents: string[];
  defaultAgent: string;
  maxSessions: number;
};
export type TerminalMode = 'shell' | 'claude' | 'codex';

type Registry = { projects: TerminalProject[]; agents: Record<TerminalMode, { name: string; command: string | null }> };

let cached: Registry | null = null;
export function terminalRegistry(): Registry {
  if (!cached) cached = JSON.parse(readFileSync(path.join(process.cwd(), 'config/terminal-projects.json'), 'utf8')) as Registry;
  return cached;
}

// ── Tickets ──────────────────────────────────────────────────────────────────

const secret = () => {
  const value = process.env.TERMINAL_GATEWAY_SECRET;
  if (!value || value.length < 32) throw new Error('TERMINAL_GATEWAY_SECRET no está configurado (mínimo 32 caracteres).');
  return value;
};
const b64u = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');
const sign = (payloadB64: string) => b64u(createHmac('sha256', secret()).update(payloadB64).digest());

export const TICKET_TTL_MS = 45_000;

export type TicketPayload = {
  v: 1;
  uid: number;
  email: string;
  project: string;
  mode: TerminalMode;
  slot: number;
  ip: string | null;
  nonce: string;
  iat: number;
  exp: number;
};

/**
 * Un ticket es un pase de 45 segundos y un solo uso para abrir UNA conexión:
 * usuario, proyecto, modo, ranura e IP van adentro y firmados. Lo emite la
 * API después de verificar sesión + lista blanca + contraseña; lo consume el
 * gateway, que lo marca usado. Robarlo sirve 45 s, desde la misma IP, una vez.
 */
export function mintTicket(input: Omit<TicketPayload, 'v' | 'nonce' | 'iat' | 'exp'>): string {
  const now = Date.now();
  const payload: TicketPayload = { v: 1, ...input, nonce: randomBytes(16).toString('hex'), iat: now, exp: now + TICKET_TTL_MS };
  const payloadB64 = b64u(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Cabeceras para que la app hable con el gateway (listar/cerrar sesiones). */
export function internalHeaders(): Record<string, string> {
  const ts = String(Date.now());
  return { 'x-terminal-ts': ts, 'x-terminal-sig': sign(`internal:${ts}`) };
}

export function gatewayUrl(): string {
  return process.env.TERMINAL_GATEWAY_URL || 'http://172.19.0.1:3400';
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
