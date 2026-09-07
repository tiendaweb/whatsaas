/**
 * Terminal Gateway · Developer Command Center · Fase 1–3 (PTY local, multi-terminal, tmux).
 *
 * Corre en el HOST (PM2 `terminal-gateway`, arranca con
 * `--env-file=/root/whatsaas/.env.terminal` y NADA más: no ve el .env de la
 * app), no dentro del contenedor de WhatsPro: los proyectos, docker, pm2,
 * `claude` y `codex` viven en el host.
 * Nunca expone una shell al navegador directamente (doc 00 §Principio):
 *
 *   Navegador → Traefik → nginx `terminal-proxy` (contenedor) → este gateway
 *   (172.19.0.1:3400, la IP del host en el bridge de docker: no escucha en
 *   ninguna interfaz pública) → node-pty → tmux → shell / claude / codex
 *
 * Lo que decide si alguien entra NO es este proceso: es la API de WhatsPro,
 * que verifica sesión, lista blanca de emails, contraseña de nuevo y emite un
 * TICKET firmado (HMAC, 45 s, un solo uso, atado al email, proyecto, modo e
 * IP). Acá se verifica la firma y se vuelve a mirar la lista blanca, por si
 * la app se equivoca. Sin ticket válido no hay PTY.
 *
 * Lo que sí es responsabilidad de acá: dónde se abre la shell (sólo `cwd` de
 * `config/terminal-projects.json`), con qué entorno (uno limpio: los secretos
 * del `.env` con el que arranca este proceso NO se heredan a la shell),
 * cuántas por usuario, cuánto tiempo, y dejar constancia de todo:
 * `audit.jsonl` con aperturas/cierres y una transcripción completa por sesión
 * (entrada y salida), modo 0600.
 *
 * Límite conocido: el host corre todo como root y los proyectos son de root,
 * así que la shell es root. Es la única desviación del plan (doc 01 §10) y
 * está anotada en docs/developer-command-center/00-ESTADO.md. Filtrar
 * comandos en una PTY no es seguridad real; lo real es QUIÉN entra, DÓNDE y
 * que TODO quede grabado.
 */

import { createServer } from 'node:http';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, appendFileSync, openSync, writeSync, closeSync, fstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import pty from 'node-pty';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(__dirname, '../../config/terminal-projects.json');
const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const PROJECTS = new Map(registry.projects.map((p) => [p.slug, p]));
const AGENTS = registry.agents;

const SECRET = process.env.TERMINAL_GATEWAY_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error('[terminal-gateway] TERMINAL_GATEWAY_SECRET falta o es corto (mínimo 32). No arranco.');
  process.exit(1);
}
const BIND = process.env.TERMINAL_GATEWAY_BIND || '172.19.0.1';
const PORT = Number(process.env.TERMINAL_GATEWAY_PORT || 3400);
const ALLOWED_EMAILS = new Set((process.env.TERMINAL_ALLOWED_EMAILS || 'noelia@whatspro.uno').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const ALLOWED_ORIGINS = new Set((process.env.TERMINAL_ALLOWED_ORIGINS || 'https://whatspro.uno,https://www.whatspro.uno,https://chatpro.uno').split(',').map((s) => s.trim()).filter(Boolean));
const LOG_DIR = process.env.TERMINAL_LOG_DIR || '/var/log/whatspro-terminal';
const TICKET_MAX_AGE_MS = 45_000;
const IDLE_TIMEOUT_MS = 30 * 60_000;      // sin teclear 30 min → se desconecta (tmux sigue vivo)
const ABSOLUTE_TIMEOUT_MS = 8 * 3_600_000; // una conexión no dura más de 8 h
const TRANSCRIPT_CAP_BYTES = 25 * 1024 * 1024;

mkdirSync(`${LOG_DIR}/sessions`, { recursive: true, mode: 0o700 });

// ── Firma y tickets ──────────────────────────────────────────────────────────

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payloadB64) => b64u(createHmac('sha256', SECRET).update(payloadB64).digest());
function safeEqual(a, b) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Nonces ya usados, con su vencimiento: un ticket se abre UNA vez. */
const usedNonces = new Map();
setInterval(() => { const now = Date.now(); for (const [n, exp] of usedNonces) if (exp < now) usedNonces.delete(n); }, 60_000).unref();

function verifyTicket(ticket, req) {
  if (typeof ticket !== 'string' || !ticket.includes('.')) return { ok: false, reason: 'ticket_malformed' };
  const [payloadB64, sig] = ticket.split('.');
  if (!safeEqual(sign(payloadB64), sig)) return { ok: false, reason: 'bad_signature' };
  let p;
  try { p = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'bad_payload' }; }
  const now = Date.now();
  if (p.v !== 1 || typeof p.exp !== 'number' || typeof p.iat !== 'number') return { ok: false, reason: 'bad_version' };
  if (p.exp < now || p.iat > now + 5_000 || p.exp - p.iat > TICKET_MAX_AGE_MS + 5_000) return { ok: false, reason: 'expired' };
  if (!p.nonce || usedNonces.has(p.nonce)) return { ok: false, reason: 'nonce_reused' };
  if (!ALLOWED_EMAILS.has(String(p.email || '').toLowerCase())) return { ok: false, reason: 'email_not_allowed' };
  if (!PROJECTS.has(p.project)) return { ok: false, reason: 'project_unknown' };
  if (!AGENTS[p.mode]) return { ok: false, reason: 'mode_unknown' };
  if (!Number.isInteger(p.slot) || p.slot < 1 || p.slot > (PROJECTS.get(p.project).maxSessions || 4)) return { ok: false, reason: 'slot_out_of_range' };
  const ip = clientIp(req);
  if (p.ip && ip && p.ip !== ip) return { ok: false, reason: 'ip_mismatch', detail: `${p.ip} ≠ ${ip}` };
  usedNonces.set(p.nonce, p.exp + 60_000);
  return { ok: true, payload: p };
}

/** Auth de la API interna (lista/cierre de sesiones desde la app): HMAC del timestamp, ventana de 60 s. */
function verifyInternal(req) {
  const ts = req.headers['x-terminal-ts']; const sig = req.headers['x-terminal-sig'];
  if (typeof ts !== 'string' || typeof sig !== 'string') return false;
  if (Math.abs(Date.now() - Number(ts)) > 60_000) return false;
  return safeEqual(sign(`internal:${ts}`), sig);
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

// ── Auditoría ────────────────────────────────────────────────────────────────

function audit(event, data) {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...data }) + '\n';
  try { appendFileSync(`${LOG_DIR}/audit.jsonl`, line, { mode: 0o600 }); } catch (error) { console.error('[terminal-gateway/audit]', error); }
  console.log(`[terminal-gateway] ${event}`, data.sessionId ?? '', data.email ?? '', data.project ?? '', data.reason ?? '');
}

class Transcript {
  constructor(path) { this.fd = openSync(path, 'a', 0o600); this.capped = false; }
  write(prefix, chunk) {
    if (this.capped) return;
    try {
      if (fstatSync(this.fd).size > TRANSCRIPT_CAP_BYTES) { writeSync(this.fd, '\n[transcripción cortada: superó el tope]\n'); this.capped = true; return; }
      writeSync(this.fd, prefix ? `${prefix}${chunk}` : chunk);
    } catch { /* la transcripción nunca tumba la sesión */ }
  }
  close() { try { closeSync(this.fd); } catch { /* ya cerrado */ } }
}

// ── Sesiones ─────────────────────────────────────────────────────────────────

/** id → { ws, pty, meta } de las CONEXIONES vivas. El proceso vive en tmux aunque la conexión muera. */
const live = new Map();
const tmuxName = (p) => `wp-${p.uid}-${p.project}-${p.slot}`.replace(/[^a-zA-Z0-9_-]/g, '');

/** Un entorno limpio: ni los secretos del .env de la app ni los del gateway llegan a la shell. */
function shellEnv(p, project) {
  return {
    PATH: '/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    HOME: process.env.HOME || '/root',
    USER: process.env.USER || 'root',
    SHELL: '/bin/bash',
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    TZ: process.env.TZ || 'UTC',
    WHATSPRO_TERMINAL: '1',
    WHATSPRO_TERMINAL_USER: p.email,
    WHATSPRO_TERMINAL_PROJECT: project.slug,
    WHATSPRO_TERMINAL_SESSION: tmuxName(p),
  };
}

function spawnSession(p, project, cols, rows) {
  const agent = AGENTS[p.mode];
  const name = tmuxName(p);
  // `new-session -A` = crear o adjuntar: refrescar la página vuelve a la misma
  // sesión con el proceso vivo (doc 01 §4). El comando del agente sólo se
  // pasa al CREAR: si ya existía, se adjunta a lo que estaba corriendo.
  const args = ['new-session', '-A', '-s', name, '-c', project.cwd];
  if (agent.command) args.push(agent.command);
  return pty.spawn('/usr/bin/tmux', args, { name: 'xterm-256color', cols, rows, cwd: project.cwd, env: shellEnv(p, project) });
}

function listSessions() {
  return [...live.values()].map(({ meta }) => ({ ...meta, connectedFor: Date.now() - meta.connectedAt }));
}

function killTmux(name) {
  try { execFileSync('/usr/bin/tmux', ['kill-session', '-t', name], { env: { PATH: '/usr/bin:/bin' }, timeout: 5_000, stdio: 'ignore' }); return true; } catch { return false; }
}

// ── HTTP + WS ────────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://gateway');
  if (req.method === 'GET' && url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, live: live.size, bind: BIND })); }
  if (!verifyInternal(req)) { res.writeHead(401); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/sessions') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ sessions: listSessions() })); }
  const kill = url.pathname.match(/^\/sessions\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'DELETE' && kill) {
    const name = kill[1];
    for (const [id, s] of live) if (s.meta.tmux === name) { try { s.ws.close(4001, 'killed'); } catch { /* ya cerrado */ } live.delete(id); }
    const ok = killTmux(name);
    audit('session_killed', { tmux: name, by: 'api', ok });
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok }));
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://gateway');
  const origin = req.headers.origin;
  if (url.pathname !== '/ws' || !origin || !ALLOWED_ORIGINS.has(origin)) {
    audit('upgrade_rejected', { reason: 'origin_or_path', origin: origin ?? null, path: url.pathname, ip: clientIp(req) });
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy();
  }
  const check = verifyTicket(url.searchParams.get('ticket'), req);
  if (!check.ok) {
    audit('ticket_rejected', { reason: check.reason, detail: check.detail ?? null, ip: clientIp(req) });
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy();
  }
  const p = check.payload;
  const perUser = [...live.values()].filter((s) => s.meta.uid === p.uid).length;
  if (perUser >= 6) {
    audit('ticket_rejected', { reason: 'too_many_connections', email: p.email, ip: clientIp(req) });
    socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => attach(ws, p, req));
});

function attach(ws, p, req) {
  const project = PROJECTS.get(p.project);
  const sessionId = randomUUID();
  const cols = Math.min(Math.max(Number(new URL(req.url, 'http://g').searchParams.get('cols')) || 120, 20), 400);
  const rows = Math.min(Math.max(Number(new URL(req.url, 'http://g').searchParams.get('rows')) || 32, 5), 200);
  const tmux = tmuxName(p);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const transcript = new Transcript(`${LOG_DIR}/sessions/${stamp}-${p.uid}-${p.project}-${p.slot}.log`);
  const meta = { sessionId, uid: p.uid, email: p.email, project: p.project, mode: p.mode, slot: p.slot, tmux, ip: clientIp(req), connectedAt: Date.now(), lastInputAt: Date.now() };

  let term;
  try { term = spawnSession(p, project, cols, rows); } catch (error) {
    audit('spawn_failed', { ...meta, reason: String(error?.message || error) });
    transcript.close();
    return ws.close(4002, 'spawn failed');
  }
  live.set(sessionId, { ws, pty: term, meta });
  audit('session_opened', { ...meta, cwd: project.cwd });
  transcript.write('', `# ${meta.email} · ${project.slug} · ${p.mode} · slot ${p.slot} · ${new Date().toISOString()} · ip ${meta.ip}\n`);
  ws.send(JSON.stringify({ t: 's', status: 'connected', sessionId, tmux, project: project.slug, cwd: project.cwd, mode: p.mode }));

  term.onData((data) => { transcript.write('', data); if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'o', d: data })); });
  term.onExit(({ exitCode }) => {
    audit('session_exited', { ...meta, exitCode });
    if (ws.readyState === ws.OPEN) { ws.send(JSON.stringify({ t: 'x', code: exitCode })); ws.close(1000, 'exit'); }
    cleanup('exit');
  });

  const idle = setInterval(() => {
    const now = Date.now();
    if (now - meta.lastInputAt > IDLE_TIMEOUT_MS) { ws.send(JSON.stringify({ t: 's', status: 'idle_timeout' })); ws.close(4003, 'idle'); }
    else if (now - meta.connectedAt > ABSOLUTE_TIMEOUT_MS) { ws.send(JSON.stringify({ t: 's', status: 'absolute_timeout' })); ws.close(4004, 'absolute'); }
  }, 30_000);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.t === 'i' && typeof msg.d === 'string') { meta.lastInputAt = Date.now(); transcript.write('', msg.d); term.write(msg.d); }
    else if (msg.t === 'r' && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) term.resize(Math.min(Math.max(msg.cols, 20), 400), Math.min(Math.max(msg.rows, 5), 200));
    else if (msg.t === 'p') ws.send(JSON.stringify({ t: 'p' }));
  });

  let done = false;
  const cleanup = (reason) => {
    if (done) return; done = true;
    clearInterval(idle);
    live.delete(sessionId);
    // Se suelta la PTY: tmux conserva el proceso. Matar de verdad es DELETE /sessions/:tmux.
    try { term.kill(); } catch { /* ya murió */ }
    transcript.write('', `\n# fin ${new Date().toISOString()} · ${reason}\n`);
    transcript.close();
    audit('session_closed', { ...meta, reason, connectedFor: Date.now() - meta.connectedAt });
  };
  ws.on('close', (code) => cleanup(`ws_close_${code}`));
  ws.on('error', (error) => cleanup(`ws_error_${error?.code || 'unknown'}`));
}

server.listen(PORT, BIND, () => {
  audit('gateway_started', { bind: BIND, port: PORT, projects: [...PROJECTS.keys()], allowed: [...ALLOWED_EMAILS] });
});
process.on('SIGTERM', () => { for (const s of live.values()) { try { s.ws.close(1001, 'gateway restart'); } catch { /* */ } } process.exit(0); });
