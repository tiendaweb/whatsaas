/**
 * Formateo de dinero a prueba de datos sucios.
 *
 * `Intl.NumberFormat` con `style: 'currency'` LANZA `RangeError` si la moneda no
 * es un código ISO-4217 de tres letras. Un throw dentro de un render tumba la
 * pantalla entera con el error boundary genérico: el servidor devuelve 200, no
 * queda nada en los logs, y el usuario ve una pantalla en blanco.
 *
 * No es hipotético. En `team_customer_transactions` hay 35 filas cuya columna
 * `currency` guarda nombres de acciones de AAPP Space —
 * `"enable_disable_nfc_card_order_website"`, `"activate_plan_during_registeration"` —
 * porque la API de origen reutiliza ese campo para otra cosa y el sync lo
 * copiaba tal cual. Cualquier pantalla que formatee una de esas filas se cae.
 *
 * El fallback `currency || 'USD'` NO alcanza: esos strings son truthy y pasan
 * derecho al `Intl` que revienta. Hay que validar la forma, no la ausencia.
 *
 * La regla: ningún dato guardado por otra app puede romper una pantalla. Si la
 * moneda no se puede interpretar, se muestra el número con el código al lado.
 */

/** ISO-4217: exactamente tres letras. Es la única forma que `Intl` acepta. */
const ISO_4217 = /^[A-Za-z]{3}$/;

/**
 * La moneda si es utilizable, o `null`. Exportada porque también sirve en el
 * borde de entrada: conviene no guardar lo que después no se va a poder mostrar.
 */
export function normalizeCurrency(currency: unknown): string | null {
  if (typeof currency !== 'string') return null;
  const trimmed = currency.trim();
  return ISO_4217.test(trimmed) ? trimmed.toUpperCase() : null;
}

export type MoneyOptions = {
  locale?: string;
  /** Cuántos decimales mostrar. Por defecto 0: los importes suelen ser enteros. */
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

/**
 * Formatea un importe ya expresado en unidades (no en centavos).
 *
 * Con una moneda inválida no lanza: devuelve el número formateado y, si el
 * valor original decía algo, lo agrega como sufijo para no perder información.
 */
export function formatMoney(amount: number, currency: unknown, options: MoneyOptions = {}): string {
  const { locale = 'es-AR', maximumFractionDigits = 0, minimumFractionDigits } = options;
  const value = Number.isFinite(amount) ? amount : 0;
  const iso = normalizeCurrency(currency);

  if (iso) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: iso,
        maximumFractionDigits,
        ...(minimumFractionDigits !== undefined ? { minimumFractionDigits } : {}),
      }).format(value);
    } catch {
      // Un ISO con forma válida que igual no exista (por ejemplo "XYZ"): se cae
      // al camino de abajo en vez de tumbar el render.
    }
  }

  const numero = new Intl.NumberFormat(locale, {
    maximumFractionDigits,
    ...(minimumFractionDigits !== undefined ? { minimumFractionDigits } : {}),
  }).format(value);

  // Sin moneda reconocible se muestra sólo el número. Si el dato original era un
  // código corto (aunque inválido) se conserva; si era basura larga, se
  // descarta: pegarle "enable_disable_nfc_card_order_website" a un importe es
  // peor que no mostrar nada.
  const sufijo = typeof currency === 'string' && currency.trim().length > 0 && currency.trim().length <= 5
    ? ` ${currency.trim()}`
    : '';
  return `${numero}${sufijo}`;
}

/** El mismo formateo para importes guardados en centavos. */
export function formatMoneyFromCents(cents: number, currency: unknown, options: MoneyOptions = {}): string {
  return formatMoney((Number.isFinite(cents) ? cents : 0) / 100, currency, options);
}
