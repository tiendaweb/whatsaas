import type { Granularity } from '@/lib/ads/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export type RangeId =
  | 'today'
  | 'yesterday'
  | 'last_7'
  | 'last_14'
  | 'last_30'
  | 'last_90'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'maximum'
  | 'custom';

export type Range = { since: string; until: string };

export const RANGE_OPTIONS: Array<{ id: RangeId; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'last_7', label: 'Últimos 7 días' },
  { id: 'last_14', label: 'Últimos 14 días' },
  { id: 'last_30', label: 'Últimos 30 días' },
  { id: 'last_90', label: 'Últimos 90 días' },
  { id: 'this_month', label: 'Este mes' },
  { id: 'last_month', label: 'Mes pasado' },
  { id: 'this_year', label: 'Este año' },
  { id: 'maximum', label: 'Máximo' },
];

/** Atajos rápidos que se muestran como botones; el resto vive en el desplegable. */
export const QUICK_RANGES: RangeId[] = ['last_7', 'last_30', 'this_month'];

/** Meta retiene ~13 meses; más atrás no hay datos que traer. */
const MAX_HISTORY_DAYS = 395;

export function resolveRange(id: RangeId, current?: Range): Range {
  const now = new Date();
  const today = isoDate(now);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  switch (id) {
    case 'today':
      return { since: today, until: today };

    case 'yesterday': {
      const yesterday = isoDate(new Date(now.getTime() - DAY_MS));
      return { since: yesterday, until: yesterday };
    }

    case 'last_7':
      return { since: isoDate(new Date(now.getTime() - 6 * DAY_MS)), until: today };

    case 'last_14':
      return { since: isoDate(new Date(now.getTime() - 13 * DAY_MS)), until: today };

    case 'last_30':
      return { since: isoDate(new Date(now.getTime() - 29 * DAY_MS)), until: today };

    case 'last_90':
      return { since: isoDate(new Date(now.getTime() - 89 * DAY_MS)), until: today };

    case 'this_month':
      return { since: isoDate(startOfMonth), until: today };

    case 'last_month': {
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return { since: isoDate(firstOfLastMonth), until: isoDate(lastOfLastMonth) };
    }

    case 'this_year':
      return { since: isoDate(new Date(now.getFullYear(), 0, 1)), until: today };

    case 'maximum':
      return { since: isoDate(new Date(now.getTime() - MAX_HISTORY_DAYS * DAY_MS)), until: today };

    case 'custom':
    default:
      return current ?? { since: isoDate(new Date(now.getTime() - 29 * DAY_MS)), until: today };
  }
}

export function rangeDays(range: Range): number {
  return (
    Math.round(
      (new Date(`${range.until}T00:00:00Z`).getTime() - new Date(`${range.since}T00:00:00Z`).getTime()) / DAY_MS,
    ) + 1
  );
}

export const GRANULARITY_OPTIONS: Array<{ id: Granularity; label: string }> = [
  { id: 'day', label: 'Por día' },
  { id: 'week', label: 'Por semana' },
  { id: 'month', label: 'Por mes' },
];
