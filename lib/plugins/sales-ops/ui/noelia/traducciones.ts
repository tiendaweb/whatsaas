import type { AnalysisDetail, DetailPayload } from '../../shared/api-types';
import { humanize } from '../components/format';

const INTENCION: Record<string, string> = {
  compra_activa: 'Quiere comprar',
  fuerte: 'Tiene intención alta',
  evaluando: 'Está evaluando',
  curiosidad: 'Está averiguando',
  ninguna: 'Todavía no mostró intención',
};

const BLOQUEO: Record<string, string> = {
  payment: 'Se frenó en el pago',
  pago: 'Se frenó en el pago',
  precio: 'Está evaluando el precio',
  presupuesto: 'Tiene una objeción de presupuesto',
  tiempo: 'Necesita más tiempo',
  confianza: 'Necesita más confianza',
  competencia: 'Está comparando alternativas',
  sin_respuesta: 'No respondió el seguimiento',
};

export function traducirIntencion(valor: string | null | undefined): string {
  return INTENCION[valor ?? ''] ?? humanize(valor);
}

export function traducirBloqueoDominante(valor: string | null | undefined): string {
  return BLOQUEO[valor ?? ''] ?? humanize(valor);
}

export function customString(custom: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = custom?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function razonesHumanas(detalle: DetailPayload, custom: Record<string, unknown>): string[] {
  const a = detalle.analysis;
  const f = detalle.facts;
  if (!a) return ['Este contacto todavía no tiene un análisis completo.'];
  const out: string[] = [];
  if (f?.never_answered_by_us) out.push('Nosotros quedamos debiendo una respuesta.');
  if (f?.evidence_gap || a.evidenceGap) out.push('Hay audios o evidencia pendiente de revisar.');
  if (f?.payment_pending || a.paymentPending) out.push('Hay un pago pendiente con evidencia.');
  if (f?.automation_active || a.automationActive) out.push('Tiene una automatización activa; revisala antes de escribir a mano.');
  if (f?.auto_reply_detected || a.autoReplyDetected) out.push('La última respuesta parece automática.');
  if (f?.is_existing_customer || a.isExistingCustomer) out.push('Ya es cliente; no tratarlo como un prospecto nuevo.');
  if (f?.days_silent != null) out.push(`Sin contacto hace ${f.days_silent} ${f.days_silent === 1 ? 'día' : 'días'}; habló ${f.who_spoke_last === 'cliente' ? 'el cliente' : f.who_spoke_last === 'nosotros' ? 'el equipo' : 'nadie' } al final.`);
  if (f?.followups_manual === 0) out.push('Nadie del equipo hizo un seguimiento manual todavía.');
  if (f?.forced_reason) out.push(f.forced_reason);
  const evidencia = customString(custom, 'radar_evidencia_decision', 'radar_por_que');
  if (evidencia) out.push(evidencia);
  if (!out.length && a.statusReason) out.push(a.statusReason);
  return [...new Set(out)].slice(0, 5);
}

export function nosotrosLoFrenamos(detalle: DetailPayload): boolean {
  const a = detalle.analysis;
  const texto = `${a?.recommendedAction ?? ''} ${a?.notesForHuman ?? ''} ${a?.lastTeamAction ?? ''}`.toLowerCase();
  return Boolean(detalle.facts?.never_answered_by_us || /(demo|alias|llamada|pregunta|respuesta).*(pendiente|debiendo|falta)/.test(texto));
}

export function dineroEnJuego(a: AnalysisDetail | null): string {
  if (!a) return 'Sin monto confirmado';
  if (!a.quotedPrice) return 'Precio a confirmar';
  const { amount, currency } = a.quotedPrice;
  try {
    // Una moneda inválida en la base tumba la pantalla entera con un
    // RangeError, y el error boundary genérico no dice por qué. Ante datos
    // sucios se degrada al código de moneda crudo.
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount / 100);
  } catch {
    return `${currency} ${Math.round(amount / 100).toLocaleString('es-AR')}`;
  }
}

const ORIGEN: Record<string, string> = {
  ads_meta: 'META ADS',
  ads_cta_sitio: 'CTA DEL SITIO',
  importacion: 'IMPORTACIÓN',
  organico: 'ORGÁNICO',
  presencial: 'PRESENCIAL',
  desconocido: 'SIN DATO',
};

/** `Origen:` de la cabecera de la tarjeta. La maqueta lo escribe en mayúsculas. */
export function traducirOrigen(a: AnalysisDetail | null): string {
  if (!a) return 'SIN DATO';
  return ORIGEN[a.source] ?? humanize(a.source).toUpperCase();
}

/** `Producto:` — lo que pidió, no la taxonomía interna. */
export function productoDelCaso(a: AnalysisDetail | null): string {
  if (!a) return 'SIN DEFINIR';
  const texto = a.needDetail?.trim() || humanize(a.need);
  return texto === '—' ? 'SIN DEFINIR' : texto;
}

/**
 * `Evidencia:` de la caja RADAR DICE. La maqueta muestra una cita textual del
 * cliente; acá se toma la primera evidencia real del expediente.
 */
export function evidenciaRadar(detalle: DetailPayload): string | null {
  const e = detalle.analysis?.evidence;
  const id = e?.payment?.[0] ?? e?.price?.[0] ?? e?.intent?.[0] ?? e?.objection?.[0] ?? e?.gate?.[0] ?? null;
  const hito = id ? detalle.timeline.find((t) => 'id' in t && t.id === id) : null;
  const texto = hito && 'text' in hito ? hito.text.trim() : null;
  if (!texto) return null;
  return texto.length > 160 ? `${texto.slice(0, 159)}…` : texto;
}

/** `Confianza:` de la caja FOCUS RECOMIENDA. */
export function nivelDeConfianza(a: AnalysisDetail | null): string {
  if (!a?.analyzedAt) return 'SIN ANALIZAR';
  if (a.confidence >= 80) return 'ALTA';
  if (a.confidence >= 55) return 'MEDIA';
  return 'BAJA';
}
