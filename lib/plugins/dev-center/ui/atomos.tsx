'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MissionAgent, MissionStatus } from '../shared/types';

/**
 * Piezas chicas de la app, sobre el mismo fondo oscuro que la terminal
 * (`#0b0f14`) para que Misiones, Prompts y Terminales se sientan una sola
 * cosa. Sin tokens de tema: la app es takeover y siempre oscura.
 */

export const AGENT_TONE: Record<MissionAgent, string> = {
  claude: 'border-violet-400/40 bg-violet-500/15 text-violet-200',
  codex: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  claude_desktop: 'border-violet-400/30 bg-violet-500/10 text-violet-300',
  codex_desktop: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  connector: 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200',
};

export const STATUS_TONE: Record<MissionStatus, string> = {
  draft: 'border-white/15 bg-white/5 text-neutral-300',
  queued: 'border-sky-400/40 bg-sky-500/15 text-sky-200',
  running: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
  blocked: 'border-orange-400/40 bg-orange-500/15 text-orange-200',
  completed: 'border-emerald-600/40 bg-emerald-700/20 text-emerald-300',
  failed: 'border-red-400/40 bg-red-500/15 text-red-200',
  cancelled: 'border-white/10 bg-white/[0.03] text-neutral-500',
};

export function Chip({ className, children, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', className)} {...rest}>{children}</span>;
}

export const control = 'h-10 w-full rounded-xl border border-white/15 bg-[#0b0f14] px-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:ring-2 focus:ring-emerald-500/40';
export const rotulo = 'text-[10px] font-black uppercase tracking-[0.16em] text-neutral-500';
export const tarjeta = 'rounded-2xl border border-white/10 bg-white/[0.03]';

type BotonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tono?: 'primario' | 'neutro' | 'peligro' | 'fantasma' };
export function Boton({ tono = 'neutro', className, ...rest }: BotonProps) {
  const tonos = {
    primario: 'bg-emerald-500 text-black hover:bg-emerald-400',
    neutro: 'border border-white/15 bg-white/[0.04] text-neutral-100 hover:bg-white/10',
    peligro: 'border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20',
    fantasma: 'text-neutral-300 hover:bg-white/10',
  };
  return <button type="button" className={cn('inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50', tonos[tono], className)} {...rest} />;
}

/**
 * Hoja: en móvil sube desde abajo y ocupa casi toda la pantalla; en escritorio
 * es un panel lateral derecho. Un solo componente para «Nueva misión», el
 * editor de prompts y cualquier formulario: así el gesto es el mismo en todos.
 */
export function Hoja({ abierta, titulo, onCerrar, children, testId }: { abierta: boolean; titulo: string; onCerrar: () => void; children: React.ReactNode; testId?: string }) {
  useEffect(() => {
    if (!abierta) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierta, onCerrar]);
  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-stretch sm:justify-end" onMouseDown={(event) => { if (event.target === event.currentTarget) onCerrar(); }} data-testid={testId}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-white/10 bg-[#0f151c] shadow-2xl sm:h-full sm:max-h-none sm:w-[520px] sm:rounded-none sm:border-l">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <span className="mx-auto h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />
          <h2 className="text-sm font-black text-neutral-100">{titulo}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex size-8 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10"><X className="size-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Vacio({ titulo, detalle, children }: { titulo: string; detalle: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 p-8 text-center">
      <p className="text-sm font-bold text-neutral-200">{titulo}</p>
      <p className="max-w-md text-xs text-neutral-500">{detalle}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
