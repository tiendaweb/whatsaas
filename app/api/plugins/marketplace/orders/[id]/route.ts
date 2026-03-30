import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { marketplaceOrders } from '@/lib/db/schema';
import { getMarketplaceContext } from '../../_lib/context';

function parseOrderId(raw: string) {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getMarketplaceContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const orderId = parseOrderId(id);
  if (!orderId) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 });
  }

  const order = await db.query.marketplaceOrders.findFirst({
    where: and(eq(marketplaceOrders.id, orderId), eq(marketplaceOrders.teamId, context.team.id)),
    with: {
      item: true,
      lines: { with: { price: true } },
      statusEvents: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  return NextResponse.json(order);
}
