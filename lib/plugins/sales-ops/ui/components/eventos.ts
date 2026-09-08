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

/**
 * Aviso de "a este chat lo sacaron (o lo devolvieron) del circuito".
 *
 * Mismo problema que el de arriba y misma solución: sacar a alguien desde la
 * ficha lo borra del servidor, pero la fila seguía a la vista en la lista de
 * atrás. Viaja además si fue una devolución, porque no son simétricos: sacar
 * es quitar una fila que ya está en pantalla, devolver es una fila que hay que
 * ir a buscar, así que la lista tiene que volver a pedirse.
 */
const EVENTO_IGNORADO = 'sales-ops:ignorado';

export function avisarIgnorado(chatId: number | null | undefined, opts: { devuelto?: boolean } = {}) {
  if (!chatId || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENTO_IGNORADO, { detail: { chatId, devuelto: Boolean(opts.devuelto) } }));
}

export function useIgnorado(handler: (chatId: number, devuelto: boolean) => void) {
  useEffect(() => {
    const escuchar = (evento: Event) => {
      const detalle = (evento as CustomEvent<{ chatId?: number; devuelto?: boolean }>).detail;
      if (detalle?.chatId) handler(detalle.chatId, Boolean(detalle.devuelto));
    };
    window.addEventListener(EVENTO_IGNORADO, escuchar);
    return () => window.removeEventListener(EVENTO_IGNORADO, escuchar);
  }, [handler]);
}
