import { NextResponse } from 'next/server';
import { and, eq, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamSupportTickets } from '@/lib/db/schema';
import { getSupportRequestContext } from '@/lib/plugins/support/server/access';

export const dynamic = 'force-dynamic';

const OPEN_STATUSES = sql`${teamSupportTickets.status} in ('open','in_progress','waiting_customer')`;

export async function GET() {
  const ctx = await getSupportRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const now = new Date();

  const [open, urgent, overdue] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(teamSupportTickets)
      .where(and(eq(teamSupportTickets.teamId, ctx.team.id), OPEN_STATUSES)),
    db.select({ count: sql<number>`count(*)` }).from(teamSupportTickets)
      .where(and(eq(teamSupportTickets.teamId, ctx.team.id), OPEN_STATUSES, eq(teamSupportTickets.priority, 'urgent'))),
    db.select({ count: sql<number>`count(*)` }).from(teamSupportTickets)
      .where(and(
        eq(teamSupportTickets.teamId, ctx.team.id),
        OPEN_STATUSES,
        lte(teamSupportTickets.dueAt, now),
      )),
  ]);

  return NextResponse.json({
    open: Number(open[0]?.count ?? 0),
    urgent: Number(urgent[0]?.count ?? 0),
    overdue: Number(overdue[0]?.count ?? 0),
  });
}
