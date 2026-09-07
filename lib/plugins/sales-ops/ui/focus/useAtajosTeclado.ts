'use client';

import { useEffect } from 'react';

export type AtajosTeclado = {
  /** Flecha derecha. */
  onSiguiente?: () => void;
  /** Flecha izquierda. */
  onAnterior?: () => void;
  /** Tecla `S`: saltar el ítem actual sin resolverlo. */
  onSaltar?: () => void;
  /** Teclas adicionales para modos que reutilizan la navegación del Focus. */
  acciones?: Partial<Record<string, () => void>>;
};

/**
 * Los atajos de teclado de los dos Focus, en un solo lugar.
 *
 * Cada pantalla tenía su propio `keydown` y las teclas se fueron separando: la
 * `S` de saltar existía en el Focus de trabajo y no en el de supervisión, y
 * quien pasaba de uno al otro la apretaba sin que pasara nada. Ahora las dos
 * pantallas registran los mismos handlers y la lista de teclas vive acá.
 *
 * Se ignoran mientras se escribe: la `s` de "seguimiento" no puede saltear al
 * cliente. Y con Ctrl/Cmd/Alt tampoco, para no pisar los atajos del navegador.
 */
export function useAtajosTeclado({ onSiguiente, onAnterior, onSaltar, acciones }: AtajosTeclado) {
  useEffect(() => {
    const escuchar = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.key === 'ArrowRight') onSiguiente?.();
      else if (e.key === 'ArrowLeft') onAnterior?.();
      else {
        const key = e.key.toLowerCase();
        if (key === 's' && onSaltar) onSaltar();
        else acciones?.[key]?.();
      }
    };
    window.addEventListener('keydown', escuchar);
    return () => window.removeEventListener('keydown', escuchar);
  }, [onSiguiente, onAnterior, onSaltar, acciones]);
}
