import { NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  marketplaceItemPrices,
  marketplaceItems,
  marketplaceOrderLines,
  marketplaceOrders,
  marketplaceOrderStatusEvents,
} from '@/lib/db/schema';
import { getMarketplaceContext } from '../_lib/context';

const createOrderSchema = z.object({
  itemId: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        priceId: z.number().int().positive(),
        quantity: z.number().int().positive().default(1),
      }),
    )
    .min(1),
});

export async function GET() {
  const context = await getMarketplaceContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const orders = await db.query.marketplaceOrders.findMany({
    where: eq(marketplaceOrders.teamId, context.team.id),
    with: {
      item: true,
      lines: {
        with: {
          price: true,
        },
      },
      statusEvents: true,
    },
    orderBy: [desc(marketplaceOrders.createdAt)],
  });

  return NextResponse.json(orders);
}

export async function POST(request: Request) {
  const context = await getMarketplaceContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const body = await request.json();
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await db.query.marketplaceItems.findFirst({ where: eq(marketplaceItems.id, parsed.data.itemId) });
  if (!item || item.status !== 'active') {
    return NextResponse.json({ error: 'Item unavailable.' }, { status: 404 });
  }

  const uniquePriceIds = [...new Set(parsed.data.lines.map((line) => line.priceId))];
  const prices = await db
    .select()
    .from(marketplaceItemPrices)
    .where(
      and(
        eq(marketplaceItemPrices.itemId, parsed.data.itemId),
        eq(marketplaceItemPrices.enabled, true),
        inArray(marketplaceItemPrices.id, uniquePriceIds),
      ),
    );

  const priceById = new Map(prices.map((price) => [price.id, price]));
  if (priceById.size !== uniquePriceIds.length) {
    return NextResponse.json({ error: 'One or more prices are invalid/disabled for this item.' }, { status: 400 });
  }

  const currencies = new Set(prices.map((price) => price.currency.toLowerCase()));
  if (currencies.size > 1) {
    return NextResponse.json({ error: 'Order lines must use the same currency.' }, { status: 400 });
  }

  const total = parsed.data.lines.reduce((acc, line) => {
    const price = priceById.get(line.priceId)!;
    return acc + price.amount * line.quantity;
  }, 0);

  const [order] = await db.transaction(async (tx) => {
    const [createdOrder] = await tx
      .insert(marketplaceOrders)
      .values({
        teamId: context.team.id,
        itemId: parsed.data.itemId,
        status: 'pending_review',
        total,
        requestedBy: context.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await tx.insert(marketplaceOrderLines).values(
      parsed.data.lines.map((line) => {
        const price = priceById.get(line.priceId)!;
        return {
          orderId: createdOrder.id,
          priceId: line.priceId,
          quantity: line.quantity,
          unitAmount: price.amount,
          currency: price.currency,
          createdAt: new Date(),
        };
      }),
    );

    await tx.insert(marketplaceOrderStatusEvents).values({
      orderId: createdOrder.id,
      teamId: context.team.id,
      previousStatus: null,
      nextStatus: 'pending_review',
      changedBy: context.user.id,
      metadata: {
        itemId: parsed.data.itemId,
        lines: parsed.data.lines,
      },
      createdAt: new Date(),
    });

    return [createdOrder];
  });

  const hydrated = await db.query.marketplaceOrders.findFirst({
    where: and(eq(marketplaceOrders.id, order.id), eq(marketplaceOrders.teamId, context.team.id)),
    with: { item: true, lines: { with: { price: true } }, statusEvents: true },
  });

  return NextResponse.json(hydrated, { status: 201 });
}
