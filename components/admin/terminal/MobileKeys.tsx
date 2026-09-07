'use client';

import { cn } from '@/lib/utils';

/**
 * Las teclas que el teclado del celular no tiene y una terminal necesita:
 * Esc, Tab, Ctrl, flechas y los símbolos que cuesta encontrar. Cada botón
 * manda la secuencia exacta por el WebSocket, como si la hubiera tecleado.
 *
 * «Ctrl» es pegajoso: se enciende y la PRÓXIMA letra sale como control
 * (Ctrl+L, Ctrl+R, Ctrl+Z…). Ctrl+C y Ctrl+D tienen botón propio porque son
 * los que se usan diez veces por sesión.
 */
type Tecla = { id: string; label: string; seq?: string; accion?: 'ctrl' | 'pegar'; ancho?: string; title?: string };

const TECLAS: Tecla[] = [
  { id: 'esc', label: 'Esc', seq: '\x1b', title: 'Escape' },
  { id: 'tab', label: 'Tab', seq: '\t', title: 'Tabulador (autocompletar)' },
  { id: 'ctrl', label: 'Ctrl', accion: 'ctrl', title: 'Ctrl pegajoso: la próxima letra va con Ctrl' },
  { id: 'ctrl-c', label: '^C', seq: '\x03', title: 'Ctrl+C: cortar el proceso' },
  { id: 'ctrl-d', label: '^D', seq: '\x04', title: 'Ctrl+D: fin de entrada / salir' },
  { id: 'arriba', label: '↑', seq: '\x1b[A', title: 'Historial anterior' },
  { id: 'abajo', label: '↓', seq: '\x1b[B' },
  { id: 'izq', label: '←', seq: '\x1b[D' },
  { id: 'der', label: '→', seq: '\x1b[C' },
  { id: 'pipe', label: '|', seq: '|' },
  { id: 'tilde', label: '~', seq: '~' },
  { id: 'slash', label: '/', seq: '/' },
  { id: 'guion', label: '-', seq: '-' },
  { id: 'pegar', label: 'Pegar', accion: 'pegar', title: 'Pegar el portapapeles' },
];

export function MobileKeys({ ctrlActivo, onSeq, onCtrl, onPegar, className }: {
  ctrlActivo: boolean;
  onSeq: (seq: string) => void;
  onCtrl: () => void;
  onPegar: () => void;
  className?: string;
}) {
  return (
    <div
      data-testid="terminal-teclas"
      className={cn('flex shrink-0 gap-1 overflow-x-auto border-t border-white/10 bg-[#0e141b] px-1.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      // Al tocar una tecla el foco NO debe irse de xterm: si se fuera, el
      // teclado del celular se cierra y hay que volver a tocar la terminal.
      // `pointerdown` no es pasivo en React (touchstart sí), y frenarlo evita
      // el cambio de foco sin perder el `click`.
      onPointerDown={(event) => event.preventDefault()}
    >
      {TECLAS.map((tecla) => (
        <button
          key={tecla.id}
          type="button"
          tabIndex={-1}
          data-testid={`terminal-tecla-${tecla.id}`}
          title={tecla.title}
          aria-pressed={tecla.accion === 'ctrl' ? ctrlActivo : undefined}
          onClick={() => {
            if (tecla.accion === 'ctrl') onCtrl();
            else if (tecla.accion === 'pegar') onPegar();
            else if (tecla.seq) onSeq(tecla.seq);
          }}
          className={cn(
            'h-9 shrink-0 select-none rounded-md border px-2.5 font-mono text-[13px] font-bold active:bg-white/20',
            tecla.accion === 'ctrl' && ctrlActivo ? 'border-emerald-400 bg-emerald-500/30 text-emerald-100' : 'border-white/10 bg-white/[0.06] text-neutral-200',
            tecla.id === 'pegar' && 'font-sans text-xs',
          )}
        >
          {tecla.label}
        </button>
      ))}
    </div>
  );
}
