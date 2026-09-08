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

/**
 * Badge de estado de la tarjeta. Arranca con lo que dice el expediente y las
 * acciones lo pisan mientras el operador trabaja el caso.
 */
export type EstadoCaso = { texto: string; tono: 'ambar' | 'verde' | 'neutro' };

export type FiltrosNoelia = FiltrosCola<EtapaNoelia>;

export const FILTROS_NOELIA: FiltrosNoelia = {
  etapas: [...ETAPAS_NOELIA],
  gates: [] as Gate[],
  situaciones: [],
  cliente: null,
  // Incluye propuestas que esperan aprobación; la tarjeta evita duplicados y
  // el backend sigue excluyendo pospuestos.
  soloPendientes: false,
  modo: 'decision',
  orden: 'priority',
};

export const LS_BLOQUE_NOELIA = 'sales-ops:noelia:bloque';
