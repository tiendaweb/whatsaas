import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamContracts } from '@/lib/db/schema';
import { getContractsRequestContext } from '@/lib/plugins/contracts/server/access';
import { assertCustomerInTeam, assertDocumentInTeam, contractSchema } from '@/lib/plugins/contracts/server/schema';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContractsRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const contract = await db.query.teamContracts.findFirst({
    where: and(eq(teamContracts.id, id), eq(teamContracts.teamId, ctx.team.id)),
  });
  if (!contract) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(contract);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContractsRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = contractSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    if (parsed.data.customerId) await assertCustomerInTeam(ctx.team.id, parsed.data.customerId);
    if (parsed.data.documentId) await assertDocumentInTeam(ctx.team.id, parsed.data.documentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_input';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const [contract] = await db.transaction(async (tx) => {
    const updated = await tx.update(teamContracts).set({
      ...parsed.data,
      updatedBy: ctx.user.id,
      updatedAt: new Date(),
    }).where(and(eq(teamContracts.id, id), eq(teamContracts.teamId, ctx.team.id))).returning();
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'CONTRACT_UPDATED', ipAddress: String(id) });
    return updated;
  });
  if (!contract) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(contract);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContractsRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const existing = await db.query.teamContracts.findFirst({
    where: and(eq(teamContracts.id, id), eq(teamContracts.teamId, ctx.team.id)),
    columns: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.status !== 'draft') return NextResponse.json({ error: 'only_draft_can_be_deleted' }, { status: 409 });

  await db.delete(teamContracts).where(and(eq(teamContracts.id, id), eq(teamContracts.teamId, ctx.team.id)));
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'CONTRACT_DELETED', ipAddress: String(id) });
  return NextResponse.json({ ok: true });
}
