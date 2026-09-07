import { ZONA_NEGOCIO } from '@/lib/time/zona';
/**
 * Etiquetas y formateadores de la UI del Command Center. Español rioplatense,
 * hardcodeado a propósito (el plugin se construye en paralelo, sin i18n).
 * `Intl.*` siempre va en try/catch: un dato sucio no puede tumbar la pantalla.
 */
import type {
  ActionKind,
  ActionStatus,
  AnalysisStatus,
  Gate,
  Owner,
  SignalKind,
  Temperature,
} from '../../shared/taxonomy';

export const OWNER_LABELS: Record<Owner, string> = {
  noelia: 'Noelia',
  carlos: 'Carlos',
  produccion: 'Producción',
  ia: 'IA',
  nadie: 'Nadie',
};

export const STATUS_LABELS: Record<AnalysisStatus, string> = {
  sin_analizar: 'Sin analizar',
  en_proceso: 'Para revisar',
  recuperado: 'Recuperado',
  cobro: 'Cobro',
  pendiente_con_fecha: 'Pendiente con fecha',
  pre_descarte: 'Pre-descarte',
  descarte_definitivo: 'Descarte definitivo',
  cliente: 'Cliente',
};

export const SIGNAL_LABELS: Record<SignalKind, string> = {
  interesado: 'Interesado',
  pide_informacion: 'Pide info',
  precio: 'Precio',
  objecion: 'Objeción',
  quiere_llamada: 'Quiere llamada',
  intencion_compra: 'Intención de compra',
  pago: 'Pago',
  rechazo: 'Rechazo',
  respuesta_automatica: 'Automática',
  irrelevante: 'Irrelevante',
};

export const ACTION_KIND_LABELS: Record<ActionKind, string> = {
  send_message: 'Enviar mensaje',
  schedule_message: 'Programar mensaje',
  create_task: 'Crear tarea',
  request_demo: 'Pedir demo web',
  register_sale: 'Registrar cobro',
  mark_pre_descarte: 'Marcar pre-descarte',
  mark_descarte: 'Marcar descarte',
  assign_owner: 'Asignar responsable',
  schedule_call: 'Agendar llamada',
};

/**
 * Mapa único de estados de acción de la Cola. `ui/cola/api.ts` lo re-exporta
 * como `STATUS_LABELS`: había dos mapas para lo mismo y una tarea creada decía
 * "Enviado" en una pantalla y "Ejecutada" en la de al lado.
 */
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  proposed: 'Propuesta',
  pending_approval: 'Pendiente de aprobación',
  approved: 'Aprobada',
  executing: 'Ejecutando',
  executed: 'Ejecutada',
  resulted: 'Con resultado',
  rejected: 'Rechazada',
  expired: 'Vencida',
  failed: 'Falló',
};

/**
 * Qué se hizo, según el tipo de acción: `executed` no quiere decir lo mismo en
 * un mensaje que en una tarea. "Ejecutada" a secas es correcto pero no dice
 * nada; con el kind a la vista se puede escribir lo que de verdad pasó.
 */
export function verboEjecutado(kind: ActionKind): string {
  switch (kind) {
    case 'send_message':
      return 'Enviado';
    case 'schedule_message':
      return 'Programado';
    case 'create_task':
    case 'request_demo':
      return 'Creada';
    case 'register_sale':
      return 'Registrado';
    case 'schedule_call':
      return 'Agendada';
    default:
      return 'Aplicado';
  }
}

export const TEMPERATURE_LABELS: Record<Temperature, string> = { hot: 'caliente', warm: 'tibio', cold: 'frío' };

export const WHO_LABELS: Record<string, string> = {
  cliente: 'CLIENTE',
  humano: 'HUMANO',
  bot: 'BOT',
  ia: 'IA',
  nota: 'NOTA',
};

export const WARNING_LABELS: Record<string, string> = {
  automation_active: 'Automatización activa',
  auto_reply: 'Respuesta automática',
  cliente: 'Es cliente',
  envio_reciente: 'Envío reciente (72 h)',
};

/** `objecion_precio` → `Objecion precio`. Para listas cerradas sin mapa propio. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function gateLabelShort(gate: Gate | null | undefined): string {
  return gate ?? '—';
}

export function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0';
  try {
    return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

export function fmtMoney(amount: number | null | undefined, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  const prefix = currency === 'PYG' ? 'Gs ' : currency === 'ARS' ? 'ARS ' : currency === 'USD' ? 'USD ' : `${currency} `;
  return `${prefix}${fmtInt(amount)}`;
}

/** Sólo la hora: en una lista agrupada por día, repetir la fecha es ruido. */
export function fmtHora(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(11, 16);
  }
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)} %`;
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_NEGOCIO, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function fmtDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_NEGOCIO, day: '2-digit', month: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(5, 10);
  }
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  try {
    // Zona del negocio explícita: el navegador de una IA que maneja Chrome
    // suele estar en UTC, y mostraría las 13 donde son las 10.
    return new Intl.DateTimeFormat('es-AR', { timeZone: ZONA_NEGOCIO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

/** "hace 2 h" sin librerías. Nunca tira. */
export function tiempoRelativo(value: string | null | undefined, ahora = Date.now()): string {
  if (!value) return '';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return '';
  const diff = ahora - ts;
  const abs = Math.abs(diff);
  const futuro = diff < 0;
  const min = Math.floor(abs / 60_000);
  let txt: string;
  if (min < 1) txt = 'ahora';
  else if (min < 60) txt = `${min} min`;
  else if (min < 60 * 24) txt = `${Math.floor(min / 60)} h`;
  else if (min < 60 * 24 * 30) txt = `${Math.floor(min / (60 * 24))} d`;
  else if (min < 60 * 24 * 365) txt = `${Math.floor(min / (60 * 24 * 30))} meses`;
  else txt = `${Math.floor(min / (60 * 24 * 365))} años`;
  if (txt === 'ahora') return txt;
  return futuro ? `en ${txt}` : `hace ${txt}`;
}

export function diasTexto(days: number | null | undefined): string {
  if (days == null) return 'sin dato';
  if (days === 0) return 'hoy';
  if (days === 1) return '1 día';
  return `${days} días`;
}

export function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

export const SALES_OPS_API = '/api/plugins/sales-ops';
export const LS_OWNER = 'sales-ops:owner';
/** Superficie plana de los bloques: sin sombra ni blur, sólo borde y fondo. */
export const panel = 'border-border bg-card';
