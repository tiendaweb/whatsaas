import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamVendors } from '@/lib/db/schema';
import { getPurchasesRequestContext } from '@/lib/plugins/purchases/server/access';
import { vendorSchema } from '@/lib/plugins/purchases/server/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getPurchasesRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const vendors = await db.select().from(teamVendors)
    .where(eq(teamVendors.teamId, ctx.team.id))
    .orderBy(asc(teamVendors.name));

  return NextResponse.json(vendors);
}

export async function POST(request: Request) {
  const ctx = await getPurchasesRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = vendorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [vendor] = await db.transaction(async (tx) => {
    const created = await tx.insert(teamVendors).values({
      teamId: ctx.team.id,
      ...parsed.data,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    }).returning();
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'PURCHASES_VENDOR_CREATED', ipAddress: parsed.data.name });
    return created;
  });
  return NextResponse.json(vendor, { status: 201 });
}
