/**
 * Formato de dinero de Finanzas OS. Reglas de la casa:
 * - Los importes viajan en CENTAVOS y por moneda; las monedas nunca se suman.
 * - `Intl` con un código inválido REVIENTA el render (incidente documentado):
 *   todo pasa por try/catch con fallback plano.
 */
const PREFIJOS: Record<string, string> = { ARS: '$', PYG: 'Gs ', USD: 'US$', EUR: '€', BRL: 'R$' };

export function fmtMoney(cents: number, currency: string): string {
  const units = Math.round(cents) / 100;
  try {
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('moneda inválida');
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      maximumFractionDigits: units % 1 === 0 ? 0 : 2,
    }).format(units);
  } catch {
    const prefix = PREFIJOS[currency] ?? `${currency} `;
    return `${prefix}${units.toLocaleString('es-AR')}`;
  }
}

/** Igual que fmtMoney pero para importes que YA están en unidades (pasarela). */
export function fmtUnits(units: number, currency: string): string {
  return fmtMoney(Math.round(units * 100), currency);
}

export function fmtMoneyMap(map: Record<string, number> | undefined | null): string {
  const entries = Object.entries(map ?? {}).filter(([, v]) => v !== 0);
  if (entries.length === 0) return '—';
  return entries
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cur, cents]) => fmtMoney(cents, cur))
    .join(' · ');
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(d);
}

export function fmtMonth(month: string): string {
  const d = new Date(`${month}-01T12:00:00Z`);
  return new Intl.DateTimeFormat('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(d);
}
