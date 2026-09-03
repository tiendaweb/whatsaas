import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCostCenters, teamFinancialEntries } from '@/lib/db/schema';
import type { CostCenterInput } from '@/lib/plugins/finance/server/schema';

/**
 * Centros de costo del equipo, sin sesión. Extraído de las rutas de
 * /api/plugins/finance/cost-centers para que el conector use la misma regla:
 * el código es único por equipo y un centro con movimientos no se borra.
 *
 * Acá NO se chequean permisos: eso es de quien llama.
 */

export type CostCenterErrorCode = 'duplicate_code' | 'cost_center_in_use' | 'not_found';

export class FinanceCostCenterError extends Error {
  constructor(public readonly code: CostCenterErrorCode, message: string) {
    super(message);
  }
}

const esCodigoDuplicado = (error: unknown) =>
  error instanceof Error && error.message.includes('team_cost_centers_team_code_uidx');

export async function listCostCenters(teamId: number) {
  return db.select().from(teamCostCenters)
    .where(eq(teamCostCenters.teamId, teamId))
    .orderBy(asc(teamCostCenters.name));
}

export async function getCostCenter(teamId: number, costCenterId: number) {
  return db.query.teamCostCenters.findFirst({
    where: and(eq(teamCostCenters.id, costCenterId), eq(teamCostCenters.teamId, teamId)),
  });
}

/**
 * Crea un centro de costo. Sin columna de idempotencia: si ya hay uno con el
 * mismo código (o el mismo nombre, cuando no hay código) se devuelve ése.
 */
export async function createCostCenter(teamId: number, _userId: number, input: CostCenterInput) {
  const code = input.code || null;
  const previo = await db.query.teamCostCenters.findFirst({
    where: and(
      eq(teamCostCenters.teamId, teamId),
      code ? eq(teamCostCenters.code, code) : eq(teamCostCenters.name, input.name),
    ),
  });
  if (previo) return { idempotent: true as const, costCenter: previo };

  try {
    const [costCenter] = await db.insert(teamCostCenters).values({ teamId, ...input, code }).returning();
    return { idempotent: false as const, costCenter };
  } catch (error) {
    if (esCodigoDuplicado(error)) throw new FinanceCostCenterError('duplicate_code', `Ya existe un centro de costo con el código "${code}" en este equipo.`);
    throw error;
  }
}

export async function updateCostCenter(teamId: number, _userId: number, costCenterId: number, patch: Partial<CostCenterInput>) {
  try {
    const [costCenter] = await db.update(teamCostCenters).set({
      ...patch,
      code: patch.code === undefined ? undefined : (patch.code || null),
      updatedAt: new Date(),
    }).where(and(eq(teamCostCenters.id, costCenterId), eq(teamCostCenters.teamId, teamId))).returning();
    return costCenter ?? null;
  } catch (error) {
    if (esCodigoDuplicado(error)) throw new FinanceCostCenterError('duplicate_code', `Ya existe un centro de costo con el código "${patch.code}" en este equipo.`);
    throw error;
  }
}

/** Devuelve false si no existía. Lanza `cost_center_in_use` si tiene movimientos. */
export async function deleteCostCenter(teamId: number, _userId: number, costCenterId: number) {
  const [linkedEntry] = await db.select({ id: teamFinancialEntries.id }).from(teamFinancialEntries)
    .where(and(eq(teamFinancialEntries.costCenterId, costCenterId), eq(teamFinancialEntries.teamId, teamId)))
    .limit(1);
  if (linkedEntry) {
    throw new FinanceCostCenterError('cost_center_in_use', 'El centro de costo tiene movimientos financieros: desactivalo con is_active=false en vez de borrarlo.');
  }
  const [deleted] = await db.delete(teamCostCenters)
    .where(and(eq(teamCostCenters.id, costCenterId), eq(teamCostCenters.teamId, teamId)))
    .returning({ id: teamCostCenters.id });
  return Boolean(deleted);
}
