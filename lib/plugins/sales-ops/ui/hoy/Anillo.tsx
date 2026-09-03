'use client';

import { cn } from '@/lib/utils';

/**
 * Anillo de progreso, como el de Tareas OS pero sin sus variables de tema.
 *
 * Se dibuja con `currentColor`, así que hereda el color del contenedor y sirve
 * igual en claro y en oscuro sin duplicar clases.
 */
export function Anillo({ valor, className, children }: { valor: number; className?: string; children?: React.ReactNode }) {
  // Un dato sucio (NaN, negativo, > 1) no puede dibujar un arco imposible.
  const p = Number.isFinite(valor) ? Math.min(1, Math.max(0, valor)) : 0;
  const r = 34;
  const circ = 2 * Math.PI * r;

  return (
    <div className={cn('relative size-24 shrink-0', className)}>
      <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-current transition-[stroke-dashoffset] duration-500"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - p)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
