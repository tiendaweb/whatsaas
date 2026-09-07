import type { Gate } from '../../shared/taxonomy';
import type { FiltrosCola } from '../focus/useColaFocus';

export const ETAPAS_NOELIA = ['dinero', 'oportunidades', 'barrido', 'revisar'] as const;
export type EtapaNoelia = (typeof ETAPAS_NOELIA)[number];

/**
 * Las cuatro colas de la maqueta aprobada (aapp.space/business-command
 * #modo-noelia). El emoji y el orden son los de la maqueta: no se cambian sin
 * cambiar también la landing, porque el cliente compra viendo esa pantalla.
 */
export const ETAPA_NOELIA_META: Record<EtapaNoelia, { label: string; emoji: string; hint: string }> = {
  dinero: { label: 'Dinero ahora', emoji: '💰', hint: 'Falta cobrar o cerrar' },
  oportunidades: { label: 'Oportunidades', emoji: '🔥', hint: 'Ya recibieron precio' },
  barrido: { label: 'Seguimientos', emoji: '↗', hint: 'Se enfriaron sin definir' },
  revisar: { label: 'Revisar', emoji: '⚠', hint: 'Datos dudosos o incompletos' },
};

/** Los cinco eslabones que la maqueta muestra debajo de la tarjeta. */
export const CADENA_MOTOR = [
  { paso: '1 · RADAR', detalle: 'Lee conversaciones' },
  { paso: '2 · FOCUS', detalle: 'Interpreta señales' },
  { paso: '3 · TORRE', detalle: 'Ordena prioridades' },
  { paso: '4 · HUMANO', detalle: 'Aprueba la decisión' },
  { paso: '5 · CLOUD', detalle: 'Ejecuta si está habilitado' },
] as const;

/** Atajos que la maqueta declara como chips en la barra de velocidad. */
export const ATAJOS_NOELIA = [
  { tecla: 'A', accion: 'Aprobar' },
  { tecla: 'E', accion: 'Editar' },
  { tecla: 'I', accion: 'IA' },
  { tecla: 'P', accion: 'Posponer' },
  { tecla: 'S', accion: 'Saltar' },
] as const;

/**
 * Badge de estado de la tarjeta. Arranca con lo que dice el expediente y las
 * acciones lo pisan mientras el operador trabaja el caso.
 */
export type EstadoCaso = { texto: string; tono: 'ambar' | 'verde' | 'neutro' };

export type FiltrosNoelia = FiltrosCola<EtapaNoelia>;

export const FILTROS_NOELIA: FiltrosNoelia = {
  etapas: [...ETAPAS_NOELIA],
  gates: [] as Gate[],
  // Incluye propuestas que esperan aprobación; la tarjeta evita duplicados y
  // el backend sigue excluyendo pospuestos.
  soloPendientes: false,
  modo: 'decision',
  orden: 'priority',
};

export const LS_BLOQUE_NOELIA = 'sales-ops:noelia:bloque';
