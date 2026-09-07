'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCopy, Columns2, Keyboard, Maximize2, Minimize2, Minus, PanelLeftClose, PanelLeftOpen, Plus, Power, RefreshCw, TerminalSquare, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MobileKeys } from './MobileKeys';
import { NuevaTerminalSheet, type SheetDefaults } from './NuevaTerminalSheet';
import { TerminalPane, type TerminalPaneHandle } from './TerminalPane';
import { MODE_LABEL, STATUS_LABEL, type Mode, type Project, type Tab, type TabStatus, type TerminalAutoOpen, type TerminalOpenedInfo } from './tipos';
import { pedirTicket, terminarSesion, useTerminalCatalog } from './useTerminalCatalog';

export type { TerminalAutoOpen, TerminalOpenedInfo } from './tipos';

/**
 * Terminales del Developer Command Center.
 *
 * Tres zonas: la barra de arriba (estado del gateway y acciones), un panel
 * lateral plegable en escritorio (proyectos con sus comandos, conexiones
 * vivas) y el centro con pestañas y xterm. En el celular el panel no existe:
 * hay un botón flotante «+» que abre la hoja de nueva terminal, y sobre el
 * teclado aparece la barra de teclas que el teclado virtual no tiene.
 *
 * `embedded` es para la app «Centro de Desarrollo»: sin cabecera de página y
 * a la altura del contenedor. `autoOpen` es cómo esa app pide una terminal ya
 * prellenada para una misión: el prompt se tipea solo al conectar.
 *
 * Pantalla completa: `requestFullscreen` cuando existe y, si no (iOS Safari),
 * un `fixed inset-0` con `100dvh` que hace lo mismo a los ojos de la persona.
 */
const LS_FONT = 'whatspro:terminal:fontSize';
const LS_PANEL = 'whatspro:terminal:panel';
const STATUS_DOT: Record<TabStatus, string> = { connecting: 'bg-amber-400', connected: 'bg-emerald-400', disconnected: 'bg-neutral-500', error: 'bg-red-500' };

function leerLS(key: string, fallback: string) { try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function escribirLS(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* sin storage */ } }

export function TerminalWorkspace({ email, embedded = false, autoOpen = null, onOpened, onClosedAll }: {
  email: string;
  embedded?: boolean;
  autoOpen?: TerminalAutoOpen | null;
  onOpened?: (info: TerminalOpenedInfo) => void;
  onClosedAll?: () => void;
}) {
  const { catalog, error: catalogError, refresh } = useTerminalCatalog();
  const projects = catalog?.projects ?? [];

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [split, setSplit] = useState(false);
  const [panelAbierto, setPanelAbierto] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [tecladoVisible, setTecladoVisible] = useState(true);
  const [ctrlActivo, setCtrlActivo] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [sheet, setSheet] = useState<{ defaults: SheetDefaults; reuseTabId?: string } | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [avisoGlobal, setAvisoGlobal] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const panes = useRef(new Map<string, TerminalPaneHandle | null>());
  const autoOpenKey = useRef<string | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    setFontSize(Number(leerLS(LS_FONT, '13')) || 13);
    setPanelAbierto(leerLS(LS_PANEL, '1') !== '0');
  }, []);
  const cambiarFuente = (delta: number) => setFontSize((f) => { const n = Math.min(22, Math.max(10, f + delta)); escribirLS(LS_FONT, String(n)); return n; });
  const togglePanel = () => setPanelAbierto((v) => { escribirLS(LS_PANEL, v ? '0' : '1'); return !v; });

  // La altura real en el celular es la del viewport visual: cuando aparece el
  // teclado, `100dvh` no baja y la terminal queda tapada; esto sí baja.
  useEffect(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!vv || !root) return;
    const aplicar = () => { root.style.setProperty('--vvh', `${Math.round(vv.height)}px`); };
    aplicar();
    vv.addEventListener('resize', aplicar);
    vv.addEventListener('scroll', aplicar);
    return () => { vv.removeEventListener('resize', aplicar); vv.removeEventListener('scroll', aplicar); };
  }, []);

  // Pantalla completa nativa si el navegador la tiene; si sale, se refleja.
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    const root = rootRef.current;
    if (fullscreen) {
      try { if (document.fullscreenElement) void document.exitFullscreen(); } catch { /* */ }
      setFullscreen(false);
      return;
    }
    setFullscreen(true);
    try { if (root?.requestFullscreen) void root.requestFullscreen().catch(() => undefined); } catch { /* iOS: queda el modo fijo */ }
    window.setTimeout(() => panes.current.get(activeId ?? '')?.fit(), 150);
  };

  const onStatus = useCallback((id: string, status: TabStatus, detail?: string) => setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, status, detail } : t))), []);
  const onConnected = useCallback((id: string, info: { tmux: string; project: string; mode: string }) => {
    const tab = tabsRef.current.find((t) => t.id === id);
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, tmux: info.tmux } : t)));
    refresh();
    if (tab && onOpened) onOpened({ missionId: tab.missionId, tmux: info.tmux, project: info.project, mode: info.mode, slot: tab.slot });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOpened]);

  const proximoSlot = (project: string) => {
    const p = projects.find((x) => x.slug === project);
    const usados = tabsRef.current.filter((t) => t.project === project).map((t) => t.slot);
    for (let s = 1; s <= (p?.maxSessions ?? 4); s += 1) if (!usados.includes(s)) return s;
    return null;
  };

  const abrirSheet = (defaults: SheetDefaults, reuseTabId?: string) => { setSheetError(null); setSheet({ defaults, reuseTabId }); };

  // La app pide una terminal prellenada. La `key` evita reabrir la hoja en cada render.
  useEffect(() => {
    if (!autoOpen || autoOpen.key === autoOpenKey.current || !projects.length) return;
    autoOpenKey.current = autoOpen.key;
    abrirSheet({ project: autoOpen.project, mode: autoOpen.mode, title: autoOpen.title, missionId: autoOpen.missionId, initialInput: autoOpen.initialInput });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen, projects.length]);

  const enviarSheet = async (input: { project: string; mode: Mode; title: string; password: string }) => {
    if (!sheet) return;
    const reuse = sheet.reuseTabId ? tabsRef.current.find((t) => t.id === sheet.reuseTabId) : undefined;
    const slot = reuse?.slot ?? sheet.defaults.reconnect?.slot ?? proximoSlot(input.project);
    const proyecto = projects.find((p) => p.slug === input.project);
    if (slot == null) { setSheetError(`${proyecto?.name ?? input.project} ya tiene ${proyecto?.maxSessions ?? 4} terminales abiertas. Cerrá una para abrir otra.`); return; }
    setAbriendo(true); setSheetError(null);
    try {
      const ticket = await pedirTicket({ project: input.project, mode: input.mode, slot, password: input.password, missionId: sheet.defaults.missionId, title: input.title || undefined });
      const nombre = proyecto?.name ?? input.project;
      const titulo = input.title || reuse?.title || `${nombre} · ${MODE_LABEL[input.mode]} #${slot}`;
      const id = reuse?.id ?? `${input.project}-${slot}-${Date.now()}`;
      const nueva: Tab = {
        id, project: input.project, mode: input.mode, slot, title: titulo, status: 'connecting', ticket,
        // Sólo la hoja que abrió la misión trae el texto: una terminal abierta a
        // mano después no lo hereda, y reconectar tampoco lo vuelve a tipear.
        initialInput: reuse ? undefined : sheet.defaults.initialInput,
        missionId: sheet.defaults.missionId ?? reuse?.missionId,
        tmux: reuse?.tmux ?? sheet.defaults.reconnect?.tmux,
      };
      setTabs((prev) => (reuse ? prev.map((t) => (t.id === id ? nueva : t)) : [...prev, nueva]));
      setActiveId(id);
      setSheet(null);
      setAvisoGlobal(null);
    } catch (error) {
      setSheetError(error instanceof Error ? error.message : 'No se pudo abrir la terminal.');
    } finally {
      setAbriendo(false);
    }
  };

  const cerrarPestana = (id: string) => {
    const siguiente = tabsRef.current.filter((t) => t.id !== id);
    panes.current.delete(id);
    setTabs(siguiente);
    if (activeId === id) setActiveId(siguiente[siguiente.length - 1]?.id ?? null);
    if (!siguiente.length) onClosedAll?.();
  };
  const terminar = async (tab: Tab) => {
    const tmux = tab.tmux ?? catalog?.sessions.find((s) => s.project === tab.project && s.slot === tab.slot)?.tmux;
    if (!tmux) { setAvisoGlobal('Esa pestaña nunca llegó a conectarse: no hay sesión que terminar. Cerrala.'); return; }
    if (!window.confirm(`¿Terminar de verdad «${tab.title}»? Se mata el proceso en tmux, no sólo la conexión.`)) return;
    const ok = await terminarSesion(tmux);
    if (!ok) setAvisoGlobal('El gateway no pudo terminar la sesión. Probá de nuevo o cerrá la pestaña.');
    cerrarPestana(tab.id);
    refresh();
  };

  const activa = tabs.find((t) => t.id === activeId) ?? null;
  const visibles = useMemo(() => (split ? tabs.slice(-2) : activa ? [activa] : []), [split, tabs, activa]);
  const paneActivo = () => panes.current.get(activeId ?? '') ?? null;
  const enviarSeq = (seq: string) => { paneActivo()?.send(seq); paneActivo()?.focus(); };
  const toggleCtrl = () => { const next = !ctrlActivo; setCtrlActivo(next); paneActivo()?.setStickyCtrl(next); paneActivo()?.focus(); };
  const pegar = async () => {
    let texto = '';
    try { texto = await navigator.clipboard.readText(); } catch { texto = window.prompt('Pegá el texto acá:') ?? ''; }
    if (texto) enviarSeq(texto);
  };
  const escribirComando = (cmd: string) => { if (!activa) { setAvisoGlobal('Abrí una terminal primero: el comando se escribe en la pestaña activa.'); return; } enviarSeq(cmd); };
  const copiar = async (texto: string) => { try { await navigator.clipboard.writeText(texto); setAvisoGlobal('Copiado.'); window.setTimeout(() => setAvisoGlobal(null), 1500); } catch { setAvisoGlobal('No se pudo copiar.'); } };

  const gatewayOk = catalog?.gatewayOk ?? false;
  const sesionesVivas = catalog?.sessions ?? [];

  return (
    <div
      ref={rootRef}
      data-testid="terminal-workspace"
      data-fullscreen={fullscreen}
      className={cn(
        'flex flex-col overflow-hidden bg-[#0b0f14] text-neutral-100',
        fullscreen ? 'fixed inset-0 z-[100] h-[var(--vvh,100dvh)]' : embedded ? 'h-full min-h-[60vh]' : 'h-[var(--vvh,100dvh)]',
      )}
    >
      {/* ── Barra superior ─────────────────────────────────────────────── */}
      <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-white/10 px-2 sm:gap-2 sm:px-3">
        {!embedded && !fullscreen && (
          <div className="mr-1 hidden min-w-0 md:block">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">Developer Command Center</p>
            <p className="truncate text-xs font-bold">Terminales <span className="font-normal text-neutral-500">· {email}</span></p>
          </div>
        )}
        <button type="button" onClick={togglePanel} className="hidden size-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 hover:bg-white/5 md:flex" title={panelAbierto ? 'Ocultar panel' : 'Mostrar panel'}>
          {panelAbierto ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold', gatewayOk ? 'border-emerald-500/40 text-emerald-300' : 'border-red-500/40 text-red-300')} data-testid="terminal-gateway-estado" title={gatewayOk ? 'El gateway responde' : 'El gateway no responde: las terminales no se pueden abrir'}>
          <span className={cn('size-1.5 rounded-full', gatewayOk ? 'bg-emerald-400' : 'bg-red-500')} />
          <span className="hidden sm:inline">{gatewayOk ? 'Gateway' : 'Sin gateway'}</span>
        </span>
        <div className="min-w-0 flex-1 truncate px-1 text-xs text-neutral-400">{activa ? <><span className="font-bold text-neutral-200">{activa.title}</span> · {STATUS_LABEL[activa.status]}</> : 'Sin terminal abierta'}</div>
        <button type="button" onClick={() => cambiarFuente(-1)} className="hidden size-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 hover:bg-white/5 sm:flex" title="Letra más chica"><Minus className="size-3.5" /></button>
        <button type="button" onClick={() => cambiarFuente(1)} className="hidden size-8 items-center justify-center rounded-lg border border-white/10 text-neutral-300 hover:bg-white/5 sm:flex" title="Letra más grande"><Plus className="size-3.5" /></button>
        <button type="button" onClick={() => setTecladoVisible((v) => !v)} className={cn('flex size-8 items-center justify-center rounded-lg border border-white/10 hover:bg-white/5 md:hidden', tecladoVisible ? 'text-emerald-300' : 'text-neutral-400')} title="Barra de teclas"><Keyboard className="size-4" /></button>
        <button type="button" onClick={() => setSplit((v) => !v)} disabled={tabs.length < 2} className={cn('hidden size-8 items-center justify-center rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-40 md:flex', split ? 'text-emerald-300' : 'text-neutral-300')} title="Ver dos terminales lado a lado"><Columns2 className="size-4" /></button>
        <button type="button" data-testid="terminal-accion-fullscreen" onClick={toggleFullscreen} className={cn('flex size-8 items-center justify-center rounded-lg border border-white/10 hover:bg-white/5', fullscreen ? 'text-emerald-300' : 'text-neutral-300')} title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
          {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button type="button" onClick={() => abrirSheet({ project: projects[0]?.slug ?? '', mode: (projects[0]?.defaultAgent as Mode) ?? 'shell' })} disabled={!projects.length} className="hidden h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-2.5 text-xs font-black text-black disabled:opacity-50 md:flex"><Plus className="size-4" /> Nueva</button>
        {!embedded && !fullscreen && <a href="/dashboard" className="hidden h-8 items-center rounded-lg border border-white/10 px-2.5 text-xs font-bold text-neutral-300 hover:bg-white/5 md:flex">Volver</a>}
      </header>

      {(avisoGlobal || catalogError) && (
        <p className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200" data-testid="terminal-aviso-global">{avisoGlobal ?? catalogError?.message}</p>
      )}
      {!gatewayOk && catalog && (
        <p className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200">El gateway de terminales no responde. Las sesiones tmux siguen vivas en el servidor; cuando vuelva, «Reconectar».</p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Panel lateral (escritorio) ──────────────────────────────── */}
        {panelAbierto && !fullscreen && (
          <aside className="hidden w-72 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-white/[0.02] md:flex" data-testid="terminal-panel">
            <section className="border-b border-white/10 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">Proyectos</p>
              <div className="space-y-2">
                {projects.map((p) => <ProyectoCard key={p.slug} project={p} activo={activa?.project === p.slug} onAbrir={() => abrirSheet({ project: p.slug, mode: (p.defaultAgent as Mode) ?? 'shell' })} onEscribir={escribirComando} onCopiar={copiar} />)}
                {!projects.length && <p className="text-xs text-neutral-500">Cargando proyectos…</p>}
              </div>
            </section>
            <section className="p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">Sesiones</p>
              {!tabs.length && !sesionesVivas.length && <p className="text-xs text-neutral-500">Ninguna. Abrí una con «Nueva».</p>}
              <div className="space-y-1">
                {tabs.map((tab) => (
                  <div key={tab.id} className={cn('rounded-lg border px-2 py-1.5 text-xs', tab.id === activeId ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10')}>
                    <button type="button" onClick={() => setActiveId(tab.id)} className="flex w-full items-center gap-2 text-left font-bold">
                      <span className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[tab.status])} /> <span className="truncate">{tab.title}</span>
                    </button>
                    <div className="mt-1 flex gap-2 text-[10px] text-neutral-400">
                      <span>{STATUS_LABEL[tab.status]}</span>
                      {tab.status !== 'connected' && tab.status !== 'connecting' && <button type="button" onClick={() => abrirSheet({ project: tab.project, mode: tab.mode, reconnect: { slot: tab.slot, tmux: tab.tmux }, missionId: tab.missionId }, tab.id)} className="text-emerald-300 hover:underline">reconectar</button>}
                      <button type="button" onClick={() => cerrarPestana(tab.id)} className="hover:text-white">cerrar</button>
                      <button type="button" onClick={() => void terminar(tab)} className="text-red-400 hover:text-red-200">terminar</button>
                    </div>
                  </div>
                ))}
                {sesionesVivas.filter((s) => !tabs.some((t) => t.project === s.project && t.slot === s.slot)).map((s) => (
                  <div key={s.sessionId} className="rounded-lg border border-dashed border-white/15 px-2 py-1.5 text-xs" title="Conexión abierta en otra pestaña o dispositivo">
                    <p className="truncate font-bold text-neutral-300">{s.title || `${projects.find((p) => p.slug === s.project)?.name ?? s.project} · ${MODE_LABEL[s.mode] ?? s.mode} #${s.slot}`}</p>
                    <div className="mt-1 flex gap-2 text-[10px] text-neutral-400">
                      <span>viva en otro lado</span>
                      <button type="button" onClick={() => abrirSheet({ project: s.project, mode: s.mode, reconnect: { slot: s.slot, tmux: s.tmux }, missionId: s.mission ?? undefined })} className="text-emerald-300 hover:underline">abrir acá</button>
                      <button type="button" onClick={() => { if (window.confirm('¿Terminar esa sesión?')) void terminarSesion(s.tmux).then(refresh); }} className="text-red-400 hover:text-red-200">terminar</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        )}

        {/* ── Centro ──────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {tabs.length > 0 && (
            <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 px-1.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" data-testid="terminal-pestanas">
              {tabs.map((tab) => (
                <div key={tab.id} className={cn('flex shrink-0 items-center gap-1 rounded-t-lg pl-2.5 pr-1 text-xs', tab.id === activeId ? 'bg-black text-white' : 'bg-white/5 text-neutral-400')}>
                  <button type="button" role="tab" aria-selected={tab.id === activeId} onClick={() => setActiveId(tab.id)} className="flex h-9 max-w-[46vw] items-center gap-2 font-bold sm:max-w-xs" data-testid={`terminal-pestana-${tab.project}-${tab.slot}`} data-estado={tab.status} title={`${tab.title} · ${STATUS_LABEL[tab.status]}${tab.detail ? ` · ${tab.detail}` : ''}`}>
                    <span className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[tab.status])} /> <span className="truncate">{tab.title}</span>
                  </button>
                  {tab.status !== 'connected' && tab.status !== 'connecting' && (
                    <button type="button" onClick={() => abrirSheet({ project: tab.project, mode: tab.mode, reconnect: { slot: tab.slot, tmux: tab.tmux }, missionId: tab.missionId }, tab.id)} title="Reconectar a la misma sesión tmux (pide contraseña)" className="flex size-7 items-center justify-center rounded text-emerald-300 hover:bg-white/10"><RefreshCw className="size-3.5" /></button>
                  )}
                  <button type="button" onClick={() => void terminar(tab)} title="Terminar la sesión de verdad (mata el proceso)" className="flex size-7 items-center justify-center rounded text-red-400 hover:bg-white/10"><Power className="size-3.5" /></button>
                  <button type="button" onClick={() => cerrarPestana(tab.id)} title="Cerrar la pestaña: el proceso sigue en tmux" className="flex size-7 items-center justify-center rounded text-neutral-500 hover:bg-white/10 hover:text-white"><X className="size-3.5" /></button>
                </div>
              ))}
            </nav>
          )}

          <main className={cn('grid min-h-0 flex-1', split && visibles.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
            {tabs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-neutral-500">
                <TerminalSquare className="size-8 text-neutral-600" aria-hidden />
                <p className="text-sm font-bold text-neutral-300">Sin terminales abiertas</p>
                <p className="max-w-md text-xs">Elegí proyecto y modo, escribí tu contraseña y abrí. La shell arranca en la carpeta del proyecto dentro de tmux: si cerrás el navegador el proceso sigue, y «Reconectar» vuelve a él.</p>
                <button type="button" onClick={() => abrirSheet({ project: projects[0]?.slug ?? '', mode: (projects[0]?.defaultAgent as Mode) ?? 'shell' })} disabled={!projects.length} className="mt-1 flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-black text-black disabled:opacity-50"><Plus className="size-4" /> Nueva terminal</button>
              </div>
            ) : tabs.map((tab) => {
              const visible = visibles.some((v) => v.id === tab.id);
              return (
                <div key={tab.id} className={visible ? 'min-h-0 border-r border-white/10 last:border-r-0' : 'hidden'}>
                  <TerminalPane
                    ref={(handle) => { panes.current.set(tab.id, handle); }}
                    tab={tab}
                    visible={visible}
                    fontSize={fontSize}
                    onStatus={onStatus}
                    onConnected={onConnected}
                    onStickyConsumed={() => setCtrlActivo(false)}
                  />
                </div>
              );
            })}
          </main>

          {tabs.length > 0 && tecladoVisible && <MobileKeys className="md:hidden" ctrlActivo={ctrlActivo} onSeq={enviarSeq} onCtrl={toggleCtrl} onPegar={() => void pegar()} />}
        </div>
      </div>

      {/* ── Botón flotante (celular) ─────────────────────────────────── */}
      {!sheet && (
        <button
          type="button"
          onClick={() => abrirSheet({ project: activa?.project ?? projects[0]?.slug ?? '', mode: (projects[0]?.defaultAgent as Mode) ?? 'shell' })}
          disabled={!projects.length}
          aria-label="Nueva terminal"
          className={cn('fixed z-[90] flex size-12 items-center justify-center rounded-full bg-emerald-500 text-black shadow-lg shadow-emerald-500/30 active:scale-95 md:hidden', tabs.length && tecladoVisible ? 'bottom-[calc(3.25rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]', 'right-4')}
        >
          <Plus className="size-6" />
        </button>
      )}

      <NuevaTerminalSheet
        open={Boolean(sheet)}
        defaults={sheet?.defaults ?? null}
        projects={projects}
        busy={abriendo}
        error={sheetError}
        onClose={() => setSheet(null)}
        onSubmit={(input) => void enviarSheet(input)}
      />
    </div>
  );
}

function ProyectoCard({ project, activo, onAbrir, onEscribir, onCopiar }: { project: Project; activo: boolean; onAbrir: () => void; onEscribir: (cmd: string) => void; onCopiar: (texto: string) => void }) {
  const comandos = Object.entries(project.commands);
  return (
    <div className={cn('rounded-xl border p-2.5', activo ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{project.name}</p>
          <p className="truncate text-[10px] text-neutral-500" title={project.cwd}>{project.cwd}</p>
        </div>
        <button type="button" onClick={onAbrir} className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[10px] font-black hover:bg-white/20">Abrir</button>
      </div>
      <p className="mt-1 text-[10px] text-neutral-400">{project.stack} · rama {project.defaultBranch}</p>
      <a href={project.productionUrl} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-300 hover:underline">{project.productionUrl}</a>
      {comandos.length > 0 && (
        <div className="mt-2 space-y-1">
          {comandos.map(([nombre, cmd]) => (
            <div key={nombre} className="flex items-center gap-1 text-[10px]">
              {/* Se escribe SIN Enter: la persona lo ve y decide si lo corre. */}
              <button type="button" onClick={() => onEscribir(cmd)} title={`Escribir en la terminal activa: ${cmd}`} className="min-w-0 flex-1 truncate rounded bg-white/5 px-1.5 py-1 text-left font-mono text-neutral-300 hover:bg-white/10"><span className="mr-1 font-sans font-black uppercase text-neutral-500">{nombre}</span>{cmd}</button>
              <button type="button" onClick={() => onCopiar(cmd)} title="Copiar" className="flex size-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-white/10 hover:text-white"><ClipboardCopy className="size-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
