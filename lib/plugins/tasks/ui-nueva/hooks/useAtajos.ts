'use client';

import { useEffect, useRef } from 'react';
import type { NavId } from '../data/tipos';

function esCampoEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

type AtajosOpts = {
  enabled: boolean;
  onBuscar: () => void;
  onNav: (nav: NavId) => void;
  onEnfoque: () => void;
  onAjustes: () => void;
  onToggleSidebar: () => void;
  onEscape: () => void;
};

export function useAtajos(opts: AtajosOpts) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!opts.enabled) return;

    const onKey = (event: KeyboardEvent) => {
      const current = optsRef.current;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (esCampoEditable(event.target) && event.key !== 'Escape') return;

      const key = event.key.toLowerCase();
      if (key === '/') {
        event.preventDefault();
        current.onBuscar();
        return;
      }
      if (key === 'i') {
        event.preventDefault();
        current.onNav('bandeja');
        return;
      }
      if (key === 't') {
        event.preventDefault();
        current.onNav('hoy');
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        current.onEnfoque();
        return;
      }
      if (key === 's') {
        event.preventDefault();
        current.onAjustes();
        return;
      }
      if (key === 'b') {
        event.preventDefault();
        current.onToggleSidebar();
        return;
      }
      if (event.key === 'Escape') {
        current.onEscape();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts.enabled]);
}
