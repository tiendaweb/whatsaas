const LOCALE = 'es-AR';

export function formatCurrency(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(value)}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' });
}

export type Delta = { percent: number; direction: 'up' | 'down' | 'flat' } | null;

/**
 * Variación contra el período anterior. Devuelve null cuando no hay base de comparación:
 * un "+100%" contra cero no dice nada útil.
 */
export function computeDelta(current: number | null, previous: number | null): Delta {
  if (current === null || previous === null || previous === 0) return null;

  const percent = ((current - previous) / previous) * 100;
  if (Math.abs(percent) < 0.5) return { percent, direction: 'flat' };

  return { percent, direction: percent > 0 ? 'up' : 'down' };
}
