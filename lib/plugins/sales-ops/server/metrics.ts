/**
 * Métricas del Command Center (doc 05 §8). Agregación en JS sobre selects
 * filtrados por equipo: nada de fechas en SQL.
 *
 * "Respondió" = tiene alguna señal que no sea automática/irrelevante.
 * "Recuperado" = status `recuperado` o `cobro`. "Propuesta" = tiene
 * `proposal_summary`. "Pagó" = su contacto tiene un cobro de la misión.
 */
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCommercialAnalysisVersions, teamCommercialSignals } from '@/lib/db/schema';
import type { MetricsPayload } from '../shared/api-types';
import { GATES, type Gate } from '../shared/taxonomy';
import { getSalesOpsSettings } from './settings';
import { daysSince } from './queries';
import { countTeamChats, loadAnalysesLite, loadPaidItems } from './overview';

const NOISE = ['respuesta_automatica', 'irrelevante'];
const AGE_BUCKETS = ['lt7', '7to30', '30to90', '90to180', 'gt180', 'sin_dato'] as const;
const FOLLOWUP_BUCKETS = ['0', '1', '2', '3plus'] as const;

export function ageBucketOf(days: number | null): (typeof AGE_BUCKETS)[number] {
  if (days == null) return 'sin_dato';
  if (days < 7) return 'lt7';
  if (days < 30) return '7to30';
  if (days < 90) return '30to90';
  if (days < 180) return '90to180';
  return 'gt180';
}

function followupBucketOf(n: number): (typeof FOLLOWUP_BUCKETS)[number] {
  if (n <= 0) return '0';
  if (n === 1) return '1';
  if (n === 2) return '2';
  return '3plus';
}

/** Lunes de la semana ISO, como YYYY-MM-DD. */
export function weekStartOf(isoDate: string): string {
  const d = new Date(isoDate);
  if (!Number.isFinite(d.getTime())) return 'sin_fecha';
  const day = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export async function getMetrics(teamId: number): Promise<MetricsPayload> {
  const settings = await getSalesOpsSettings(teamId);
  const fx: Record<string, number> = { ...settings.fx, USD: 1 };
  const since = settings.missionSince;

  const [analyses, total, paidItems, respondedRows, versionRow] = await Promise.all([
    loadAnalysesLite(teamId),
    countTeamChats(teamId),
    loadPaidItems(teamId, since, fx),
    db
      .selectDistinct({ chatId: teamCommercialSignals.chatId })
      .from(teamCommercialSignals)
      .where(and(eq(teamCommercialSignals.teamId, teamId), notInArray(teamCommercialSignals.kind, NOISE))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamCommercialAnalysisVersions)
      .where(eq(teamCommercialAnalysisVersions.teamId, teamId)),
  ]);

  const responded = new Set(respondedRows.map((r) => r.chatId));
  const paidByContact = new Map<number, number>();
  for (const it of paidItems) {
    if (it.contactId == null) continue;
    paidByContact.set(it.contactId, (paidByContact.get(it.contactId) ?? 0) + (it.usd ?? 0));
  }

  // Caja por semana
  const weekMap = new Map<string, number>();
  for (const it of paidItems) {
    const w = weekStartOf(it.at);
    weekMap.set(w, (weekMap.get(w) ?? 0) + (it.usd ?? 0));
  }
  const cashByWeek = [...weekMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, usd]) => ({ week, usd: Math.round(usd) }));

  const byGate = Object.fromEntries(
    GATES.map((g) => [g, { total: 0, responded: 0, recovered: 0, proposal: 0, paid: 0, revenueUsd: 0 }]),
  ) as MetricsPayload['byGate'];
  const byAge: MetricsPayload['byAge'] = Object.fromEntries(AGE_BUCKETS.map((b) => [b, { total: 0, responded: 0, recovered: 0 }]));
  const byObjection: MetricsPayload['byObjection'] = {};
  const byFollowups: MetricsPayload['byFollowups'] = Object.fromEntries(FOLLOWUP_BUCKETS.map((b) => [b, { total: 0, responded: 0 }]));
  const bySource: MetricsPayload['bySource'] = {};

  const now = Date.now();
  let analyzed = 0;
  let confidenceSum = 0;
  let toReview = 0;
  let evidenceGap = 0;

  for (const a of analyses) {
    const gate = (a.currentGate ?? null) as Gate | null;
    const didRespond = responded.has(a.chatId);
    const recovered = a.status === 'recuperado' || a.status === 'cobro';
    const hasProposal = Boolean(a.proposalSummary);
    const paidUsd = a.contactId != null ? paidByContact.get(a.contactId) : undefined;
    const paid = paidUsd != null;

    if (gate && byGate[gate]) {
      const g = byGate[gate];
      g.total += 1;
      if (didRespond) g.responded += 1;
      if (recovered) g.recovered += 1;
      if (hasProposal) g.proposal += 1;
      if (paid) {
        g.paid += 1;
        g.revenueUsd += paidUsd ?? 0;
      }
    }

    const age = byAge[ageBucketOf(daysSince(a.lastCustomerMessageAt, now))];
    age.total += 1;
    if (didRespond) age.responded += 1;
    if (recovered) age.recovered += 1;

    const obj = (byObjection[a.objectionType] ??= { total: 0, recovered: 0 });
    obj.total += 1;
    if (recovered) obj.recovered += 1;

    const fu = byFollowups[followupBucketOf(a.followupsTotal)];
    fu.total += 1;
    if (didRespond) fu.responded += 1;

    const src = (bySource[a.source] ??= { total: 0, paid: 0, revenueUsd: 0 });
    src.total += 1;
    if (paid) {
      src.paid += 1;
      src.revenueUsd += paidUsd ?? 0;
    }

    if (a.analyzedAt) {
      analyzed += 1;
      confidenceSum += a.confidence;
      if (a.confidence < 55) toReview += 1;
      if (a.evidenceGap) evidenceGap += 1;
    }
  }

  for (const g of Object.values(byGate)) g.revenueUsd = Math.round(g.revenueUsd);
  for (const s of Object.values(bySource)) s.revenueUsd = Math.round(s.revenueUsd);

  const pct = (n: number) => (analyzed ? Math.round((n / analyzed) * 1000) / 10 : 0);

  return {
    cashByWeek,
    byGate,
    byAge,
    byObjection,
    byFollowups,
    bySource,
    audit: {
      analyzed,
      total,
      avgConfidence: analyzed ? Math.round(confidenceSum / analyzed) : 0,
      toReviewPct: pct(toReview),
      evidenceGapPct: pct(evidenceGap),
      versionsPerChat: analyzed ? Math.round(((versionRow[0]?.n ?? 0) / analyzed) * 10) / 10 : 0,
    },
  };
}
