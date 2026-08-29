import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamCommercialActions, teamCommercialAnalysis } from '@/lib/db/schema';
import { SALES_OPS_ACTIVITY_PREFIX, type CollectionSpeed, type Gate, type Objection } from '../shared/taxonomy';
import { computePriority } from './priority';
import { expireStale, proposeBatch } from './queue';

/**
 * Housekeeping diario del Command Center (doc 05 §E, reglas 4 y 5; doc 04 §9).
 *
 * 1. Expira propuestas vencidas (TTL 7 días).
 * 2. PROPONE (no aplica) `mark_pre_descarte` para G0–G2 con 3+ impactos sin
 *    respuesta o >180 días de silencio. Lo aprueba una persona.
 * 3. `pendiente_con_fecha` con la fecha vencida vuelve a la cola de su
 *    responsable como `assign_owner` propuesto.
 * 4. Recalcula `priority_score` por antigüedad, sin crear versión nueva.
 *
 * Nada escribe en el CRM.
 */

const DAY = 86400000;
const PRE_DESCARTE_GATES: Gate[] = ['G0', 'G1', 'G2'];
const PRE_DESCARTE_MIN_FOLLOWUPS = 3;
const PRE_DESCARTE_MIN_DAYS = 180;

export type HousekeepingReport = {
  teamId: number;
  expired: number;
  preDescarte: { batchId: string | null; proposed: number; excluded: number };
  overdue: { batchId: string | null; proposed: number };
  priority: { scanned: number; updated: number };
  seconds: number;
};

function formatDayLabel(date: Date): string {
  try {
    return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(5, 10);
  }
}

/** Chats que ya tienen una acción viva de ese tipo (no se proponen dos veces). */
async function chatsWithOpenAction(teamId: number, kind: string, chatIds: number[]): Promise<Set<number>> {
  if (!chatIds.length) return new Set();
  const rows = await db
    .select({ chatId: teamCommercialActions.chatId })
    .from(teamCommercialActions)
    .where(
      and(
        eq(teamCommercialActions.teamId, teamId),
        eq(teamCommercialActions.kind, kind),
        inArray(teamCommercialActions.chatId, chatIds),
        inArray(teamCommercialActions.status, ['proposed', 'pending_approval', 'approved', 'executing']),
      ),
    );
  return new Set(rows.map((r) => r.chatId));
}

async function proposePreDescarte(teamId: number, now: Date): Promise<HousekeepingReport['preDescarte']> {
  const rows = await db
    .select({
      chatId: teamCommercialAnalysis.chatId,
      followupsTotal: teamCommercialAnalysis.followupsTotal,
      lastCustomerMessageAt: teamCommercialAnalysis.lastCustomerMessageAt,
      firstContactAt: teamCommercialAnalysis.firstContactAt,
    })
    .from(teamCommercialAnalysis)
    .where(
      and(
        eq(teamCommercialAnalysis.teamId, teamId),
        inArray(teamCommercialAnalysis.currentGate, PRE_DESCARTE_GATES),
        inArray(teamCommercialAnalysis.status, ['en_proceso', 'recuperado', 'pendiente_con_fecha', 'sin_analizar']),
        eq(teamCommercialAnalysis.isExistingCustomer, false),
      ),
    );
  const candidates = rows.filter((r) => {
    if (r.followupsTotal >= PRE_DESCARTE_MIN_FOLLOWUPS) return true;
    const reference = r.lastCustomerMessageAt ?? r.firstContactAt;
    if (!reference) return false;
    return (now.getTime() - reference.getTime()) / DAY > PRE_DESCARTE_MIN_DAYS;
  });
  const already = await chatsWithOpenAction(teamId, 'mark_pre_descarte', candidates.map((c) => c.chatId));
  const chatIds = candidates.filter((c) => !already.has(c.chatId)).map((c) => c.chatId);
  if (!chatIds.length) return { batchId: null, proposed: 0, excluded: 0 };
  const result = await proposeBatch(teamId, {
    label: `Pre-descarte automático ${formatDayLabel(now)}`,
    kind: 'mark_pre_descarte',
    requiresRole: 'noelia',
    chatIds,
    filters: { limit: 2000 },
    payloadTemplate: { extra: { reason: 'housekeeping', rule: `G0-G2 con ${PRE_DESCARTE_MIN_FOLLOWUPS}+ impactos o >${PRE_DESCARTE_MIN_DAYS} días` } },
    proposedBy: 'ia',
  });
  return { batchId: result.batchId, proposed: result.included.length, excluded: result.excluded.length };
}

async function proposeOverdue(teamId: number, now: Date): Promise<HousekeepingReport['overdue']> {
  const today = now.toISOString().slice(0, 10);
  const rows = await db
    .select({
      chatId: teamCommercialAnalysis.chatId,
      nextActionAt: teamCommercialAnalysis.nextActionAt,
      recommendedOwner: teamCommercialAnalysis.recommendedOwner,
    })
    .from(teamCommercialAnalysis)
    .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.status, 'pendiente_con_fecha')));
  // `date` viene como string: se compara como YYYY-MM-DD.
  const overdue = rows.filter((r) => r.nextActionAt != null && String(r.nextActionAt).slice(0, 10) < today);
  const already = await chatsWithOpenAction(teamId, 'assign_owner', overdue.map((r) => r.chatId));
  const pending = overdue.filter((r) => !already.has(r.chatId));
  if (!pending.length) return { batchId: null, proposed: 0 };

  // Un lote por responsable, para que cada cola reciba lo suyo.
  const byOwner = new Map<string, number[]>();
  for (const r of pending) {
    const owner = r.recommendedOwner || 'nadie';
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), r.chatId]);
  }
  let proposed = 0;
  let firstBatch: string | null = null;
  for (const [owner, chatIds] of byOwner) {
    const result = await proposeBatch(teamId, {
      label: `Vencidos con fecha · ${owner} ${formatDayLabel(now)}`,
      kind: 'assign_owner',
      requiresRole: owner === 'noelia' || owner === 'carlos' ? owner : 'any',
      chatIds,
      filters: { limit: 2000 },
      payloadTemplate: { extra: { owner, reason: 'next_action_due', dueDate: today } },
      proposedBy: 'ia',
    });
    proposed += result.included.length;
    firstBatch ??= result.batchId;
  }
  return { batchId: firstBatch, proposed };
}

async function recalcPriority(teamId: number, now: Date): Promise<HousekeepingReport['priority']> {
  const rows = await db
    .select({
      id: teamCommercialAnalysis.id,
      currentGate: teamCommercialAnalysis.currentGate,
      lastCustomerMessageAt: teamCommercialAnalysis.lastCustomerMessageAt,
      followupsTotal: teamCommercialAnalysis.followupsTotal,
      objectionType: teamCommercialAnalysis.objectionType,
      collectionSpeed: teamCommercialAnalysis.collectionSpeed,
      potentialValueUsd: teamCommercialAnalysis.potentialValueUsd,
      evidenceGap: teamCommercialAnalysis.evidenceGap,
      autoReplyDetected: teamCommercialAnalysis.autoReplyDetected,
      confidence: teamCommercialAnalysis.confidence,
      priorityScore: teamCommercialAnalysis.priorityScore,
      recoveryProbability: teamCommercialAnalysis.recoveryProbability,
      status: teamCommercialAnalysis.status,
    })
    .from(teamCommercialAnalysis)
    .where(eq(teamCommercialAnalysis.teamId, teamId));
  let updated = 0;
  for (const row of rows) {
    if (!row.currentGate || row.status === 'sin_analizar') continue;
    const daysSilent = row.lastCustomerMessageAt ? Math.floor((now.getTime() - row.lastCustomerMessageAt.getTime()) / DAY) : null;
    const result = computePriority({
      gate: row.currentGate as Gate,
      daysSilent,
      followupsTotal: row.followupsTotal,
      objection: (row.objectionType as Objection) ?? 'ninguna',
      collectionSpeed: (row.collectionSpeed as CollectionSpeed) ?? 'indefinida',
      potentialValueUsd: row.potentialValueUsd,
      evidenceGap: row.evidenceGap,
      autoReply: row.autoReplyDetected,
      confidence: row.confidence,
    });
    if (result.priorityScore === row.priorityScore && result.recoveryProbability === row.recoveryProbability) continue;
    await db
      .update(teamCommercialAnalysis)
      .set({ priorityScore: result.priorityScore, recoveryProbability: result.recoveryProbability, updatedAt: now })
      .where(eq(teamCommercialAnalysis.id, row.id));
    updated += 1;
  }
  return { scanned: rows.length, updated };
}

export async function runHousekeeping(teamId: number): Promise<HousekeepingReport> {
  const started = Date.now();
  const now = new Date();
  const { expired } = await expireStale(teamId);
  const preDescarte = await proposePreDescarte(teamId, now);
  const overdue = await proposeOverdue(teamId, now);
  const priority = await recalcPriority(teamId, now);
  const report: HousekeepingReport = { teamId, expired, preDescarte, overdue, priority, seconds: Math.round((Date.now() - started) / 1000) };
  try {
    await db.insert(activityLogs).values({ teamId, userId: null, action: `${SALES_OPS_ACTIVITY_PREFIX}HOUSEKEEPING`, metadata: report });
  } catch (error) {
    console.error('[sales-ops/housekeeping] audit failed', error);
  }
  return report;
}

/** Equipos con análisis: los únicos donde el housekeeping tiene algo que hacer. */
export async function teamsWithAnalysis(): Promise<number[]> {
  const rows = await db.selectDistinct({ teamId: teamCommercialAnalysis.teamId }).from(teamCommercialAnalysis);
  return rows.map((r) => r.teamId);
}
