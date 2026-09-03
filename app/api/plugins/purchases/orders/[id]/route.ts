import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamPurchaseOrderItems, teamPurchaseOrders, teamVendors } from '@/lib/db/schema';
import { getPurchasesRequestContext } from '@/lib/plugins/purchases/server/access';
import { assertVendorInTeam, computeOrderTotals, purchaseOrderSchema } from '@/lib/plugins/purchases/server/schema';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPurchasesRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const order = await db.query.teamPurchaseOrders.findFirst({
    where: and(eq(teamPurchaseOrders.id, id), eq(teamPurchaseOrders.teamId, ctx.team.id)),
  });
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const [vendor, items] = await Promise.all([
    db.query.teamVendors.findFirst({ where: eq(teamVendors.id, order.vendorId) }),
    db.select().from(teamPurchaseOrderItems).where(eq(teamPurchaseOrderItems.purchaseOrderId, id)),
  ]);

  return NextResponse.json({ ...order, vendor, items });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPurchasesRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const existing = await db.query.teamPurchaseOrders.findFirst({
    where: and(eq(teamPurchaseOrders.id, id), eq(teamPurchaseOrders.teamId, ctx.team.id)),
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = purchaseOrderSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.vendorId) {
    try {
      await assertVendorInTeam(ctx.team.id, parsed.data.vendorId);
    } catch {
      return NextResponse.json({ error: 'invalid_vendor' }, { status: 400 });
    }
  }

  const order = await db.transaction(async (tx) => {
    if (parsed.data.items) {
      await tx.delete(teamPurchaseOrderItems).where(eq(teamPurchaseOrderItems.purchaseOrderId, id));
      if (parsed.data.items.length) {
        await tx.insert(teamPurchaseOrderItems).values(
          parsed.data.items.map((item) => ({
            teamId: ctx.team.id,
            purchaseOrderId: id,
            articleId: item.articleId ?? null,
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            totalAmount: item.quantity * item.unitAmount,
            receivedQuantity: item.receivedQuantity,
          })),
        );
      }
    }

    const currentItems = parsed.data.items
      ?? (await tx.select().from(teamPurchaseOrderItems).where(eq(teamPurchaseOrderItems.purchaseOrderId, id)));
    const taxAmount = parsed.data.taxAmount ?? existing.taxAmount;
    const totals = computeOrderTotals(currentItems, taxAmount);

    const { items: _items, ...patchFields } = parsed.data;
    const [updated] = await tx.update(teamPurchaseOrders).set({
      ...patchFields,
      subtotalAmount: totals.subtotalAmount,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(and(eq(teamPurchaseOrders.id, id), eq(teamPurchaseOrders.teamId, ctx.team.id))).returning();

    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'PURCHASES_ORDER_UPDATED', ipAddress: String(id) });
    return updated;
  });

  return NextResponse.json(order);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPurchasesRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const existing = await db.query.teamPurchaseOrders.findFirst({
    where: and(eq(teamPurchaseOrders.id, id), eq(teamPurchaseOrders.teamId, ctx.team.id)),
    columns: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.status !== 'draft') return NextResponse.json({ error: 'only_draft_can_be_deleted' }, { status: 409 });

  await db.delete(teamPurchaseOrders).where(and(eq(teamPurchaseOrders.id, id), eq(teamPurchaseOrders.teamId, ctx.team.id)));
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'PURCHASES_ORDER_DELETED', ipAddress: String(id) });
  return NextResponse.json({ ok: true });
}
