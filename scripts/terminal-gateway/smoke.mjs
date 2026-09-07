/**
 * Smoke del Terminal Gateway, de punta a punta y sin navegador:
 *
 *   node --env-file=/root/whatsaas/.env.terminal scripts/terminal-gateway/smoke.mjs [wss://whatspro.uno/terminal-gateway/ws]
 *
 * Firma un ticket con el MISMO secreto que usa la app (así que también prueba
 * que app y gateway coinciden), abre el WebSocket, manda `pwd` y espera ver la
 * carpeta del proyecto en la salida; después prueba que el mismo ticket NO se
 * pueda usar dos veces y que uno vencido se rechace. Al final mata la sesión
 * tmux de prueba. Sale con 1 si algo falla.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import WebSocket from 'ws';

const SECRET = process.env.TERMINAL_GATEWAY_SECRET;
if (!SECRET) { console.error('falta TERMINAL_GATEWAY_SECRET (corré con --env-file=/root/whatsaas/.env.terminal)'); process.exit(1); }
const URL_WS = process.argv[2] || `ws://${process.env.TERMINAL_GATEWAY_BIND || '172.19.0.1'}:${process.env.TERMINAL_GATEWAY_PORT || 3400}/ws`;
const ORIGIN = 'https://whatspro.uno';
const EMAIL = (process.env.TERMINAL_ALLOWED_EMAILS || 'noelia@whatspro.uno').split(',')[0].trim();
const SLOT = 4; // la última ranura del proyecto, para no pisar una sesión real
const PROJECT = 'whatspro';

const b64u = (s) => Buffer.from(s).toString('base64url');
const ticket = (extra = {}) => {
  const now = Date.now();
  const p = { v: 1, uid: 0, email: EMAIL, project: PROJECT, mode: 'shell', slot: SLOT, ip: null, nonce: randomBytes(16).toString('hex'), iat: now, exp: now + 45_000, ...extra };
  const payload = b64u(JSON.stringify(p));
  return `${payload}.${b64u(createHmac('sha256', SECRET).update(payload).digest())}`;
};

let fallos = 0;
const ok = (cond, msg, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${msg}${extra ? ` → ${extra}` : ''}`); if (!cond) fallos += 1; };

function conectar(t, { esperarOutput = true } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${URL_WS}?ticket=${encodeURIComponent(t)}&cols=100&rows=30`, { headers: { Origin: ORIGIN }, handshakeTimeout: 8000 });
    let salida = ''; let estado = null; let abierto = false;
    const fin = (r) => { try { ws.close(1000, 'smoke'); } catch { /* */ } resolve({ abierto, estado, salida, ...r }); };
    ws.on('open', () => { abierto = true; if (!esperarOutput) return fin({}); setTimeout(() => ws.send(JSON.stringify({ t: 'i', d: 'pwd\n' })), 800); setTimeout(() => fin({}), 4000); });
    ws.on('message', (raw) => { try { const m = JSON.parse(raw.toString()); if (m.t === 'o') salida += m.d; if (m.t === 's') estado = m.status; } catch { /* */ } });
    ws.on('unexpected-response', (_req, res) => fin({ http: res.statusCode }));
    ws.on('error', (e) => fin({ error: e.message }));
  });
}

const t1 = ticket();
const r1 = await conectar(t1);
ok(r1.abierto && r1.estado === 'connected', 'abre el WebSocket con un ticket válido', r1.http ? `HTTP ${r1.http}` : r1.error ?? r1.estado);
ok(r1.salida.includes('/root/whatsaas'), 'la shell arranca en la carpeta del proyecto (pwd)', r1.salida.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trim().split('\n').slice(-3).join(' | ').slice(0, 160));

const r2 = await conectar(t1, { esperarOutput: false });
ok(!r2.abierto && r2.http === 401, 'el mismo ticket NO sirve dos veces (nonce)', r2.http ? `HTTP ${r2.http}` : r2.error);

const r3 = await conectar(ticket({ iat: Date.now() - 120_000, exp: Date.now() - 60_000 }), { esperarOutput: false });
ok(!r3.abierto && r3.http === 401, 'un ticket vencido se rechaza', r3.http ? `HTTP ${r3.http}` : r3.error);

const r4 = await conectar(ticket({ email: 'otro@ejemplo.com' }), { esperarOutput: false });
ok(!r4.abierto && r4.http === 401, 'un email fuera de la lista blanca se rechaza', r4.http ? `HTTP ${r4.http}` : r4.error);

const r5 = await conectar(ticket({ project: 'etc' }), { esperarOutput: false });
ok(!r5.abierto && r5.http === 401, 'un proyecto fuera del registro se rechaza', r5.http ? `HTTP ${r5.http}` : r5.error);

const malo = t1.slice(0, -4) + 'AAAA';
const r6 = await conectar(malo, { esperarOutput: false });
ok(!r6.abierto && r6.http === 401, 'una firma alterada se rechaza', r6.http ? `HTTP ${r6.http}` : r6.error);

// Reconexión: otro ticket, misma ranura → misma sesión tmux (el proceso siguió vivo).
const r7 = await conectar(ticket());
ok(r7.abierto && r7.salida.includes('/root/whatsaas'), 'reconectar a la misma ranura vuelve a la sesión tmux viva');

try { execFileSync('/usr/bin/tmux', ['kill-session', '-t', `wp-0-${PROJECT}-${SLOT}`], { stdio: 'ignore' }); ok(true, 'sesión tmux de prueba cerrada'); } catch { ok(false, 'no se pudo cerrar la sesión tmux de prueba'); }

console.log(fallos ? `\n${fallos} chequeos fallaron.` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
