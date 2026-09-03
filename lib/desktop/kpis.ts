import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contacts, teamDeals, teamSales } from '@/lib/db/schema';
import { OPEN_STAGES } from '@/lib/deals/types';

export const DESKTOP_PERIODS = ['30d', '3m', '6m', '1y', 'all'] as const;
export type DesktopPeriod = (typeof DESKTOP_PERIODS)[number];

const PERIOD_DAYS: Record<Exclude<DesktopPeriod, 'all'>, number> = {
  '30d': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
};

export type PeriodRange = {
  /** Inicio del período actual. `null` en "todo el historial". */
  from: Date | null;
  /** Inicio del período anterior, de la MISMA duración. */
  previousFrom: Date | null;
};

/**
 * El período anterior tiene siempre la misma duración que el actual. Comparar
 * 30 días contra "todo lo anterior" daría un delta que no significa nada.
 */
export function periodRange(period: DesktopPeriod, now = new Date()): PeriodRange {
  if (period === 'all') return { from: null, previousFrom: null };
  const days = PERIOD_DAYS[period];
  const ms = days * 24 * 60 * 60 * 1000;
  return { from: new Date(now.getTime() - ms), previousFrom: new Date(now.getTime() - 2 * ms) };
}

export type Kpi = {
  value: number;
  changePct: number;
  trend: 'up' | 'down';
  progress: number;
};

export type DesktopKpis = {
  revenue: Kpi & { currency: string };
  leads: Kpi;
  dealsClosed: Kpi;
  conversion: Kpi;
};

/** Delta porcentual seguro: sin período anterior no se inventa un 100 %. */
function delta(current: number, previous: number): { changePct: number; trend: 'up' | 'down' } {
  if (previous <= 0) {
    return { changePct: current > 0 ? 100 : 0, trend: current > 0 ? 'up' : 'down' };
  }
  const changePct = ((current - previous) / previous) * 100;
  return { changePct: Math.round(changePct * 10) / 10, trend: changePct >= 0 ? 'up' : 'down' };
}

/** Barra de progreso de la tarjeta: proporción del objetivo, acotada a 0-100. */
function progressOf(current: number, target: number): number {
  if (target <= 0) return current > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

/**
 * Fecha lista para interpolar dentro de un fragmento `sql`.
 *
 * 🚨 Un `Date` crudo dentro de un `sql` anidado en `FILTER (WHERE …)` NO lo
 * serializa postgres.js: revienta en runtime con "The string argument must be of
 * type string" y ni el build ni el typecheck lo detectan. Va como ISO string con
 * cast explícito.
 */
function ts(value: Date) {
  return sql`${value.toISOString()}::timestamp`;
}

export type KpiFlags = {
  sales: boolean;
  deals: boolean;
  contacts: boolean;
};

export async function computeKpis(
  teamId: number,
  period: DesktopPeriod,
  flags: KpiFlags,
  currency = 'USD',
): Promise<DesktopKpis> {
  const { from, previousFrom } = periodRange(period);

  // Los cuatro KPIs y sus cuatro períodos anteriores son ocho agregaciones. Se
  // resuelven en tres consultas con FILTER, no en ocho viajes a la base.
  const [revenueRow] = flags.sales
    ? await db
        .select({
          current: sql<number>`COALESCE(SUM(${teamSales.total}) FILTER (WHERE ${from ? sql`${teamSales.paidAt} >= ${ts(from)}` : sql`TRUE`}), 0)`,
          previous: sql<number>`COALESCE(SUM(${teamSales.total}) FILTER (WHERE ${previousFrom && from ? sql`${teamSales.paidAt} >= ${ts(previousFrom)} AND ${teamSales.paidAt} < ${ts(from)}` : sql`FALSE`}), 0)`,
        })
        .from(teamSales)
        .where(and(eq(teamSales.teamId, teamId), eq(teamSales.status, 'paid')))
    : [{ current: 0, previous: 0 }];

  const [dealRow] = flags.deals
    ? await db
        .select({
          wonCurrent: sql<number>`COUNT(*) FILTER (WHERE ${teamDeals.stage} = 'closed_won' AND ${from ? sql`${teamDeals.closedAt} >= ${ts(from)}` : sql`TRUE`})`,
          wonPrevious: sql<number>`COUNT(*) FILTER (WHERE ${teamDeals.stage} = 'closed_won' AND ${previousFrom && from ? sql`${teamDeals.closedAt} >= ${ts(previousFrom)} AND ${teamDeals.closedAt} < ${ts(from)}` : sql`FALSE`})`,
          lostCurrent: sql<number>`COUNT(*) FILTER (WHERE ${teamDeals.stage} = 'closed_lost' AND ${from ? sql`${teamDeals.closedAt} >= ${ts(from)}` : sql`TRUE`})`,
          lostPrevious: sql<number>`COUNT(*) FILTER (WHERE ${teamDeals.stage} = 'closed_lost' AND ${previousFrom && from ? sql`${teamDeals.closedAt} >= ${ts(previousFrom)} AND ${teamDeals.closedAt} < ${ts(from)}` : sql`FALSE`})`,
        })
        .from(teamDeals)
        .where(eq(teamDeals.teamId, teamId))
    : [{ wonCurrent: 0, wonPrevious: 0, lostCurrent: 0, lostPrevious: 0 }];

  const [leadRow] = flags.contacts
    ? await db
        .select({
          current: sql<number>`COUNT(*) FILTER (WHERE ${from ? sql`${contacts.createdAt} >= ${ts(from)}` : sql`TRUE`})`,
          previous: sql<number>`COUNT(*) FILTER (WHERE ${previousFrom && from ? sql`${contacts.createdAt} >= ${ts(previousFrom)} AND ${contacts.createdAt} < ${ts(from)}` : sql`FALSE`})`,
          active: sql<number>`COUNT(*) FILTER (WHERE ${contacts.funnelStageId} IS NOT NULL)`,
        })
        .from(contacts)
        .where(eq(contacts.teamId, teamId))
    : [{ current: 0, previous: 0, active: 0 }];

  const revenueCurrent = Number(revenueRow?.current) || 0;
  const revenuePrevious = Number(revenueRow?.previous) || 0;
  const wonCurrent = Number(dealRow?.wonCurrent) || 0;
  const wonPrevious = Number(dealRow?.wonPrevious) || 0;
  const lostCurrent = Number(dealRow?.lostCurrent) || 0;
  const lostPrevious = Number(dealRow?.lostPrevious) || 0;
  const leadsActive = Number(leadRow?.active) || 0;
  const leadsCurrent = Number(leadRow?.current) || 0;
  const leadsPrevious = Number(leadRow?.previous) || 0;

  // Sin oportunidades cerradas la conversión es 0, no NaN.
  const closedCurrent = wonCurrent + lostCurrent;
  const closedPrevious = wonPrevious + lostPrevious;
  const conversionCurrent = closedCurrent > 0 ? (wonCurrent / closedCurrent) * 100 : 0;
  const conversionPrevious = closedPrevious > 0 ? (wonPrevious / closedPrevious) * 100 : 0;

  return {
    revenue: {
      value: revenueCurrent,
      currency,
      ...delta(revenueCurrent, revenuePrevious),
      progress: progressOf(revenueCurrent, revenuePrevious),
    },
    leads: {
      value: leadsActive,
      ...delta(leadsCurrent, leadsPrevious),
      progress: progressOf(leadsCurrent, leadsPrevious),
    },
    dealsClosed: {
      value: wonCurrent,
      ...delta(wonCurrent, wonPrevious),
      progress: progressOf(wonCurrent, wonPrevious),
    },
    conversion: {
      value: Math.round(conversionCurrent * 10) / 10,
      ...delta(conversionCurrent, conversionPrevious),
      progress: Math.round(conversionCurrent),
    },
  };
}

/** Distribución del embudo para el donut. */
export async function pipelineBreakdown(teamId: number) {
  const rows = await db
    .select({
      stage: teamDeals.stage,
      count: sql<number>`COUNT(*)`,
      value: sql<number>`COALESCE(SUM(${teamDeals.value}), 0)`,
    })
    .from(teamDeals)
    .where(and(eq(teamDeals.teamId, teamId), inArray(teamDeals.stage, [...OPEN_STAGES, 'closed_won'])))
    .groupBy(teamDeals.stage);

  const total = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  return rows.map((row) => ({
    stage: row.stage,
    count: Number(row.count) || 0,
    value: Number(row.value) || 0,
    // Sin oportunidades no hay porcentaje que calcular.
    pct: total > 0 ? Math.round(((Number(row.count) || 0) / total) * 100) : 0,
  }));
}
