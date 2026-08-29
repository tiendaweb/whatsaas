import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamCommercialExperimentMembers, teamCommercialExperiments } from '@/lib/db/schema';
import type { ExperimentFunnel, ExperimentRow } from '../shared/api-types';
import { DEFAULT_FX_TO_USD, GATES, SALES_OPS_ACTIVITY_PREFIX, type ExperimentStatus, type Gate } from '../shared/taxonomy';
import { getSalesOpsSettings } from './settings';

/**
 * Experimentos A/B (doc 03 §6, doc 05 §7). El embudo se calcula en JS desde
 * `team_commercial_experiment_members`: las fechas las llenan la cola
 * (`sent_at`), el radar (`responded_at`) y las ventas (`paid_at`).
 */

export type CreateExperimentInput = {
  name: string;
  hypothesis?: string | null;
  segmentGates?: Gate[];
  messageA?: string | null;
  messageB?: string | null;
  status?: ExperimentStatus;
  createdBy?: number | null;
};

export type MemberTouchField = 'sentAt' | 'deliveredAt' | 'respondedAt' | 'recoveredAt' | 'proposalAt' | 'paidAt';

type MemberRecord = typeof teamCommercialExperimentMembers.$inferSelect;

async function audit(teamId: number, verb: string, metadata: Record<string, unknown>, userId?: number | null) {
  try {
    await db.insert(activityLogs).values({ teamId, userId: userId ?? null, action: `${SALES_OPS_ACTIVITY_PREFIX}EXPERIMENT_${verb}`, metadata });
  } catch (error) {
    console.error('[sales-ops/experiments] audit failed', error);
  }
}

function emptyFunnel(): ExperimentFunnel {
  return { eligible: 0, sent: 0, delivered: 0, responded: 0, recovered: 0, proposal: 0, paid: 0, revenueUsd: 0 };
}

function buildFunnel(members: MemberRecord[], fx: Record<string, number>): ExperimentRow['funnel'] {
  const funnel: ExperimentRow['funnel'] = { A: emptyFunnel(), B: emptyFunnel(), all: emptyFunnel() };
  for (const m of members) {
    const variant: 'A' | 'B' = m.variant === 'B' ? 'B' : 'A';
    for (const bucket of [funnel[variant], funnel.all]) {
      bucket.eligible += 1;
      if (m.sentAt) bucket.sent += 1;
      if (m.deliveredAt) bucket.delivered += 1;
      if (m.respondedAt) bucket.responded += 1;
      if (m.recoveredAt) bucket.recovered += 1;
      if (m.proposalAt) bucket.proposal += 1;
      if (m.paidAt) {
        bucket.paid += 1;
        if (m.revenueCents != null && m.currency) {
          // Cada moneda se convierte con su fx explícito; nunca se suman entre sí sin él.
          const rate = fx[m.currency] ?? DEFAULT_FX_TO_USD[m.currency as keyof typeof DEFAULT_FX_TO_USD];
          if (rate && rate > 0) bucket.revenueUsd += m.revenueCents / 100 / rate;
        }
      }
    }
  }
  for (const key of ['A', 'B', 'all'] as const) funnel[key].revenueUsd = Math.round(funnel[key].revenueUsd * 100) / 100;
  return funnel;
}

function toRow(exp: typeof teamCommercialExperiments.$inferSelect, funnel: ExperimentRow['funnel']): ExperimentRow {
  return {
    id: exp.id,
    name: exp.name,
    hypothesis: exp.hypothesis,
    segmentGates: (exp.segmentGates ?? []).filter((g): g is Gate => GATES.includes(g as Gate)),
    messageA: exp.messageA,
    messageB: exp.messageB,
    status: exp.status as ExperimentStatus,
    startedAt: exp.startedAt?.toISOString() ?? null,
    endedAt: exp.endedAt?.toISOString() ?? null,
    funnel,
  };
}

export async function createExperiment(teamId: number, input: CreateExperimentInput): Promise<ExperimentRow> {
  const name = input.name?.trim();
  if (!name) throw new Error('El experimento necesita un nombre.');
  const status: ExperimentStatus = input.status ?? 'running';
  const [created] = await db
    .insert(teamCommercialExperiments)
    .values({
      teamId,
      name: name.slice(0, 160),
      hypothesis: input.hypothesis?.trim() || null,
      segmentGates: (input.segmentGates ?? []).filter((g) => GATES.includes(g)),
      messageA: input.messageA?.trim() || null,
      messageB: input.messageB?.trim() || null,
      status,
      startedAt: status === 'running' ? new Date() : null,
      createdBy: input.createdBy ?? null,
    })
    .returning();
  await audit(teamId, 'CREATED', { experimentId: created.id, name: created.name, userId: input.createdBy ?? null }, input.createdBy ?? null);
  return toRow(created, { A: emptyFunnel(), B: emptyFunnel(), all: emptyFunnel() });
}

export async function listExperiments(teamId: number, options: { status?: ExperimentStatus } = {}): Promise<ExperimentRow[]> {
  const conditions = [eq(teamCommercialExperiments.teamId, teamId)];
  if (options.status) conditions.push(eq(teamCommercialExperiments.status, options.status));
  const experiments = await db
    .select()
    .from(teamCommercialExperiments)
    .where(and(...conditions))
    .orderBy(desc(teamCommercialExperiments.createdAt), desc(teamCommercialExperiments.id));
  if (!experiments.length) return [];
  const [members, settings] = await Promise.all([
    db
      .select()
      .from(teamCommercialExperimentMembers)
      .where(and(eq(teamCommercialExperimentMembers.teamId, teamId), inArray(teamCommercialExperimentMembers.experimentId, experiments.map((e) => e.id)))),
    getSalesOpsSettings(teamId),
  ]);
  const fx: Record<string, number> = { ...settings.fx, USD: 1 };
  const byExperiment = new Map<number, MemberRecord[]>();
  for (const m of members) {
    const list = byExperiment.get(m.experimentId);
    if (list) list.push(m);
    else byExperiment.set(m.experimentId, [m]);
  }
  return experiments.map((exp) => toRow(exp, buildFunnel(byExperiment.get(exp.id) ?? [], fx)));
}

export async function getExperiment(teamId: number, experimentId: number): Promise<ExperimentRow | null> {
  const rows = await listExperiments(teamId);
  return rows.find((r) => r.id === experimentId) ?? null;
}

export async function closeExperiment(teamId: number, experimentId: number, userId?: number | null): Promise<ExperimentRow> {
  const [updated] = await db
    .update(teamCommercialExperiments)
    .set({ status: 'closed', endedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(teamCommercialExperiments.teamId, teamId), eq(teamCommercialExperiments.id, experimentId)))
    .returning();
  if (!updated) throw new Error(`El experimento ${experimentId} no existe en este equipo.`);
  await audit(teamId, 'CLOSED', { experimentId, userId: userId ?? null }, userId ?? null);
  const row = await getExperiment(teamId, experimentId);
  return row ?? toRow(updated, { A: emptyFunnel(), B: emptyFunnel(), all: emptyFunnel() });
}

/**
 * Marca un hito del embudo para un chat. Sólo escribe la primera vez (el primer
 * `responded_at` es el que cuenta); `revenue` sólo acompaña a `paidAt`.
 */
export async function touchMember(
  teamId: number,
  experimentId: number,
  chatId: number,
  field: MemberTouchField,
  at: Date = new Date(),
  revenue?: { cents: number; currency: string } | null,
): Promise<boolean> {
  const [member] = await db
    .select()
    .from(teamCommercialExperimentMembers)
    .where(
      and(
        eq(teamCommercialExperimentMembers.teamId, teamId),
        eq(teamCommercialExperimentMembers.experimentId, experimentId),
        eq(teamCommercialExperimentMembers.chatId, chatId),
      ),
    )
    .limit(1);
  if (!member || member[field]) return false;
  const patch: Partial<typeof teamCommercialExperimentMembers.$inferInsert> = { [field]: at };
  if (field === 'paidAt' && revenue) {
    patch.revenueCents = revenue.cents;
    patch.currency = revenue.currency.slice(0, 3).toUpperCase();
  }
  await db.update(teamCommercialExperimentMembers).set(patch).where(eq(teamCommercialExperimentMembers.id, member.id));
  return true;
}
