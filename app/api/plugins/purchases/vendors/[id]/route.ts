import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamPurchaseOrders, teamVendors } from '@/lib/db/schema';
import { getPurchasesRequestContext } from '@/lib/plugins/purchases/server/access';
import { vendorSchema } from '@/lib/plugins/purchases/server/schema';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPurchasesRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = vendorSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [vendor] = await db.update(teamVendors).set({
    ...parsed.data,
    updatedBy: ctx.user.id,
    updatedAt: new Date(),
  }).where(and(eq(teamVendors.id, id), eq(teamVendors.teamId, ctx.team.id))).returning();
  if (!vendor) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'PURCHASES_VENDOR_UPDATED', ipAddress: String(id) });
  return NextResponse.json(vendor);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPurchasesRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const [linkedOrder] = await db.select({ id: teamPurchaseOrders.id }).from(teamPurchaseOrders)
    .where(and(eq(teamPurchaseOrders.vendorId, id), eq(teamPurchaseOrders.teamId, ctx.team.id))).limit(1);
  if (linkedOrder) return NextResponse.json({ error: 'vendor_in_use' }, { status: 409 });

  const [deleted] = await db.delete(teamVendors)
    .where(and(eq(teamVendors.id, id), eq(teamVendors.teamId, ctx.team.id)))
    .returning({ id: teamVendors.id });
  if (!deleted) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'PURCHASES_VENDOR_DELETED', ipAddress: String(id) });
  return NextResponse.json({ ok: true });
}
