'use client';

import { useEffect } from 'react';

/**
 * Aviso de "este chat ya tiene algo en cola".
 *
 * Las listas se cargan una vez y paginan por cursor: cuando alguien deja un
 * prompt, propone una acción o programa un mensaje desde la ficha, el contacto
 * ya dejó de estar pendiente en el servidor, pero la fila seguía a la vista y
 * volvía a trabajarse. Refrescar la lista entera después de cada acción sería
 * tirar el scroll y la paginación; esto avisa qué chat cambió y cada lista
 * decide (sacar la fila, o volver a pedir si es la lista de "En cola").
 *
 * Es un evento del navegador y no un contexto de React porque quien avisa y
 * quien escucha viven en árboles distintos (la ficha es una hoja aparte en
 * móvil) y no comparten proveedor.
 */
const EVENTO = 'sales-ops:encolado';

export function avisarEncolado(chatId: number | null | undefined) {
  if (!chatId || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { chatId } }));
}

export function useEncolado(handler: (chatId: number) => void) {
  useEffect(() => {
    const escuchar = (evento: Event) => {
      const chatId = (evento as CustomEvent<{ chatId?: number }>).detail?.chatId;
      if (chatId) handler(chatId);
    };
    window.addEventListener(EVENTO, escuchar);
    return () => window.removeEventListener(EVENTO, escuchar);
  }, [handler]);
}
