/**
 * Radar de respuestas del Command Center Comercial (doc 04 §3 y §10, doc 05 §6).
 *
 * Una señal por mensaje entrante. Las reglas van ANTES de la IA: lo que se
 * reconoce con un patrón (pago, rechazo, auto-reply, precio, llamada) no se le
 * pregunta a nadie; la IA queda para lo ambiguo y, si no hay proveedor, se
 * degrada a `interesado` con confianza baja en vez de romper.
 *
 * Toda la lógica tiene firma `(teamId, …)`: las rutas HTTP, el cron y las tools
 * MCP son envoltorios finos. Escribe SÓLO en team_commercial_* y activity_logs.
 */
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  chats,
  contacts,
  messageAudioInsights,
  messages,
  teamCommercialActions,
  teamCommercialAnalysis,
  teamCommercialExperimentMembers,
  teamCommercialSignals,
} from '@/lib/db/schema';
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import { maskJid } from '@/lib/desktop/command-center/types';
import { condicionesDeChatIgnorado } from '@/lib/chats/internos';
import { getSalesOpsSettings, patchSalesOpsSettings } from './settings';
import { generateStructuredObjectForTeam } from '@/lib/plugins/ai-chat/server/structured-output';
import { signalClassificationSchema, type SignalClassification } from '../shared/contract';
import {
  GATES,
  SIGNAL_KINDS,
  URGENT_SIGNALS,
  gateRank,
  type Gate,
  type SignalKind,
  type SignalStatus,
} from '../shared/taxonomy';
import type { SignalRow, SignalsPayload } from '../shared/api-types';

// ── Tipos ───────────────────────────────────────────────────────────────────

export type RadarEngine = 'rules' | 'server';

export type ClassifyOptions = {
  /** `rules`: nunca llama a la IA (lo ambiguo cae en `interesado` 40). Default `server`. */
  engine?: RadarEngine;
  /** Clasificación traída por un conector (Claude/ChatGPT/Grok): manda sobre la IA del servidor, no sobre las reglas. */
  classification?: SignalClassification;
  /** Quién trajo la clasificación (`claude` · `chatgpt` · `grok`). Va a la auditoría. */
  connector?: string;
  /** Sin escribir: devuelve lo que se insertaría. */
  dryRun?: boolean;
};

export type ClassifyResult =
  | { ok: true; created: boolean; signal: SignalRow; decidedBy: 'rules' | 'ai' | 'connector' | 'fallback' | 'existing'; reason: string }
  | { ok: false; reason: string };

export type ScanOptions = { since?: Date; limit?: number; engine?: RadarEngine };

export type ScanReport = {
  since: string;
  scanned: number;
  created: number;
  skipped: number;
  byKind: Record<SignalKind, number>;
  signalIds: number[];
  lastCutAt: string | null;
  errors: number;
};

type MessageCtx = {
  id: string;
  chatId: number;
  fromMe: boolean;
  text: string | null;
  mediaCaption: string | null;
  messageType: string | null;
  isAutomation: boolean | null;
  isAi: boolean | null;
  timestamp: Date;
};

// ── Patrones (doc 04 §3 y §10; texto ya normalizado: minúsculas y sin acentos) ──

const BOT_PATTERNS = [
  /asistente virtual/,
  /horario de atencion/,
  /fuera de horario/,
  /gracias por comunicarte/,
  /en breve/,
  /\bmenu\b/,
  /opcion [0-9]/,
];
const PAGO_RE = /\b(alias|cbu|cvu|transferencia|comprobante|sena|anticipo|como pago|link de pago)\b/;
const RECHAZO_RE = /(\bno me interesa|\bno gracias|\bno molest|equivocado|\bbloque|\bbaja\b|\bdeja de)/;
const PRECIO_RE = /(\bprecio|cuanto|\bvale\b|\bcosto)/;
const LLAMADA_RE = /(llamar|llamada|llamame|hablamos por telefono|me llamas)/;
const COMPROMISO_RE = /(lo hago|avanzo|arranquemos|quiero hacerlo|me interesa|\bdale\b)/;
/** Un "no me interesa" que contiene "me interesa": el rechazo se evalúa antes. */

const AUTO_REPLY_LATENCY_MS = 5_000;
const TRIGGER_WINDOW_MS = 72 * 60 * 60 * 1000;
const REPEATED_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SCAN_DAYS = 3;
/** Margen para no perder mensajes que llegaron entre el último mensaje señalado y la creación de su señal. */
const CUT_MARGIN_MS = 60 * 60 * 1000;

/** Misma normalización en JS y en SQL (`normalizedTextSql`): minúsculas, sin acentos, sin dígitos ni símbolos. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalizedTextSql = (col: SQL | typeof messages.text) =>
  sql`btrim(regexp_replace(regexp_replace(translate(lower(${col}), 'áàäéèëíìïóòöúùüñ', 'aaaeeeiiiooouuun'), '[^a-z ]', ' ', 'g'), '\\s+', ' ', 'g'))`;

// ── Diccionario de textos repetidos (auto-reply criterio 2), cacheado por proceso ──

const repeatedCache = new Map<number, { at: number; texts: Set<string> }>();

async function repeatedTextsForTeam(teamId: number): Promise<Set<string>> {
  const hit = repeatedCache.get(teamId);
  if (hit && Date.now() - hit.at < REPEATED_CACHE_TTL_MS) return hit.texts;
  const texts = new Set<string>();
  try {
    const rows = await db.execute(sql`
      select ${normalizedTextSql(messages.text)} as t
        from ${messages}
        join ${chats} on ${chats.id} = ${messages.chatId}
       where ${chats.teamId} = ${teamId}
         and ${messages.fromMe} = false
         and ${messages.text} is not null
         and length(${messages.text}) >= 25
         and ${messages.timestamp} > now() - interval '365 days'
       group by 1
      having count(distinct ${messages.chatId}) >= 3
       limit 2000
    `);
    for (const row of rows as unknown as Array<{ t: string }>) if (row.t) texts.add(row.t);
  } catch (error) {
    console.error('[sales-ops/radar] diccionario de repetidos falló', error);
  }
  repeatedCache.set(teamId, { at: Date.now(), texts });
  return texts;
}

/** Sólo para pruebas: olvida el diccionario cacheado. */
export function resetRadarCaches() {
  repeatedCache.clear();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isGate(value: string | null | undefined): value is Gate {
  return !!value && (GATES as readonly string[]).includes(value);
}

function maxGate(a: Gate | null, b: Gate): Gate {
  if (!a || a === 'GX') return b;
  return gateRank(a) >= gateRank(b) ? a : b;
}

function textOf(message: MessageCtx): string {
  return (message.text ?? message.mediaCaption ?? '').trim();
}

function excerptOf(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function emptyCounts(): Record<SignalKind, number> {
  return Object.fromEntries(SIGNAL_KINDS.map((k) => [k, 0])) as Record<SignalKind, number>;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata });
  } catch (error) {
    console.error('[sales-ops/radar] audit failed', error);
  }
}

/**
 * Condiciones de chat que nunca son un cliente: grupos, difusiones, nuestros
 * propios números y los internos del equipo.
 *
 * Los internos salen de `lib/chats/internos.ts`, la misma lista que usa la cola
 * de audios. Antes esta función era una copia que no miraba esa config, y por
 * eso el chat interno AAPP.SPACE terminó clasificado en G9 —lista Dinero— y
 * Martin Dev encabezando el radar de respuestas.
 */
function excludedChatConditions(): SQL[] {
  return [
    sql`${chats.remoteJid} not like '%@g.us'`,
    sql`${chats.remoteJid} not like '%@broadcast'`,
    sql`${chats.remoteJid} not like '%@newsletter'`,
    sql`regexp_replace(split_part(${chats.remoteJid}, '@', 1), '[^0-9]', '', 'g') not in (
      select regexp_replace(instance_number, '[^0-9]', '', 'g')
        from evolution_instances
       where instance_number is not null and instance_number <> ''
    )`,
    ...condicionesDeChatIgnorado(),
    // Excluidos de Respuestas desde la bandeja (settings del plugin): el radar
    // no les crea señales aunque escriban.
    sql`not exists (
      select 1 from team_plugins tp
       where tp.team_id = ${chats.teamId} and tp.plugin_id = 'sales-ops'
         and coalesce(tp.settings -> 'radarMutedChatIds', '[]'::jsonb) @> to_jsonb(${chats.id})
    )`,
  ];
}

// ── Clasificación por reglas ───────────────────────────────────────────────

type RuleDecision = { classification: SignalClassification; reason: string } | null;

function detectAutoReply(text: string, normalized: string, message: MessageCtx, timeline: MessageCtx[], repeated: Set<string>): boolean {
  let score = 0;
  // 1. Latencia < 5 s después de un mensaje nuestro.
  const previousOurs = [...timeline].reverse().find((m) => m.fromMe && m.timestamp.getTime() <= message.timestamp.getTime());
  if (previousOurs && message.timestamp.getTime() - previousOurs.timestamp.getTime() < AUTO_REPLY_LATENCY_MS) score += 1;
  // 2. Texto idéntico en ≥ 3 chats del equipo.
  if (normalized.length >= 20 && repeated.has(normalized)) score += 1;
  // 3. Patrones de bot (dos patrones distintos alcanzan solos).
  const patterns = BOT_PATTERNS.filter((re) => re.test(normalized)).length;
  score += Math.min(patterns, 2);
  // 4. Repetido exactamente en el mismo chat ≥ 2 veces como respuesta a mensajes nuestros.
  if (text.length >= 20) {
    const sameInChat = timeline.filter((m) => !m.fromMe && m.id !== message.id && textOf(m) === text).length;
    if (sameInChat >= 1 && timeline.some((m) => m.fromMe)) score += 1;
  }
  return score >= 2;
}

function classifyByRules(text: string, message: MessageCtx, timeline: MessageCtx[], repeated: Set<string>, gateBefore: Gate | null): RuleDecision {
  const normalized = normalizeText(text);
  const excerpt = excerptOf(text);

  if (text && detectAutoReply(text, normalized, message, timeline, repeated)) {
    return { classification: { kind: 'respuesta_automatica', confidence: 85, gate_after_suggested: gateBefore, urgent: false, excerpt }, reason: 'auto_reply' };
  }
  if (PAGO_RE.test(normalized)) {
    return { classification: { kind: 'pago', confidence: 90, gate_after_suggested: maxGate(gateBefore, 'G9'), urgent: true, excerpt }, reason: 'pago_pattern' };
  }
  if (RECHAZO_RE.test(normalized)) {
    return { classification: { kind: 'rechazo', confidence: 85, gate_after_suggested: 'GX', urgent: false, excerpt }, reason: 'rechazo_pattern' };
  }
  if (PRECIO_RE.test(normalized)) {
    return { classification: { kind: 'precio', confidence: 80, gate_after_suggested: maxGate(gateBefore, 'G3'), urgent: false, excerpt }, reason: 'precio_pattern' };
  }
  if (LLAMADA_RE.test(normalized)) {
    return { classification: { kind: 'quiere_llamada', confidence: 80, gate_after_suggested: maxGate(gateBefore, 'G5'), urgent: true, excerpt }, reason: 'llamada_pattern' };
  }
  if (COMPROMISO_RE.test(normalized)) {
    const strong = !!gateBefore && gateBefore !== 'GX' && gateRank(gateBefore) >= gateRank('G4');
    return strong
      ? { classification: { kind: 'intencion_compra', confidence: 75, gate_after_suggested: maxGate(gateBefore, 'G7'), urgent: true, excerpt }, reason: 'compromiso_pattern_g4plus' }
      : { classification: { kind: 'interesado', confidence: 70, gate_after_suggested: maxGate(gateBefore, 'G2'), urgent: false, excerpt }, reason: 'compromiso_pattern' };
  }
  return null;
}

/** Mensajes sin texto: audio, imagen, sticker… La decisión no necesita IA. */
function classifyMedia(message: MessageCtx, timeline: MessageCtx[], gateBefore: Gate | null): RuleDecision {
  const type = message.messageType ?? '';
  if (type === 'audioMessage') {
    return { classification: { kind: 'pide_informacion', confidence: 30, gate_after_suggested: gateBefore, urgent: false, excerpt: '[audio]' }, reason: 'audio_sin_transcripcion' };
  }
  if (type === 'stickerMessage' || type === 'reactionMessage' || type === 'protocolMessage') {
    return { classification: { kind: 'irrelevante', confidence: 70, gate_after_suggested: gateBefore, urgent: false, excerpt: `[${type.replace('Message', '')}]` }, reason: 'media_irrelevante' };
  }
  if (type === 'imageMessage' || type === 'documentMessage' || type === 'albumMessage') {
    // Una imagen después de nuestros datos de pago casi siempre es el comprobante.
    const lastOurs = [...timeline].reverse().find((m) => m.fromMe);
    const oursSaysPago = !!lastOurs && PAGO_RE.test(normalizeText(textOf(lastOurs)))
      && message.timestamp.getTime() - lastOurs.timestamp.getTime() < 48 * 60 * 60 * 1000;
    const label = type === 'imageMessage' ? '[imagen]' : type === 'albumMessage' ? '[album]' : '[documento]';
    if (oursSaysPago) {
      return { classification: { kind: 'pago', confidence: 55, gate_after_suggested: maxGate(gateBefore, 'G9'), urgent: true, excerpt: `${label} tras datos de pago` }, reason: 'media_tras_pago' };
    }
    return { classification: { kind: 'interesado', confidence: 30, gate_after_suggested: gateBefore, urgent: false, excerpt: label }, reason: 'media_sin_texto' };
  }
  const label = type ? `[${type.replace('Message', '')}]` : '[sin texto]';
  return { classification: { kind: 'irrelevante', confidence: 50, gate_after_suggested: gateBefore, urgent: false, excerpt: label }, reason: 'sin_texto' };
}

// ── IA para lo ambiguo (prompt corto, doc 04 §10) ───────────────────────────

async function classifyByAi(teamId: number, text: string, timeline: MessageCtx[], gateBefore: Gate | null): Promise<SignalClassification | null> {
  const context = timeline
    .filter((m) => m.id)
    .map((m) => `${m.fromMe ? 'NOSOTROS' : 'CLIENTE'}: ${excerptOf(textOf(m) || `[${m.messageType ?? 'media'}]`).slice(0, 200)}`)
    .join('\n');
  try {
    const result = await generateStructuredObjectForTeam({
      teamId,
      schema: signalClassificationSchema,
      temperature: 0.1,
      systemPrompt:
        'Sos el radar de respuestas de un equipo comercial que vende sitios web y tiendas online por WhatsApp. ' +
        'Clasificás UN mensaje nuevo del cliente en una sola categoría: ' +
        'interesado (muestra interés general), pide_informacion (pregunta cómo funciona, qué incluye), ' +
        'precio (pregunta o discute el precio), objecion (pone una traba: caro, después, lo consulto, no confío), ' +
        'quiere_llamada (pide hablar por teléfono o reunión), intencion_compra (quiere avanzar ya), ' +
        'pago (pide datos de pago, avisa que pagó o manda comprobante), rechazo (no le interesa, que no lo molesten), ' +
        'respuesta_automatica (mensaje de bot o autorespuesta), irrelevante (saludo suelto, emoji, tema ajeno). ' +
        'Los gates van G0 (entrada muerta) a G11 (ganado); GX perdido. gate_after_suggested es a qué gate sugerís pasar, o null si no cambia. ' +
        'urgent=true sólo para pago, intencion_compra o quiere_llamada. confidence 0-100. excerpt: el fragmento literal (≤ 200 caracteres) que justifica la categoría.',
      userPrompt: `Gate actual: ${gateBefore ?? 'sin analizar'}\n\nÚltimos mensajes:\n${context || '(sin contexto)'}\n\nMENSAJE NUEVO DEL CLIENTE:\n${excerptOf(text)}\n\nDevolvé {"kind","confidence","gate_after_suggested","urgent","excerpt"}.`,
    });
    return result.data;
  } catch (error) {
    console.warn('[sales-ops/radar] IA no disponible, se degrada a reglas:', error instanceof Error ? error.message : error);
    return null;
  }
}

// ── Carga del contexto ──────────────────────────────────────────────────────

async function loadMessage(teamId: number, messageId: string) {
  const [row] = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      fromMe: messages.fromMe,
      text: messages.text,
      mediaCaption: messages.mediaCaption,
      messageType: messages.messageType,
      isAutomation: messages.isAutomation,
      isAi: messages.isAi,
      isInternal: messages.isInternal,
      timestamp: messages.timestamp,
      remoteJid: chats.remoteJid,
      chatName: chats.name,
      pushName: chats.pushName,
      contactId: contacts.id,
      contactName: contacts.name,
    })
    .from(messages)
    .innerJoin(chats, eq(chats.id, messages.chatId))
    .leftJoin(contacts, and(eq(contacts.chatId, chats.id), eq(contacts.teamId, teamId)))
    .where(and(eq(messages.id, messageId), eq(chats.teamId, teamId)))
    .limit(1);
  return row ?? null;
}

async function loadTimeline(chatId: number, before: Date, excludeId: string): Promise<MessageCtx[]> {
  const rows = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      fromMe: messages.fromMe,
      text: messages.text,
      mediaCaption: messages.mediaCaption,
      messageType: messages.messageType,
      isAutomation: messages.isAutomation,
      isAi: messages.isAi,
      timestamp: messages.timestamp,
    })
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.isInternal, false), lte(messages.timestamp, before), ne(messages.id, excludeId)))
    .orderBy(desc(messages.timestamp))
    .limit(6);
  return rows.reverse();
}

async function loadTranscript(messageId: string): Promise<string | null> {
  const [row] = await db
    .select({ status: messageAudioInsights.status, transcript: messageAudioInsights.transcript })
    .from(messageAudioInsights)
    .where(eq(messageAudioInsights.messageId, messageId))
    .limit(1);
  return row && row.status === 'done' && row.transcript.trim() ? row.transcript.trim() : null;
}

async function loadTriggerAction(teamId: number, chatId: number, at: Date): Promise<number | null> {
  const rows = await db
    .select({ id: teamCommercialActions.id, executedAt: teamCommercialActions.executedAt })
    .from(teamCommercialActions)
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.chatId, chatId), inArray(teamCommercialActions.status, ['executed', 'resulted'])))
    .orderBy(desc(teamCommercialActions.executedAt))
    .limit(5);
  // El filtro por ventana se hace en JS (regla 7 del brief).
  const hit = rows.find((r) => r.executedAt && at.getTime() - r.executedAt.getTime() <= TRIGGER_WINDOW_MS && at.getTime() >= r.executedAt.getTime());
  return hit?.id ?? null;
}

function rowFromRecord(record: typeof teamCommercialSignals.$inferSelect, name: string): SignalRow {
  return {
    id: record.id,
    chatId: record.chatId,
    contactId: record.contactId,
    name,
    messageId: record.messageId,
    kind: record.kind as SignalKind,
    confidence: record.confidence,
    excerpt: record.excerpt,
    triggeredByActionId: record.triggeredByActionId,
    gateBefore: isGate(record.gateBefore) ? record.gateBefore : null,
    gateAfter: isGate(record.gateAfter) ? record.gateAfter : null,
    status: record.status as SignalStatus,
    handledBy: record.handledBy,
    handledAt: toIso(record.handledAt),
    createdAt: toIso(record.createdAt) ?? new Date().toISOString(),
  };
}

// ── Efectos colaterales (UPDATE directos, sin importar queue.ts) ────────────

async function applySideEffects(teamId: number, chatId: number, kind: SignalKind, signalId: number, name: string) {
  const countsAsReply = kind !== 'respuesta_automatica' && kind !== 'irrelevante';
  const now = new Date();
  try {
    await db
      .update(teamCommercialAnalysis)
      .set({ stale: true, updatedAt: now })
      .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)));
  } catch (error) {
    console.error('[sales-ops/radar] stale=true falló', error);
  }
  if (!countsAsReply) return;
  try {
    await db
      .update(teamCommercialActions)
      .set({ status: 'expired', result: { reason: 'customer_replied', signalId }, updatedAt: now })
      .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.chatId, chatId), inArray(teamCommercialActions.status, ['proposed', 'pending_approval'])));
  } catch (error) {
    console.error('[sales-ops/radar] expirar acciones falló', error);
  }
  try {
    await db
      .update(teamCommercialExperimentMembers)
      .set({ respondedAt: now })
      .where(and(
        eq(teamCommercialExperimentMembers.teamId, teamId),
        eq(teamCommercialExperimentMembers.chatId, chatId),
        sql`${teamCommercialExperimentMembers.sentAt} is not null`,
        isNull(teamCommercialExperimentMembers.respondedAt),
      ));
  } catch (error) {
    console.error('[sales-ops/radar] responded_at falló', error);
  }
  if (URGENT_SIGNALS.includes(kind)) {
    try {
      const { pusherServer } = await import('@/lib/pusher-server');
      await pusherServer.trigger(`team-${teamId}`, 'sales-ops:signal', { chatId, kind, name, signalId });
    } catch (error) {
      console.warn('[sales-ops/radar] pusher no disponible', error instanceof Error ? error.message : error);
    }
  }
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Clasifica un mensaje entrante y guarda la señal. Idempotente por messageId:
 * la segunda llamada devuelve la señal existente sin tocar nada.
 */
export async function classifyIncomingMessage(teamId: number, messageId: string, opts: ClassifyOptions = {}): Promise<ClassifyResult> {
  const message = await loadMessage(teamId, messageId);
  if (!message) return { ok: false, reason: 'Mensaje inexistente o de otro equipo.' };
  if (message.fromMe) return { ok: false, reason: 'El mensaje es nuestro, no del cliente.' };
  if (message.isInternal) return { ok: false, reason: 'Nota interna, no es un mensaje del cliente.' };
  if (/@(g\.us|broadcast|newsletter)$/.test(message.remoteJid)) return { ok: false, reason: 'Grupo, difusión o canal: fuera del radar.' };

  const name = message.contactName || message.chatName || message.pushName || maskJid(message.remoteJid);

  const existing = await db.query.teamCommercialSignals.findFirst({
    where: and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.messageId, messageId)),
  });
  if (existing) return { ok: true, created: false, signal: rowFromRecord(existing, name), decidedBy: 'existing', reason: 'already_classified' };

  const [timeline, analysis, repeated] = await Promise.all([
    loadTimeline(message.chatId, message.timestamp, message.id),
    db.query.teamCommercialAnalysis.findFirst({
      where: and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, message.chatId)),
      columns: { currentGate: true },
    }),
    repeatedTextsForTeam(teamId),
  ]);
  const gateBefore: Gate | null = isGate(analysis?.currentGate) ? analysis.currentGate : null;

  const ctx: MessageCtx = { ...message, timestamp: message.timestamp };
  let text = textOf(ctx);
  if (!text && message.messageType === 'audioMessage') {
    const transcript = await loadTranscript(message.id);
    if (transcript) text = transcript;
  }

  let decidedBy: 'rules' | 'ai' | 'connector' | 'fallback' = 'rules';
  let reason = '';
  let classification: SignalClassification | null = null;

  if (text) {
    const rule = classifyByRules(text, ctx, timeline, repeated, gateBefore);
    if (rule) {
      classification = rule.classification;
      reason = rule.reason;
    }
  } else {
    const media = classifyMedia(ctx, timeline, gateBefore);
    if (media) {
      classification = media.classification;
      reason = media.reason;
    }
  }

  if (!classification && opts.classification) {
    const parsed = signalClassificationSchema.safeParse(opts.classification);
    if (!parsed.success) return { ok: false, reason: `Clasificación inválida: ${parsed.error.issues[0]?.message ?? 'error'}` };
    classification = { ...parsed.data, excerpt: parsed.data.excerpt || excerptOf(text) };
    decidedBy = 'connector';
    reason = `connector:${opts.connector ?? 'desconocido'}`;
  }

  if (!classification && (opts.engine ?? 'server') === 'server') {
    const ai = await classifyByAi(teamId, text, timeline, gateBefore);
    if (ai) {
      classification = { ...ai, excerpt: ai.excerpt || excerptOf(text) };
      decidedBy = 'ai';
      reason = 'ai';
    }
  }

  if (!classification) {
    classification = { kind: 'interesado', confidence: 40, gate_after_suggested: gateBefore, urgent: false, excerpt: excerptOf(text) };
    decidedBy = 'fallback';
    reason = opts.engine === 'rules' ? 'rules_only_fallback' : 'ai_unavailable_fallback';
  }

  const gateAfter = classification.gate_after_suggested ?? gateBefore;
  const urgent = classification.urgent || URGENT_SIGNALS.includes(classification.kind);
  const triggeredByActionId = await loadTriggerAction(teamId, message.chatId, message.timestamp);

  const values = {
    teamId,
    chatId: message.chatId,
    contactId: message.contactId ?? null,
    messageId: message.id,
    kind: classification.kind,
    confidence: Math.max(0, Math.min(100, Math.round(classification.confidence))),
    excerpt: excerptOf(classification.excerpt || text || ''),
    triggeredByActionId,
    gateBefore,
    gateAfter,
    status: 'new' as const,
  };

  if (opts.dryRun) {
    const preview = { id: 0, handledBy: null, handledAt: null, createdAt: new Date(), ...values } as typeof teamCommercialSignals.$inferSelect;
    return { ok: true, created: false, signal: rowFromRecord(preview, name), decidedBy, reason: `${reason} (dry_run)` };
  }

  const [inserted] = await db.insert(teamCommercialSignals).values(values).onConflictDoNothing().returning();
  if (!inserted) {
    // Carrera con otra corrida: la señal ya está.
    const raced = await db.query.teamCommercialSignals.findFirst({
      where: and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.messageId, messageId)),
    });
    if (!raced) return { ok: false, reason: 'No se pudo guardar la señal.' };
    return { ok: true, created: false, signal: rowFromRecord(raced, name), decidedBy: 'existing', reason: 'already_classified' };
  }

  await applySideEffects(teamId, message.chatId, classification.kind, inserted.id, name);
  await audit(teamId, null, 'SALES_OPS_SIGNAL', {
    signalId: inserted.id,
    chatId: message.chatId,
    messageId: message.id,
    kind: classification.kind,
    confidence: values.confidence,
    urgent,
    gateBefore,
    gateAfter,
    decidedBy,
    reason,
    connector: opts.connector ?? null,
    triggeredByActionId,
  });

  return { ok: true, created: true, signal: rowFromRecord(inserted, name), decidedBy, reason };
}

/** Último corte del radar: la señal más nueva del equipo. Sin tabla nueva. */
export async function lastSignalCut(teamId: number): Promise<Date | null> {
  const [row] = await db
    .select({ max: sql<string | null>`max(${teamCommercialSignals.createdAt})` })
    .from(teamCommercialSignals)
    .where(eq(teamCommercialSignals.teamId, teamId));
  if (!row?.max) return null;
  const d = new Date(row.max);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ScanCandidate = { messageId: string; chatId: number; name: string; messageType: string | null; excerpt: string; timestamp: string };

/** Mensajes entrantes sin señal desde el corte. Lo usa el barrido y el `dry_run` de la tool. */
export async function listScanCandidates(teamId: number, opts: ScanOptions = {}): Promise<{ since: Date; candidates: ScanCandidate[] }> {
  const limit = Math.max(1, Math.min(opts.limit ?? 200, 1000));
  let since = opts.since ?? null;
  if (!since) {
    const cut = await lastSignalCut(teamId);
    since = cut ? new Date(cut.getTime() - CUT_MARGIN_MS) : new Date(Date.now() - DEFAULT_SCAN_DAYS * 24 * 60 * 60 * 1000);
  }

  const rows = await db
    .select({
      messageId: messages.id,
      chatId: messages.chatId,
      messageType: messages.messageType,
      text: messages.text,
      mediaCaption: messages.mediaCaption,
      timestamp: messages.timestamp,
      remoteJid: chats.remoteJid,
      chatName: chats.name,
      pushName: chats.pushName,
    })
    .from(messages)
    .innerJoin(chats, eq(chats.id, messages.chatId))
    .leftJoin(teamCommercialSignals, and(eq(teamCommercialSignals.messageId, messages.id), eq(teamCommercialSignals.teamId, teamId)))
    .where(and(
      eq(chats.teamId, teamId),
      eq(messages.fromMe, false),
      sql`coalesce(${messages.isInternal}, false) = false`,
      gt(messages.timestamp, since),
      isNull(teamCommercialSignals.id),
      ...excludedChatConditions(),
    ))
    .orderBy(asc(messages.timestamp))
    .limit(limit);

  return {
    since,
    candidates: rows.map((r) => ({
      messageId: r.messageId,
      chatId: r.chatId,
      name: r.chatName || r.pushName || maskJid(r.remoteJid),
      messageType: r.messageType,
      excerpt: excerptOf((r.text ?? r.mediaCaption ?? '') || `[${(r.messageType ?? 'media').replace('Message', '')}]`).slice(0, 120),
      timestamp: r.timestamp.toISOString(),
    })),
  };
}

/** Barrido: clasifica los mensajes entrantes nuevos desde el último corte. */
export async function scanNewMessages(teamId: number, opts: ScanOptions = {}): Promise<ScanReport> {
  const { since, candidates } = await listScanCandidates(teamId, opts);
  const report: ScanReport = {
    since: since.toISOString(),
    scanned: candidates.length,
    created: 0,
    skipped: 0,
    byKind: emptyCounts(),
    signalIds: [],
    lastCutAt: null,
    errors: 0,
  };

  for (const candidate of candidates) {
    try {
      const result = await classifyIncomingMessage(teamId, candidate.messageId, { engine: opts.engine });
      if (!result.ok) {
        report.skipped += 1;
        continue;
      }
      if (result.created) {
        report.created += 1;
        report.signalIds.push(result.signal.id);
        report.byKind[result.signal.kind] += 1;
      } else {
        report.skipped += 1;
      }
    } catch (error) {
      report.errors += 1;
      console.error(`[sales-ops/radar] falló ${candidate.messageId}`, error);
    }
  }

  report.lastCutAt = toIso(await lastSignalCut(teamId));
  if (report.created > 0) {
    await audit(teamId, null, 'SALES_OPS_RADAR_SCAN', { since: report.since, scanned: report.scanned, created: report.created, byKind: report.byKind, engine: opts.engine ?? 'server' });
  }
  return report;
}

export type ListSignalsOptions = { status?: SignalStatus | 'all'; kind?: SignalKind; limit?: number; cursor?: string | null };

/** Lista de señales con nombre del contacto (nunca el teléfono completo) y conteos por tipo. */
export async function listSignals(teamId: number, opts: ListSignalsOptions = {}): Promise<SignalsPayload> {
  const status = opts.status ?? 'new';
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 500));
  const cursorId = opts.cursor ? Number(opts.cursor) : null;

  const where: SQL[] = [eq(teamCommercialSignals.teamId, teamId)];
  const muted = (await getSalesOpsSettings(teamId)).radarMutedChatIds;
  if (muted.length) where.push(notInArray(teamCommercialSignals.chatId, muted));
  if (status !== 'all') where.push(eq(teamCommercialSignals.status, status));
  if (opts.kind) where.push(eq(teamCommercialSignals.kind, opts.kind));
  if (cursorId && Number.isFinite(cursorId)) where.push(lt(teamCommercialSignals.id, cursorId));

  const [rows, countRows, cut] = await Promise.all([
    db
      .select({
        signal: teamCommercialSignals,
        remoteJid: chats.remoteJid,
        chatName: chats.name,
        pushName: chats.pushName,
        contactName: contacts.name,
      })
      .from(teamCommercialSignals)
      .innerJoin(chats, eq(chats.id, teamCommercialSignals.chatId))
      .leftJoin(contacts, and(eq(contacts.chatId, chats.id), eq(contacts.teamId, teamId)))
      .where(and(...where))
      .orderBy(desc(teamCommercialSignals.createdAt), desc(teamCommercialSignals.id))
      .limit(limit),
    db
      .select({ kind: teamCommercialSignals.kind, count: sql<number>`count(*)::int` })
      .from(teamCommercialSignals)
      .where(and(eq(teamCommercialSignals.teamId, teamId), ...(status === 'all' ? [] : [eq(teamCommercialSignals.status, status)])))
      .groupBy(teamCommercialSignals.kind),
    lastSignalCut(teamId),
  ]);

  const counts = emptyCounts();
  for (const row of countRows) if ((SIGNAL_KINDS as readonly string[]).includes(row.kind)) counts[row.kind as SignalKind] = Number(row.count);

  return {
    rows: rows.map((r) => rowFromRecord(r.signal, r.contactName || r.chatName || r.pushName || maskJid(r.remoteJid))),
    counts,
    lastCutAt: toIso(cut),
  };
}

/**
 * Atiende varias señales de un saque.
 *
 * La bandeja agrupa por contacto, y ahí una persona que escribió cinco veces
 * son cinco señales: marcarlas de a una es un request y una auditoría por cada
 * una para un solo trabajo real, y si el tercero falla el contacto queda medio
 * atendido y vuelve a aparecer al refrescar. Acá el UPDATE es uno solo: o
 * quedan todas o no queda ninguna.
 */
export async function markSignals(
  teamId: number,
  userId: number,
  signalIds: number[],
  status: 'seen' | 'handled' | 'dismissed',
): Promise<SignalRow[]> {
  const ids = [...new Set(signalIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 200);
  if (!ids.length) return [];

  const now = new Date();
  const updated = await db
    .update(teamCommercialSignals)
    .set(status === 'seen' ? { status } : { status, handledBy: userId, handledAt: now })
    .where(and(eq(teamCommercialSignals.teamId, teamId), inArray(teamCommercialSignals.id, ids)))
    .returning();
  if (!updated.length) return [];

  const chatIds = [...new Set(updated.map((row) => row.chatId))];

  if (status === 'handled') {
    // Mismo cierre de experimento que `markSignal`, pero por los chats tocados.
    try {
      await db
        .update(teamCommercialExperimentMembers)
        .set({ respondedAt: now })
        .where(and(
          eq(teamCommercialExperimentMembers.teamId, teamId),
          inArray(teamCommercialExperimentMembers.chatId, chatIds),
          sql`${teamCommercialExperimentMembers.sentAt} is not null`,
          isNull(teamCommercialExperimentMembers.respondedAt),
        ));
    } catch (error) {
      console.error('[sales-ops/radar] responded_at (bulk) falló', error);
    }
  }

  await audit(teamId, userId, 'SALES_OPS_SIGNAL_MARK', {
    signalIds: updated.map((row) => row.id),
    chatIds,
    status,
    bulk: true,
  });

  const chatRows = await db
    .select({ id: chats.id, remoteJid: chats.remoteJid, chatName: chats.name, pushName: chats.pushName, contactName: contacts.name })
    .from(chats)
    .leftJoin(contacts, and(eq(contacts.chatId, chats.id), eq(contacts.teamId, teamId)))
    .where(inArray(chats.id, chatIds));
  const nombres = new Map(
    chatRows.map((row) => [row.id, row.contactName || row.chatName || row.pushName || maskJid(row.remoteJid)] as const),
  );

  return updated.map((row) => rowFromRecord(row, nombres.get(row.chatId) ?? '—'));
}

/** Cambia el estado de una señal. `handled`/`dismissed` registran quién y cuándo. */
export async function markSignal(teamId: number, userId: number, signalId: number, status: 'seen' | 'handled' | 'dismissed'): Promise<SignalRow | null> {
  const now = new Date();
  const [updated] = await db
    .update(teamCommercialSignals)
    .set(status === 'seen' ? { status } : { status, handledBy: userId, handledAt: now })
    .where(and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.id, signalId)))
    .returning();
  if (!updated) return null;

  if (status === 'handled') {
    // Doc 05 §6: atender una señal que vino de un lote cierra el "respondió" del experimento.
    try {
      await db
        .update(teamCommercialExperimentMembers)
        .set({ respondedAt: now })
        .where(and(
          eq(teamCommercialExperimentMembers.teamId, teamId),
          eq(teamCommercialExperimentMembers.chatId, updated.chatId),
          sql`${teamCommercialExperimentMembers.sentAt} is not null`,
          isNull(teamCommercialExperimentMembers.respondedAt),
        ));
    } catch (error) {
      console.error('[sales-ops/radar] responded_at (handled) falló', error);
    }
  }

  await audit(teamId, userId, 'SALES_OPS_SIGNAL_MARK', { signalId, chatId: updated.chatId, status, kind: updated.kind });

  const [chat] = await db
    .select({ remoteJid: chats.remoteJid, chatName: chats.name, pushName: chats.pushName, contactName: contacts.name })
    .from(chats)
    .leftJoin(contacts, and(eq(contacts.chatId, chats.id), eq(contacts.teamId, teamId)))
    .where(eq(chats.id, updated.chatId))
    .limit(1);
  return rowFromRecord(updated, chat?.contactName || chat?.chatName || chat?.pushName || (chat ? maskJid(chat.remoteJid) : '—'));
}

/** Excluir (o volver a incluir) un chat de Respuestas. Al excluir se descartan sus señales abiertas. */
export async function setRadarMuted(teamId: number, userId: number, chatId: number, muted: boolean): Promise<{ radarMutedChatIds: number[]; dismissed: number }> {
  const actual = (await getSalesOpsSettings(teamId)).radarMutedChatIds;
  const next = muted ? Array.from(new Set([...actual, chatId])) : actual.filter((id) => id !== chatId);
  const settings = await patchSalesOpsSettings(teamId, userId, { radarMutedChatIds: next });
  let dismissed = 0;
  if (muted) {
    const rows = await db
      .update(teamCommercialSignals)
      .set({ status: 'dismissed', handledAt: new Date() })
      .where(and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.chatId, chatId), inArray(teamCommercialSignals.status, ['new', 'seen'])))
      .returning({ id: teamCommercialSignals.id });
    dismissed = rows.length;
  }
  return { radarMutedChatIds: settings.radarMutedChatIds, dismissed };
}

/** Los excluidos de Respuestas, con nombre, para poder revertir. */
export async function listRadarMuted(teamId: number): Promise<Array<{ chatId: number; name: string }>> {
  const ids = (await getSalesOpsSettings(teamId)).radarMutedChatIds;
  if (!ids.length) return [];
  const rows = await db
    .select({ chatId: chats.id, chatName: chats.name, pushName: chats.pushName, remoteJid: chats.remoteJid })
    .from(chats)
    .where(and(eq(chats.teamId, teamId), inArray(chats.id, ids)));
  return rows.map((r) => ({ chatId: r.chatId, name: r.chatName?.trim() || r.pushName?.trim() || `…${(r.remoteJid || '').replace(/\D/g, '').slice(-4)}` }));
}
