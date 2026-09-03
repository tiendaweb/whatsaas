import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamSupportTicketComments, teamSupportTickets } from '@/lib/db/schema';
import { getSupportRequestContext } from '@/lib/plugins/support/server/access';
import { assertChatInTeam, assertContactInTeam, assertCustomerInTeam, ticketSchema } from '@/lib/plugins/support/server/schema';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSupportRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const ticket = await db.query.teamSupportTickets.findFirst({
    where: and(eq(teamSupportTickets.id, id), eq(teamSupportTickets.teamId, ctx.team.id)),
  });
  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const comments = await db.select().from(teamSupportTicketComments)
    .where(eq(teamSupportTicketComments.ticketId, id))
    .orderBy(asc(teamSupportTicketComments.createdAt));

  return NextResponse.json({ ...ticket, comments });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSupportRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const existing = await db.query.teamSupportTickets.findFirst({
    where: and(eq(teamSupportTickets.id, id), eq(teamSupportTickets.teamId, ctx.team.id)),
  });
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = ticketSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    if (parsed.data.customerId) await assertCustomerInTeam(ctx.team.id, parsed.data.customerId);
    if (parsed.data.contactId) await assertContactInTeam(ctx.team.id, parsed.data.contactId);
    if (parsed.data.chatId) await assertChatInTeam(ctx.team.id, parsed.data.chatId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_input';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const now = new Date();
  const statusTransition = parsed.data.status && parsed.data.status !== existing.status ? parsed.data.status : null;

  const [ticket] = await db.transaction(async (tx) => {
    const { dueAt, ...rest } = parsed.data;
    const updated = await tx.update(teamSupportTickets).set({
      ...rest,
      ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
      ...(statusTransition === 'resolved' ? { resolvedAt: now } : {}),
      ...(statusTransition === 'closed' ? { closedAt: now } : {}),
      updatedBy: ctx.user.id,
      updatedAt: now,
    }).where(and(eq(teamSupportTickets.id, id), eq(teamSupportTickets.teamId, ctx.team.id))).returning();

    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'SUPPORT_TICKET_UPDATED', ipAddress: String(id) });
    return updated;
  });

  return NextResponse.json(ticket);
}
