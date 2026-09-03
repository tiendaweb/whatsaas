import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  teamDeals,
  teamSales,
  type SaleItem,
} from '@/lib/db/schema';
import { convertContactToCustomer, customerForContact } from '@/lib/customers/service';
import { createDeal, getDeal, logDealActivity, type Deal } from './service';
import { STAGE_DEFAULT_PROBABILITY, type DealStage } from './types';

export type Sale = typeof teamSales.$inferSelect;

export type ConvertLeadInput = {
  contactId: number;
  customerId?: number | null;
  title: string;
  value?: number;
  currency?: string;
  stage?: Extract<DealStage, 'qualified' | 'proposal' | 'negotiation'>;
  probability?: number;
  expectedCloseDate?: Date | null;
  ownerId?: number | null;
};

/**
 * Prospecto → Oportunidad.
 *
 * Si el contacto todavía no es cliente, se crea la ficha primero: una
 * oportunidad sin cliente no se puede reportar por cliente, que es el uso
 * principal del embudo.
 *
 * Lo que a propósito NO hace: mover al contacto de etapa del embudo. Prospecto y
 * oportunidad son ciclos distintos —un contacto puede tener tres oportunidades
 * abiertas y seguir en la misma etapa—, así que moverlo es decisión del equipo.
 * Tampoco deduplica: venderle dos veces al mismo cliente es normal.
 */
export async function convertLeadToDeal(
  teamId: number,
  input: ConvertLeadInput,
  actorId: number | null,
): Promise<{ deal: Deal; customerId: number | null; customerCreated: boolean }> {
  let customerId = input.customerId ?? null;
  let customerCreated = false;

  if (!customerId) {
    const existing = await customerForContact(teamId, input.contactId);
    if (existing) {
      customerId = existing.id;
    } else {
      const result = await convertContactToCustomer(teamId, input.contactId, {}, actorId);
      customerId = result.customer.id;
      customerCreated = result.created;
    }
  }

  const stage = input.stage ?? 'qualified';
  const deal = await createDeal(
    teamId,
    {
      title: input.title,
      customerId,
      contactId: input.contactId,
      stage,
      value: input.value ?? 0,
      currency: input.currency ?? 'USD',
      probability: input.probability ?? STAGE_DEFAULT_PROBABILITY[stage],
      expectedCloseDate: input.expectedCloseDate ?? null,
      ownerId: input.ownerId ?? actorId,
      source: 'lead',
    },
    actorId,
  );

  await logDealActivity(teamId, actorId, 'DEAL_CREATED_FROM_CONTACT', {
    dealId: deal.id,
    contactId: input.contactId,
    customerId,
  });

  return { deal, customerId, customerCreated };
}

/**
 * Numeración de ventas, con el mismo formato `V-0001` que ya usa el conector
 * (`finance-actions.ts`). No se reimplementa el criterio para no tener dos
 * numeradores distintos conviviendo.
 *
 * ⚠️ Cuenta filas: con dos cierres concurrentes puede repetir número. Ya pasa hoy
 * con las ventas manuales. Si aparece en producción se arregla con una secuencia
 * en la base, no con reintentos — un reintento sobre un contador que cuenta filas
 * vuelve a dar el mismo número.
 */
async function nextSaleNumber(tx: typeof db, teamId: number): Promise<string> {
  const [row] = await tx
    .select({ total: sql<number>`count(*)` })
    .from(teamSales)
    .where(eq(teamSales.teamId, teamId));
  return `V-${String((Number(row?.total) || 0) + 1).padStart(4, '0')}`;
}

export type CloseWonInput = {
  items?: SaleItem[];
  currency?: string;
  dueDate?: Date | null;
  /** Obligatoria: es lo único que impide facturar dos veces el mismo cierre. */
  idempotencyKey: string;
  /** `false` marca la oportunidad como ganada sin emitir la venta. */
  createSale?: boolean;
};

export type CloseWonResult = {
  deal: Deal;
  sale: Sale | null;
  /** `true` si la venta ya existía y no se creó ninguna nueva. */
  reused: boolean;
};

/**
 * Oportunidad → Venta.
 *
 * Es el único punto del rediseño que crea un hecho contable, así que las tres
 * defensas van juntas y ninguna es opcional:
 *
 *  1. **Transacción.** El deal pasa a ganado, se crea la venta y se enlazan en
 *     ambos sentidos, o no pasa nada. Nunca queda un deal ganado sin venta ni una
 *     venta huérfana.
 *  2. **`sale_id` ya presente ⇒ se devuelve la existente.** El caso que rompe
 *     sistemas no es el doble clic sino reabrir una oportunidad ganada y volver a
 *     ganarla semanas después.
 *  3. **Clave de idempotencia** con índice único parcial en `team_sales`
 *     (migración 0089). Cubre el doble clic y el reintento del conector.
 */
export async function closeDealAsWon(
  teamId: number,
  dealId: number,
  input: CloseWonInput,
  actorId: number | null,
): Promise<CloseWonResult | null> {
  return db.transaction(async (tx) => {
    const [deal] = await tx
      .select()
      .from(teamDeals)
      .where(and(eq(teamDeals.id, dealId), eq(teamDeals.teamId, teamId)))
      .limit(1);
    if (!deal) return null;

    // Defensa 2: la oportunidad ya generó su venta.
    if (deal.saleId) {
      const [existing] = await tx
        .select()
        .from(teamSales)
        .where(and(eq(teamSales.id, deal.saleId), eq(teamSales.teamId, teamId)))
        .limit(1);
      if (existing) return { deal, sale: existing, reused: true };
    }

    // Defensa 3: el mismo cierre ya se ejecutó con esta clave.
    const [byKey] = await tx
      .select()
      .from(teamSales)
      .where(
        and(eq(teamSales.teamId, teamId), eq(teamSales.idempotencyKey, input.idempotencyKey)),
      )
      .limit(1);
    if (byKey) {
      const [linked] = await tx
        .update(teamDeals)
        .set({ stage: 'closed_won', closedAt: deal.closedAt ?? new Date(), saleId: byKey.id })
        .where(and(eq(teamDeals.id, dealId), eq(teamDeals.teamId, teamId)))
        .returning();
      return { deal: linked ?? deal, sale: byKey, reused: true };
    }

    const closedAt = new Date();
    let sale: Sale | null = null;

    if (input.createSale !== false) {
      const currency = (input.currency ?? deal.currency).toUpperCase();
      const items: SaleItem[] =
        input.items?.length
          ? input.items
          : [
              {
                articleId: null,
                name: deal.title,
                sku: '',
                quantity: 1,
                unitPrice: deal.value,
                total: deal.value,
              },
            ];
      const subtotal = items.reduce((sum, item) => sum + item.total, 0);

      const [created] = await tx
        .insert(teamSales)
        .values({
          teamId,
          contactId: deal.contactId,
          customerId: deal.customerId,
          dealId: deal.id,
          idempotencyKey: input.idempotencyKey,
          saleNumber: await nextSaleNumber(tx as unknown as typeof db, teamId),
          status: 'confirmed',
          currency,
          items,
          subtotal,
          total: subtotal,
          notes: deal.notes,
          dueDate: input.dueDate ?? null,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning();
      sale = created;
    }

    const [closed] = await tx
      .update(teamDeals)
      .set({
        stage: 'closed_won',
        probability: 100,
        closedAt,
        saleId: sale?.id ?? null,
        updatedBy: actorId,
        updatedAt: closedAt,
      })
      .where(and(eq(teamDeals.id, dealId), eq(teamDeals.teamId, teamId)))
      .returning();

    await tx.insert(activityLogs).values({
      teamId,
      userId: actorId,
      action: 'DEAL_WON',
      metadata: { dealId, saleId: sale?.id ?? null, value: deal.value, currency: deal.currency },
    });

    return { deal: closed ?? deal, sale, reused: false };
  });
}

/** Perder una oportunidad no toca nada de ventas. */
export async function closeDealAsLost(
  teamId: number,
  dealId: number,
  reason: string,
  actorId: number | null,
): Promise<Deal | null> {
  const current = await getDeal(teamId, dealId);
  if (!current) return null;

  const [deal] = await db
    .update(teamDeals)
    .set({
      stage: 'closed_lost',
      probability: 0,
      closedAt: new Date(),
      lostReason: reason.trim(),
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(and(eq(teamDeals.id, dealId), eq(teamDeals.teamId, teamId)))
    .returning();

  await logDealActivity(teamId, actorId, 'DEAL_LOST', { dealId, reason: reason.trim() });
  return deal ?? null;
}
