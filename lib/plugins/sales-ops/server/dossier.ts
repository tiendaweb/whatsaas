import 'server-only';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  automationSessions,
  automations,
  chats,
  contactTags,
  contacts,
  customFields,
  funnelStages,
  messageAudioInsights,
  messages,
  tags,
  teamCommercialAnalysis,
  teamCustomerContacts,
  teamDeals,
  teamMembershipSubscriptions,
  teamSales,
} from '@/lib/db/schema';
import { getContactCommercialSnapshot } from '@/lib/contacts/graph';
import { maskJid } from '@/lib/desktop/command-center/types';
import { dossierSchema, type Dossier, type DossierEntry } from '../shared/contract';
import { computeFingerprint } from './fingerprint';
import {
  classifyWho,
  computeRuleFacts,
  detectFlags,
  markAutoReplies,
  type RuleDbFacts,
  type RuleEntry,
} from './rules';

/**
 * El expediente de un chat (doc 04 §1): lo que ven las reglas, la IA y la
 * pestaña Timeline. Sin IA. Nunca lleva el teléfono completo.
 *
 * Los grupos (@g.us) se excluyen: no son prospectos. Un chat de otro equipo
 * no existe para esta función.
 */

const HEAD_KEEP = 15;
const TAIL_KEEP = 60;
const MAX_TEXT = 400;
/** ~6.000 tokens para la IA (doc 04 §1): presupuesto en caracteres del timeline serializado. */
const TIMELINE_CHAR_BUDGET = 24_000;
/** Un chat con más mensajes que esto no es un prospecto: es el equipo hablando consigo mismo. */
const MAX_MESSAGES = 6_000;
/** Chats excluidos por lista (doc 04 §1: el interno de 10.731 mensajes del equipo 2). */
export const EXCLUDED_CHAT_IDS: Record<number, number[]> = { 2: [14920] };

export function isExcludedChat(teamId: number, chatId: number): boolean {
  return (EXCLUDED_CHAT_IDS[teamId] ?? []).includes(chatId);
}
const AUDIO_TYPES = new Set(['audiomessage', 'audio', 'ptt', 'pttmessage']);

export class DossierError extends Error {
  constructor(message: string, readonly code: 'not_found' | 'group' | 'excluded') {
    super(message);
  }
}

// ── Diccionario de textos repetidos (doc 04 §3 criterio 2) ────────────────

const repeatedCache = new Map<number, { at: number; texts: Set<string> }>();
const REPEATED_TTL_MS = 10 * 60_000;

/**
 * Textos del cliente que aparecen idénticos (forma canónica) en ≥ 3 chats
 * distintos del equipo. La expresión SQL replica `canonicalText` de rules.ts:
 * minúsculas, sin acentos, sólo [a-z ], espacios colapsados.
 */
export async function repeatedTextsForTeam(teamId: number, opts: { force?: boolean } = {}): Promise<Set<string>> {
  const cached = repeatedCache.get(teamId);
  if (cached && !opts.force && Date.now() - cached.at < REPEATED_TTL_MS) return cached.texts;

  const rows = (await db.execute(sql`
    with canon as (
      select m.chat_id,
        btrim(regexp_replace(regexp_replace(lower(translate(m.text,
          'áéíóúüñàèìòùâêîôûäëïöÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖ',
          'aeiouunaeiouaeiouaeioAEIOUUNAEIOUAEIOUAEIO')), '[^a-z ]', '', 'g'), '\s+', ' ', 'g')) as t
      from messages m
      inner join chats c on c.id = m.chat_id
      where c.team_id = ${teamId}
        and m.from_me = false
        and coalesce(m.is_internal, false) = false
        and m.text is not null
        and length(m.text) >= 20
    )
    select t, count(distinct chat_id)::int as n
    from canon
    where length(t) >= 20
    group by t
    having count(distinct chat_id) >= 3
  `)) as unknown as Array<{ t: string; n: number }>;

  const texts = new Set(rows.map((r) => r.t));
  repeatedCache.set(teamId, { at: Date.now(), texts });
  return texts;
}

// ── Carga de datos ────────────────────────────────────────────────────────

type MessageRow = {
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
  errorMessage: string | null;
  timestamp: Date;
};

function isAudioMessage(m: MessageRow) {
  return !!m.mediaIsPtt || AUDIO_TYPES.has((m.messageType ?? '').toLowerCase());
}

function renderText(m: MessageRow, transcript: string | null): string {
  const type = (m.messageType ?? '').toLowerCase();
  if (isAudioMessage(m)) {
    if (transcript) return `[audio ${m.mediaSeconds ?? '?'}s] ${transcript}`;
    return `[audio ${m.mediaSeconds ?? '?'}s sin transcribir]`;
  }
  const caption = m.mediaCaption?.trim() || m.text?.trim() || '';
  if (type.includes('image')) return caption ? `[imagen] ${caption}` : '[imagen]';
  if (type.includes('document')) return caption ? `[documento ${caption}]` : '[documento]';
  if (type.includes('video') || type === 'ptvmessage') return caption ? `[video] ${caption}` : '[video]';
  if (type.includes('sticker')) return '[sticker]';
  if (type.includes('contact')) return '[contacto compartido]';
  if (type.includes('location')) return '[ubicación]';
  if (type.includes('album')) return caption ? `[álbum] ${caption}` : '[álbum]';
  if (caption) return caption;
  return type ? `[${type.replace(/message$/, '')}]` : '';
}

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

export type DossierBuildResult = {
  dossier: Dossier;
  /** Entradas completas (sin recorte), para reglas y Timeline. */
  entries: RuleEntry[];
  dbFacts: RuleDbFacts;
  automation: { activeSession: { automationName: string; currentNodeId: string | null; since: string } | null; completedSessions: number };
  existingAnalysis: { id: number; version: number; fingerprint: string | null; analyzedBy: string | null; currentGate: string | null; stale: boolean } | null;
};

export async function buildChatDossierFull(teamId: number, chatId: number, opts: { now?: Date } = {}): Promise<DossierBuildResult> {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
    columns: { id: true, remoteJid: true, name: true, pushName: true, instanceId: true, automationDisabled: true, lastCustomerInteraction: true },
  });
  if (!chat) throw new DossierError(`El chat ${chatId} no existe en este equipo.`, 'not_found');
  if (chat.remoteJid.endsWith('@g.us')) throw new DossierError('Los grupos no tienen expediente comercial.', 'group');
  if (isExcludedChat(teamId, chatId)) throw new DossierError(`El chat ${chatId} está excluido por lista (chat interno).`, 'excluded');

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.chatId, chatId), eq(contacts.teamId, teamId)),
    columns: { id: true, name: true, funnelStageId: true, customData: true },
  });

  const [messageRows, insightRows, sessions, stage, tagRows, existing, repeated, catalogoEtapas, catalogoTags, catalogoCampos] = await Promise.all([
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
        errorMessage: messages.errorMessage,
        timestamp: messages.timestamp,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.timestamp), asc(messages.id))
      .limit(MAX_MESSAGES + 1),
    db
      .select({ messageId: messageAudioInsights.messageId, status: messageAudioInsights.status, transcript: messageAudioInsights.transcript })
      .from(messageAudioInsights)
      .where(and(eq(messageAudioInsights.chatId, chatId), eq(messageAudioInsights.teamId, teamId))),
    db
      .select({
        status: automationSessions.status,
        currentNodeId: automationSessions.currentNodeId,
        updatedAt: automationSessions.updatedAt,
        createdAt: automationSessions.createdAt,
        automationName: automations.name,
      })
      .from(automationSessions)
      .innerJoin(automations, eq(automations.id, automationSessions.automationId))
      .where(and(eq(automationSessions.chatId, chatId), eq(automationSessions.teamId, teamId))),
    contact?.funnelStageId
      ? db.query.funnelStages.findFirst({ where: eq(funnelStages.id, contact.funnelStageId), columns: { name: true } })
      : Promise.resolve(null),
    contact
      ? db
          .select({ name: tags.name })
          .from(contactTags)
          .innerJoin(tags, eq(tags.id, contactTags.tagId))
          .where(and(eq(contactTags.contactId, contact.id), eq(tags.teamId, teamId)))
      : Promise.resolve([] as Array<{ name: string }>),
    db.query.teamCommercialAnalysis.findFirst({
      where: and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)),
      columns: { id: true, version: true, fingerprint: true, analyzedBy: true, currentGate: true, stale: true },
    }),
    repeatedTextsForTeam(teamId),
    // Catálogo del equipo: sin esto, quien propone una corrección de CRM no
    // sabe a qué etapa se puede mover ni qué etiquetas existen, y termina
    // inventando nombres que el servidor después saltea.
    db.select({ name: funnelStages.name }).from(funnelStages).where(eq(funnelStages.teamId, teamId)).orderBy(asc(funnelStages.order)),
    db.select({ name: tags.name }).from(tags).where(eq(tags.teamId, teamId)).orderBy(asc(tags.name)),
    db.select({ name: customFields.name }).from(customFields).where(eq(customFields.teamId, teamId)).orderBy(asc(customFields.position)),
  ]);

  if (messageRows.length > MAX_MESSAGES) {
    throw new DossierError(`El chat ${chatId} supera ${MAX_MESSAGES} mensajes: se trata como interno y se excluye.`, 'excluded');
  }

  // Hechos comerciales de la base (R1, R5).
  let customerLinked = false;
  let salePaid = false;
  let salePending = false;
  let subscriptionActive = false;
  let dealNegotiationOverdue = false;
  let commercial: unknown = null;
  if (contact) {
    const [links, sales, subs, deals] = await Promise.all([
      db
        .select({ id: teamCustomerContacts.id })
        .from(teamCustomerContacts)
        .where(and(eq(teamCustomerContacts.teamId, teamId), eq(teamCustomerContacts.contactId, contact.id)))
        .limit(1),
      db
        .select({ status: teamSales.status })
        .from(teamSales)
        .where(and(eq(teamSales.teamId, teamId), eq(teamSales.contactId, contact.id))),
      db
        .select({ status: teamMembershipSubscriptions.status })
        .from(teamMembershipSubscriptions)
        .where(and(eq(teamMembershipSubscriptions.teamId, teamId), eq(teamMembershipSubscriptions.contactId, contact.id))),
      db
        .select({ stage: teamDeals.stage, expectedCloseDate: teamDeals.expectedCloseDate })
        .from(teamDeals)
        .where(and(eq(teamDeals.teamId, teamId), eq(teamDeals.contactId, contact.id), inArray(teamDeals.stage, ['qualified', 'proposal', 'negotiation']))),
    ]);
    customerLinked = links.length > 0;
    salePaid = sales.some((s) => s.status === 'paid');
    salePending = sales.some((s) => s.status === 'draft' || s.status === 'confirmed');
    subscriptionActive = subs.some((s) => s.status === 'active');
    const nowMs = (opts.now ?? new Date()).getTime();
    dealNegotiationOverdue = deals.some((d) => d.stage === 'negotiation' && d.expectedCloseDate != null && new Date(d.expectedCloseDate).getTime() < nowMs);

    try {
      const snapshot = await getContactCommercialSnapshot(teamId, { contactId: contact.id }, { agenda: false });
      if (snapshot) {
        // Compacto y sin datos personales: lo que la IA necesita para reconciliar R1/R5.
        commercial = {
          customerId: snapshot.scope.customerId,
          customerName: snapshot.scope.customerName,
          siblings: snapshot.scope.siblings.length,
          deals: snapshot.deals
            ? { open: snapshot.deals.open.map((d) => ({ title: d.title, stage: d.stage, value: d.value, currency: d.currency, expectedCloseDate: d.expectedCloseDate })), lastClosed: snapshot.deals.lastClosed ? { title: snapshot.deals.lastClosed.title, stage: snapshot.deals.lastClosed.stage, closedAt: snapshot.deals.lastClosed.closedAt } : null }
            : null,
          money: snapshot.money
            ? { pendingCount: snapshot.money.pendingCount, pendingByCurrency: snapshot.money.pendingByCurrency, paidByCurrency: snapshot.money.paidByCurrency, nextDueDate: snapshot.money.nextDueDate, overdueCount: snapshot.money.overdueCount }
            : null,
          subscriptions: snapshot.subscriptions ?? null,
        };
        if (snapshot.money && Object.keys(snapshot.money.paidByCurrency).length > 0) salePaid = true;
        if (snapshot.money && snapshot.money.pendingCount > 0) salePending = true;
      }
    } catch (error) {
      console.error('[sales-ops/dossier] snapshot comercial falló', error);
    }
  }

  // Timeline completo.
  const transcriptById = new Map<string, string | null>();
  for (const row of insightRows) transcriptById.set(row.messageId, row.status === 'done' && row.transcript ? row.transcript : null);

  const entries: RuleEntry[] = messageRows.map((m: MessageRow) => {
    const isAudio = isAudioMessage(m);
    const transcript = isAudio ? transcriptById.get(m.id) ?? null : null;
    const text = clip(renderText(m, transcript));
    const who = classifyWho(m);
    const flags: DossierEntry['flags'] = who === 'nota' ? [] : detectFlags(transcript ?? m.text ?? m.mediaCaption ?? '');
    return {
      id: m.id,
      at: new Date(m.timestamp).toISOString(),
      who,
      type: m.messageType ?? 'text',
      text,
      flags,
      fromMe: m.fromMe,
      isAudio,
      audioTranscribed: isAudio && transcript != null,
      errorMessage: m.errorMessage,
      epoch: new Date(m.timestamp).getTime(),
    };
  });
  markAutoReplies(entries, repeated);

  const activeSession = sessions.find((s) => s.status === 'active') ?? null;
  const dbFacts: RuleDbFacts = {
    chatName: chat.name ?? chat.pushName ?? null,
    customerLinked,
    salePaid,
    salePending,
    subscriptionActive,
    dealNegotiationOverdue,
    activeAutomationName: activeSession?.automationName ?? null,
    humanOverride: !!existing && existing.analyzedBy === 'human',
    customData: (contact?.customData ?? {}) as Record<string, unknown>,
    tags: tagRows.map((t) => t.name),
  };
  const facts = computeRuleFacts({ entries, dbFacts, now: opts.now });

  // Conteos.
  const visible = entries.filter((e) => e.who !== 'nota');
  const counts: Dossier['counts'] = {
    total: entries.length,
    customer: visible.filter((e) => e.who === 'cliente').length,
    customerEffective: visible.filter((e) => e.who === 'cliente' && !e.flags.includes('auto')).length,
    human: visible.filter((e) => e.who === 'humano').length,
    bot: visible.filter((e) => e.who === 'bot').length,
    ai: visible.filter((e) => e.who === 'ia').length,
    internal: entries.length - visible.length,
    audiosTotal: visible.filter((e) => e.isAudio).length,
    audiosTranscribed: visible.filter((e) => e.isAudio && e.audioTranscribed).length,
  };

  // Recorte para la IA: primeros 15 + últimos 60 + con flags + notas. Si aun
  // así excede el presupuesto, se sueltan los "con flags" del medio, los más
  // viejos primero: la cabeza y la cola cuentan la historia, el medio la adorna.
  const keep = new Set<number>();
  const core = (i: number) => i < HEAD_KEEP || i >= entries.length - TAIL_KEEP || entries[i].who === 'nota';
  entries.forEach((e, i) => {
    if (core(i) || e.flags.length > 0) keep.add(i);
  });
  const sizeOf = (i: number) => JSON.stringify(entries[i].text).length + 80;
  let size = [...keep].reduce((s, i) => s + sizeOf(i), 0);
  if (size > TIMELINE_CHAR_BUDGET) {
    const droppable = [...keep].filter((i) => !core(i)).sort((a, b) => a - b);
    for (const i of droppable) {
      if (size <= TIMELINE_CHAR_BUDGET) break;
      keep.delete(i);
      size -= sizeOf(i);
    }
  }
  const timeline: DossierEntry[] = [];
  const omitted: Dossier['omitted'] = [];
  let gap: { from: string; to: string; count: number } | null = null;
  entries.forEach((e, i) => {
    if (keep.has(i)) {
      if (gap) {
        omitted.push(gap);
        gap = null;
      }
      timeline.push({ id: e.id, at: e.at, who: e.who, type: e.type, text: e.text, flags: e.flags });
    } else if (gap) {
      gap.to = e.at;
      gap.count += 1;
    } else {
      gap = { from: e.at, to: e.at, count: 1 };
    }
  });
  if (gap) omitted.push(gap);

  const last = entries.at(-1) ?? null;
  const fingerprint = computeFingerprint({
    chatId,
    lastMessageId: last?.id ?? null,
    lastMessageTimestamp: last?.at ?? null,
    audioInsightsDone: insightRows.filter((r) => r.status === 'done').length,
  });

  const dossier: Dossier = dossierSchema.parse({
    chat: {
      id: chat.id,
      contactId: contact?.id ?? null,
      name: contact?.name ?? chat.name ?? chat.pushName ?? maskJid(chat.remoteJid),
      phoneMasked: maskJid(chat.remoteJid),
      instanceId: chat.instanceId ?? null,
      automationDisabled: !!chat.automationDisabled,
    },
    contact: contact
      ? {
          funnelStage: stage?.name ?? null,
          tags: tagRows.map((t) => t.name),
          customData: contact.customData ?? {},
        }
      : null,
    crmCatalog: {
      stages: catalogoEtapas.map((x) => x.name),
      tags: catalogoTags.map((x) => x.name),
      fields: catalogoCampos.map((x) => x.name),
    },
    commercial,
    counts,
    timeline,
    omitted,
    facts,
    fingerprint,
  });

  return {
    dossier,
    entries,
    dbFacts,
    automation: {
      activeSession: activeSession
        ? { automationName: activeSession.automationName, currentNodeId: activeSession.currentNodeId, since: new Date(activeSession.createdAt).toISOString() }
        : null,
      completedSessions: sessions.filter((s) => s.status === 'completed').length,
    },
    existingAnalysis: existing ?? null,
  };
}

/** El expediente que cumple `dossierSchema`. B/C/D lo importan (sólo lectura). */
export async function buildChatDossier(teamId: number, chatId: number): Promise<Dossier> {
  const { dossier } = await buildChatDossierFull(teamId, chatId);
  return dossier;
}
