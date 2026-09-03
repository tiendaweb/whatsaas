'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Riel horizontal para la fila de pestañas de la ficha.
 *
 * La ficha vive en un panel de 440 px (y en móvil, en menos) con ocho pestañas:
 * el `overflow-x-auto` solo ya la desplazaba, pero sin barra visible ni ningún
 * borde cortado no había forma de saber que Acciones, Radar y Versiones
 * existían — se leía como si la última pestaña fuera la última que se ve. Acá
 * hay degradado en el borde que todavía tiene contenido y una flecha para
 * empujar sin depender de la rueda ni del trackpad.
 */
export function BarraPestanas({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hayIzquierda, setHayIzquierda] = useState(false);
  const [hayDerecha, setHayDerecha] = useState(false);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 2 px de tolerancia: los anchos fraccionarios dejan la flecha prendida
    // para siempre cuando el riel ya llegó al final.
    setHayIzquierda(el.scrollLeft > 2);
    setHayDerecha(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(el);
    for (const hijo of Array.from(el.children)) observer.observe(hijo);
    return () => observer.disconnect();
  }, [medir]);

  const empujar = (direccion: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direccion * Math.max(120, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        ref={ref}
        onScroll={medir}
        className="overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {hayIzquierda ? (
        <Flecha lado="izquierda" onClick={() => empujar(-1)} />
      ) : null}
      {hayDerecha ? (
        <Flecha lado="derecha" onClick={() => empujar(1)} />
      ) : null}
    </div>
  );
}

function Flecha({ lado, onClick }: { lado: 'izquierda' | 'derecha'; onClick: () => void }) {
  const esIzquierda = lado === 'izquierda';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={esIzquierda ? 'Ver pestañas anteriores' : 'Ver más pestañas'}
      className={cn(
        'absolute inset-y-0 flex w-8 items-center bg-gradient-to-r from-background via-background/90 to-transparent text-muted-foreground hover:text-foreground',
        esIzquierda ? 'left-0 justify-start' : 'right-0 justify-end bg-gradient-to-l',
      )}
    >
      {esIzquierda ? <ChevronLeft className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
    </button>
  );
}
