import type { ContactoCard, Orden, OrdenSinFicha, Temperatura } from './tipos';

/** JID de WhatsApp → número pelado (sin dominio ni sufijo de dispositivo). */
export function numeroDeJid(jid: string): string {
  return (jid || '').split('@')[0].split(':')[0];
}

export function normalizarJid(jid: string): string {
  return (jid || '').split(':')[0];
}

/** Texto sin acentos ni mayúsculas, para buscar. */
export function plano(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function formatearNumero(numero: string): string {
  if (!numero) return '';
  const digits = numero.replace(/\D/g, '');
  if (!digits) return numero;
  return `+${digits}`;
}

export function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "hace 2 h" sin depender de date-fns. Nunca tira. */
export function tiempoRelativo(ts: number | null, ahora = Date.now()): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const diff = Math.max(0, ahora - ts);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `hace ${w} sem`;
  const m = Math.floor(d / 30);
  if (m < 12) return `hace ${m} mes${m === 1 ? '' : 'es'}`;
  const y = Math.floor(d / 365);
  return `hace ${y} año${y === 1 ? '' : 's'}`;
}

const PESO_TEMPERATURA: Record<Temperatura, number> = { hot: 0, warm: 1, cold: 2 };

export const TEMPERATURA_DOT: Record<Temperatura, string> = {
  hot: 'bg-red-500',
  warm: 'bg-amber-400',
  cold: 'bg-sky-400',
};

function porUltimo(a: ContactoCard, b: ContactoCard) {
  return (b.ultimoTs ?? 0) - (a.ultimoTs ?? 0);
}

function porNombre(a: ContactoCard, b: ContactoCard) {
  return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
}

export function ordenar(lista: ContactoCard[], orden: Orden): ContactoCard[] {
  const copia = [...lista];
  switch (orden) {
    case 'nombre':
      return copia.sort(porNombre);
    case 'sinContestar':
      return copia.sort((a, b) => {
        const pa = !a.ultimoEsMio && a.unread > 0 ? 0 : 1;
        const pb = !b.ultimoEsMio && b.unread > 0 ? 0 : 1;
        return pa - pb || porUltimo(a, b);
      });
    case 'temperatura':
      return copia.sort((a, b) => PESO_TEMPERATURA[a.temperatura] - PESO_TEMPERATURA[b.temperatura] || porUltimo(a, b));
    case 'ultimo':
    default:
      return copia.sort(porUltimo);
  }
}

export function ordenarSinFicha(lista: ContactoCard[], orden: OrdenSinFicha): ContactoCard[] {
  const copia = [...lista];
  switch (orden) {
    case 'nombre':
      return copia.sort(porNombre);
    case 'noLeidos':
      return copia.sort((a, b) => b.unread - a.unread || porUltimo(a, b));
    case 'ultimo':
    default:
      return copia.sort(porUltimo);
  }
}

export function leerLS<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function guardarLS(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sin storage */
  }
}
