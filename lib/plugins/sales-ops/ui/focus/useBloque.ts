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

function leer(clave: string): BloqueGuardado | null {
  try {
    const raw = window.localStorage.getItem(clave);
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

function escribir(clave: string, b: BloqueGuardado | null) {
  try {
    if (b) window.localStorage.setItem(clave, JSON.stringify(b));
    else window.localStorage.removeItem(clave);
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
 *
 * `clave` es dónde se guarda: el Focus de trabajo y el de supervisión tienen
 * cada uno la suya, porque son dos tareas y no un mismo bloque visto desde dos
 * pantallas.
 */
export function useBloque(clave: string = LS_BLOQUE) {
  const [bloque, setBloque] = useState<BloqueGuardado | null>(null);
  const [vencido, setVencido] = useState(false);
  /** El aviso de "se terminó" se cierra a mano: si se cerrara solo, quien
   *  estaba escribiendo un mensaje no se enteraría de que el bloque terminó. */
  const [avisoCerrado, setAvisoCerrado] = useState(false);

  useEffect(() => {
    setBloque(leer(clave));
  }, [clave]);

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

  const arrancar = useCallback(
    (tipo: TipoBloque = 'foco') => {
      const ahora = Date.now();
      const nuevo: BloqueGuardado = { tipo, terminaEn: ahora + MINUTOS[tipo] * 60_000, pausadoCon: null, desde: ahora };
      setBloque(nuevo);
      escribir(clave, nuevo);
      setAvisoCerrado(false);
    },
    [clave],
  );

  const pausar = useCallback(() => {
    setBloque((actual) => {
      if (!actual || actual.pausadoCon != null) return actual;
      const nuevo = { ...actual, pausadoCon: Math.max(0, actual.terminaEn - Date.now()) };
      escribir(clave, nuevo);
      return nuevo;
    });
  }, [clave]);

  const reanudar = useCallback(() => {
    setBloque((actual) => {
      if (!actual || actual.pausadoCon == null) return actual;
      const nuevo = { ...actual, terminaEn: Date.now() + actual.pausadoCon, pausadoCon: null };
      escribir(clave, nuevo);
      return nuevo;
    });
  }, [clave]);

  const terminar = useCallback(() => {
    setBloque(null);
    escribir(clave, null);
    setAvisoCerrado(false);
  }, [clave]);

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
