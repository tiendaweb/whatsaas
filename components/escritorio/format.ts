/**
 * Formateadores tolerantes a datos sucios.
 *
 * `Intl` LANZA ante entradas inválidas —`RelativeTimeFormat.format(NaN)` tira
 * RangeError, y `NumberFormat` con una moneda que no sea ISO-4217 también—, y un
 * throw dentro del render tumba la pantalla entera con el error boundary
 * genérico. Ya pasó una vez con `"10:10"` en la agenda de una mini-app: un dato
 * de un plugin dejó el Escritorio inutilizable.
 *
 * La regla acá es que ningún dato guardado por otra app pueda romper esta
 * pantalla: si no se puede formatear, se muestra algo razonable.
 */

/** Moneda con fallback: una divisa inválida no puede tumbar la pantalla. */
export function formatMoney(cents: number, currency: string, locale: string): string {
  const amount = (Number.isFinite(cents) ? cents : 0) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount)} ${currency || ''}`.trim();
  }
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(Number.isFinite(value) ? value : 0);
}
