import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { marketplaceItemPrices, marketplaceItems } from '@/lib/db/schema';
import { getMarketplaceAdminContext, getMarketplaceContext } from '../../_lib/context';
import { getBranding } from '@/lib/db/queries/branding';
import { getTenant } from '@/lib/tenant/context';
import { buildBrandIdentity, renderTenantCopy } from '@/lib/branding/constants';

const updateItemSchema = z.object({
  title: z.string().min(1).max(180).optional(),
  subtitle: z.string().max(255).nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
  category: z.string().min(1).max(80).optional(),
  tags: z.array(z.string()).optional(),
  interfaceBlocks: z.array(z.record(z.string(), z.unknown())).optional(),
  customFields: z.array(z.record(z.string(), z.unknown())).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
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
  if (!itemId) {
    return NextResponse.json({ error: 'Invalid item id.' }, { status: 400 });
  }

  const [item, branding, tenant] = await Promise.all([
    db.query.marketplaceItems.findFirst({ where: eq(marketplaceItems.id, itemId) }),
    getBranding(),
    getTenant(),
  ]);
  if (!item) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const prices = await db
    .select()
    .from(marketplaceItemPrices)
    .where(eq(marketplaceItemPrices.itemId, itemId))
    .orderBy(asc(marketplaceItemPrices.amount));

  const identity = buildBrandIdentity(branding, tenant?.hostname);
  return NextResponse.json(renderTenantCopy({ ...item, prices }, identity));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getMarketplaceAdminContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const itemId = parseId(id);
  if (!itemId) {
    return NextResponse.json({ error: 'Invalid item id.' }, { status: 400 });
  }

  const body = await request.json();
  const parsed = updateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [updated] = await db
    .update(marketplaceItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(marketplaceItems.id, itemId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getMarketplaceAdminContext();
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { id } = await params;
  const itemId = parseId(id);
  if (!itemId) {
    return NextResponse.json({ error: 'Invalid item id.' }, { status: 400 });
  }

  await db.delete(marketplaceItems).where(eq(marketplaceItems.id, itemId));
  return NextResponse.json({ ok: true });
}
