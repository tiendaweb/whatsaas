import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamCustomers, teamSupportTickets } from '@/lib/db/schema';
import { getSupportRequestContext } from '@/lib/plugins/support/server/access';
import { assertChatInTeam, assertContactInTeam, assertCustomerInTeam, ticketSchema } from '@/lib/plugins/support/server/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getSupportRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  const where = status
    ? and(eq(teamSupportTickets.teamId, ctx.team.id), eq(teamSupportTickets.status, status as never))
    : eq(teamSupportTickets.teamId, ctx.team.id);

  const tickets = await db
    .select({
      id: teamSupportTickets.id,
      subject: teamSupportTickets.subject,
      priority: teamSupportTickets.priority,
      status: teamSupportTickets.status,
      category: teamSupportTickets.category,
      assignedUserId: teamSupportTickets.assignedUserId,
      customerId: teamSupportTickets.customerId,
      customerName: teamCustomers.name,
      dueAt: teamSupportTickets.dueAt,
      createdAt: teamSupportTickets.createdAt,
    })
    .from(teamSupportTickets)
    .leftJoin(teamCustomers, eq(teamCustomers.id, teamSupportTickets.customerId))
    .where(where)
    .orderBy(desc(teamSupportTickets.createdAt));

  return NextResponse.json(tickets);
}

export async function POST(request: Request) {
  const ctx = await getSupportRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = ticketSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    if (parsed.data.customerId) await assertCustomerInTeam(ctx.team.id, parsed.data.customerId);
    if (parsed.data.contactId) await assertContactInTeam(ctx.team.id, parsed.data.contactId);
    if (parsed.data.chatId) await assertChatInTeam(ctx.team.id, parsed.data.chatId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_input';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const [ticket] = await db.transaction(async (tx) => {
    const created = await tx.insert(teamSupportTickets).values({
      teamId: ctx.team.id,
      ...parsed.data,
      dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    }).returning();
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'SUPPORT_TICKET_CREATED', ipAddress: parsed.data.subject });
    return created;
  });
  return NextResponse.json(ticket, { status: 201 });
}
