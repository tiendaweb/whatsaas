import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamEmployeeProfiles, teamMembers, users } from '@/lib/db/schema';
import { getHrRequestContext } from '@/lib/plugins/hr/server/access';
import { employeeProfileSchema, assertTeamMemberUser } from '@/lib/plugins/hr/server/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getHrRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const members = await db
    .select({
      teamMemberId: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      name: users.name,
      email: users.email,
      profileId: teamEmployeeProfiles.id,
      jobTitle: teamEmployeeProfiles.jobTitle,
      employmentStatus: teamEmployeeProfiles.employmentStatus,
      hireDate: teamEmployeeProfiles.hireDate,
      notes: teamEmployeeProfiles.notes,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .leftJoin(teamEmployeeProfiles, eq(teamEmployeeProfiles.userId, teamMembers.userId))
    .where(eq(teamMembers.teamId, ctx.team.id));

  return NextResponse.json(members);
}

const upsertSchema = employeeProfileSchema.extend({
  userId: z.number().int().positive(),
});

export async function POST(request: Request) {
  const ctx = await getHrRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await assertTeamMemberUser(ctx.team.id, parsed.data.userId);
  } catch {
    return NextResponse.json({ error: 'invalid_user' }, { status: 400 });
  }

  const { userId, ...profileFields } = parsed.data;

  const [profile] = await db.transaction(async (tx) => {
    const created = await tx.insert(teamEmployeeProfiles).values({
      teamId: ctx.team.id,
      userId,
      ...profileFields,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    }).onConflictDoUpdate({
      target: [teamEmployeeProfiles.teamId, teamEmployeeProfiles.userId],
      set: { ...profileFields, updatedBy: ctx.user.id, updatedAt: new Date() },
    }).returning();
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'HR_PROFILE_UPSERTED', ipAddress: String(userId) });
    return created;
  });

  return NextResponse.json(profile, { status: 201 });
}
