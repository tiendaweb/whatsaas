import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskItems, teamTaskColumns, teamTaskProjects } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { eq, and, lte, gte, isNotNull } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const items = await db
    .select({
      id: teamTaskItems.id,
      title: teamTaskItems.title,
      notes: teamTaskItems.notes,
      checklist: teamTaskItems.checklist,
      labelIds: teamTaskItems.labelIds,
      dueDate: teamTaskItems.dueDate,
      columnId: teamTaskItems.columnId,
      projectId: teamTaskItems.projectId,
      columnTitle: teamTaskColumns.title,
      projectName: teamTaskProjects.name,
      projectLabels: teamTaskProjects.labels,
    })
    .from(teamTaskItems)
    .innerJoin(teamTaskColumns, eq(teamTaskItems.columnId, teamTaskColumns.id))
    .innerJoin(teamTaskProjects, eq(teamTaskItems.projectId, teamTaskProjects.id))
    .where(
      and(
        eq(teamTaskItems.teamId, ctx.team.id),
        isNotNull(teamTaskItems.dueDate),
        lte(teamTaskItems.dueDate, todayEnd),
        gte(teamTaskItems.dueDate, todayStart),
      )
    )
    .orderBy(teamTaskItems.dueDate);

  return NextResponse.json(items);
}
