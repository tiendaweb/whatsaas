'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisRow, ListPayload } from '../../shared/api-types';
import type { OwnerFilterValue } from '../components/OwnerFilter';
import { SALES_OPS_API, fetcher } from '../components/format';
import { ETAPAS, type Etapa, type FiltrosFocus } from './tipos';

export type TipoProceso = 'ejecutado' | 'encolado' | 'saltado';

export type ResumenSesion = { ejecutados: number; encolados: number; saltados: number };

const PAGINA = 50;
/** Cuántos clientes antes del final se pide la página siguiente. */
const MARGEN_PREFETCH = 6;

function url(etapa: Etapa, filtros: FiltrosFocus, owner: OwnerFilterValue, cursor: string | null): string {
  const p = new URLSearchParams();
  p.set('vista', etapa);
  if (owner !== 'todos') p.set('owner', owner);
  if (filtros.gates.length) p.set('gates', filtros.gates.join(','));
  if (filtros.soloPendientes) p.set('queued', 'sin');
  p.set('sort', filtros.orden);
  p.set('limit', String(PAGINA));
  if (cursor) p.set('cursor', cursor);
  return `${SALES_OPS_API}/contacts?${p.toString()}`;
}

/**
 * La cola del Focus (doc 08 §6).
 *
 * Es una lista paginada por cursor que se recorre de a uno y **no se recarga
 * sola**: apenas se le encola algo a un contacto deja de cumplir el filtro
 * "pendiente de verificación", y volver a pedir la lista lo haría desaparecer
 * de abajo del cursor mientras la persona sigue trabajando. Las filas viejas se
 * quedan; lo que cambia es el índice.
 *
 * Los contadores de la sesión viven acá y sólo acá: son de esta sesión, no
 * métricas del equipo (invariante 6).
 */
export function useColaFocus(filtros: FiltrosFocus, owner: OwnerFilterValue) {
  const etapas = filtros.etapas.length ? filtros.etapas : [...ETAPAS];
  const [etapaIdx, setEtapaIdx] = useState(0);
  const etapa = etapas[Math.min(etapaIdx, etapas.length - 1)] ?? etapas[0];

  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);

  const [procesados, setProcesados] = useState<Record<number, TipoProceso>>({});
  const [sesion, setSesion] = useState<ResumenSesion>({ ejecutados: 0, encolados: 0, saltados: 0 });
  /** Lo hecho dentro del bloque de 25 en curso; se pone a cero al arrancar otro. */
  const [enBloque, setEnBloque] = useState(0);

  const pedido = useRef(0);
  const clave = url(etapa, filtros, owner, null);
  /**
   * Qué cola está realmente pintada. Sin esto, el render que cambia de etapa
   * (antes de que corra el efecto que recarga) ve las filas de la etapa vieja
   * con el nombre de la nueva y dibuja "etapa vacía" por un frame.
   */
  const [claveCargada, setClaveCargada] = useState<string | null>(null);

  const cargar = useCallback(
    async (desdeCursor: string | null) => {
      const id = ++pedido.current;
      if (desdeCursor) setCargandoMas(true);
      else {
        setCargando(true);
        setError(null);
      }
      try {
        const payload = await fetcher<ListPayload>(url(etapa, filtros, owner, desdeCursor));
        if (id !== pedido.current) return;
        setRows((prev) => (desdeCursor ? [...prev, ...payload.rows] : payload.rows));
        setTotal(payload.total);
        setCursor(payload.nextCursor);
        setClaveCargada(url(etapa, filtros, owner, null));
      } catch (e) {
        if (id !== pedido.current) return;
        setError(e instanceof Error ? e.message : 'No se pudo cargar la cola.');
      } finally {
        if (id === pedido.current) {
          setCargando(false);
          setCargandoMas(false);
        }
      }
    },
    [etapa, filtros, owner],
  );

  // Cambiar de etapa o de filtro empieza la cola de cero.
  useEffect(() => {
    setRows([]);
    setCursor(null);
    setIdx(0);
    setClaveCargada(null);
    void cargar(null);
    // `clave` resume etapa + filtros + responsable en un string: sin eso, el
    // objeto de filtros cambia de identidad en cada render y esto se dispara solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Se pide la página siguiente antes de llegar al final, para que pasar de
  // cliente nunca espere a la red.
  useEffect(() => {
    if (cursor && !cargandoMas && !cargando && idx >= rows.length - MARGEN_PREFETCH) void cargar(cursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cursor, rows.length, cargandoMas, cargando]);

  const sincronizada = claveCargada === clave;
  const actual = sincronizada ? (rows[idx] ?? null) : null;
  const siguiente = sincronizada ? (rows[idx + 1] ?? null) : null;
  const terminada = sincronizada && !cargando && !cargandoMas && !cursor && idx >= rows.length;

  const procesadosEtapa = useMemo(
    () => rows.slice(0, Math.max(idx, 0)).filter((r) => procesados[r.chatId] && procesados[r.chatId] !== 'saltado').length,
    [rows, idx, procesados],
  );

  const avanzar = useCallback(() => setIdx((i) => i + 1), []);
  const retroceder = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  /** Deja anotado qué se hizo con este cliente y pasa al siguiente. */
  const marcar = useCallback(
    (chatId: number, tipo: TipoProceso) => {
      setProcesados((prev) => ({ ...prev, [chatId]: tipo }));
      setSesion((prev) => ({
        ejecutados: prev.ejecutados + (tipo === 'ejecutado' ? 1 : 0),
        encolados: prev.encolados + (tipo === 'encolado' ? 1 : 0),
        saltados: prev.saltados + (tipo === 'saltado' ? 1 : 0),
      }));
      if (tipo !== 'saltado') setEnBloque((n) => n + 1);
      setIdx((i) => i + 1);
    },
    [],
  );

  const hayOtraEtapa = etapaIdx < etapas.length - 1;
  const pasarASiguienteEtapa = useCallback(() => setEtapaIdx((i) => i + 1), []);
  const volverAPrimeraEtapa = useCallback(() => setEtapaIdx(0), []);

  return {
    etapa,
    etapas,
    etapaIdx,
    hayOtraEtapa,
    pasarASiguienteEtapa,
    volverAPrimeraEtapa,
    rows,
    actual,
    siguiente,
    idx,
    total,
    procesadosEtapa,
    terminada,
    cargando: cargando || !sincronizada,
    cargandoMas,
    error,
    sesion,
    enBloque,
    reiniciarBloque: () => setEnBloque(0),
    avanzar,
    retroceder,
    marcar,
    recargar: () => void cargar(null),
  };
}
