import type { AppAgrupada } from './vistas';

/**
 * Contrato de `/api/plugins/marketing/*`. El mismo archivo lo importan el
 * servidor y la UI: si cambia un campo, el build lo dice.
 */

/**
 * Un monto SIEMPRE viaja con su moneda y NUNCA se suma con otra.
 *
 * Las cuentas de Meta del equipo facturan en monedas distintas (ARS y PYG
 * conviven hoy). Sumar el gasto de las tres da un número que no significa nada
 * y que además se mueve solo con el dólar.
 */
export type MontoPorMoneda = { currency: string; cents: number };

/** Una campaña de Meta con lo gastado y conseguido en el rango. */
export type CampanaMeta = {
  id: number;
  nombre: string;
  estado: string;
  objetivo: string | null;
  cuenta: string | null;
  gasto: MontoPorMoneda | null;
  impresiones: number;
  clicks: number;
  resultados: number;
  /** Costo por resultado; null cuando no hubo resultados en el rango. */
  costoPorResultado: MontoPorMoneda | null;
};

export type ResumenMarketing = {
  /** Días que abarca el panorama. */
  rangoDias: number;
  /**
   * Vistas que se pueden dibujar: las propias más las de una app que el equipo
   * tenga activa. El rail se arma con esto.
   */
  vistasDisponibles: string[];
  publicidad: {
    cuentas: number;
    cuentasSincronizadas: number;
    campanasActivas: number;
    campanasTotales: number;
    /** Gasto del rango, por moneda. */
    gasto: MontoPorMoneda[];
    impresiones: number;
    clicks: number;
    resultados: number;
    /** Última sincronización con Meta, ISO o null si nunca corrió. */
    ultimaSync: string | null;
    /**
     * Último día del que hay métricas (`YYYY-MM-DD`), o null si no hay ninguna.
     *
     * No es lo mismo que `ultimaSync`: el sync puede haber corrido ayer y
     * fallado, y entonces el último dato sigue siendo de hace dos meses. Sin
     * este dato, un panorama vacío se lee como "no se gastó nada" cuando lo que
     * pasa es que nadie trajo los números.
     */
    ultimoDiaConDatos: string | null;
    /** Cuentas que nunca sincronizaron o cuyo último intento falló. */
    cuentasConProblema: number;
    top: CampanaMeta[];
  };
  difusion: {
    disponible: boolean;
    campanas: number;
    enviados: number;
    fallidos: number;
    programadas: number;
  };
  publicaciones: {
    programadas: number;
    publicadas: number;
    cuentas: number;
    /** Comentarios de Facebook e Instagram sin responder. */
    comentariosNuevos: number;
  };
  captacion: {
    formularios: number;
    envios: number;
    /** Envíos de los últimos `rangoDias`. */
    enviosDelRango: number;
    plantillas: number;
  };
  /** Contadores de las apps agrupadas que el equipo tenga activas. */
  apps: {
    activas: string[];
    contadores: Partial<Record<NonNullable<AppAgrupada['contador']>, number>>;
  };
};
