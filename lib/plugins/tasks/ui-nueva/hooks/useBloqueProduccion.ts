'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * El cronómetro de los bloques de trabajo del Focus de Producción.
 *
 * Es la misma idea que el bloque del Command Center comercial, pero con su
 * propia clave de `localStorage`: son dos tareas distintas —vender y producir—
 * y compartir el reloj haría que pausar la ronda de mensajes también pausara la
 * de demos. Tampoco se importa aquel hook: vive en otro plugin, y un plugin no
 * debería quedar roto porque el otro cambió su reloj.
 *
 * Dos decisiones que no son cosméticas:
 *
 * 1. Se guarda el **instante de vencimiento**, no los segundos que faltan. Con
 *    los segundos, recargar la página o dejar la pestaña en segundo plano dejaba
 *    el reloj corriendo en otro lado.
 * 2. **No hace tic-tac.** Sólo agenda un `setTimeout` al vencimiento exacto; si
 *    cambiara de estado una vez por segundo volvería a renderizar el Focus
 *    entero (checklist, prompt y chat embebido incluidos) sesenta veces por
 *    minuto. Los segundos que corren los dibuja quien los muestra.
 *
 * El reloj informa, no manda: al llegar a cero no se bloquea nada de la
 * pantalla, sólo aparece el aviso para decidir cómo seguir.
 */

export const LS_BLOQUE_PRODUCCION = 'sales-ops:focus:bloque-produccion';
export const MINUTOS_BLOQUE_PRODUCCION = 25;
export const MINUTOS_DESCANSO_PRODUCCION = 5;

export type TipoBloqueProduccion = 'foco' | 'descanso';

type BloqueGuardado = {
  tipo: TipoBloqueProduccion;
  /** Instante (epoch ms) en que vence el bloque. */
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
    const guardado = JSON.parse(raw) as Partial<BloqueGuardado>;
    if ((guardado.tipo !== 'foco' && guardado.tipo !== 'descanso') || typeof guardado.terminaEn !== 'number') return null;
    return {
      tipo: guardado.tipo,
      terminaEn: guardado.terminaEn,
      pausadoCon: typeof guardado.pausadoCon === 'number' ? guardado.pausadoCon : null,
      desde: typeof guardado.desde === 'number' ? guardado.desde : Date.now(),
    };
  } catch {
    // Storage bloqueado o JSON corrupto: se arranca sin bloque, nunca se rompe
    // la pantalla por un reloj.
    return null;
  }
}

function escribir(clave: string, bloque: BloqueGuardado | null) {
  try {
    if (bloque) window.localStorage.setItem(clave, JSON.stringify(bloque));
    else window.localStorage.removeItem(clave);
  } catch {
    /* sin storage: el bloque vive sólo en memoria */
  }
}

/** `mm:ss` a partir de milisegundos. Nunca negativo: cero es cero. */
export function relojBloque(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutos = Math.floor(total / 60);
  const segundos = total % 60;
  return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}

export type OpcionesBloqueProduccion = {
  /** Dónde se guarda. Sirve para tener más de una ronda abierta a la vez. */
  clave?: string;
  minutosFoco?: number;
  minutosDescanso?: number;
};

export function useBloqueProduccion(opciones: OpcionesBloqueProduccion = {}) {
  const clave = opciones.clave ?? LS_BLOQUE_PRODUCCION;
  const minutosFoco = opciones.minutosFoco ?? MINUTOS_BLOQUE_PRODUCCION;
  const minutosDescanso = opciones.minutosDescanso ?? MINUTOS_DESCANSO_PRODUCCION;

  const [bloque, setBloque] = useState<BloqueGuardado | null>(null);
  const [vencido, setVencido] = useState(false);
  /** El aviso de "se terminó" se cierra a mano: si se cerrara solo, quien está
   *  con las manos en un pedido no se enteraría de que el bloque terminó. */
  const [avisoCerrado, setAvisoCerrado] = useState(false);

  // El `localStorage` sólo existe en el navegador: leerlo en el primer render
  // rompería la hidratación del servidor.
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
    (tipo: TipoBloqueProduccion = 'foco') => {
      const ahora = Date.now();
      const minutos = tipo === 'foco' ? minutosFoco : minutosDescanso;
      const nuevo: BloqueGuardado = { tipo, terminaEn: ahora + minutos * 60_000, pausadoCon: null, desde: ahora };
      setBloque(nuevo);
      escribir(clave, nuevo);
      setAvisoCerrado(false);
    },
    [clave, minutosDescanso, minutosFoco],
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

  const cerrarAviso = useCallback(() => setAvisoCerrado(true), []);

  return {
    /** null hasta que se lee localStorage: en el primer render no hay reloj. */
    tipo: bloque?.tipo ?? null,
    terminaEn: bloque?.terminaEn ?? null,
    pausadoCon: bloque?.pausadoCon ?? null,
    pausado: bloque?.pausadoCon != null,
    hayBloque: Boolean(bloque),
    desde: bloque?.desde ?? null,
    /** Vencido y todavía sin decidir qué hacer. */
    mostrarAviso: vencido && !avisoCerrado,
    minutos: bloque ? (bloque.tipo === 'foco' ? minutosFoco : minutosDescanso) : minutosFoco,
    arrancar,
    pausar,
    reanudar,
    terminar,
    cerrarAviso,
  };
}

export type BloqueProduccion = ReturnType<typeof useBloqueProduccion>;
