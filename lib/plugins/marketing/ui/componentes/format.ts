import { formatMoneyFromCents } from '@/lib/format/money';
import { ZONA_NEGOCIO } from '@/lib/time/zona';
import type { MontoPorMoneda } from '../../shared/api-types';

export const MARKETING_API = '/api/plugins/marketing';
export const LS_RANGO = 'marketing:rango';

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
 * normaliza el código: una moneda sucia venida del sync de Meta hace tirar
 * `RangeError` a `Intl` y eso se lleva puesta la pantalla entera.
 */
export function fmtMonto(monto: MontoPorMoneda): string {
  return formatMoneyFromCents(monto.cents, monto.currency, { locale: 'es-AR', maximumFractionDigits: 0 });
}

/** Varias monedas, en texto corto. Nunca se suman entre sí. */
export function fmtMontos(montos: MontoPorMoneda[] | null | undefined): string {
  if (!montos?.length) return '—';
  return montos.map(fmtMonto).join(' · ');
}

/** "hace 3 h" / "hace 2 días" / "nunca". */
export function fmtDesde(iso: string | null | undefined): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'nunca';
  const minutos = Math.round((Date.now() - d.getTime()) / 60_000);
  if (minutos < 1) return 'recién';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
}

export function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_NEGOCIO, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

/** Porcentaje de clicks sobre impresiones, ya redondeado. */
export function fmtCtr(clicks: number, impresiones: number): string {
  if (!impresiones) return '—';
  return `${((clicks / impresiones) * 100).toFixed(2)}%`;
}

export function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Un día suelto (`YYYY-MM-DD`) en texto corto: "7 de jul". */
export function fmtDia(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return fecha.slice(0, 10);
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_NEGOCIO, day: 'numeric', month: 'long' }).format(d);
  } catch {
    return fecha.slice(0, 10);
  }
}
