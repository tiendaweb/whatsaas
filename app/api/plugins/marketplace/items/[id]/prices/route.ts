import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { marketplaceItemPrices, marketplaceItems } from '@/lib/db/schema';
import { getMarketplaceAdminContext, getMarketplaceContext } from '../../../_lib/context';

const createPriceSchema = z.object({
  billingType: z.enum(['free', 'monthly', 'yearly', 'setup']),
  amount: z.number().int().min(0),
  currency: z.string().length(3).default('usd'),
  enabled: z.boolean().default(true),
});

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getMarketplaceContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const itemId = parseId(id);
  if (!itemId) return NextResponse.json({ error: 'Invalid item id.' }, { status: 400 });

  const prices = await db
    .select()
    .from(marketplaceItemPrices)
    .where(eq(marketplaceItemPrices.itemId, itemId))
    .orderBy(asc(marketplaceItemPrices.amount));

  return NextResponse.json(prices);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getMarketplaceAdminContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const itemId = parseId(id);
  if (!itemId) return NextResponse.json({ error: 'Invalid item id.' }, { status: 400 });

  const item = await db.query.marketplaceItems.findFirst({ where: eq(marketplaceItems.id, itemId) });
  if (!item) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });

  const body = await request.json();
  const parsed = createPriceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(marketplaceItemPrices)
    .values({
      itemId,
      billingType: parsed.data.billingType,
      amount: parsed.data.amount,
      currency: parsed.data.currency.toLowerCase(),
      enabled: parsed.data.enabled,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
