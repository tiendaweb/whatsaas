import { NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { marketplaceOrderStatusEvents, marketplaceOrders } from '@/lib/db/schema';
import { getMarketplaceAdminContext } from '../../_lib/context';

const reviewStatuses = ['pending_review', 'approved', 'rejected', 'canceled', 'all'] as const;

export async function GET(request: Request) {
  const context = await getMarketplaceAdminContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const statusFilter = statusParam && reviewStatuses.includes(statusParam as (typeof reviewStatuses)[number])
    ? statusParam
    : 'pending_review';

  const orders = await db.query.marketplaceOrders.findMany({
    where: statusFilter === 'all'
      ? undefined
      : eq(marketplaceOrders.status, statusFilter),
    with: {
      item: true,
      team: { columns: { id: true, name: true } },
      requestedByUser: { columns: { id: true, name: true, email: true } },
      reviewedByUser: { columns: { id: true, name: true, email: true } },
      lines: { with: { price: true } },
    },
    orderBy: [desc(marketplaceOrders.createdAt)],
  });

  const orderIds = orders.map((order) => order.id);
  const events = orderIds.length
    ? await db
        .select()
        .from(marketplaceOrderStatusEvents)
        .where(inArray(marketplaceOrderStatusEvents.orderId, orderIds))
        .orderBy(desc(marketplaceOrderStatusEvents.createdAt))
    : [];

  const eventsByOrder = new Map<number, typeof events>();
  for (const event of events) {
    const current = eventsByOrder.get(event.orderId) ?? [];
    current.push(event);
    eventsByOrder.set(event.orderId, current);
  }

  return NextResponse.json(
    orders.map((order) => ({
      ...order,
      statusEvents: eventsByOrder.get(order.id) ?? [],
    })),
  );
}
