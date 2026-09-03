import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamContracts, teamCustomers } from '@/lib/db/schema';
import { getContractsRequestContext } from '@/lib/plugins/contracts/server/access';
import { assertCustomerInTeam, assertDocumentInTeam, contractSchema } from '@/lib/plugins/contracts/server/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getContractsRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const contracts = await db
    .select({
      id: teamContracts.id,
      title: teamContracts.title,
      status: teamContracts.status,
      value: teamContracts.value,
      currency: teamContracts.currency,
      startDate: teamContracts.startDate,
      endDate: teamContracts.endDate,
      autoRenew: teamContracts.autoRenew,
      customerId: teamContracts.customerId,
      customerName: teamCustomers.name,
      createdAt: teamContracts.createdAt,
    })
    .from(teamContracts)
    .leftJoin(teamCustomers, eq(teamCustomers.id, teamContracts.customerId))
    .where(eq(teamContracts.teamId, ctx.team.id))
    .orderBy(desc(teamContracts.createdAt));

  return NextResponse.json(contracts);
}

export async function POST(request: Request) {
  const ctx = await getContractsRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = contractSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    if (parsed.data.customerId) await assertCustomerInTeam(ctx.team.id, parsed.data.customerId);
    if (parsed.data.documentId) await assertDocumentInTeam(ctx.team.id, parsed.data.documentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_input';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const [contract] = await db.transaction(async (tx) => {
    const created = await tx.insert(teamContracts).values({
      teamId: ctx.team.id,
      ...parsed.data,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    }).returning();
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'CONTRACT_CREATED', ipAddress: parsed.data.title });
    return created;
  });
  return NextResponse.json(contract, { status: 201 });
}
