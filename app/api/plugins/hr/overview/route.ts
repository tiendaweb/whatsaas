import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamEmployeeProfiles, teamMembers, teamSaleCommissions } from '@/lib/db/schema';
import { getHrRequestContext } from '@/lib/plugins/hr/server/access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getHrRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const [memberCount, activeProfiles, pendingCommissions] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(teamMembers).where(eq(teamMembers.teamId, ctx.team.id)),
    db.select({ count: sql<number>`count(*)` }).from(teamEmployeeProfiles)
      .where(and(eq(teamEmployeeProfiles.teamId, ctx.team.id), eq(teamEmployeeProfiles.employmentStatus, 'active'))),
    db.select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${teamSaleCommissions.commissionAmount}), 0)` })
      .from(teamSaleCommissions)
      .where(and(eq(teamSaleCommissions.teamId, ctx.team.id), eq(teamSaleCommissions.status, 'pending'))),
  ]);

  return NextResponse.json({
    teamMembers: Number(memberCount[0]?.count ?? 0),
    activeEmployeeProfiles: Number(activeProfiles[0]?.count ?? 0),
    pendingCommissions: {
      count: Number(pendingCommissions[0]?.count ?? 0),
      total: Number(pendingCommissions[0]?.total ?? 0),
    },
  });
}
