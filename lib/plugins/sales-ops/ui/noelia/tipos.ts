import type { Gate } from '../../shared/taxonomy';
import type { FiltrosCola } from '../focus/useColaFocus';

export const ETAPAS_NOELIA = ['dinero', 'oportunidades', 'barrido', 'revisar'] as const;
export type EtapaNoelia = (typeof ETAPAS_NOELIA)[number];

export const ETAPA_NOELIA_META: Record<EtapaNoelia, { label: string; hint: string; icon: string }> = {
  dinero: { label: 'Dinero ahora', hint: 'Falta cobrar o cerrar', icon: 'dinero' },
  oportunidades: { label: 'Oportunidades', hint: 'Ya recibieron precio', icon: 'oportunidad' },
  barrido: { label: 'Seguimientos', hint: 'Se enfriaron sin definir', icon: 'seguimiento' },
  revisar: { label: 'Revisar', hint: 'Datos dudosos o incompletos', icon: 'revisar' },
};

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
