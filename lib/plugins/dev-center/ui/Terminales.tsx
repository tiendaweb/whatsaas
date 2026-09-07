'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { TerminalWorkspace, type TerminalAutoOpen } from '@/components/admin/terminal/TerminalWorkspace';

/**
 * La vista Terminales es el Terminal Manager del admin embebido. Lo único
 * propio de acá es el botón para esconder la barra inferior en el celular:
 * con el teclado abierto, cada píxel de alto cuenta.
 */
export function Terminales({ email, autoOpen, barraOculta, onBarra, onOpened }: {
  email: string;
  autoOpen: TerminalAutoOpen | null;
  barraOculta: boolean;
  onBarra: (oculta: boolean) => void;
  onOpened: (info: { missionId?: number; tmux: string; project: string; mode: string; slot: number }) => void;
}) {
  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="devcenter-terminales">
      <button
        type="button"
        onClick={() => onBarra(!barraOculta)}
        title={barraOculta ? 'Mostrar la barra' : 'Ocultar la barra para ganar espacio'}
        aria-label={barraOculta ? 'Mostrar la barra' : 'Ocultar la barra'}
        className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/60 text-neutral-300 sm:hidden"
        data-testid="devcenter-accion-barra"
      >
        {barraOculta ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>
      <div className="min-h-0 flex-1">
        {email ? <TerminalWorkspace email={email} embedded autoOpen={autoOpen} onOpened={onOpened} /> : <div className="flex h-full items-center justify-center text-xs text-neutral-500">Cargando tu sesión…</div>}
      </div>
    </div>
  );
}
