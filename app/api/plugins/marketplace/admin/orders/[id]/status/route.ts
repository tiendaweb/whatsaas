import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { marketplaceOrderStatusEvents, marketplaceOrders } from '@/lib/db/schema';
import {
  activateMarketplaceEntitlement,
  revokeMarketplaceEntitlement,
} from '@/lib/plugins/marketplace/server/entitlements';
import { getMarketplaceAdminContext } from '../../../../_lib/context';

const updateStatusSchema = z.object({
  status: z.enum(['approved', 'rejected', 'canceled']),
  paymentMethod: z.enum(['manual_transfer', 'mercadopago', 'stripe', 'cash', 'other']).default('other'),
  reason: z.string().max(1000).nullable().optional(),
});

function parseOrderId(raw: string) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getMarketplaceAdminContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const orderId = parseOrderId(id);
  if (!orderId) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(marketplaceOrders)
    .where(eq(marketplaceOrders.id, orderId))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  if (existing.status !== 'pending_review') {
    return NextResponse.json({ error: 'Only pending_review orders can be updated.' }, { status: 409 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(marketplaceOrders)
      .set({
        status: parsed.data.status,
        reviewedBy: context.user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(marketplaceOrders.id, orderId), eq(marketplaceOrders.status, 'pending_review')));

    await tx.insert(marketplaceOrderStatusEvents).values({
      orderId,
      teamId: existing.teamId,
      previousStatus: existing.status,
      nextStatus: parsed.data.status,
      changedBy: context.user.id,
      reason: parsed.data.reason ?? null,
      metadata: {
        reviewedBy: context.user.id,
        paymentMethod: parsed.data.paymentMethod,
        auditScope: 'order_review',
      },
      createdAt: new Date(),
    });

    if (parsed.data.status === 'approved') {
      const entitlementWindow = await activateMarketplaceEntitlement({
        teamId: existing.teamId,
        itemId: existing.itemId,
        sourceOrderId: orderId,
        changedBy: context.user.id,
        executor: tx,
      });

      await tx.insert(marketplaceOrderStatusEvents).values({
        orderId,
        teamId: existing.teamId,
        previousStatus: parsed.data.status,
        nextStatus: 'entitlement_active',
        changedBy: context.user.id,
        reason: 'Entitlement activado tras aprobación.',
        metadata: {
          paymentMethod: parsed.data.paymentMethod,
          entitlement: {
            startsAt: entitlementWindow.startsAt.toISOString(),
            endsAt: entitlementWindow.endsAt?.toISOString() ?? null,
            billingType: entitlementWindow.billingType,
            durationDays: entitlementWindow.durationDays,
          },
          auditScope: 'entitlement',
        },
        createdAt: new Date(),
      });
    }

    if (parsed.data.status === 'rejected' || parsed.data.status === 'canceled') {
      const revokedWindow = await revokeMarketplaceEntitlement({
        teamId: existing.teamId,
        itemId: existing.itemId,
        sourceOrderId: orderId,
        changedBy: context.user.id,
        executor: tx,
      });

      await tx.insert(marketplaceOrderStatusEvents).values({
        orderId,
        teamId: existing.teamId,
        previousStatus: parsed.data.status,
        nextStatus: 'entitlement_revoked',
        changedBy: context.user.id,
        reason: parsed.data.reason ?? 'Entitlement revocado por revisión.',
        metadata: {
          paymentMethod: parsed.data.paymentMethod,
          entitlement: {
            startsAt: revokedWindow.startsAt.toISOString(),
            endsAt: revokedWindow.endsAt?.toISOString() ?? null,
          },
          auditScope: 'entitlement',
        },
        createdAt: new Date(),
      });
    }
  });

  const updated = await db.query.marketplaceOrders.findFirst({
    where: eq(marketplaceOrders.id, orderId),
    with: {
      item: true,
      team: { columns: { id: true, name: true } },
      lines: { with: { price: true } },
      statusEvents: true,
    },
  });

  return NextResponse.json(updated);
}
