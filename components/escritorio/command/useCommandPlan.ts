'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CommandAction, CommandItem, PlannedAction } from '@/lib/desktop/command-center/types';

/**
 * El plan es un DERIVADO de la selección, no un estado paralelo.
 *
 * Si el plan viviera aparte, un clic de curiosidad para ver qué escribió la IA
 * quedaría planificado y saldría media hora después junto con otra cosa. Acá
 * sólo se ejecuta lo que está seleccionado Y sigue presente después de
 * revalidar: un chat que otro agente ya respondió desaparece del plan solo.
 */
export function useCommandPlan(items: CommandItem[]) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<Map<string, PlannedAction>>(new Map());

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // Purga: lo que ya no viene del servidor no se puede ejecutar.
  useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((id) => itemsById.has(id)));
      return next.size === current.size ? current : next;
    });
    setPlan((current) => {
      const next = new Map([...current].filter(([id]) => itemsById.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [itemsById]);

  const toggleSelected = useCallback((itemId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const toggleVisible = useCallback((visibleIds: string[]) => {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
      // Agrega o quita SÓLO lo visible: no limpia lo que el usuario eligió antes
      // en otro filtro.
      for (const id of visibleIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  /** Planificar SIEMPRE marca la fila y entra en modo selección: el estado tiene
   *  que ser visible, nunca acumularse en silencio. */
  const planAction = useCallback((itemId: string, action: CommandAction) => {
    setPlan((current) => new Map(current).set(itemId, { itemId, action }));
    setSelected((current) => new Set(current).add(itemId));
    setSelectionMode(true);
  }, []);

  const unplan = useCallback((itemId: string) => {
    setPlan((current) => {
      const next = new Map(current);
      next.delete(itemId);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setPlan(new Map());
    setSelected(new Set());
    setSelectionMode(false);
  }, []);

  const clearOk = useCallback((itemIds: string[]) => {
    const done = new Set(itemIds);
    setPlan((current) => new Map([...current].filter(([id]) => !done.has(id))));
    setSelected((current) => new Set([...current].filter((id) => !done.has(id))));
  }, []);

  /** Lo que realmente se va a ejecutar. */
  const executable = useMemo(
    () => [...plan.values()].filter((entry) => selected.has(entry.itemId) && itemsById.has(entry.itemId)),
    [plan, selected, itemsById],
  );

  return {
    selectionMode,
    setSelectionMode,
    selected,
    plan,
    executable,
    itemsById,
    toggleSelected,
    toggleVisible,
    planAction,
    unplan,
    clear,
    clearOk,
  };
}
