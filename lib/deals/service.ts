import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  contacts,
  teamCustomers,
  teamDeals,
  users,
  type DealStage,
} from '@/lib/db/schema';
import {
  DEFAULT_STALE_AFTER_DAYS,
  OPEN_STAGES,
  STAGE_DEFAULT_PROBABILITY,
  type DealInput,
  type DealListFilters,
  type DealStats,
} from './types';

export type Deal = typeof teamDeals.$inferSelect;

export type DealWithRelations = Deal & {
  customerName: string | null;
  contactName: string | null;
  ownerName: string | null;
};

/**
 * Todas las firmas reciben `teamId` ya resuelto. El permiso se valida en el
 * borde (ruta o tool MCP), nunca acá dentro: así la misma función sirve a la UI
 * y al conector sin duplicar lógica ni chequeos.
 */

function staleCutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function listDeals(
  teamId: number,
  filters: DealListFilters = {},
): Promise<DealWithRelations[]> {
  const where = [eq(teamDeals.teamId, teamId)];
  if (filters.stage) where.push(eq(teamDeals.stage, filters.stage));
  if (filters.ownerId) where.push(eq(teamDeals.ownerId, filters.ownerId));
  if (filters.customerId) where.push(eq(teamDeals.customerId, filters.customerId));
  if (filters.contactId) where.push(eq(teamDeals.contactId, filters.contactId));
  if (filters.minValue != null) where.push(gte(teamDeals.value, filters.minValue));
  if (filters.expectedBefore) where.push(lte(teamDeals.expectedCloseDate, filters.expectedBefore));
  if (filters.open) where.push(inArray(teamDeals.stage, [...OPEN_STAGES]));
  if (filters.stale) where.push(lte(teamDeals.updatedAt, staleCutoff(DEFAULT_STALE_AFTER_DAYS)));
  if (filters.search?.trim()) where.push(ilike(teamDeals.title, `%${filters.search.trim()}%`));

  const rows = await db
    .select({
      deal: teamDeals,
      customerName: teamCustomers.name,
      contactName: contacts.name,
      ownerName: users.name,
    })
    .from(teamDeals)
    .leftJoin(teamCustomers, eq(teamDeals.customerId, teamCustomers.id))
    .leftJoin(contacts, eq(teamDeals.contactId, contacts.id))
    .leftJoin(users, eq(teamDeals.ownerId, users.id))
    .where(and(...where))
    .orderBy(asc(teamDeals.position), desc(teamDeals.updatedAt))
    .limit(Math.min(filters.limit ?? 200, 500))
    .offset(filters.offset ?? 0);

  return rows.map((row) => ({
    ...row.deal,
    customerName: row.customerName,
    contactName: row.contactName,
    ownerName: row.ownerName,
  }));
}

export async function getDeal(teamId: number, dealId: number): Promise<DealWithRelations | null> {
  const [row] = await db
    .select({
      deal: teamDeals,
      customerName: teamCustomers.name,
      contactName: contacts.name,
      ownerName: users.name,
    })
    .from(teamDeals)
    .leftJoin(teamCustomers, eq(teamDeals.customerId, teamCustomers.id))
    .leftJoin(contacts, eq(teamDeals.contactId, contacts.id))
    .leftJoin(users, eq(teamDeals.ownerId, users.id))
    // El filtro por teamId va acá y no en una comprobación posterior: un id de
    // otro equipo tiene que devolver "no existe", no un 403 que confirme que sí.
    .where(and(eq(teamDeals.id, dealId), eq(teamDeals.teamId, teamId)))
    .limit(1);

  if (!row) return null;
  return {
    ...row.deal,
    customerName: row.customerName,
    contactName: row.contactName,
    ownerName: row.ownerName,
  };
}

async function nextPosition(teamId: number, stage: DealStage): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${teamDeals.position}), -1)` })
    .from(teamDeals)
    .where(and(eq(teamDeals.teamId, teamId), eq(teamDeals.stage, stage)));
  return (Number(row?.max) || -1) + 1;
}

export async function logDealActivity(
  teamId: number,
  actorId: number | null,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.insert(activityLogs).values({
    teamId,
    userId: actorId,
    action,
    // Va en `metadata`, no en `ipAddress`. Ver el comentario de la columna.
    metadata,
  });
}

export async function createDeal(
  teamId: number,
  input: DealInput,
  actorId: number | null,
): Promise<Deal> {
  const stage = input.stage ?? 'qualified';
  const [deal] = await db
    .insert(teamDeals)
    .values({
      teamId,
      title: input.title.trim(),
      customerId: input.customerId ?? null,
      contactId: input.contactId ?? null,
      stage,
      value: input.value ?? 0,
      currency: (input.currency ?? 'USD').toUpperCase(),
      probability: input.probability ?? STAGE_DEFAULT_PROBABILITY[stage],
      expectedCloseDate: input.expectedCloseDate ?? null,
      ownerId: input.ownerId ?? actorId,
      source: input.source ?? 'manual',
      notes: input.notes ?? '',
      position: await nextPosition(teamId, stage),
      createdBy: actorId,
      updatedBy: actorId,
    })
    .returning();

  await logDealActivity(teamId, actorId, 'DEAL_CREATED', {
    dealId: deal.id,
    stage,
    value: deal.value,
    currency: deal.currency,
  });
  return deal;
}

export async function updateDeal(
  teamId: number,
  dealId: number,
  input: Partial<DealInput>,
  actorId: number | null,
): Promise<Deal | null> {
  const current = await getDeal(teamId, dealId);
  if (!current) return null;

  const patch: Partial<typeof teamDeals.$inferInsert> = { updatedBy: actorId, updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.customerId !== undefined) patch.customerId = input.customerId;
  if (input.contactId !== undefined) patch.contactId = input.contactId;
  if (input.value !== undefined) patch.value = input.value;
  if (input.currency !== undefined) patch.currency = input.currency.toUpperCase();
  if (input.probability !== undefined) patch.probability = input.probability;
  if (input.expectedCloseDate !== undefined) patch.expectedCloseDate = input.expectedCloseDate;
  if (input.ownerId !== undefined) patch.ownerId = input.ownerId;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.stage !== undefined) patch.stage = input.stage;

  const [deal] = await db
    .update(teamDeals)
    .set(patch)
    .where(and(eq(teamDeals.id, dealId), eq(teamDeals.teamId, teamId)))
    .returning();

  await logDealActivity(teamId, actorId, 'DEAL_UPDATED', { dealId, fields: Object.keys(patch) });
  return deal ?? null;
}

/**
 * Mueve una oportunidad de etapa y de posición.
 *
 * Deliberadamente NO factura, ni siquiera al mover a `closed_won`: el kanban
 * dispara esto en cada arrastre, y un arrastre accidental no puede emitir una
 * venta. El cierre real vive en `closeDealAsWon`, que pide confirmación e
 * idempotencia.
 */
export async function moveDeal(
  teamId: number,
  dealId: number,
  input: { stage: DealStage; position: number },
  actorId: number | null,
): Promise<Deal | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(teamDeals)
      .where(and(eq(teamDeals.id, dealId), eq(teamDeals.teamId, teamId)))
      .limit(1);
    if (!current) return null;

    const target = Math.max(0, Math.trunc(input.position));

    // Hueco en la columna destino.
    await tx
      .update(teamDeals)
      .set({ position: sql`${teamDeals.position} + 1` })
      .where(
        and(
          eq(teamDeals.teamId, teamId),
          eq(teamDeals.stage, input.stage),
          gte(teamDeals.position, target),
        ),
      );

    // Cierra el hueco que deja en la columna de origen.
    if (current.stage !== input.stage) {
      await tx
        .update(teamDeals)
        .set({ position: sql`${teamDeals.position} - 1` })
        .where(
          and(
            eq(teamDeals.teamId, teamId),
            eq(teamDeals.stage, current.stage),
            sql`${teamDeals.position} > ${current.position}`,
          ),
        );
    }

    const stageChanged = current.stage !== input.stage;
    // La probabilidad sólo se ajusta si seguía en el valor por defecto de su
    // etapa anterior. Un número puesto a mano se respeta.
    const keepsDefault = current.probability === STAGE_DEFAULT_PROBABILITY[current.stage];

    const [deal] = await tx
      .update(teamDeals)
      .set({
        stage: input.stage,
        position: target,
        probability:
          stageChanged && keepsDefault ? STAGE_DEFAULT_PROBABILITY[input.stage] : current.probability,
        updatedBy: actorId,
        updatedAt: new Date(),
      })
      .where(and(eq(teamDeals.id, dealId), eq(teamDeals.teamId, teamId)))
      .returning();

    if (stageChanged) {
      await tx.insert(activityLogs).values({
        teamId,
        userId: actorId,
        action: 'DEAL_STAGE_CHANGED',
        metadata: { dealId, from: current.stage, to: input.stage },
      });
    }
    return deal ?? null;
  });
}

export async function deleteDeal(
  teamId: number,
  dealId: number,
  actorId: number | null,
): Promise<boolean> {
  const deleted = await db
    .delete(teamDeals)
    .where(and(eq(teamDeals.id, dealId), eq(teamDeals.teamId, teamId)))
    .returning({ id: teamDeals.id });
  if (!deleted.length) return false;
  // La venta enlazada sobrevive: `team_sales.deal_id` es ON DELETE SET NULL.
  await logDealActivity(teamId, actorId, 'DEAL_DELETED', { dealId });
  return true;
}

export async function dealStats(teamId: number, currency = 'USD'): Promise<DealStats> {
  const rows = await db
    .select({
      stage: teamDeals.stage,
      count: sql<number>`count(*)`,
      value: sql<number>`COALESCE(SUM(${teamDeals.value}), 0)`,
      weighted: sql<number>`COALESCE(SUM(${teamDeals.value} * ${teamDeals.probability} / 100), 0)`,
    })
    .from(teamDeals)
    .where(eq(teamDeals.teamId, teamId))
    .groupBy(teamDeals.stage);

  const byStage = rows.map((row) => ({
    stage: row.stage as DealStage,
    count: Number(row.count) || 0,
    value: Number(row.value) || 0,
    weightedValue: Math.round(Number(row.weighted) || 0),
  }));

  const open = byStage.filter((row) => (OPEN_STAGES as readonly string[]).includes(row.stage));
  const openCount = open.reduce((sum, row) => sum + row.count, 0);
  const totalValue = open.reduce((sum, row) => sum + row.value, 0);

  return {
    totalValue,
    openCount,
    // Sin oportunidades abiertas el promedio es 0, no NaN.
    averageValue: openCount > 0 ? Math.round(totalValue / openCount) : 0,
    currency,
    byStage,
  };
}
