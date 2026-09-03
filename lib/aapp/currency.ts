/**
 * Moneda real de una membresía de AAPP SPACE.
 *
 * AAPP manda `currency: "USD"` en los planes y valores basura en las
 * transacciones; ninguna venta se hizo en dólares. La moneda se deduce del
 * país del cliente: facturación de las transacciones → prefijo telefónico →
 * nombre del plan → default del equipo (ARS).
 */
export const AAPP_CURRENCIES = ['ARS', 'PYG', 'EUR', 'USD'] as const;
export type AappCurrency = (typeof AAPP_CURRENCIES)[number];

const EURO_COUNTRIES = ['españa', 'spain', 'italia', 'italy', 'alemania', 'germany', 'francia', 'france', 'portugal', 'países bajos', 'paises bajos', 'netherlands', 'bélgica', 'belgica', 'belgium', 'austria', 'irlanda', 'ireland', 'grecia', 'greece', 'finlandia', 'finland'];
const EURO_PREFIXES = ['34', '39', '49', '33', '351', '31', '32', '43', '353', '30', '358'];

export function currencyFromCountry(country: string | null | undefined): AappCurrency | null {
  const c = (country ?? '').trim().toLowerCase();
  if (!c) return null;
  if (c.includes('argentin')) return 'ARS';
  if (c.includes('paragua')) return 'PYG';
  if (EURO_COUNTRIES.some((e) => c.includes(e))) return 'EUR';
  return null;
}

export function currencyFromPhone(phone: string | null | undefined): AappCurrency | null {
  const digits = (phone ?? '').replace(/@.*$/, '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('54')) return 'ARS';
  if (digits.startsWith('595')) return 'PYG';
  if (EURO_PREFIXES.some((p) => digits.startsWith(p))) return 'EUR';
  return null;
}

export function currencyFromPlanName(name: string | null | undefined): AappCurrency | null {
  const n = (name ?? '').toLowerCase();
  if (/\(py\)|guaran|\bgs\b/.test(n)) return 'PYG';
  if (/\beur\b|€/.test(n)) return 'EUR';
  return null;
}

/** Sólo acepta códigos ISO de 3 letras; lo demás (claves de features, vacíos) es null. */
export function normalizeCurrencyCode(raw: unknown): string | null {
  const s = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

export type CurrencyEvidence = { countries?: Array<string | null | undefined>; phones?: Array<string | null | undefined>; planName?: string | null; fallback?: AappCurrency };

/** Decide la moneda con la evidencia disponible y dice por qué. */
export function resolveAappCurrency(evidence: CurrencyEvidence): { currency: AappCurrency; reason: 'country' | 'phone' | 'plan' | 'default' } {
  const votes = new Map<AappCurrency, number>();
  for (const country of evidence.countries ?? []) {
    const c = currencyFromCountry(country);
    if (c) votes.set(c, (votes.get(c) ?? 0) + 1);
  }
  if (votes.size) return { currency: [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0], reason: 'country' };
  for (const phone of evidence.phones ?? []) {
    const c = currencyFromPhone(phone);
    if (c) return { currency: c, reason: 'phone' };
  }
  const byPlan = currencyFromPlanName(evidence.planName);
  if (byPlan) return { currency: byPlan, reason: 'plan' };
  return { currency: evidence.fallback ?? 'ARS', reason: 'default' };
}
