import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamSupportTicketComments, teamSupportTickets } from '@/lib/db/schema';
import { getSupportRequestContext } from '@/lib/plugins/support/server/access';
import { ticketCommentSchema } from '@/lib/plugins/support/server/schema';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSupportRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const ticketId = Number((await params).id);
  if (!Number.isInteger(ticketId)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const ticket = await db.query.teamSupportTickets.findFirst({
    where: and(eq(teamSupportTickets.id, ticketId), eq(teamSupportTickets.teamId, ctx.team.id)),
    columns: { id: true },
  });
  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const comments = await db.select().from(teamSupportTicketComments)
    .where(eq(teamSupportTicketComments.ticketId, ticketId))
    .orderBy(asc(teamSupportTicketComments.createdAt));

  return NextResponse.json(comments);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSupportRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const ticketId = Number((await params).id);
  if (!Number.isInteger(ticketId)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const ticket = await db.query.teamSupportTickets.findFirst({
    where: and(eq(teamSupportTickets.id, ticketId), eq(teamSupportTickets.teamId, ctx.team.id)),
    columns: { id: true },
  });
  if (!ticket) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = ticketCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [comment] = await db.transaction(async (tx) => {
    const created = await tx.insert(teamSupportTicketComments).values({
      teamId: ctx.team.id,
      ticketId,
      authorUserId: ctx.user.id,
      ...parsed.data,
    }).returning();
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'SUPPORT_TICKET_COMMENTED', ipAddress: String(ticketId) });
    return created;
  });

  return NextResponse.json(comment, { status: 201 });
}
