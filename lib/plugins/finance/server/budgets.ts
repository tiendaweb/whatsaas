import 'server-only';

import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamBudgets, teamCostCenters, teamFinancialEntries } from '@/lib/db/schema';
import type { BudgetInput } from '@/lib/plugins/finance/server/schema';

/**
 * Presupuestos del equipo, sin sesión.
 *
 * Vivían inline en las rutas de /api/plugins/finance/budgets. Se extraen para
 * que la pantalla y el conector compartan la misma regla de "cuánto se gastó
 * de este presupuesto": gastos NO cancelados, dentro del período, del mismo
 * centro de costo/categoría si el presupuesto los fija, y SIEMPRE de la misma
 * moneda que el presupuesto — un presupuesto en ARS no se consume con gastos
 * en USD, porque las monedas no se suman entre sí.
 *
 * Acá NO se chequean permisos: eso es de quien llama.
 */

export class FinanceBudgetError extends Error {}

async function assertCostCenter(teamId: number, costCenterId: number | null | undefined) {
  if (costCenterId == null) return;
  const cc = await db.query.teamCostCenters.findFirst({
    where: and(eq(teamCostCenters.id, costCenterId), eq(teamCostCenters.teamId, teamId)),
    columns: { id: true },
  });
  if (!cc) throw new FinanceBudgetError('El centro de costo no existe en este equipo.');
}

function assertPeriodo(periodStart: string, periodEnd: string) {
  if (periodEnd < periodStart) {
    throw new FinanceBudgetError(`El período termina (${periodEnd}) antes de empezar (${periodStart}).`);
  }
}

export async function budgetSpent(teamId: number, budget: { periodStart: string; periodEnd: string; currency: string; costCenterId: number | null; category: string | null }) {
  const conditions = [
    eq(teamFinancialEntries.teamId, teamId),
    eq(teamFinancialEntries.type, 'expense'),
    ne(teamFinancialEntries.status, 'cancelled'),
    eq(teamFinancialEntries.currency, budget.currency),
    gte(teamFinancialEntries.occurredOn, budget.periodStart),
    lte(teamFinancialEntries.occurredOn, budget.periodEnd),
  ];
  if (budget.costCenterId) conditions.push(eq(teamFinancialEntries.costCenterId, budget.costCenterId));
  if (budget.category) conditions.push(eq(teamFinancialEntries.category, budget.category));
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${teamFinancialEntries.amount}), 0)` })
    .from(teamFinancialEntries)
    .where(and(...conditions));
  return Number(row?.total ?? 0);
}

/** Presupuestos con su ejecución (`spent`, en la moneda del presupuesto). */
export async function listBudgetsWithExecution(teamId: number) {
  const budgets = await db.select().from(teamBudgets)
    .where(eq(teamBudgets.teamId, teamId))
    .orderBy(desc(teamBudgets.periodStart));
  return Promise.all(budgets.map(async (budget) => ({ ...budget, spent: await budgetSpent(teamId, budget) })));
}

export async function getBudget(teamId: number, budgetId: number) {
  return db.query.teamBudgets.findFirst({ where: and(eq(teamBudgets.id, budgetId), eq(teamBudgets.teamId, teamId)) });
}

/**
 * Crea un presupuesto. No hay columna de idempotencia en la tabla, así que la
 * clave natural es (nombre, período): repetir la creación devuelve el existente.
 */
export async function createBudget(teamId: number, userId: number, input: BudgetInput) {
  assertPeriodo(input.periodStart, input.periodEnd);
  await assertCostCenter(teamId, input.costCenterId);

  const previo = await db.query.teamBudgets.findFirst({
    where: and(
      eq(teamBudgets.teamId, teamId),
      eq(teamBudgets.name, input.name),
      eq(teamBudgets.periodStart, input.periodStart),
      eq(teamBudgets.periodEnd, input.periodEnd),
    ),
  });
  if (previo) return { idempotent: true as const, budget: previo };

  const [budget] = await db.insert(teamBudgets).values({
    teamId,
    ...input,
    costCenterId: input.costCenterId ?? null,
    category: input.category || null,
    createdBy: userId,
  }).returning();
  return { idempotent: false as const, budget };
}

export async function updateBudget(teamId: number, _userId: number, budgetId: number, patch: Partial<BudgetInput>) {
  const existing = await getBudget(teamId, budgetId);
  if (!existing) return null;
  assertPeriodo(patch.periodStart ?? existing.periodStart, patch.periodEnd ?? existing.periodEnd);
  if (patch.costCenterId !== undefined) await assertCostCenter(teamId, patch.costCenterId);

  const [budget] = await db.update(teamBudgets).set({
    ...patch,
    category: patch.category === undefined ? undefined : (patch.category || null),
    updatedAt: new Date(),
  }).where(and(eq(teamBudgets.id, budgetId), eq(teamBudgets.teamId, teamId))).returning();
  return budget ?? null;
}

/** Devuelve false si no existía. */
export async function deleteBudget(teamId: number, _userId: number, budgetId: number) {
  const [deleted] = await db.delete(teamBudgets)
    .where(and(eq(teamBudgets.id, budgetId), eq(teamBudgets.teamId, teamId)))
    .returning({ id: teamBudgets.id });
  return Boolean(deleted);
}
