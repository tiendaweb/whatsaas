import type { MembershipPlanPrice } from '@/lib/db/schema';

/**
 * Deja la lista de precios por moneda coherente con el precio principal.
 *
 * `price`/`currency` (el principal, que es lo que leen suscripciones, Finanzas
 * y los reportes) y la fila de esa misma moneda dentro de `prices` son el mismo
 * número. Si se separan, el catálogo muestra uno y la suscripción cobra otro.
 *
 * Quien edita sólo el precio principal —la app Empresa, el sync de aapp.space,
 * un conector— no tiene por qué saber de la lista: acá se le actualiza su fila
 * y se dejan intactas las demás monedas, que las cargó alguien a mano.
 */
export function syncPlanPrices(opts: {
  /** Lista explícita, cuando el que escribe sí administra todas las monedas. */
  prices?: MembershipPlanPrice[];
  /** Lo que ya estaba guardado en el plan. */
  previous?: MembershipPlanPrice[] | null;
  currency: string;
  price: number;
}): MembershipPlanPrice[] {
  const currency = opts.currency.toUpperCase();
  const base = (opts.prices ?? opts.previous ?? []).map((item) => ({ ...item, currency: item.currency.toUpperCase() }));
  const principal = base.find((item) => item.currency === currency);
  if (!principal) return [...base, { currency, price: opts.price }];
  // Con lista explícita manda lo que mandaron; sin ella, manda el principal.
  if (opts.prices) return base;
  return base.map((item) => (item.currency === currency ? { ...item, price: opts.price } : item));
}
