import { NextResponse } from 'next/server';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamNotifications } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export async function GET() {
  const context = await getPluginRequestContext('calendarRead');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const notifications = await db
    .select()
    .from(teamNotifications)
    .where(
      and(
        eq(teamNotifications.teamId, context.team.id),
        or(eq(teamNotifications.userId, context.user.id), isNull(teamNotifications.userId)),
      ),
    )
    .orderBy(desc(teamNotifications.createdAt))
    .limit(25);

  return NextResponse.json(notifications);
}

export async function PATCH() {
  const context = await getPluginRequestContext('calendarRead');
  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  await db
    .update(teamNotifications)
    .set({ readAt: new Date() })
    .where(and(eq(teamNotifications.teamId, context.team.id), eq(teamNotifications.userId, context.user.id), isNull(teamNotifications.readAt)));

  return NextResponse.json({ ok: true });
}
