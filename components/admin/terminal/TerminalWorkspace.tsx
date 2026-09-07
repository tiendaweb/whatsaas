'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import '@xterm/xterm/css/xterm.css';
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

/**
 * Terminales del Developer Command Center · Fase 1–3.
 *
 * Multi-terminal con pestañas (hasta el máximo del proyecto), cada una con su
 * propio WebSocket al gateway y su sesión tmux: refrescar la página o cerrar
 * la pestaña NO mata el proceso, sólo desconecta; «Reconectar» vuelve a la
 * misma sesión. Abrir cualquier terminal pide la contraseña de nuevo: el
 * ticket que devuelve la API dura 45 segundos y sirve una sola vez.
 *
 * xterm.js se importa dinámicamente porque toca `window` al cargar.
 */

type Mode = 'shell' | 'claude' | 'codex';
type Project = { slug: string; name: string; cwd: string; stack: string; productionUrl: string; defaultBranch: string; agents: string[]; defaultAgent: string; maxSessions: number; commands: Record<string, string> };
type Catalog = { projects: Project[]; agents: Record<Mode, { name: string; command: string | null }>; sessions: Array<{ sessionId: string; project: string; mode: Mode; slot: number; tmux: string; connectedAt: number }>; gatewayOk: boolean };
type Tab = { id: string; project: string; mode: Mode; slot: number; title: string; status: 'connecting' | 'connected' | 'disconnected' | 'error'; detail?: string };

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
  return body as Catalog;
};

const MODE_LABEL: Record<Mode, string> = { shell: 'Shell', claude: 'Claude Code', codex: 'Codex' };
const STATUS_DOT: Record<Tab['status'], string> = { connecting: 'bg-amber-400', connected: 'bg-emerald-400', disconnected: 'bg-neutral-500', error: 'bg-red-500' };

export function TerminalWorkspace({ email }: { email: string }) {
  const { data, error, mutate } = useSWR<Catalog>('/api/admin/terminal/sessions', fetcher, { refreshInterval: 15_000, revalidateOnFocus: false });
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [project, setProject] = useState('');
  const [mode, setMode] = useState<Mode>('shell');
  const [password, setPassword] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [split, setSplit] = useState(false);

  useEffect(() => {
    if (!project && data?.projects[0]) { setProject(data.projects[0].slug); setMode((data.projects[0].defaultAgent as Mode) ?? 'shell'); }
  }, [data, project]);

  const proyecto = data?.projects.find((p) => p.slug === project) ?? null;
  const usadas = tabs.filter((t) => t.project === project).map((t) => t.slot);
  const proximoSlot = useMemo(() => { for (let s = 1; s <= (proyecto?.maxSessions ?? 4); s += 1) if (!usadas.includes(s)) return s; return null; }, [proyecto?.maxSessions, usadas]);

  const abrir = async (reuse?: Tab) => {
    if (!proyecto && !reuse) return;
    const target = reuse ?? { project: proyecto!.slug, mode, slot: proximoSlot! };
    if (!reuse && proximoSlot == null) { setAviso(`${proyecto!.name} ya tiene ${proyecto!.maxSessions} terminales abiertas.`); return; }
    if (!password) { setAviso('Escribí tu contraseña para abrir la terminal.'); return; }
    setOpening(true); setAviso(null);
    try {
      const response = await fetch('/api/admin/terminal/ticket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: target.project, mode: target.mode, slot: target.slot, password }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body?.error ?? `Error ${response.status}`));
      const id = reuse?.id ?? `${target.project}-${target.slot}-${Date.now()}`;
      const tab: Tab = { id, project: target.project, mode: target.mode, slot: target.slot, title: `${data?.projects.find((p) => p.slug === target.project)?.name ?? target.project} · ${MODE_LABEL[target.mode]} #${target.slot}`, status: 'connecting' };
      setTabs((prev) => (reuse ? prev.map((t) => (t.id === id ? tab : t)) : [...prev, tab]));
      setActiveId(id);
      tickets.current.set(id, String(body.ticket));
      setPassword('');
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo abrir la terminal.');
    } finally {
      setOpening(false);
    }
  };

  const tickets = useRef(new Map<string, string>());
  const cerrarPestana = (id: string) => { setTabs((prev) => prev.filter((t) => t.id !== id)); tickets.current.delete(id); if (activeId === id) setActiveId(tabs.find((t) => t.id !== id)?.id ?? null); };
  const matar = async (tab: Tab) => {
    if (!window.confirm(`¿Terminar de verdad la sesión ${tab.title}? Se mata el proceso (tmux), no sólo la conexión.`)) return;
    const tmux = data?.sessions.find((s) => s.project === tab.project && s.slot === tab.slot)?.tmux ?? `wp-${'?'}`;
    await fetch('/api/admin/terminal/sessions', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tmux }) }).catch(() => undefined);
    cerrarPestana(tab.id);
    void mutate();
  };
  const onStatus = useCallback((id: string, status: Tab['status'], detail?: string) => setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, status, detail } : t))), []);

  const visibles = split ? tabs.slice(-2) : tabs.filter((t) => t.id === activeId);

  return (
    <div className="flex h-screen flex-col" data-testid="terminal-workspace">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2">
        <div className="mr-auto">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">Developer Command Center</p>
          <p className="text-sm font-bold">Terminales <span className="font-normal text-neutral-400">· {email} · shell del servidor de producción, todo queda grabado</span></p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${data?.gatewayOk ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300'}`} data-testid="terminal-gateway-estado">
          <span className={`size-1.5 rounded-full ${data?.gatewayOk ? 'bg-emerald-400' : 'bg-red-500'}`} /> {data?.gatewayOk ? 'Gateway conectado' : 'Gateway sin respuesta'}
        </span>
        <button type="button" onClick={() => setSplit((v) => !v)} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-bold hover:bg-white/5" title="Ver las dos últimas terminales lado a lado">{split ? 'Una terminal' : 'Dividir'}</button>
        <a href="/dashboard" className="rounded-lg border border-white/15 px-2.5 py-1 text-xs font-bold hover:bg-white/5">Volver a WhatsPro</a>
      </header>

      <section className="flex flex-wrap items-end gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3" data-testid="terminal-nueva">
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wide text-neutral-400">Proyecto</span>
          <select value={project} onChange={(e) => { setProject(e.target.value); const p = data?.projects.find((x) => x.slug === e.target.value); if (p) setMode((p.defaultAgent as Mode) ?? 'shell'); }} className="block h-9 rounded-lg border border-white/15 bg-[#0b0f14] px-2 text-sm" data-testid="terminal-campo-proyecto">
            {(data?.projects ?? []).map((p) => <option key={p.slug} value={p.slug}>{p.name} · {p.cwd}</option>)}
          </select>
        </label>
        <div className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wide text-neutral-400">Modo</span>
          <div className="flex gap-1 rounded-lg bg-white/5 p-0.5">
            {(['shell', 'claude', 'codex'] as Mode[]).filter((m) => m === 'shell' || proyecto?.agents.includes(m)).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} data-testid={`terminal-modo-${m}`} className={`h-8 rounded-md px-2.5 text-xs font-bold ${mode === m ? 'bg-emerald-500 text-black' : 'text-neutral-300 hover:bg-white/10'}`}>{MODE_LABEL[m]}</button>
            ))}
          </div>
        </div>
        <label className="space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wide text-neutral-400">Tu contraseña (cada vez)</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void abrir(); }} className="block h-9 w-48 rounded-lg border border-white/15 bg-[#0b0f14] px-2 text-sm" data-testid="terminal-campo-password" />
        </label>
        <button type="button" disabled={opening || !proyecto || proximoSlot == null} onClick={() => void abrir()} className="h-9 rounded-lg bg-emerald-500 px-3 text-sm font-black text-black disabled:opacity-50" data-testid="terminal-accion-abrir">
          {opening ? 'Abriendo…' : `Abrir terminal${proximoSlot != null ? ` #${proximoSlot}` : ''}`}
        </button>
        {proyecto && <p className="w-full text-[11px] text-neutral-500">{proyecto.stack} · rama {proyecto.defaultBranch} · {proyecto.productionUrl} · máx. {proyecto.maxSessions} terminales · tmux persistente</p>}
        {aviso && <p className="w-full text-xs font-semibold text-amber-300" data-testid="terminal-aviso">{aviso}</p>}
        {error && <p className="w-full text-xs font-semibold text-red-300">{error.message}</p>}
      </section>

      {tabs.length > 0 && (
        <nav className="flex gap-1 overflow-x-auto border-b border-white/10 px-2 pt-1" role="tablist" data-testid="terminal-pestanas">
          {tabs.map((tab) => (
            <div key={tab.id} className={`flex shrink-0 items-center gap-2 rounded-t-lg px-3 py-1.5 text-xs ${tab.id === activeId ? 'bg-black text-white' : 'bg-white/5 text-neutral-400'}`}>
              <button type="button" role="tab" aria-selected={tab.id === activeId} onClick={() => setActiveId(tab.id)} className="flex items-center gap-2 font-bold" data-testid={`terminal-pestana-${tab.project}-${tab.slot}`} data-estado={tab.status}>
                <span className={`size-2 rounded-full ${STATUS_DOT[tab.status]}`} /> {tab.title}
              </button>
              {tab.status === 'disconnected' && <button type="button" onClick={() => void abrir(tab)} title="Volver a la misma sesión tmux (pide contraseña)" className="text-emerald-300 hover:underline">reconectar</button>}
              <button type="button" onClick={() => cerrarPestana(tab.id)} title="Cerrar la pestaña: el proceso sigue en tmux" className="text-neutral-500 hover:text-white">×</button>
              <button type="button" onClick={() => void matar(tab)} title="Terminar la sesión de verdad (mata el proceso)" className="text-red-400 hover:text-red-200">■</button>
            </div>
          ))}
        </nav>
      )}

      <main className={`grid min-h-0 flex-1 ${split && visibles.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {tabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-neutral-500">
            <p className="text-sm font-bold text-neutral-300">Sin terminales abiertas</p>
            <p className="max-w-lg text-xs">Elegí el proyecto y el modo, escribí tu contraseña y abrí. La shell arranca en la carpeta del proyecto dentro de una sesión tmux: si cerrás el navegador el proceso sigue, y «reconectar» vuelve a él.</p>
          </div>
        ) : tabs.map((tab) => (
          <div key={tab.id} className={visibles.some((v) => v.id === tab.id) ? 'min-h-0 border-r border-white/10 last:border-r-0' : 'hidden'}>
            <TerminalPane tab={tab} ticket={tickets.current.get(tab.id) ?? null} visible={visibles.some((v) => v.id === tab.id)} onStatus={onStatus} onConsumed={() => tickets.current.delete(tab.id)} />
          </div>
        ))}
      </main>
    </div>
  );
}

function TerminalPane({ tab, ticket, visible, onStatus, onConsumed }: { tab: Tab; ticket: string | null; visible: boolean; onStatus: (id: string, status: Tab['status'], detail?: string) => void; onConsumed: () => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Una conexión por ticket. Cuando el ticket cambia (reconectar), se abre otra.
  useEffect(() => {
    if (!ticket || !hostRef.current) return;
    let cancelled = false;
    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (cancelled || !hostRef.current) return;
      if (!termRef.current) {
        const term = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', theme: { background: '#0b0f14' }, scrollback: 5000, allowProposedApi: true });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(hostRef.current);
        termRef.current = term; fitRef.current = fit;
      }
      const term = termRef.current; const fit = fitRef.current!;
      fit.fit();
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/terminal-gateway/ws?ticket=${encodeURIComponent(ticket)}&cols=${term.cols}&rows=${term.rows}`;
      onConsumed();
      const ws = new WebSocket(url);
      wsRef.current = ws;
      onStatus(tab.id, 'connecting');
      ws.onopen = () => { onStatus(tab.id, 'connected'); term.focus(); };
      ws.onmessage = (event) => {
        let msg: { t: string; d?: string; status?: string; code?: number };
        try { msg = JSON.parse(String(event.data)); } catch { return; }
        if (msg.t === 'o' && msg.d) term.write(msg.d);
        else if (msg.t === 's' && msg.status && msg.status !== 'connected') term.write(`\r\n\x1b[33m[${msg.status === 'idle_timeout' ? 'desconectado por 30 min sin actividad: el proceso sigue en tmux' : msg.status === 'absolute_timeout' ? 'conexión de 8 h cumplida: reconectá' : msg.status}]\x1b[0m\r\n`);
        else if (msg.t === 'x') term.write(`\r\n\x1b[90m[proceso terminado · código ${msg.code}]\x1b[0m\r\n`);
      };
      ws.onclose = (event) => { onStatus(tab.id, event.code === 1000 ? 'disconnected' : event.code >= 4000 ? 'error' : 'disconnected', `${event.code} ${event.reason}`); term.write(`\r\n\x1b[90m[conexión cerrada · ${event.code}${event.reason ? ` ${event.reason}` : ''}]\x1b[0m\r\n`); };
      ws.onerror = () => onStatus(tab.id, 'error', 'ws error');
      const dataSub = term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d })); });
      const resizeSub = term.onResize(({ cols, rows }) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'r', cols, rows })); });
      const ping = window.setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'p' })); }, 25_000);
      ws.addEventListener('close', () => { dataSub.dispose(); resizeSub.dispose(); window.clearInterval(ping); });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  useEffect(() => {
    if (!visible) return;
    const onResize = () => { try { fitRef.current?.fit(); } catch { /* sin tamaño todavía */ } };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [visible]);

  useEffect(() => () => { try { wsRef.current?.close(1000, 'unmount'); } catch { /* */ } try { termRef.current?.dispose(); } catch { /* */ } }, []);

  return <div ref={hostRef} className="h-full min-h-[320px] w-full bg-[#0b0f14] p-1" data-testid={`terminal-pane-${tab.project}-${tab.slot}`} data-estado={tab.status} />;
}
