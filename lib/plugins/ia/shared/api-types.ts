import type { AppAgrupada } from './vistas';

/** Contrato de `/api/plugins/ia/*`. Lo importan el servidor y la UI. */

export type ResumenIa = {
  vistasDisponibles: string[];
  agente: {
    /** El bot contesta solo en los chats donde está encendido. */
    activo: boolean;
    proveedor: string | null;
    modelo: string | null;
    /** Largo del prompt de sistema, en caracteres. 0 = sin instrucciones. */
    instrucciones: number;
    /** Conversaciones con sesión de IA abierta. */
    sesiones: number;
  };
  funciones: {
    /** Las que trae el sistema por app (`ai_builtin_tools`). */
    integradas: number;
    integradasActivas: number;
    /** Las que armó el equipo en el creador de herramientas. */
    propias: number;
    propiasActivas: number;
  };
  automatizaciones: {
    total: number;
    activas: number;
    /** Carpetas donde están guardadas. */
    carpetas: number;
  };
  conectores: Array<{
    pluginId: string;
    label: string;
    activo: boolean;
    /** Credenciales vivas: sin revocar y sin vencer. */
    credenciales: number;
    ultimoUso: string | null;
  }>;
  banco: {
    total: number;
    activas: number;
    /** Apagadas por el propio banco (cuota, error). */
    apagadas: number;
    /** Keys con un error registrado en las últimas 24 h. */
    conErrorReciente: number;
    /** La última vez que el banco usó una key. */
    ultimoUso: string | null;
  };
  apps: {
    activas: string[];
    contadores: Partial<Record<NonNullable<AppAgrupada['contador']>, number>>;
  };
};
