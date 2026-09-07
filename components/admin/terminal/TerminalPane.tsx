'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { Tab, TabStatus } from './tipos';

/**
 * Un panel de xterm enganchado a UNA conexión del gateway.
 *
 * La regla es: un ticket, una conexión. El ticket llega por props; cuando
 * cambia (reconectar) se cierra la conexión anterior y se abre otra sobre la
 * misma sesión tmux. El ticket ya usado se recuerda para no reabrir por un
 * re-render. Todo lo que el resto de la pantalla necesita hacerle a la
 * terminal (mandar una tecla, pegar, cambiar el tamaño de letra, enfocar)
 * entra por el `ref` imperativo: así la barra de teclas del celular y los
 * comandos rápidos del panel no tienen que saber de WebSockets.
 *
 * El texto inicial de una misión se manda una sola vez, dos segundos después
 * de conectar: Claude Code y Codex tardan eso en estar listos para leer.
 */
export type TerminalPaneHandle = {
  send: (data: string) => void;
  focus: () => void;
  fit: () => void;
  setFontSize: (size: number) => void;
  /** Ctrl pegajoso: la próxima letra tecleada sale como carácter de control. */
  setStickyCtrl: (on: boolean) => void;
};

const DEMORA_MISION_MS = 2000;

export const TerminalPane = forwardRef<TerminalPaneHandle, {
  tab: Tab;
  visible: boolean;
  fontSize: number;
  onStatus: (id: string, status: TabStatus, detail?: string) => void;
  onConnected: (id: string, info: { tmux: string; project: string; mode: string }) => void;
  onStickyConsumed?: () => void;
}>(function TerminalPane({ tab, visible, fontSize, onStatus, onConnected, onStickyConsumed }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ticketUsado = useRef<string | null>(null);
  const misionEnviada = useRef(false);
  const stickyCtrl = useRef(false);
  const callbacks = useRef({ onStatus, onConnected, onStickyConsumed });
  callbacks.current = { onStatus, onConnected, onStickyConsumed };

  const send = (data: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d: data }));
  };
  const fit = () => { try { fitRef.current?.fit(); } catch { /* sin tamaño todavía */ } };

  useImperativeHandle(ref, () => ({
    send,
    focus: () => termRef.current?.focus(),
    fit,
    setFontSize: (size) => { const term = termRef.current; if (!term) return; term.options.fontSize = size; fit(); },
    setStickyCtrl: (on) => { stickyCtrl.current = on; },
  }));

  useEffect(() => {
    if (!tab.ticket || tab.ticket === ticketUsado.current || !hostRef.current) return;
    ticketUsado.current = tab.ticket;
    const ticket = tab.ticket;
    let cancelado = false;
    let timerMision = 0;

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
      if (cancelado || !hostRef.current) return;
      if (!termRef.current) {
        const term = new Terminal({
          cursorBlink: true,
          fontSize,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
          theme: { background: '#0b0f14', foreground: '#e6edf3', cursor: '#34d399' },
          scrollback: 5000,
          allowProposedApi: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(hostRef.current);
        // Todo lo que la persona teclea pasa por acá: es donde el Ctrl
        // pegajoso convierte "c" en Ctrl+C sin depender de que el teclado
        // del celular mande un `keydown` legible (Android suele no hacerlo).
        term.onData((d) => {
          if (stickyCtrl.current && /^[a-zA-Z]$/.test(d)) {
            stickyCtrl.current = false;
            callbacks.current.onStickyConsumed?.();
            send(String.fromCharCode(d.toUpperCase().charCodeAt(0) & 31));
            return;
          }
          send(d);
        });
        term.onResize(({ cols, rows }) => {
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'r', cols, rows }));
        });
        termRef.current = term;
        fitRef.current = fitAddon;
      }
      const term = termRef.current;
      fit();

      // Reconectar: se cierra la conexión vieja antes de abrir la nueva.
      try { wsRef.current?.close(1000, 'reconnect'); } catch { /* ya cerrada */ }
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/terminal-gateway/ws?ticket=${encodeURIComponent(ticket)}&cols=${term.cols}&rows=${term.rows}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      callbacks.current.onStatus(tab.id, 'connecting');

      ws.onopen = () => { callbacks.current.onStatus(tab.id, 'connected'); term.focus(); };
      ws.onmessage = (event) => {
        let msg: { t: string; d?: string; status?: string; code?: number; tmux?: string; project?: string; mode?: string };
        try { msg = JSON.parse(String(event.data)); } catch { return; }
        if (msg.t === 'o' && msg.d) { term.write(msg.d); return; }
        if (msg.t === 's') {
          if (msg.status === 'connected') {
            callbacks.current.onConnected(tab.id, { tmux: msg.tmux ?? '', project: msg.project ?? tab.project, mode: msg.mode ?? tab.mode });
            if (tab.initialInput && !misionEnviada.current) {
              misionEnviada.current = true;
              const texto = tab.initialInput;
              timerMision = window.setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d: `${texto}\n` }));
              }, DEMORA_MISION_MS);
            }
            return;
          }
          const aviso = msg.status === 'idle_timeout'
            ? 'Desconectada por 30 minutos sin actividad. El proceso sigue vivo en tmux: reconectá para volver.'
            : msg.status === 'absolute_timeout'
              ? 'La conexión cumplió 8 horas. Reconectá para seguir en la misma sesión.'
              : msg.status;
          term.write(`\r\n\x1b[33m[${aviso}]\x1b[0m\r\n`);
          return;
        }
        if (msg.t === 'x') term.write(`\r\n\x1b[90m[proceso terminado · código ${msg.code}]\x1b[0m\r\n`);
      };
      ws.onclose = (event) => {
        if (wsRef.current !== ws) return; // la reemplazó una reconexión
        const detalle = `${event.code}${event.reason ? ` ${event.reason}` : ''}`;
        callbacks.current.onStatus(tab.id, event.code >= 4000 && event.code !== 4003 && event.code !== 4004 ? 'error' : 'disconnected', detalle);
        term.write(`\r\n\x1b[90m[conexión cerrada · ${detalle}. El proceso sigue en tmux: «Reconectar» vuelve a él.]\x1b[0m\r\n`);
      };
      ws.onerror = () => { if (wsRef.current === ws) callbacks.current.onStatus(tab.id, 'error', 'ws error'); };

      const ping = window.setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'p' })); else window.clearInterval(ping); }, 25_000);
      ws.addEventListener('close', () => { window.clearInterval(ping); window.clearTimeout(timerMision); });
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.ticket]);

  // El tamaño real de la terminal depende del contenedor Y del teclado del
  // celular: `visualViewport` cambia cuando aparece, y el ResizeObserver
  // cuando se abre/cierra un panel o se divide la pantalla.
  useEffect(() => {
    if (!visible) return;
    fit();
    const host = hostRef.current;
    const observer = typeof ResizeObserver !== 'undefined' && host ? new ResizeObserver(() => fit()) : null;
    if (host && observer) observer.observe(host);
    const vv = window.visualViewport;
    const onVv = () => fit();
    vv?.addEventListener('resize', onVv);
    vv?.addEventListener('scroll', onVv);
    window.addEventListener('resize', onVv);
    return () => {
      observer?.disconnect();
      vv?.removeEventListener('resize', onVv);
      vv?.removeEventListener('scroll', onVv);
      window.removeEventListener('resize', onVv);
    };
  }, [visible]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = fontSize;
    fit();
  }, [fontSize]);

  useEffect(() => () => {
    try { wsRef.current?.close(1000, 'unmount'); } catch { /* */ }
    try { termRef.current?.dispose(); } catch { /* */ }
  }, []);

  return (
    <div
      ref={hostRef}
      className="h-full min-h-[240px] w-full touch-manipulation bg-[#0b0f14] p-1 [&_.xterm]:h-full"
      data-testid={`terminal-pane-${tab.project}-${tab.slot}`}
      data-estado={tab.status}
    />
  );
});
