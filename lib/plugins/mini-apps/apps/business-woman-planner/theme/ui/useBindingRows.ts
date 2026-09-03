'use client';

import { applyBinding } from './binding';
import { useSystemBindingRows } from './useSystemBindingRows';
import type { BwBinding } from '../shared/schema';
import type { BwCollectionsData } from './BwBlockRenderer';

/**
 * Resuelve CUALQUIER binding (`local` o `system`) a filas, con la misma
 * forma de resultado sin importar cuál sea. `local` es instantáneo (ya está
 * en memoria); `system` pega contra `useSystemBindingRows` — el hook de SWR
 * se llama SIEMPRE (con key null cuando no aplica), nunca condicionalmente,
 * para no romper las reglas de hooks.
 */
export function useBindingRows(binding: BwBinding, localData: BwCollectionsData) {
  const system = useSystemBindingRows(binding.kind === 'system' ? binding : null);
  if (binding.kind === 'local') {
    return { rows: applyBinding(localData[binding.collection] ?? [], binding), loading: false, error: null as string | null };
  }
  return system;
}
