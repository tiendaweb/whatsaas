'use client';

import type { ReactNode } from 'react';

/** Contenedor táctil: una decisión ocupa la pantalla y conserva el safe area. */
export function NoeliaMovil({ children }: { children: ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>;
}
