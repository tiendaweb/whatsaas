/**
 * Dashboard "Hoy" del Command Center: meta de caja, contadores, auditoría,
 * siguiente mejor acción y distribución por gate.
 *
 * Todo se agrega en JS sobre selects filtrados por equipo/estado. Las monedas
 * NUNCA se suman entre sí: cada una se convierte con el `fx` del plugin.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { countConnectorPending } from './work-queue';
import {
  chats,
  contacts,
  messageAudioInsights,
  teamCommercialAnalysis,
  teamCommercialSignals,
  teamFinancialEntries,
  teamSales,
} from '@/lib/db/schema';
import { maskJid } from '@/lib/desktop/command-center/types';
import type { CashGoal, OverviewPayload } from '../shared/api-types';
import { FRONT_OPPORTUNITY_GATES, FRONT_SWEEP_GATES, GATES, URGENT_SIGNALS, type Gate, type Owner, type SignalKind } from '../shared/taxonomy';
import { getSalesOpsSettings } from './settings';
import { DISCARD_STATUSES, MONEY_GATES } from './queries';

const NOISE_SIGNALS: SignalKind[] = ['respuesta_automatica', 'irrelevante'];

/** Fila liviana de análisis que comparten overview y metrics. */
export type AnalysisLite = {
  id: number;
  chatId: number;
  contactId: number | null;
  currentGate: string | null;
  status: string;
  confidence: number;
  priorityScore: number;
  recommendedAction: string | null;
  recommendedOwner: string;
  objectionType: string;
  source: string;
  followupsTotal: number;
  evidenceGap: boolean;
  stale: boolean;
  proposalSummary: string | null;
  lastCustomerMessageAt: Date | null;
  analyzedAt: Date | null;
  version: number;
};

export async function loadAnalysesLite(teamId: number): Promise<AnalysisLite[]> {
  const a = teamCommercialAnalysis;
  return db
    .select({
      id: a.id,
      chatId: a.chatId,
      contactId: a.contactId,
      currentGate: a.currentGate,
      status: a.status,
      confidence: a.confidence,
      priorityScore: a.priorityScore,
      recommendedAction: a.recommendedAction,
      recommendedOwner: a.recommendedOwner,
      objectionType: a.objectionType,
      source: a.source,
      followupsTotal: a.followupsTotal,
      evidenceGap: a.evidenceGap,
      stale: a.stale,
      proposalSummary: a.proposalSummary,
      lastCustomerMessageAt: a.lastCustomerMessageAt,
      analyzedAt: a.analyzedAt,
      version: a.version,
    })
    .from(a)
    .where(eq(a.teamId, teamId));
}

/** Chats reales del equipo: sin grupos ni broadcast. */
export async function countTeamChats(teamId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(chats)
    .where(and(eq(chats.teamId, teamId), sql`${chats.remoteJid} not like '%@g.us'`, sql`${chats.remoteJid} not like '%@broadcast'`));
  return rows[0]?.n ?? 0;
}

export type PaidItem = { at: string; currency: string; amountMinor: number; contactId: number | null; usd: number | null };

export function toUsd(amountMinor: number, currency: string, fx: Record<string, number>): number | null {
  const rate = currency === 'USD' ? 1 : fx[currency];
  if (!rate || rate <= 0) return null;
  return amountMinor / 100 / rate;
}

/**
 * Cobros de la misión: ventas pagadas + ingresos financieros pagados sin venta
 * asociada (para no contar dos veces), desde `missionSince`.
 */
export async function loadPaidItems(teamId: number, since: string, fx: Record<string, number>): Promise<PaidItem[]> {
  const [sales, entries] = await Promise.all([
    db
      .select({ contactId: teamSales.contactId, currency: teamSales.currency, total: teamSales.total, paidAt: teamSales.paidAt, updatedAt: teamSales.updatedAt })
      .from(teamSales)
      .where(and(eq(teamSales.teamId, teamId), eq(teamSales.status, 'paid'))),
    db
      .select({ currency: teamFinancialEntries.currency, amount: teamFinancialEntries.amount, paidOn: teamFinancialEntries.paidOn, occurredOn: teamFinancialEntries.occurredOn })
      .from(teamFinancialEntries)
      .where(
        and(
          eq(teamFinancialEntries.teamId, teamId),
          eq(teamFinancialEntries.type, 'income'),
          eq(teamFinancialEntries.status, 'paid'),
          isNull(teamFinancialEntries.saleId),
        ),
      ),
  ]);

  const items: PaidItem[] = [];
  for (const s of sales) {
    const at = (s.paidAt ?? s.updatedAt).toISOString();
    if (at.slice(0, 10) < since) continue;
    items.push({ at, currency: s.currency, amountMinor: s.total, contactId: s.contactId, usd: toUsd(s.total, s.currency, fx) });
  }
  for (const e of entries) {
    const day = e.paidOn ?? e.occurredOn;
    if (!day || day < since) continue;
    items.push({ at: `${day}T12:00:00.000Z`, currency: e.currency, amountMinor: e.amount, contactId: null, usd: toUsd(e.amount, e.currency, fx) });
  }
  items.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  return items;
}

export function buildCashGoal(items: PaidItem[], goalUsd: number, since: string): CashGoal {
  const byCurrency: Record<string, number> = {};
  let collectedUsd = 0;
  for (const it of items) {
    byCurrency[it.currency] = (byCurrency[it.currency] ?? 0) + it.amountMinor / 100;
    if (it.usd != null) collectedUsd += it.usd;
  }
  return {
    goalUsd,
    collectedUsd: Math.round(collectedUsd),
    byCurrency: Object.fromEntries(Object.entries(byCurrency).map(([k, v]) => [k, Math.round(v)])),
    salesCount: items.length,
    lastPaidAt: items.length ? items[items.length - 1].at : null,
    since,
  };
}

export function isOpenForWork(a: Pick<AnalysisLite, 'currentGate' | 'status'>): boolean {
  if (a.currentGate === 'G11' || a.currentGate === 'GX') return false;
  if ((DISCARD_STATUSES as readonly string[]).includes(a.status) || a.status === 'cliente') return false;
  return true;
}

export async function getOverview(teamId: number): Promise<OverviewPayload> {
  const settings = await getSalesOpsSettings(teamId);
  const fx: Record<string, number> = { ...settings.fx, USD: 1 };
  const since = settings.missionSince;

  const [analyses, total, paidItems, audiosQueuedRow, recentSignals, urgentSignals] = await Promise.all([
    loadAnalysesLite(teamId),
    countTeamChats(teamId),
    loadPaidItems(teamId, since, fx),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(messageAudioInsights)
      .where(and(eq(messageAudioInsights.teamId, teamId), eq(messageAudioInsights.status, 'queued'))),
    // Últimas señales del equipo; "hoy" se decide en JS.
    db
      .select({ chatId: teamCommercialSignals.chatId, kind: teamCommercialSignals.kind, createdAt: teamCommercialSignals.createdAt })
      .from(teamCommercialSignals)
      .where(eq(teamCommercialSignals.teamId, teamId))
      .orderBy(desc(teamCommercialSignals.createdAt))
      .limit(2000),
    db
      .select({
        id: teamCommercialSignals.id,
        chatId: teamCommercialSignals.chatId,
        kind: teamCommercialSignals.kind,
        excerpt: teamCommercialSignals.excerpt,
        createdAt: teamCommercialSignals.createdAt,
      })
      .from(teamCommercialSignals)
      .where(and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.status, 'new'), inArray(teamCommercialSignals.kind, URGENT_SIGNALS)))
      .orderBy(desc(teamCommercialSignals.createdAt))
      .limit(5),
  ]);

  const byChat = new Map(analyses.map((a) => [a.chatId, a]));

  // Contadores
  const counters = { moneyNow: 0, respondedToday: 0, opportunities: 0, sweep: 0, preDiscard: 0, customers: 0 };
  const distribution = Object.fromEntries(GATES.map((g) => [g, 0])) as Record<Gate, number>;
  let analyzed = 0;
  let stale = 0;
  let toReview = 0;
  for (const a of analyses) {
    const gate = a.currentGate as Gate | null;
    if (gate && gate in distribution) distribution[gate] += 1;
    if (a.analyzedAt) analyzed += 1;
    if (a.stale) stale += 1;
    if (a.analyzedAt && a.confidence < 55) toReview += 1;
    if (gate && MONEY_GATES.includes(gate) && a.status !== 'cliente') counters.moneyNow += 1;
    if (gate && FRONT_OPPORTUNITY_GATES.includes(gate)) counters.opportunities += 1;
    if (gate && FRONT_SWEEP_GATES.includes(gate) && !(DISCARD_STATUSES as readonly string[]).includes(a.status)) counters.sweep += 1;
    if (a.status === 'pre_descarte') counters.preDiscard += 1;
    if (a.status === 'cliente' || gate === 'G11') counters.customers += 1;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const respondedChats = new Set<number>();
  for (const s of recentSignals) {
    if (NOISE_SIGNALS.includes(s.kind as SignalKind)) continue;
    if (s.createdAt.toISOString().slice(0, 10) !== todayKey) break;
    respondedChats.add(s.chatId);
  }
  counters.respondedToday = respondedChats.size;

  // Siguiente mejor acción: señales urgentes nuevas primero, después prioridad.
  const nextBest: OverviewPayload['nextBest'] = [];
  const used = new Set<number>();
  for (const s of urgentSignals) {
    if (used.has(s.chatId)) continue;
    used.add(s.chatId);
    const a = byChat.get(s.chatId);
    nextBest.push({
      chatId: s.chatId,
      name: '',
      gate: (a?.currentGate ?? null) as Gate | null,
      priorityScore: a?.priorityScore ?? 0,
      reason: 'signal',
      signalKind: s.kind as SignalKind,
      text: s.excerpt || `señal: ${s.kind}`,
      owner: (a?.recommendedOwner ?? 'nadie') as Owner,
    });
    if (nextBest.length >= 5) break;
  }
  if (nextBest.length < 5) {
    const top = analyses
      .filter((a) => isOpenForWork(a) && a.analyzedAt && !used.has(a.chatId))
      .sort((x, y) => y.priorityScore - x.priorityScore || y.id - x.id)
      .slice(0, 5 - nextBest.length);
    for (const a of top) {
      used.add(a.chatId);
      nextBest.push({
        chatId: a.chatId,
        name: '',
        gate: (a.currentGate ?? null) as Gate | null,
        priorityScore: a.priorityScore,
        reason: 'priority',
        text: a.recommendedAction ?? '',
        owner: a.recommendedOwner as Owner,
      });
    }
  }
  if (nextBest.length) {
    const ids = nextBest.map((n) => n.chatId);
    const names = await db
      .select({ id: chats.id, remoteJid: chats.remoteJid, name: chats.name, pushName: chats.pushName, contactName: contacts.name })
      .from(chats)
      .leftJoin(contacts, eq(contacts.chatId, chats.id))
      .where(and(eq(chats.teamId, teamId), inArray(chats.id, ids)));
    const nameById = new Map(names.map((n) => [n.id, (n.contactName || n.name || n.pushName || '').trim() || maskJid(n.remoteJid)]));
    for (const n of nextBest) n.name = nameById.get(n.chatId) ?? `chat ${n.chatId}`;
  }

  return {
    cash: buildCashGoal(paidItems, settings.cashGoalUsd, since),
    counters,
    audit: { analyzed, total, stale, toReview, audiosQueued: audiosQueuedRow[0]?.n ?? 0, connectorPending: await countConnectorPending(teamId, { total, analyzed, stale }) },
    nextBest,
    distribution,
    generatedAt: new Date().toISOString(),
  };
}
