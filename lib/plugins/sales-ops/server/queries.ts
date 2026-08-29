/**
 * Lecturas del Command Center: lista de análisis y ficha de un chat.
 *
 * Sólo SELECT. Nada de fechas como parámetro en SQL: los buckets de antigüedad
 * van como `now() - interval` literal y `daysSilent` se calcula en JS.
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lt, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  messageAudioInsights,
  messages,
  teamCommercialActions,
  teamCommercialAnalysis,
  teamCommercialAnalysisVersions,
  teamCommercialSignals,
} from '@/lib/db/schema';
import { maskJid } from '@/lib/desktop/command-center/types';
import type {
  ActionRow,
  AnalysisDetail,
  AnalysisRow,
  AnalysisVersionRow,
  DetailPayload,
  ListPayload,
  ListQuery,
  SignalRow,
  TimelineGap,
  TimelineHit,
} from '../shared/api-types';
import type { DossierEntry } from '../shared/contract';
import {
  FRONT_OPPORTUNITY_GATES,
  FRONT_SWEEP_GATES,
  SEND_COOLDOWN_HOURS,
  type Gate,
} from '../shared/taxonomy';

export const MONEY_GATES: Gate[] = ['G8', 'G9', 'G10'];
export const DISCARD_STATUSES = ['pre_descarte', 'descarte_definitivo'] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DAY_MS = 86_400_000;
const SILENCE_GAP_DAYS = 7;
/** Tope de mensajes que se leen para el timeline (los chats internos superan 10k). */
const TIMELINE_MESSAGE_CAP = 4000;
/** Si hay más hitos que esto, se comprimen: primeros, marcados, evidencia y últimos. */
const TIMELINE_HIT_CAP = 300;

// ── Diccionarios de flags (doc 04 §1) ────────────────────────────────────────

export const FLAG_PATTERNS: Array<{ flag: DossierEntry['flags'][number]; re: RegExp }> = [
  { flag: 'precio', re: /precio|cu[aá]nto|cuanto sale|\bvale\b|costo|\bplan\b|\$|\busd\b|\bgs\.?|\bmil\b|\dk\b|%/i },
  { flag: 'pago', re: /\balias\b|\bcbu\b|\bcvu\b|transferencia|comprobante|se[ñn]a\b|anticipo|pagar|pagu[eé]\b|deposit|mercado pago|\bcuenta\b/i },
  { flag: 'objecion', re: /\bcaro\b|no tengo|presupuesto|\bsocio\b|\bpareja\b|m[aá]s adelante|despu[eé]s\b|lo pienso|comparar|otra empresa|no conf[ií]o|desconf/i },
  { flag: 'compromiso', re: /lo hago|avanzo|arranquemos|\bdale\b|cuando cobre|la semana que viene|el mes que viene|te confirmo|quiero hacerlo|me interesa/i },
  { flag: 'rechazo', re: /no me interesa|no gracias|no molest|equivocado|bloque|\bbaja\b|dej[aá] de/i },
];

export function flagsFor(text: string): DossierEntry['flags'] {
  if (!text) return [];
  const out: DossierEntry['flags'] = [];
  for (const { flag, re } of FLAG_PATTERNS) if (re.test(text)) out.push(flag);
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

export function daysSince(value: Date | string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const t = typeof value === 'string' ? Date.parse(value) : value.getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

export function numeroDeJid(jid: string): string {
  return (jid || '').split('@')[0].split(':')[0];
}

function displayName(contactName: string | null, chatName: string | null, pushName: string | null, remoteJid: string): string {
  const name = (contactName || chatName || pushName || '').trim();
  return name || maskJid(remoteJid);
}

function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): Record<string, unknown> | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type JoinedRow = {
  a: typeof teamCommercialAnalysis.$inferSelect;
  chat: { remoteJid: string; name: string | null; pushName: string | null; profilePicUrl: string | null; instanceId: number | null };
  contactName: string | null;
};

function toRow(r: JoinedRow, now: number): AnalysisRow {
  const a = r.a;
  return {
    id: a.id,
    chatId: a.chatId,
    contactId: a.contactId,
    name: displayName(r.contactName, r.chat.name, r.chat.pushName, r.chat.remoteJid),
    phoneMasked: maskJid(r.chat.remoteJid),
    avatarUrl: r.chat.profilePicUrl,
    currentGate: (a.currentGate ?? 'G0') as Gate,
    maxGate: (a.maxGate ?? a.currentGate ?? 'G0') as Gate,
    dropGate: (a.dropGate ?? a.currentGate ?? 'G0') as Gate,
    dropReason: (a.dropReason ?? 'desconocido') as AnalysisRow['dropReason'],
    confidence: a.confidence,
    priorityScore: a.priorityScore,
    recoveryProbability: a.recoveryProbability,
    potentialValueUsd: a.potentialValueUsd,
    collectionSpeed: a.collectionSpeed as AnalysisRow['collectionSpeed'],
    need: a.need as AnalysisRow['need'],
    objectionType: a.objectionType as AnalysisRow['objectionType'],
    intent: a.intent as AnalysisRow['intent'],
    temperature: a.temperature as AnalysisRow['temperature'],
    status: a.status as AnalysisRow['status'],
    recommendedAction: a.recommendedAction ?? '',
    recommendedOwner: a.recommendedOwner as AnalysisRow['recommendedOwner'],
    nextActionAt: a.nextActionAt ? String(a.nextActionAt) : null,
    lastCustomerMessageAt: iso(a.lastCustomerMessageAt),
    lastTeamMessageAt: iso(a.lastTeamMessageAt),
    daysSilent: daysSince(a.lastCustomerMessageAt, now),
    followupsTotal: a.followupsTotal,
    automationActive: a.automationActive,
    isExistingCustomer: a.isExistingCustomer,
    customerEvidence: a.customerEvidence as AnalysisRow['customerEvidence'],
    paymentPending: a.paymentPending,
    autoReplyDetected: a.autoReplyDetected,
    evidenceGap: a.evidenceGap,
    stale: a.stale,
    analyzedAt: iso(a.analyzedAt),
    analyzedBy: (a.analyzedBy ?? null) as AnalysisRow['analyzedBy'],
    version: a.version,
    source: a.source as AnalysisRow['source'],
  };
}

function toDetail(r: JoinedRow, now: number): AnalysisDetail {
  const a = r.a;
  const ev = (a.evidence ?? {}) as Record<string, string[]>;
  return {
    ...toRow(r, now),
    needDetail: a.needDetail,
    businessType: a.businessType,
    quotedPrice: a.quotedPrice != null && a.quotedCurrency ? { amount: a.quotedPrice, currency: a.quotedCurrency } : null,
    proposalSummary: a.proposalSummary,
    objectionDetail: a.objectionDetail,
    intentScore: a.intentScore,
    lastProspectAction: a.lastProspectAction,
    lastTeamAction: a.lastTeamAction,
    statusReason: a.statusReason,
    notesForHuman: a.notesForHuman,
    crmToFix: a.crmToFix,
    evidence: {
      gate: ev.gate ?? [],
      price: ev.price,
      objection: ev.objection,
      intent: ev.intent,
      payment: ev.payment,
    },
    priorRadar: a.priorRadar ?? null,
    sourceDetail: a.sourceDetail,
    firstContactAt: iso(a.firstContactAt),
    followupsAutomated: a.followupsAutomated,
    followupsManual: a.followupsManual,
    lastFollowupAt: iso(a.lastFollowupAt),
    provider: a.provider,
    model: a.model,
  };
}

const chatCols = {
  remoteJid: chats.remoteJid,
  name: chats.name,
  pushName: chats.pushName,
  profilePicUrl: chats.profilePicUrl,
  instanceId: chats.instanceId,
};

// ── Filtros ─────────────────────────────────────────────────────────────────

/** Condiciones de una vista (sin cursor). Exportado para que overview/metrics cuenten igual. */
export function vistaWhere(vista: ListQuery['vista']): SQL | undefined {
  const a = teamCommercialAnalysis;
  switch (vista) {
    case 'dinero':
      return and(inArray(a.currentGate, MONEY_GATES), ne(a.status, 'cliente'));
    case 'oportunidades':
      return inArray(a.currentGate, FRONT_OPPORTUNITY_GATES);
    case 'barrido':
      return and(inArray(a.currentGate, FRONT_SWEEP_GATES), notInArray(a.status, [...DISCARD_STATUSES]));
    case 'limpieza':
      return or(inArray(a.status, [...DISCARD_STATUSES]), eq(a.currentGate, 'GX'));
    default:
      return undefined;
  }
}

const AGE_INTERVALS: Record<NonNullable<ListQuery['ageBucket']>, SQL> = {
  lt7: sql`${teamCommercialAnalysis.lastCustomerMessageAt} >= now() - interval '7 days'`,
  '7to30': sql`${teamCommercialAnalysis.lastCustomerMessageAt} < now() - interval '7 days' and ${teamCommercialAnalysis.lastCustomerMessageAt} >= now() - interval '30 days'`,
  '30to90': sql`${teamCommercialAnalysis.lastCustomerMessageAt} < now() - interval '30 days' and ${teamCommercialAnalysis.lastCustomerMessageAt} >= now() - interval '90 days'`,
  '90to180': sql`${teamCommercialAnalysis.lastCustomerMessageAt} < now() - interval '90 days' and ${teamCommercialAnalysis.lastCustomerMessageAt} >= now() - interval '180 days'`,
  gt180: sql`${teamCommercialAnalysis.lastCustomerMessageAt} < now() - interval '180 days'`,
};

function buildWhere(teamId: number, q: ListQuery): SQL {
  const a = teamCommercialAnalysis;
  const parts: Array<SQL | undefined> = [eq(a.teamId, teamId), vistaWhere(q.vista)];
  if (q.gates?.length) parts.push(inArray(a.currentGate, q.gates));
  if (q.status?.length) parts.push(inArray(a.status, q.status));
  if (q.owner) parts.push(eq(a.recommendedOwner, q.owner));
  if (q.objection) parts.push(eq(a.objectionType, q.objection));
  if (q.need) parts.push(eq(a.need, q.need));
  if (q.source) parts.push(eq(a.source, q.source));
  if (q.ageBucket && AGE_INTERVALS[q.ageBucket]) parts.push(AGE_INTERVALS[q.ageBucket]);
  if (q.followups === '0') parts.push(eq(a.followupsTotal, 0));
  else if (q.followups === '1') parts.push(eq(a.followupsTotal, 1));
  else if (q.followups === '2') parts.push(eq(a.followupsTotal, 2));
  else if (q.followups === '3plus') parts.push(gte(a.followupsTotal, 3));
  if (typeof q.evidenceGap === 'boolean') parts.push(eq(a.evidenceGap, q.evidenceGap));
  if (typeof q.automationActive === 'boolean') parts.push(eq(a.automationActive, q.automationActive));
  if (typeof q.stale === 'boolean') parts.push(eq(a.stale, q.stale));
  if (q.toReview) parts.push(and(isNotNull(a.analyzedAt), lt(a.confidence, 55)));

  const term = (q.q ?? '').trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const digits = term.replace(/\D/g, '');
    const ors: SQL[] = [ilike(contacts.name, like), ilike(chats.name, like), ilike(chats.pushName, like)];
    if (digits.length >= 3) ors.push(ilike(chats.remoteJid, `%${digits}%`));
    parts.push(or(...ors));
  }
  return and(...parts.filter((p): p is SQL => Boolean(p))) as SQL;
}

const nameExpr = sql<string>`coalesce(nullif(${contacts.name}, ''), nullif(${chats.name}, ''), nullif(${chats.pushName}, ''), ${chats.remoteJid})`;

function orderFor(sort: ListQuery['sort']): SQL[] {
  const a = teamCommercialAnalysis;
  switch (sort) {
    case 'age':
      return [sql`${a.lastCustomerMessageAt} desc nulls last`, desc(a.id)];
    case 'lastFollowup':
      return [sql`${a.lastFollowupAt} desc nulls last`, desc(a.id)];
    case 'name':
      return [asc(nameExpr), asc(a.id)];
    default:
      return [desc(a.priorityScore), desc(a.id)];
  }
}

// ── Lista ───────────────────────────────────────────────────────────────────

export async function listAnalyses(teamId: number, query: ListQuery): Promise<ListPayload> {
  const a = teamCommercialAnalysis;
  const sort = query.sort ?? 'priority';
  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const where = buildWhere(teamId, query);
  const cursor = decodeCursor(query.cursor);

  let pageWhere: SQL = where;
  let offset = 0;
  if (cursor && cursor.sort === sort) {
    if (sort === 'priority' && typeof cursor.score === 'number' && typeof cursor.id === 'number') {
      // Keyset sobre (priority_score, id): estable aunque cambien filas entre páginas.
      pageWhere = and(
        where,
        or(lt(a.priorityScore, cursor.score), and(eq(a.priorityScore, cursor.score), lt(a.id, cursor.id))),
      ) as SQL;
    } else if (typeof cursor.offset === 'number' && cursor.offset > 0) {
      offset = cursor.offset;
    }
  }

  const base = db
    .select({ a, chat: chatCols, contactName: contacts.name })
    .from(a)
    .innerJoin(chats, eq(chats.id, a.chatId))
    .leftJoin(contacts, eq(contacts.chatId, a.chatId));

  const [rowsRaw, totalRow] = await Promise.all([
    base
      .where(pageWhere)
      .orderBy(...orderFor(sort))
      .limit(limit + 1)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(a)
      .innerJoin(chats, eq(chats.id, a.chatId))
      .leftJoin(contacts, eq(contacts.chatId, a.chatId))
      .where(where),
  ]);

  const hasMore = rowsRaw.length > limit;
  const page = rowsRaw.slice(0, limit);
  const now = Date.now();
  const rows = page.map((r) => toRow(r as JoinedRow, now));
  const last = page[page.length - 1];

  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor =
      sort === 'priority'
        ? encodeCursor({ sort, score: last.a.priorityScore, id: last.a.id })
        : encodeCursor({ sort, offset: offset + page.length });
  }

  return { rows, total: totalRow[0]?.n ?? 0, nextCursor };
}

// ── Ficha ───────────────────────────────────────────────────────────────────

type Msg = {
  id: string;
  fromMe: boolean;
  messageType: string | null;
  text: string | null;
  mediaCaption: string | null;
  mediaSeconds: number | null;
  mediaIsPtt: boolean | null;
  isAi: boolean | null;
  isAutomation: boolean | null;
  isInternal: boolean | null;
  timestamp: Date;
};

function whoOf(m: Msg): DossierEntry['who'] {
  if (!m.fromMe) return 'cliente';
  if (m.isInternal) return 'nota';
  if (m.isAi) return 'ia';
  if (m.isAutomation) return 'bot';
  return 'humano';
}

function textOf(m: Msg, transcript: string | undefined): string {
  const t = (m.text ?? '').trim();
  if (t) return t;
  const caption = (m.mediaCaption ?? '').trim();
  const type = (m.messageType ?? '').toLowerCase();
  if (type.includes('audio') || m.mediaIsPtt) {
    if (transcript) return transcript;
    return `[audio ${m.mediaSeconds ?? 0}s sin transcribir]`;
  }
  if (type.includes('image')) return caption ? `[imagen] ${caption}` : '[imagen]';
  if (type.includes('video')) return caption ? `[video] ${caption}` : '[video]';
  if (type.includes('document')) return caption ? `[documento] ${caption}` : '[documento]';
  if (type.includes('sticker')) return '[sticker]';
  if (type.includes('location')) return '[ubicación]';
  if (type.includes('contact')) return '[contacto]';
  return caption || (type ? `[${type}]` : '');
}

/**
 * Hitos del timeline (doc 05 §4): cambios de `who`, flags, evidencia del análisis
 * y notas internas. Los tramos sin hitos se colapsan en gaps de silencio u omitidos.
 */
export function buildTimeline(
  msgs: Msg[],
  transcripts: Map<string, string>,
  evidence: Record<string, string[]> | null,
): Array<TimelineHit | TimelineGap> {
  const evidenceOf = new Map<string, string[]>();
  for (const [key, ids] of Object.entries(evidence ?? {})) {
    for (const id of ids ?? []) {
      const list = evidenceOf.get(id) ?? [];
      list.push(key);
      evidenceOf.set(id, list);
    }
  }

  const entries: Array<TimelineHit & { idx: number }> = [];
  let prevWho: DossierEntry['who'] | null = null;
  msgs.forEach((m, idx) => {
    const who = whoOf(m);
    const text = textOf(m, transcripts.get(m.id));
    const flags = who === 'nota' ? [] : flagsFor(text);
    const ev = evidenceOf.get(m.id) ?? [];
    const isHit = idx === 0 || who !== prevWho || flags.length > 0 || ev.length > 0 || who === 'nota' || idx === msgs.length - 1;
    if (isHit) {
      entries.push({
        id: m.id,
        at: m.timestamp.toISOString(),
        who,
        type: m.messageType ?? 'text',
        text: text.length > 300 ? `${text.slice(0, 297)}…` : text,
        flags,
        evidenceOf: ev,
        idx,
      });
    }
    prevWho = who;
  });

  let hits = entries;
  if (hits.length > TIMELINE_HIT_CAP) {
    const keep = new Set<number>();
    hits.slice(0, 40).forEach((h) => keep.add(h.idx));
    hits.slice(-150).forEach((h) => keep.add(h.idx));
    hits.forEach((h) => {
      if (h.flags.length || h.evidenceOf.length || h.who === 'nota') keep.add(h.idx);
    });
    hits = hits.filter((h) => keep.has(h.idx));
  }

  const out: Array<TimelineHit | TimelineGap> = [];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (i > 0) {
      const prev = hits[i - 1];
      const omitted = hit.idx - prev.idx - 1;
      const days = (Date.parse(hit.at) - Date.parse(prev.at)) / DAY_MS;
      if (days > SILENCE_GAP_DAYS) out.push({ from: prev.at, to: hit.at, count: omitted, kind: 'silence' });
      else if (omitted > 0) out.push({ from: prev.at, to: hit.at, count: omitted, kind: 'omitted' });
    }
    const { idx: _idx, ...rest } = hit;
    out.push(rest);
  }
  return out;
}

/** DetailPayload más una cabecera mínima: los chats sin análisis también se abren. */
export type DetailWithHeader = DetailPayload & { header: ChatHeader };

export async function getAnalysisDetail(teamId: number, chatId: number): Promise<DetailWithHeader | null> {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
    columns: { id: true, remoteJid: true, name: true, pushName: true, profilePicUrl: true, instanceId: true },
  });
  if (!chat) return null;

  const now = Date.now();
  const [contact, analysisRows, msgsDesc, audioRows, versionRows, actionRows, signalRows] = await Promise.all([
    db.query.contacts.findFirst({ where: eq(contacts.chatId, chatId), columns: { id: true, name: true, notes: true, customData: true, funnelStageId: true }, with: { contactTags: { with: { tag: { columns: { id: true, name: true, color: true } } } } } }),
    db.select().from(teamCommercialAnalysis).where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId))).limit(1),
    db
      .select({
        id: messages.id,
        fromMe: messages.fromMe,
        messageType: messages.messageType,
        text: messages.text,
        mediaCaption: messages.mediaCaption,
        mediaSeconds: messages.mediaSeconds,
        mediaIsPtt: messages.mediaIsPtt,
        isAi: messages.isAi,
        isAutomation: messages.isAutomation,
        isInternal: messages.isInternal,
        timestamp: messages.timestamp,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp), desc(messages.id))
      .limit(TIMELINE_MESSAGE_CAP),
    db
      .select({ messageId: messageAudioInsights.messageId, transcript: messageAudioInsights.transcript })
      .from(messageAudioInsights)
      .where(and(eq(messageAudioInsights.chatId, chatId), eq(messageAudioInsights.status, 'done'))),
    db
      .select()
      .from(teamCommercialAnalysisVersions)
      .where(and(eq(teamCommercialAnalysisVersions.teamId, teamId), eq(teamCommercialAnalysisVersions.chatId, chatId)))
      .orderBy(desc(teamCommercialAnalysisVersions.version)),
    db
      .select()
      .from(teamCommercialActions)
      .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.chatId, chatId)))
      .orderBy(desc(teamCommercialActions.createdAt)),
    db
      .select()
      .from(teamCommercialSignals)
      .where(and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.chatId, chatId)))
      .orderBy(desc(teamCommercialSignals.createdAt)),
  ]);

  const joined: JoinedRow | null = analysisRows[0]
    ? { a: analysisRows[0], chat, contactName: contact?.name ?? null }
    : null;
  const analysis = joined ? toDetail(joined, now) : null;
  const name = displayName(contact?.name ?? null, chat.name, chat.pushName, chat.remoteJid);

  const transcripts = new Map<string, string>();
  for (const r of audioRows) if (r.transcript) transcripts.set(r.messageId, r.transcript);
  const msgs = [...msgsDesc].reverse();
  const timeline = buildTimeline(msgs, transcripts, (analysisRows[0]?.evidence as Record<string, string[]>) ?? null);

  const versions: AnalysisVersionRow[] = versionRows.map((v) => {
    const snap = (v.snapshot ?? {}) as Record<string, unknown>;
    const gate = (snap.current_gate ?? snap.currentGate ?? 'G0') as Gate;
    const conf = Number(snap.confidence ?? 0);
    return {
      id: v.id,
      version: v.version,
      reason: v.reason,
      analyzedBy: (v.analyzedBy ?? null) as AnalysisVersionRow['analyzedBy'],
      currentGate: gate,
      confidence: Number.isFinite(conf) ? conf : 0,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy,
      diff: v.diff ?? null,
    };
  });

  const cooldownMs = SEND_COOLDOWN_HOURS * 3_600_000;
  const lastExecutedAt = actionRows
    .filter((x) => x.executedAt && (x.status === 'executed' || x.status === 'resulted'))
    .map((x) => x.executedAt!.getTime())
    .sort((x, y) => y - x)[0];
  const baseWarnings: string[] = [];
  if (analysis?.automationActive) baseWarnings.push('automation_active');
  if (analysis?.autoReplyDetected) baseWarnings.push('auto_reply');
  if (analysis?.isExistingCustomer) baseWarnings.push('cliente');
  if (lastExecutedAt && now - lastExecutedAt < cooldownMs) baseWarnings.push('envio_reciente');

  const actions: ActionRow[] = actionRows.map((x) => ({
    id: x.id,
    chatId: x.chatId,
    contactId: x.contactId,
    name,
    batchId: x.batchId,
    batchLabel: x.batchLabel,
    experimentId: x.experimentId,
    variant: x.variant,
    kind: x.kind as ActionRow['kind'],
    payload: x.payload ?? {},
    gateAtCreation: (x.gateAtCreation ?? null) as ActionRow['gateAtCreation'],
    status: x.status as ActionRow['status'],
    requiresRole: x.requiresRole as ActionRow['requiresRole'],
    proposedBy: x.proposedBy,
    approvedBy: x.approvedBy,
    approvedAt: iso(x.approvedAt),
    executedAt: iso(x.executedAt),
    executedVia: x.executedVia,
    resultMessageId: x.resultMessageId,
    result: x.result ?? null,
    scheduledFor: iso(x.scheduledFor),
    expiresAt: iso(x.expiresAt),
    createdAt: x.createdAt.toISOString(),
    warnings: x.status === 'proposed' || x.status === 'pending_approval' || x.status === 'approved' ? baseWarnings : [],
  }));

  const signals: SignalRow[] = signalRows.map((s) => ({
    id: s.id,
    chatId: s.chatId,
    contactId: s.contactId,
    name,
    messageId: s.messageId,
    kind: s.kind as SignalRow['kind'],
    confidence: s.confidence,
    excerpt: s.excerpt,
    triggeredByActionId: s.triggeredByActionId,
    gateBefore: (s.gateBefore ?? null) as SignalRow['gateBefore'],
    gateAfter: (s.gateAfter ?? null) as SignalRow['gateAfter'],
    status: s.status as SignalRow['status'],
    handledBy: s.handledBy,
    handledAt: iso(s.handledAt),
    createdAt: s.createdAt.toISOString(),
  }));

  const chatHref = `/dashboard/chat/${numeroDeJid(chat.remoteJid)}?instanceId=${chat.instanceId ?? ''}`;

  const header: ChatHeader = {
    chatId: chat.id,
    contactId: contact?.id ?? null,
    name,
    phoneMasked: maskJid(chat.remoteJid),
    avatarUrl: chat.profilePicUrl,
    remoteJid: chat.remoteJid,
    instanceId: chat.instanceId ?? null,
    customData: (contact?.customData as Record<string, unknown> | null) ?? {},
    contactNotes: contact?.notes ?? null,
    tags: (contact?.contactTags ?? []).map((ct) => ct.tag).filter(Boolean) as Array<{ id: number; name: string; color: string | null }>,
  };

  return { analysis, timeline, versions, actions, signals, chatHref, header };
}

/** Cabecera mínima de un chat sin análisis (para la ficha). */
export type ChatHeader = {
  chatId: number;
  contactId: number | null;
  name: string;
  phoneMasked: string;
  avatarUrl: string | null;
  /** JID técnico para el chat embebido (`/api/messages?jid=`). No se muestra: para la UI está `phoneMasked`. */
  remoteJid: string;
  instanceId: number | null;
  /** Campos personalizados del contacto (contacts.customData) tal cual, sin secretos. */
  customData: Record<string, unknown>;
  /** Nota libre de la ficha del contacto (contacts.notes). */
  contactNotes: string | null;
  tags: Array<{ id: number; name: string; color: string | null }>;
};
