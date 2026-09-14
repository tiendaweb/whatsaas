import { formatMoneyFromCents } from '@/lib/format/money';
import { ZONA_NEGOCIO } from '@/lib/time/zona';
import type { MontoPorMoneda } from '../../shared/api-types';

export const EMPRESA_API = '/api/plugins/empresa';
export const LS_MARCA = 'empresa:marca';

export const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = String(body.error);
    } catch {
      /* sin cuerpo */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
};

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0';
  try {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

/**
 * Un monto en centavos, con su moneda. Pasa por `formatMoneyFromCents`, que ya
 * normaliza el código: una moneda sucia venida de un sync hace tirar
 * `RangeError` a `Intl` y eso se lleva puesta la pantalla entera.
 */
export function fmtMonto(monto: MontoPorMoneda): string {
  return formatMoneyFromCents(monto.cents, monto.currency, { locale: 'es-AR', maximumFractionDigits: 0 });
}

/**
 * Varias monedas, en texto corto: "USD 2.140 · ARS 380.000".
 *
 * Nunca se suman entre sí. Cuando no hay nada devuelve un guion, no un cero:
 * "USD 0" afirma que se midió y dio cero, y acá lo que pasa es que no hay dato.
 */
export function fmtMontos(montos: MontoPorMoneda[] | null | undefined): string {
  if (!montos?.length) return '—';
  return montos.map(fmtMonto).join(' · ');
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_NEGOCIO, day: '2-digit', month: 'short' }).format(d);
  } catch {
    return iso.slice(0, 10);
  }
}

/** "en 5 días" / "vencida hace 2 días" / "vence hoy". */
export function fmtVencimiento(dias: number): string {
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  if (dias > 0) return `en ${dias} días`;
  if (dias === -1) return 'venció ayer';
  return `venció hace ${Math.abs(dias)} días`;
}

export function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
