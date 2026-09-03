/**
 * Meta reporta la inversión NETA: lo que factura el anuncio, sin impuestos.
 * En Argentina encima van percepciones e impuestos (por defecto 30%), así que el dinero
 * que realmente sale de la cuenta es el neto más la alícuota. Todos los importes que
 * mostramos son FINALES; el neto queda como referencia.
 *
 * Se aplica sobre el gasto y, por arrastre, sobre todo lo derivado de él: costo por
 * resultado, CPC y CPM.
 */
export function applyTax(net: number, taxRatePercent: number): number {
  return net * (1 + taxRatePercent / 100);
}

export function parseTaxRate(value: unknown): number {
  const rate = Number(value ?? 0);
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.min(rate, 200);
}
