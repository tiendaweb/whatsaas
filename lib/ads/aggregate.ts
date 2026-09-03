import { applyTax } from './tax';
import type { Granularity, OverviewKpis } from './types';

export const num = (value: unknown) => Number(value ?? 0) || 0;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Métricas derivadas SIEMPRE calculadas sobre los totales del período, nunca promediando
 * los valores diarios de Meta: el promedio de CPC diarios no es el CPC real.
 * Todo lo monetario sale con impuesto aplicado.
 */
export function buildKpis(
  totals: { spendNet: number; results: number; impressions: number; clicks: number; reach?: number },
  taxRate: number,
): OverviewKpis {
  const { spendNet, results, impressions, clicks, reach = 0 } = totals;
  const spend = applyTax(spendNet, taxRate);

  return {
    spend,
    spendNet,
    tax: spend - spendNet,
    results,
    costPerResult: results > 0 ? spend / results : null,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    frequency: reach > 0 ? impressions / reach : null,
    reach,
    activeCampaigns: 0,
  };
}

/** Con rangos largos, una barra por día es ilegible: subimos a semana o mes. */
export function resolveGranularity(requested: string | null, since: string, until: string): Granularity {
  if (requested === 'day' || requested === 'week' || requested === 'month') return requested;

  const days =
    Math.round(
      (new Date(`${until}T00:00:00Z`).getTime() - new Date(`${since}T00:00:00Z`).getTime()) / DAY_MS,
    ) + 1;

  if (days > 180) return 'month';
  if (days > 62) return 'week';
  return 'day';
}

export function seriesLabel(date: string, granularity: Granularity): string {
  const parsed = new Date(`${date}T00:00:00`);

  if (granularity === 'month') {
    return parsed.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
  }
  if (granularity === 'week') {
    return `sem ${parsed.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`;
  }
  return parsed.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}
