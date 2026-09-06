import type { EvidenciaDebil, FuenteCliente } from '@/lib/customers/es-cliente';
import type { DossierEntry, RuleFacts } from '../shared/contract';
import type { CustomerEvidence, Gate, Source } from '../shared/taxonomy';

/**
 * Reglas determinísticas del motor (doc 04 §1-§6). Todo acá es puro: recibe
 * el expediente ya clasificado (quién habló, flags, auto) y los hechos que el
 * dossier sacó de la base, y devuelve `RuleFacts`. Sin IA, sin queries.
 *
 * Se usan dos veces por clasificación: antes de la IA (para forzar gates y
 * armar el prompt) y después (para reconciliar lo que la IA dijo).
 */

// ── Normalización de texto ────────────────────────────────────────────────

/** Minúsculas y sin acentos. Los diccionarios están escritos sin acentos. */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Forma canónica para comparar textos entre chats: sin acentos, sin números,
 * sin emojis ni puntuación, espacios colapsados. Tiene que coincidir EXACTO
 * con la expresión SQL de `repeatedTextsForTeam` (dossier.ts).
 */
export function canonicalText(text: string | null | undefined): string {
  return normalizeText(text)
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Diccionarios (doc 04 §1) ──────────────────────────────────────────────

export type Flag = DossierEntry['flags'][number];

const FLAG_PATTERNS: Array<[Exclude<Flag, 'auto'>, RegExp]> = [
  ['precio', /\bprecio|\bcuanto\b|cuanto sale|\bvale\b|\bcosto|\bplan(es)?\b|\$|\busd\b|\bgs\.?\b|\bmil\b|\d+\s?k\b|%/],
  ['pago', /\balias\b|\bcbu\b|\bcvu\b|transferencia|comprobante|\bsena\b|anticipo|\bpagar\b|\bpague\b|\bpago\b|deposit|mercado ?pago|\bcuenta\b/],
  ['objecion', /\bcaro\b|no tengo|presupuesto|\bsocio\b|\bpareja\b|mas adelante|\bdespues\b|lo pienso|comparar|otra empresa|no confio|desconf/],
  ['compromiso', /lo hago|\bavanzo\b|arranquemos|\bdale\b|cuando cobre|la semana que viene|el mes que viene|te confirmo|quiero hacerlo|me interesa/],
  ['rechazo', /no me interesa|no gracias|no molest|equivocado|bloque|\bbaja\b|deja de/],
];

export function detectFlags(text: string): Exclude<Flag, 'auto'>[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const flags: Exclude<Flag, 'auto'>[] = [];
  for (const [flag, pattern] of FLAG_PATTERNS) {
    if (pattern.test(normalized)) flags.push(flag);
  }
  return flags;
}

/** Patrones de bot del lado del cliente (doc 04 §3 criterio 3). */
export const BOT_PATTERN = /asistente virtual|horario de atencion|fuera de horario|gracias por comunicarte|gracias por tu mensaje|en breve te responderemos|en este momento no podemos|\bmenu\b|opcion [0-9]/;

/** Primer mensaje del anuncio (doc 04 §2 R2 y §5). */
export const AD_META_PATTERN = /quiero (mas )?informaci|me gustaria conseguir mas|quiero mas info/;
export const AD_CTA_PATTERN = /quiero crear mi (sitio|tienda)|tienda online profesional|sitio web \+ tienda|quiero activar mi sitio/;
export const AD_ANY_PATTERN = new RegExp(`${AD_META_PATTERN.source}|${AD_CTA_PATTERN.source}`);

/** El cliente pide cómo pagar (doc 04 §6). */
export const ASKS_PAYMENT_PATTERN = /pasame el alias|pasame el cbu|\bcbu\b|\bcvu\b|\balias\b|como pago|donde pago|link de pago|como te pago|como abono|donde abono|numero de cuenta/;

// ── Entradas internas ─────────────────────────────────────────────────────

/** Entrada del expediente con lo que las reglas necesitan además del contrato. */
export type RuleEntry = DossierEntry & {
  fromMe: boolean;
  isAudio: boolean;
  audioTranscribed: boolean;
  errorMessage: string | null;
  epoch: number;
};

/** Lo que dice `resolverCliente` (lib/customers/es-cliente.ts): la única definición de cliente del producto. */
export type ClienteFacts = { fuente: FuenteCliente | null; customerId: number | null; evidenciaDebil: EvidenciaDebil[] };

export type RuleDbFacts = {
  chatName: string | null;
  cliente: ClienteFacts;
  /** Venta `paid` del contacto: sólo para R5 (un pago pendiente ya cobrado no es pendiente). */
  salePaid: boolean;
  salePending: boolean;
  dealNegotiationOverdue: boolean;
  activeAutomationName: string | null;
  humanOverride: boolean;
  customData: Record<string, unknown>;
  tags: string[];
};

export type Who = DossierEntry['who'];

/** Matriz fromMe / isAi / isAutomation / isInternal → quién habló. */
export function classifyWho(m: { fromMe: boolean; isAi: boolean | null; isAutomation: boolean | null; isInternal: boolean | null }): Who {
  if (m.isInternal) return 'nota';
  if (!m.fromMe) return 'cliente';
  if (m.isAutomation) return 'bot';
  if (m.isAi) return 'ia';
  return 'humano';
}

const isOurs = (e: RuleEntry) => e.who === 'humano' || e.who === 'bot' || e.who === 'ia';
const isCustomerEffective = (e: RuleEntry) => e.who === 'cliente' && !e.flags.includes('auto');

export function daysBetween(fromEpoch: number, toEpoch: number): number {
  return Math.max(0, Math.floor((toEpoch - fromEpoch) / 86_400_000));
}

// ── R7: auto-reply del cliente (doc 04 §3) ────────────────────────────────

/**
 * Marca `auto` en los mensajes del cliente que cumplen dos de los cuatro
 * criterios. Muta `flags` de las entradas y devuelve cuántas marcó.
 */
export function markAutoReplies(entries: RuleEntry[], repeatedTexts: Set<string>): number {
  let marked = 0;
  // Criterio 4: mismo texto exacto en el chat como respuesta a mensajes nuestros distintos.
  const repliesByText = new Map<string, Set<string>>();
  let lastOursId: string | null = null;
  for (const e of entries) {
    if (isOurs(e)) {
      lastOursId = e.id;
      continue;
    }
    if (e.who !== 'cliente' || !lastOursId) continue;
    const canon = canonicalText(e.text);
    if (canon.length < 12) continue;
    const set = repliesByText.get(canon) ?? new Set<string>();
    set.add(lastOursId);
    repliesByText.set(canon, set);
  }

  let prevOurs: RuleEntry | null = null;
  for (const e of entries) {
    if (isOurs(e)) {
      prevOurs = e;
      continue;
    }
    if (e.who !== 'cliente') continue;
    const canon = canonicalText(e.text);
    const normalized = normalizeText(e.text);
    let score = 0;
    if (prevOurs && e.epoch - prevOurs.epoch >= 0 && e.epoch - prevOurs.epoch < 5_000) score += 1;
    if (canon.length >= 20 && repeatedTexts.has(canon) && !AD_ANY_PATTERN.test(normalized)) score += 1;
    if (BOT_PATTERN.test(normalized)) score += 1;
    if ((repliesByText.get(canon)?.size ?? 0) >= 2) score += 1;
    if (score >= 2 && !e.flags.includes('auto')) {
      e.flags.push('auto');
      marked += 1;
    }
  }
  return marked;
}

// ── Cliente existente (doc 04 §4) ─────────────────────────────────────────

const EVIDENCIA_FUERTE: Record<FuenteCliente, CustomerEvidence> = {
  vinculo: 'customer_link',
  suscripcion_activa: 'subscription',
  venta_pagada: 'sale_paid',
  telefono: 'phone_match',
};
const EVIDENCIA_DEBIL: Record<EvidenciaDebil, CustomerEvidence> = {
  custom_data: 'custom_data',
  tag_producto: 'tag_product',
  etapa: 'funnel_stage',
};

/**
 * R1 sale de `resolverCliente`, no de acá: antes esta función tenía su propia
 * idea de cliente (vínculo, venta, suscripción por contact_id, custom_data,
 * etiqueta) y contradecía a la UI y a la ruta `by-contact`. Ahora sólo mapea
 * la fuente canónica a la evidencia que guarda el análisis. La evidencia débil
 * (custom_data, etiqueta, etapa) nunca es fuerte: es una hipótesis del CRM que
 * la IA puede confirmar por el chat, no un hecho.
 */
export function customerEvidenceFor(dbFacts: RuleDbFacts): { evidence: CustomerEvidence; strong: boolean } {
  const { fuente, evidenciaDebil } = dbFacts.cliente;
  if (fuente) return { evidence: EVIDENCIA_FUERTE[fuente], strong: true };
  const debil = evidenciaDebil[0];
  if (debil) return { evidence: EVIDENCIA_DEBIL[debil], strong: false };
  return { evidence: 'none', strong: false };
}

// ── Origen (doc 04 §5) ────────────────────────────────────────────────────

export function inferSource(entries: RuleEntry[], dbFacts: RuleDbFacts): { source: Source; detail: string | null } {
  const first = entries.find((e) => e.who !== 'nota');
  const firstCustomer = entries.find((e) => e.who === 'cliente');
  const firstText = normalizeText(firstCustomer?.text ?? '');
  if (firstCustomer && first && firstCustomer.id === first.id) {
    if (AD_META_PATTERN.test(firstText)) return { source: 'ads_meta', detail: (firstCustomer.text ?? '').slice(0, 120) };
    if (AD_CTA_PATTERN.test(firstText)) return { source: 'ads_cta_sitio', detail: (firstCustomer.text ?? '').slice(0, 120) };
  }
  const origen = typeof dbFacts.customData.origen_lead === 'string' ? dbFacts.customData.origen_lead : '';
  if (normalizeText(origen).startsWith('importaci')) return { source: 'importacion', detail: origen.slice(0, 120) };
  if (normalizeText(origen).includes('presencial') || dbFacts.tags.some((t) => normalizeText(t).includes('visita presencial'))) {
    return { source: 'presencial', detail: origen.slice(0, 120) || 'Etiqueta Origen · Visita presencial' };
  }
  if (!first) return { source: 'desconocido', detail: null };
  if (first.who === 'cliente') return { source: 'organico', detail: null };
  return { source: 'desconocido', detail: 'El chat lo abrimos nosotros' };
}

// ── Reglas R1-R11 ─────────────────────────────────────────────────────────

export type RuleInput = {
  entries: RuleEntry[];
  dbFacts: RuleDbFacts;
  now?: Date;
};

export function computeRuleFacts(input: RuleInput): RuleFacts {
  const { entries, dbFacts } = input;
  const nowEpoch = (input.now ?? new Date()).getTime();
  const visible = entries.filter((e) => e.who !== 'nota');
  const customerAll = visible.filter((e) => e.who === 'cliente');
  const customerEff = visible.filter(isCustomerEffective);
  const ours = visible.filter(isOurs);
  const humans = ours.filter((e) => e.who === 'humano');

  const lastCustomer = customerEff.at(-1) ?? null;
  const lastOurs = ours.at(-1) ?? null;
  const lastHuman = humans.at(-1) ?? null;
  const first = visible[0] ?? null;

  // R1
  const customer = customerEvidenceFor(dbFacts);

  // R8 impactos: nuestros mensajes después del último del cliente (efectivo).
  const afterCustomer = lastCustomer ? ours.filter((e) => e.epoch > lastCustomer.epoch) : ours;
  const followupsAutomated = afterCustomer.filter((e) => e.who === 'bot' || e.who === 'ia').length;
  const followupsManual = afterCustomer.filter((e) => e.who === 'humano').length;
  const lastFollowup = afterCustomer.at(-1) ?? null;

  // R9 silencio
  const daysSilent = lastCustomer ? daysBetween(lastCustomer.epoch, nowEpoch) : null;
  let whoSpokeLast: RuleFacts['who_spoke_last'] = 'nadie';
  if (lastCustomer && (!lastOurs || lastCustomer.epoch >= lastOurs.epoch)) whoSpokeLast = 'cliente';
  else if (lastOurs) whoSpokeLast = 'nosotros';

  // R3 nunca contestados
  const neverAnswered = ours.length === 0 && customerAll.length >= 1;

  // R2 entrada muerta
  let deadEntry = false;
  if (!neverAnswered && customerEff.length <= 1 && customerEff.length === customerAll.length) {
    const only = customerEff[0] ?? null;
    if (only) {
      const isAd = AD_ANY_PATTERN.test(normalizeText(only.text));
      const span = (visible.at(-1)?.epoch ?? only.epoch) - (first?.epoch ?? only.epoch);
      const repliedAfter = ours.some((e) => e.epoch >= only.epoch);
      const customerAfter = customerAll.some((e) => e.epoch > only.epoch);
      deadEntry = (isAd || span < 10 * 60_000) && repliedAfter && !customerAfter;
    }
  }

  // R4 GX explícito
  const lastTwoCustomer = customerEff.slice(-2);
  const rejected = lastTwoCustomer.length > 0 && lastTwoCustomer.some((e) => e.flags.includes('rechazo'));
  const noContact = normalizeText(dbFacts.chatName).includes('no contactar');
  const invalidNumber = ours.slice(-3).some((e) => !!e.errorMessage && /not.?found|invalid|no existe|not on whatsapp|exists.*false/i.test(e.errorMessage));

  // R5 pago pendiente (doc 04 §6)
  let paymentPending = false;
  const customerAsksPayment = customerEff.some((e) => ASKS_PAYMENT_PATTERN.test(normalizeText(e.text)));
  if (customerAsksPayment) paymentPending = true;
  if (!paymentPending) {
    let sawTrigger = false;
    for (const e of visible) {
      if (e.who === 'cliente' && !e.flags.includes('auto') && (e.flags.includes('compromiso') || e.flags.includes('precio'))) sawTrigger = true;
      if (sawTrigger && isOurs(e) && e.flags.includes('pago')) {
        paymentPending = true;
        break;
      }
    }
    if (paymentPending && dbFacts.salePaid) paymentPending = false;
  }
  if (dbFacts.salePending || dbFacts.dealNegotiationOverdue) paymentPending = true;

  // R10 hueco de evidencia
  const pendingAudios = visible.filter((e) => e.isAudio && !e.audioTranscribed);
  const lastTen = new Set(visible.slice(-10).map((e) => e.id));
  const evidenceGap = pendingAudios.some((e) => lastTen.has(e.id));

  // Gate forzado: primera regla que decide.
  let forcedGate: Gate | null = null;
  let forcedReason: string | null = null;
  if (customer.strong) {
    forcedGate = 'G11';
    forcedReason = `R1 cliente existente (${customer.evidence})`;
  } else if (neverAnswered) {
    forcedGate = 'G0';
    forcedReason = 'R3 nunca se le contestó';
  } else if (deadEntry) {
    forcedGate = 'G0';
    forcedReason = 'R2 entrada muerta: un solo mensaje del cliente y silencio';
  } else if (rejected || noContact || invalidNumber) {
    forcedGate = 'GX';
    forcedReason = rejected ? 'R4 rechazo explícito' : noContact ? 'R4 marcado "no contactar"' : 'R4 número inválido';
  }

  const minGate: Gate | null = paymentPending && !forcedGate ? 'G9' : null;
  const { source, detail } = inferSource(entries, dbFacts);

  return {
    is_existing_customer: customer.strong,
    customer_evidence: customer.evidence,
    forced_gate: forcedGate,
    forced_reason: forcedReason,
    min_gate: minGate,
    payment_pending: paymentPending,
    automation_active: dbFacts.activeAutomationName != null,
    automation_name: dbFacts.activeAutomationName,
    auto_reply_detected: customerAll.some((e) => e.flags.includes('auto')),
    evidence_gap: evidenceGap,
    pending_audio_message_ids: pendingAudios.map((e) => e.id),
    never_answered_by_us: neverAnswered,
    days_silent: daysSilent,
    who_spoke_last: whoSpokeLast,
    followups_total: followupsAutomated + followupsManual,
    followups_automated: followupsAutomated,
    followups_manual: followupsManual,
    last_followup_at: lastFollowup?.at ?? null,
    source,
    source_detail: detail,
    first_contact_at: first?.at ?? null,
    last_customer_message_at: lastCustomer?.at ?? null,
    last_team_message_at: lastOurs?.at ?? null,
    last_human_message_at: lastHuman?.at ?? null,
    human_override: dbFacts.humanOverride,
  };
}
