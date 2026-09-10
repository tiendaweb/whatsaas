import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamCommercialActions, teamCommercialAnalysis, teamPromptRuns } from '@/lib/db/schema';
import { MAX_DECISIONES_VIVAS, SALES_OPS_ACTIVITY_PREFIX, type CollectionSpeed, type Gate, type Objection } from '../shared/taxonomy';
import { computePriority } from './priority';
import { expireStale, proposeBatch } from './queue';
import { encolarAudiosDeFrentes } from './audios';
import { getSalesOpsSettings } from './settings';

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
  /** Corridas `queued` que ningún conector tomó en 72 h, canceladas. */
  runsVencidas: number;
  preDescarte: { batchId: string | null; proposed: number; excluded: number };
  overdue: { batchId: string | null; proposed: number };
  priority: { scanned: number; updated: number };
  /** Audios de Dinero y Oportunidades sumados a la cola de fichas. */
  audios: { chats: number; encolados: number; yaEstaban: number };
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

/**
 * ¿Le queda lugar al cron para proponer?
 *
 * El housekeeping propone solo todas las noches (pre-descartes y vencidos: 13
 * filas el 10/09). Con un techo de 25 decisiones vivas, un cron que se despacha
 * de a trece se come la mitad del cupo del día antes de que una persona
 * proponga nada, y lo que se decide a mano es lo que mueve plata. Así que el
 * automático sólo entra cuando la cola está a menos de la mitad: si el equipo
 * tiene trabajo sin decidir, esperar un día no cuesta nada —los pre-descartes
 * llevan semanas quietos— y la cola no se convierte en un archivo.
 */
async function hayLugarParaElCron(teamId: number): Promise<boolean> {
  const settings = await getSalesOpsSettings(teamId);
  const tope = Math.max(0, settings.maxDecisionesVivas ?? MAX_DECISIONES_VIVAS);
  const [{ vivas = 0 } = { vivas: 0 }] = await db
    .select({ vivas: sql<number>`count(*)::int` })
    .from(teamCommercialActions)
    .where(and(eq(teamCommercialActions.teamId, teamId), inArray(teamCommercialActions.status, ['proposed', 'pending_approval'])));
  return vivas * 2 < tope;
}

export async function runHousekeeping(teamId: number): Promise<HousekeepingReport> {
  const started = Date.now();
  const now = new Date();
  const { expired } = await expireStale(teamId);
  const runsVencidas = await expirarCorridasSinConector(teamId, now);
  // Expirar va SIEMPRE (libera cupo); proponer, sólo si quedó lugar.
  const conLugar = await hayLugarParaElCron(teamId);
  const preDescarte = conLugar ? await proposePreDescarte(teamId, now) : { batchId: null, proposed: 0, excluded: 0 };
  const overdue = conLugar ? await proposeOverdue(teamId, now) : { batchId: null, proposed: 0 };
  const priority = await recalcPriority(teamId, now);
  // Los audios entran acá porque el frente de un chat cambia con cada
  // clasificación: lo que ayer era Barrido hoy puede ser Dinero y sus notas de
  // voz recién ahí valen la cuota.
  let audios = { chats: 0, encolados: 0, yaEstaban: 0 };
  try {
    audios = await encolarAudiosDeFrentes(teamId);
  } catch (error) {
    console.error('[sales-ops/housekeeping] encolar audios de frentes falló', error);
  }
  const report: HousekeepingReport = { teamId, expired, runsVencidas, preDescarte, overdue, priority, audios, seconds: Math.round((Date.now() - started) / 1000) };
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

/** Horas que una corrida puede esperar un conector antes de darse por vencida. */
const HORAS_CORRIDA_VENCIDA = 72;

/**
 * Corridas `queued` que ningún conector tomó en 72 h → `cancelled`.
 *
 * Había 31 corridas esperando desde hacía días (algunas del 04-09): nada las
 * expiraba y la Cola las mostraba como trabajo vivo. Se cancelan con el motivo
 * en `summary` y quedan en Descartados, donde se pueden relanzar a mano.
 */
export async function expirarCorridasSinConector(teamId: number, now = new Date()): Promise<number> {
  const limite = new Date(now.getTime() - HORAS_CORRIDA_VENCIDA * 3_600_000);
  const rows = await db
    .update(teamPromptRuns)
    .set({
      status: 'cancelled',
      summary: `Vencida: ningún conector la tomó en ${HORAS_CORRIDA_VENCIDA} h`,
      completedAt: now,
      metadata: sql`coalesce(${teamPromptRuns.metadata}, '{}'::jsonb) || jsonb_build_object('expiredAt', ${now.toISOString()}::text)`,
    })
    .where(and(eq(teamPromptRuns.teamId, teamId), eq(teamPromptRuns.status, 'queued'), lt(teamPromptRuns.createdAt, limite)))
    .returning({ id: teamPromptRuns.id });
  if (rows.length) {
    try {
      await db.insert(activityLogs).values({ teamId, userId: null, action: `${SALES_OPS_ACTIVITY_PREFIX}RUNS_EXPIRED`, metadata: { count: rows.length, hours: HORAS_CORRIDA_VENCIDA, ids: rows.map((r) => r.id).slice(0, 50) } });
    } catch (error) {
      console.error('[sales-ops/housekeeping] audit runs expired', error);
    }
  }
  return rows.length;
}
