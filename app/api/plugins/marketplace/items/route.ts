import { NextResponse } from 'next/server';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { marketplaceItemPrices, marketplaceItems } from '@/lib/db/schema';
import { getMarketplaceAdminContext, getMarketplaceContext } from '../_lib/context';
import { getBranding } from '@/lib/db/queries/branding';
import { getTenant } from '@/lib/tenant/context';
import { buildBrandIdentity, renderTenantCopy } from '@/lib/branding/constants';

const createItemSchema = z.object({
  title: z.string().min(1).max(180),
  subtitle: z.string().max(255).nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
  category: z.string().min(1).max(80).default('general'),
  tags: z.array(z.string()).default([]),
  interfaceBlocks: z.array(z.record(z.string(), z.unknown())).default([]),
  customFields: z.array(z.record(z.string(), z.unknown())).default([]),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
});

export async function GET() {
  const context = await getMarketplaceContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const [items, branding, tenant] = await Promise.all([
    db
      .select()
      .from(marketplaceItems)
      .where(eq(marketplaceItems.status, 'active'))
      .orderBy(desc(marketplaceItems.updatedAt)),
    getBranding(),
    getTenant(),
  ]);
  const identity = buildBrandIdentity(branding, tenant?.hostname);

  const itemIds = items.map((item) => item.id);
  const prices = itemIds.length
    ? await db
        .select()
        .from(marketplaceItemPrices)
        .where(inArray(marketplaceItemPrices.itemId, itemIds))
        .orderBy(asc(marketplaceItemPrices.amount))
    : [];

  const pricesByItem = new Map<number, typeof prices>();
  for (const price of prices) {
    const arr = pricesByItem.get(price.itemId) ?? [];
    arr.push(price);
    pricesByItem.set(price.itemId, arr);
  }

  return NextResponse.json(
    items.map((item) =>
      renderTenantCopy({ ...item, prices: pricesByItem.get(item.id) ?? [] }, identity),
    ),
  );
}

export async function POST(request: Request) {
  const context = await getMarketplaceAdminContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const body = await request.json();
  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [created] = await db
    .insert(marketplaceItems)
    .values({
      ...parsed.data,
      subtitle: parsed.data.subtitle ?? null,
      iconUrl: parsed.data.iconUrl ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      description: parsed.data.description ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
