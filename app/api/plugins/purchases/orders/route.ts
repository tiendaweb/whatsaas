import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamPurchaseOrderItems, teamPurchaseOrders, teamVendors } from '@/lib/db/schema';
import { getPurchasesRequestContext } from '@/lib/plugins/purchases/server/access';
import { assertVendorInTeam, computeOrderTotals, purchaseOrderSchema } from '@/lib/plugins/purchases/server/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getPurchasesRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  const where = status
    ? and(eq(teamPurchaseOrders.teamId, ctx.team.id), eq(teamPurchaseOrders.status, status as never))
    : eq(teamPurchaseOrders.teamId, ctx.team.id);

  const orders = await db
    .select({
      id: teamPurchaseOrders.id,
      orderNumber: teamPurchaseOrders.orderNumber,
      status: teamPurchaseOrders.status,
      currency: teamPurchaseOrders.currency,
      totalAmount: teamPurchaseOrders.totalAmount,
      expectedDate: teamPurchaseOrders.expectedDate,
      receivedDate: teamPurchaseOrders.receivedDate,
      createdAt: teamPurchaseOrders.createdAt,
      vendorId: teamPurchaseOrders.vendorId,
      vendorName: teamVendors.name,
    })
    .from(teamPurchaseOrders)
    .innerJoin(teamVendors, eq(teamVendors.id, teamPurchaseOrders.vendorId))
    .where(where)
    .orderBy(desc(teamPurchaseOrders.createdAt));

  return NextResponse.json(orders);
}

export async function POST(request: Request) {
  const ctx = await getPurchasesRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = purchaseOrderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await assertVendorInTeam(ctx.team.id, parsed.data.vendorId);
  } catch {
    return NextResponse.json({ error: 'invalid_vendor' }, { status: 400 });
  }

  const { items, ...orderInput } = parsed.data;
  const totals = computeOrderTotals(items, orderInput.taxAmount);

  const order = await db.transaction(async (tx) => {
    const [created] = await tx.insert(teamPurchaseOrders).values({
      teamId: ctx.team.id,
      vendorId: orderInput.vendorId,
      status: orderInput.status,
      currency: orderInput.currency,
      subtotalAmount: totals.subtotalAmount,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      expectedDate: orderInput.expectedDate ?? null,
      receivedDate: orderInput.receivedDate ?? null,
      notes: orderInput.notes,
      orderNumber: 'PENDING',
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    }).returning();

    const orderNumber = `OC-${String(created.id).padStart(6, '0')}`;
    const [updated] = await tx.update(teamPurchaseOrders)
      .set({ orderNumber })
      .where(eq(teamPurchaseOrders.id, created.id))
      .returning();

    if (items.length) {
      await tx.insert(teamPurchaseOrderItems).values(
        items.map((item) => ({
          teamId: ctx.team.id,
          purchaseOrderId: created.id,
          articleId: item.articleId ?? null,
          description: item.description,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          totalAmount: item.quantity * item.unitAmount,
          receivedQuantity: item.receivedQuantity,
        })),
      );
    }

    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'PURCHASES_ORDER_CREATED', ipAddress: orderNumber });
    return updated;
  });

  return NextResponse.json(order, { status: 201 });
}
