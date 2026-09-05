'use client';

import { useCallback, useEffect, useState } from 'react';
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
 * **No hace tic-tac.** Antes tenía un `setInterval` de un segundo que cambiaba
 * estado, y como este hook vive en el Focus eso volvía a renderizar la pantalla
 * entera —las tres columnas, el chat embebido y todo— sesenta veces por minuto.
 * Acá sólo se agenda un `setTimeout` al instante exacto del vencimiento; los
 * segundos que corren los dibuja `<Reloj>`, que se re-renderiza solo.
 *
 * El reloj informa, no manda: nada de la pantalla se bloquea al llegar a cero.
 */
export function useBloque() {
  const [bloque, setBloque] = useState<BloqueGuardado | null>(null);
  const [vencido, setVencido] = useState(false);
  /** El aviso de "se terminó" se cierra a mano: si se cerrara solo, quien
   *  estaba escribiendo un mensaje no se enteraría de que el bloque terminó. */
  const [avisoCerrado, setAvisoCerrado] = useState(false);

  useEffect(() => {
    setBloque(leer());
  }, []);

  useEffect(() => {
    setVencido(false);
    if (!bloque || bloque.pausadoCon != null) return;

    let id = 0;
    const revisar = () => {
      const falta = bloque.terminaEn - Date.now();
      if (falta <= 0) {
        setVencido(true);
        return;
      }
      window.clearTimeout(id);
      id = window.setTimeout(revisar, falta);
    };
    revisar();

    // Con la pestaña en segundo plano el navegador estira los timers: al volver
    // se revisa contra el reloj real en vez de confiar en cuándo disparó.
    const alVolver = () => {
      if (document.visibilityState === 'visible') revisar();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [bloque]);

  const arrancar = useCallback((tipo: TipoBloque = 'foco') => {
    const ahora = Date.now();
    const nuevo: BloqueGuardado = { tipo, terminaEn: ahora + MINUTOS[tipo] * 60_000, pausadoCon: null, desde: ahora };
    setBloque(nuevo);
    escribir(nuevo);
    setAvisoCerrado(false);
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
    /** null hasta que se lee localStorage: en el primer render no hay reloj. */
    tipo: bloque?.tipo ?? null,
    terminaEn: bloque?.terminaEn ?? null,
    pausadoCon: bloque?.pausadoCon ?? null,
    pausado: bloque?.pausadoCon != null,
    hayBloque: Boolean(bloque),
    /** Vencido y todavía sin decidir qué hacer. */
    mostrarAviso: vencido && !avisoCerrado,
    minutos: bloque ? MINUTOS[bloque.tipo] : MINUTOS_BLOQUE,
    arrancar,
    pausar,
    reanudar,
    terminar,
    cerrarAviso: () => setAvisoCerrado(true),
  };
}
