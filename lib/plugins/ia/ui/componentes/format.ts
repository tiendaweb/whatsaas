import { ZONA_NEGOCIO } from '@/lib/time/zona';

export const IA_API = '/api/plugins/ia';

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

export function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
