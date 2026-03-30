import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { marketplaceItemPrices } from '@/lib/db/schema';
import { getMarketplaceAdminContext, getMarketplaceContext } from '../../../../_lib/context';

const updatePriceSchema = z.object({
  billingType: z.enum(['free', 'monthly', 'yearly', 'setup']).optional(),
  amount: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  enabled: z.boolean().optional(),
});

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; priceId: string }> },
) {
  const context = await getMarketplaceAdminContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id, priceId } = await params;
  const itemId = parseId(id);
  const parsedPriceId = parseId(priceId);
  if (!itemId || !parsedPriceId) {
    return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = updatePriceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(marketplaceItemPrices)
    .set({
      ...parsed.data,
      currency: parsed.data.currency?.toLowerCase(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceItemPrices.id, parsedPriceId),
        eq(marketplaceItemPrices.itemId, itemId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string; priceId: string }> },
) {
  const context = await getMarketplaceAdminContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id, priceId } = await params;
  const itemId = parseId(id);
  const parsedPriceId = parseId(priceId);
  if (!itemId || !parsedPriceId) {
    return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  }

  await db
    .delete(marketplaceItemPrices)
    .where(and(eq(marketplaceItemPrices.id, parsedPriceId), eq(marketplaceItemPrices.itemId, itemId)));

  return NextResponse.json({ ok: true });
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; priceId: string }> },
) {
  const context = await getMarketplaceContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id, priceId } = await params;
  const itemId = parseId(id);
  const parsedPriceId = parseId(priceId);
  if (!itemId || !parsedPriceId) {
    return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  }

  const price = await db.query.marketplaceItemPrices.findFirst({
    where: and(eq(marketplaceItemPrices.id, parsedPriceId), eq(marketplaceItemPrices.itemId, itemId)),
  });

  if (!price) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  return NextResponse.json(price);
}
