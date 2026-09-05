'use client';

import type { Etapa } from './tipos';

/**
 * Pedidos de un toque.
 *
 * En el celular, escribir el prompt es el cuello de botella: entre teclado,
 * autocorrector y una mano sola, tipear "recordale el pago en dos renglones"
 * cuesta más que leer el chat entero. Y en una tanda el pedido casi siempre es
 * el mismo, cambiando el cliente. Así que se toca, no se escribe.
 *
 * Dos fuentes, en este orden: lo que esta persona ya usó en esta etapa (lo que
 * más va a repetir) y una lista fija por etapa para arrancar el primer día.
 */

const PRESETS: Record<Etapa, string[]> = {
  dinero: [
    'Pedile el comprobante en dos renglones, tono amable.',
    'Recordale el pago sin presionar y ofrecele ayuda para completarlo.',
    'Preguntale si tuvo algún problema para pagar.',
  ],
  oportunidades: [
    'Contestale la objeción que puso, corto y concreto.',
    'Ofrecele una demo de lo que estaba pidiendo.',
    'Preguntale qué le falta para decidir.',
  ],
  barrido: [
    'Reactivalo con una sola pregunta corta.',
    'Ofrecele algo concreto sobre lo que había preguntado.',
    'Preguntale si sigue con la idea o lo dejamos acá.',
  ],
  limpieza: [
    'Cerrá la conversación con amabilidad, sin pedir nada.',
    'Preguntale en una línea si sigue interesado.',
  ],
};

const LS = 'sales-ops:focus:atajos';
const MAX_RECIENTES = 4;
const MAX_TOTAL = 6;

function leerRecientes(etapa: Etapa): string[] {
  try {
    const raw = window.localStorage.getItem(`${LS}:${etapa}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECIENTES) : [];
  } catch {
    return [];
  }
}

/** Sube el pedido usado al principio de los recientes, sin repetirlo. */
export function recordarAtajo(etapa: Etapa, texto: string) {
  const limpio = texto.trim();
  if (limpio.length < 5) return;
  try {
    const previos = leerRecientes(etapa).filter((x) => x !== limpio);
    window.localStorage.setItem(`${LS}:${etapa}`, JSON.stringify([limpio, ...previos].slice(0, MAX_RECIENTES)));
  } catch {
    /* sin storage */
  }
}

export type Atajo = { texto: string; origen: 'reciente' | 'preset' | 'analisis' };

/**
 * Los atajos de esta etapa. `accionRecomendada` va primero cuando existe: es el
 * único que mira a ESTE cliente y no a la tanda.
 */
export function atajosDe(etapa: Etapa, accionRecomendada?: string | null): Atajo[] {
  const out: Atajo[] = [];
  const vistos = new Set<string>();
  const sumar = (texto: string, origen: Atajo['origen']) => {
    const limpio = texto.trim();
    if (!limpio || vistos.has(limpio) || out.length >= MAX_TOTAL) return;
    vistos.add(limpio);
    out.push({ texto: limpio, origen });
  };

  if (accionRecomendada?.trim()) sumar(accionRecomendada, 'analisis');
  for (const texto of leerRecientes(etapa)) sumar(texto, 'reciente');
  for (const texto of PRESETS[etapa] ?? []) sumar(texto, 'preset');
  return out;
}
