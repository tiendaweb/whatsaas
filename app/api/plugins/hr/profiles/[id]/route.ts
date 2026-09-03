import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamEmployeeProfiles } from '@/lib/db/schema';
import { getHrRequestContext } from '@/lib/plugins/hr/server/access';
import { employeeProfileSchema } from '@/lib/plugins/hr/server/schema';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getHrRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  const parsed = employeeProfileSchema.partial().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const [profile] = await db.update(teamEmployeeProfiles).set({
    ...parsed.data,
    updatedBy: ctx.user.id,
    updatedAt: new Date(),
  }).where(and(eq(teamEmployeeProfiles.id, id), eq(teamEmployeeProfiles.teamId, ctx.team.id))).returning();
  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await db.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'HR_PROFILE_UPDATED', ipAddress: String(id) });
  return NextResponse.json(profile);
}
