import { DEAL_STAGES, type DealStage } from '@/lib/db/schema';

export { DEAL_STAGES };
export type { DealStage };

export const OPEN_STAGES: readonly DealStage[] = ['qualified', 'proposal', 'negotiation'];
export const CLOSED_STAGES: readonly DealStage[] = ['closed_won', 'closed_lost'];

export function isDealStage(value: unknown): value is DealStage {
  return typeof value === 'string' && (DEAL_STAGES as readonly string[]).includes(value);
}

/**
 * Probabilidad por defecto de cada etapa. Sólo se aplica al crear o al mover una
 * oportunidad que todavía tiene el valor por defecto de su etapa anterior: si
 * alguien puso 82 a mano, moverla de etapa no se lo pisa.
 */
export const STAGE_DEFAULT_PROBABILITY: Record<DealStage, number> = {
  qualified: 25,
  proposal: 50,
  negotiation: 75,
  closed_won: 100,
  closed_lost: 0,
};

export const CUSTOMER_INDUSTRIES = [
  'technology',
  'software',
  'finance',
  'healthcare',
  'retail',
  'manufacturing',
  'consulting',
  'other',
] as const;

export type CustomerIndustry = (typeof CUSTOMER_INDUSTRIES)[number];

export type DealListFilters = {
  stage?: DealStage;
  ownerId?: number;
  customerId?: number;
  contactId?: number;
  minValue?: number;
  expectedBefore?: Date;
  /** Sólo las que no se movieron en `staleAfterDays`. */
  stale?: boolean;
  open?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
};

export type DealInput = {
  title: string;
  customerId?: number | null;
  contactId?: number | null;
  stage?: DealStage;
  value?: number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: Date | null;
  ownerId?: number | null;
  source?: string;
  notes?: string;
};

export type DealStats = {
  totalValue: number;
  openCount: number;
  averageValue: number;
  currency: string;
  byStage: Array<{
    stage: DealStage;
    count: number;
    value: number;
    /** Valor ponderado por probabilidad: lo que realmente se espera cerrar. */
    weightedValue: number;
  }>;
};

export const DEFAULT_STALE_AFTER_DAYS = 14;
