'use client';

import { useEffect, useState } from 'react';
import { reloj } from './tipos';

/**
 * Los segundos que corren, aislados en su propio componente.
 *
 * Vive acá y no en `useBloque` porque el hook lo usa el Focus entero: un
 * `setInterval` allá arriba volvía a renderizar las tres columnas y el chat
 * embebido una vez por segundo. Acá el tic-tac sólo repinta estos cinco
 * caracteres.
 */
export function Reloj({ terminaEn, pausadoCon }: { terminaEn: number | null; pausadoCon: number | null }) {
  const calcular = () => (pausadoCon != null ? pausadoCon : terminaEn != null ? Math.max(0, terminaEn - Date.now()) : 0);
  const [restante, setRestante] = useState(calcular);

  useEffect(() => {
    setRestante(calcular());
    // Pausado no hay nada que contar: el número no se mueve hasta que reanuden.
    if (pausadoCon != null || terminaEn == null) return;
    const id = window.setInterval(() => setRestante(Math.max(0, terminaEn - Date.now())), 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminaEn, pausadoCon]);

  return <>{reloj(restante)}</>;
}
