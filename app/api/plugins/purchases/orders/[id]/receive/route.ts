import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamPurchaseOrderItems, teamPurchaseOrders } from '@/lib/db/schema';
import { getPurchasesRequestContext } from '@/lib/plugins/purchases/server/access';

const receiveSchema = z.object({
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  items: z.array(z.object({ id: z.number().int().positive(), receivedQuantity: z.number().int().min(0) })).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPurchasesRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const existing = await db.query.teamPurchaseOrders.findFirst({
    where: and(eq(teamPurchaseOrders.id, id), eq(teamPurchaseOrders.teamId, ctx.team.id)),
    columns: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.status === 'cancelled') return NextResponse.json({ error: 'order_cancelled' }, { status: 409 });

  const parsed = receiveSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const order = await db.transaction(async (tx) => {
    if (parsed.data.items?.length) {
      for (const item of parsed.data.items) {
        await tx.update(teamPurchaseOrderItems)
          .set({ receivedQuantity: item.receivedQuantity, updatedAt: new Date() })
          .where(and(eq(teamPurchaseOrderItems.id, item.id), eq(teamPurchaseOrderItems.purchaseOrderId, id)));
      }
    } else {
      const items = await tx.select().from(teamPurchaseOrderItems).where(eq(teamPurchaseOrderItems.purchaseOrderId, id));
      for (const item of items) {
        await tx.update(teamPurchaseOrderItems)
          .set({ receivedQuantity: item.quantity, updatedAt: new Date() })
          .where(eq(teamPurchaseOrderItems.id, item.id));
      }
    }

    const [updated] = await tx.update(teamPurchaseOrders).set({
      status: 'received',
      receivedDate: parsed.data.receivedDate ?? new Date().toISOString().slice(0, 10),
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(and(eq(teamPurchaseOrders.id, id), eq(teamPurchaseOrders.teamId, ctx.team.id))).returning();

    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'PURCHASES_ORDER_RECEIVED', ipAddress: String(id) });
    return updated;
  });

  return NextResponse.json(order);
}
