'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODE_LABEL, type Mode, type Project } from './tipos';

/**
 * El formulario de «Nueva terminal» y de «Reconectar», en una hoja que sube
 * desde abajo en el celular y se centra como diálogo en escritorio. Sin
 * librería: es un `fixed` con transición.
 *
 * Pide la contraseña siempre, aunque la sesión esté abierta: es la regla de
 * la puerta (un ticket por terminal, con la contraseña de nuevo). Por eso el
 * foco arranca en ese campo cuando el formulario viene prellenado.
 */
export type SheetDefaults = {
  project: string;
  mode: Mode;
  title?: string;
  /** Reconexión a una ranura existente: proyecto/modo/ranura fijos, sólo contraseña. */
  reconnect?: { slot: number; tmux?: string };
  missionId?: number;
  /** Texto que se tipea al conectar (misiones). Viaja con la hoja para no mezclarse con una terminal abierta a mano. */
  initialInput?: string;
};

export function NuevaTerminalSheet({ open, defaults, projects, busy, error, onClose, onSubmit }: {
  open: boolean;
  defaults: SheetDefaults | null;
  projects: Project[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { project: string; mode: Mode; title: string; password: string }) => void;
}) {
  const [project, setProject] = useState(defaults?.project ?? projects[0]?.slug ?? '');
  const [mode, setMode] = useState<Mode>(defaults?.mode ?? 'shell');
  const [title, setTitle] = useState(defaults?.title ?? '');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setProject(defaults?.project ?? projects[0]?.slug ?? '');
    setMode(defaults?.mode ?? ((projects.find((p) => p.slug === (defaults?.project ?? projects[0]?.slug))?.defaultAgent as Mode) ?? 'shell'));
    setTitle(defaults?.title ?? '');
    setPassword('');
    // El teclado del celular tarda un tick en aparecer sobre la hoja.
    const id = window.setTimeout(() => passwordRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, [open, defaults, projects]);

  const proyecto = projects.find((p) => p.slug === project) ?? null;
  const modos: Mode[] = (['shell', 'claude', 'codex'] as Mode[]).filter((m) => m === 'shell' || proyecto?.agents.includes(m));
  const reconectando = Boolean(defaults?.reconnect);
  const enviar = () => { if (!password.trim() || busy || !project) return; onSubmit({ project, mode, title: title.trim(), password }); };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 md:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terminal-nueva-titulo"
      data-testid="terminal-nueva"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div className="w-full max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0e141b] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-neutral-100 shadow-2xl md:max-w-md md:rounded-2xl md:p-5">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 md:hidden" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400">{reconectando ? 'Reconectar' : 'Nueva terminal'}</p>
            <h2 id="terminal-nueva-titulo" className="mt-0.5 text-base font-bold">
              {reconectando ? `Volver a la sesión #${defaults?.reconnect?.slot}` : defaults?.missionId ? `Misión #${defaults.missionId}` : 'Abrir una shell en el servidor'}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Cerrar" className="rounded-full p-2 text-neutral-400 hover:bg-white/10 hover:text-white"><X className="size-4" /></button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-neutral-400">Proyecto</span>
            <select
              data-testid="terminal-campo-proyecto"
              value={project}
              disabled={reconectando || busy}
              onChange={(event) => { setProject(event.target.value); const p = projects.find((x) => x.slug === event.target.value); if (p && !modos.includes(mode)) setMode((p.defaultAgent as Mode) ?? 'shell'); }}
              className="block h-11 w-full rounded-xl border border-white/15 bg-[#0b0f14] px-3 text-sm disabled:opacity-60"
            >
              {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name} · {p.cwd}</option>)}
            </select>
            {proyecto && <p className="text-[11px] text-neutral-500">{proyecto.stack} · rama {proyecto.defaultBranch} · máx. {proyecto.maxSessions} terminales</p>}
          </label>

          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-neutral-400">Modo</span>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
              {modos.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={reconectando || busy}
                  data-testid={`terminal-modo-${m}`}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn('h-10 rounded-lg text-xs font-bold transition-colors', mode === m ? 'bg-emerald-500 text-black' : 'text-neutral-300 hover:bg-white/10', reconectando && mode !== m && 'opacity-40')}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          {!reconectando && (
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wide text-neutral-400">Título (opcional)</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Ej.: deploy, logs, misión 12" className="block h-11 w-full rounded-xl border border-white/15 bg-[#0b0f14] px-3 text-sm" />
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-wide text-neutral-400">Tu contraseña (cada vez)</span>
            <input
              ref={passwordRef}
              data-testid="terminal-campo-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') enviar(); }}
              className="block h-11 w-full rounded-xl border border-white/15 bg-[#0b0f14] px-3 text-base"
            />
          </label>

          {error && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200" data-testid="terminal-aviso">{error}</p>}

          <button
            type="button"
            data-testid="terminal-accion-abrir"
            disabled={busy || !password.trim() || !project}
            onClick={enviar}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-black text-black disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {busy ? 'Abriendo…' : reconectando ? 'Reconectar' : `Abrir ${MODE_LABEL[mode]}`}
          </button>
          <p className="text-center text-[11px] text-neutral-500">Shell del servidor de producción. Todo lo que pase queda grabado.</p>
        </div>
      </div>
    </div>
  );
}
