'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LS_BLOQUE, MINUTOS_BLOQUE, MINUTOS_DESCANSO } from './tipos';

export type TipoBloque = 'foco' | 'descanso';

type BloqueGuardado = {
  tipo: TipoBloque;
  /** Instante (epoch ms) en que vence. Se guarda esto y NO los segundos que
   *  faltan: con los segundos, una recarga o una pestaña en segundo plano
   *  dejaban el reloj corriendo en otro lado. */
  terminaEn: number;
  /** Milisegundos que quedaban cuando se pausó. `null` = está corriendo. */
  pausadoCon: number | null;
  /** Cuándo arrancó, para poder decir cuánto duró el bloque terminado. */
  desde: number;
};

function leer(): BloqueGuardado | null {
  try {
    const raw = window.localStorage.getItem(LS_BLOQUE);
    if (!raw) return null;
    const b = JSON.parse(raw) as Partial<BloqueGuardado>;
    if ((b.tipo !== 'foco' && b.tipo !== 'descanso') || typeof b.terminaEn !== 'number') return null;
    return {
      tipo: b.tipo,
      terminaEn: b.terminaEn,
      pausadoCon: typeof b.pausadoCon === 'number' ? b.pausadoCon : null,
      desde: typeof b.desde === 'number' ? b.desde : Date.now(),
    };
  } catch {
    return null;
  }
}

function escribir(b: BloqueGuardado | null) {
  try {
    if (b) window.localStorage.setItem(LS_BLOQUE, JSON.stringify(b));
    else window.localStorage.removeItem(LS_BLOQUE);
  } catch {
    /* sin storage */
  }
}

const MINUTOS: Record<TipoBloque, number> = { foco: MINUTOS_BLOQUE, descanso: MINUTOS_DESCANSO };

/**
 * El cronómetro de los bloques de 25 minutos (doc 08 §8).
 *
 * El reloj informa, no manda: nada de la pantalla se bloquea cuando llega a
 * cero. Lo único que pasa es que `vencido` se pone en true y el Focus muestra
 * el aviso con las tres salidas (otro bloque, descanso, salir).
 */
export function useBloque() {
  const [bloque, setBloque] = useState<BloqueGuardado | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  /** El aviso de "se terminó" se cierra a mano: si se cerrara solo, quien
   *  estaba escribiendo un mensaje no se enteraría de que el bloque terminó. */
  const [avisoCerrado, setAvisoCerrado] = useState(false);
  const montado = useRef(false);

  useEffect(() => {
    montado.current = true;
    setBloque(leer());
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const restante = bloque ? (bloque.pausadoCon ?? Math.max(0, bloque.terminaEn - ahora)) : 0;
  const pausado = Boolean(bloque?.pausadoCon != null);
  const vencido = Boolean(bloque && !pausado && restante <= 0);

  const arrancar = useCallback((tipo: TipoBloque = 'foco') => {
    const ahoraMs = Date.now();
    const nuevo: BloqueGuardado = { tipo, terminaEn: ahoraMs + MINUTOS[tipo] * 60_000, pausadoCon: null, desde: ahoraMs };
    setBloque(nuevo);
    escribir(nuevo);
    setAvisoCerrado(false);
    setAhora(ahoraMs);
  }, []);

  const pausar = useCallback(() => {
    setBloque((actual) => {
      if (!actual || actual.pausadoCon != null) return actual;
      const nuevo = { ...actual, pausadoCon: Math.max(0, actual.terminaEn - Date.now()) };
      escribir(nuevo);
      return nuevo;
    });
  }, []);

  const reanudar = useCallback(() => {
    setBloque((actual) => {
      if (!actual || actual.pausadoCon == null) return actual;
      const nuevo = { ...actual, terminaEn: Date.now() + actual.pausadoCon, pausadoCon: null };
      escribir(nuevo);
      return nuevo;
    });
  }, []);

  const terminar = useCallback(() => {
    setBloque(null);
    escribir(null);
    setAvisoCerrado(false);
  }, []);

  return {
    /** null hasta que se lee localStorage: en el primer render del servidor no hay reloj. */
    tipo: bloque?.tipo ?? null,
    restante,
    pausado,
    corriendo: Boolean(bloque) && !pausado && restante > 0,
    /** Vencido y todavía sin decidir qué hacer. */
    mostrarAviso: vencido && !avisoCerrado,
    /** Minutos que duró el bloque que acaba de terminar. */
    minutos: bloque ? MINUTOS[bloque.tipo] : MINUTOS_BLOQUE,
    hayBloque: Boolean(bloque),
    arrancar,
    pausar,
    reanudar,
    terminar,
    cerrarAviso: () => setAvisoCerrado(true),
  };
}
