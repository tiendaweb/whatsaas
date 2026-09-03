import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamSaleCommissions, users } from '@/lib/db/schema';
import { getHrRequestContext } from '@/lib/plugins/hr/server/access';
import { assertSaleInTeam, assertTeamMemberUser, saleCommissionSchema } from '@/lib/plugins/hr/server/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const ctx = await getHrRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');

  const where = userId
    ? and(eq(teamSaleCommissions.teamId, ctx.team.id), eq(teamSaleCommissions.userId, Number(userId)))
    : eq(teamSaleCommissions.teamId, ctx.team.id);

  const commissions = await db
    .select({
      id: teamSaleCommissions.id,
      saleId: teamSaleCommissions.saleId,
      userId: teamSaleCommissions.userId,
      userName: users.name,
      userEmail: users.email,
      ruleId: teamSaleCommissions.ruleId,
      basisAmount: teamSaleCommissions.basisAmount,
      commissionAmount: teamSaleCommissions.commissionAmount,
      currency: teamSaleCommissions.currency,
      status: teamSaleCommissions.status,
      createdAt: teamSaleCommissions.createdAt,
    })
    .from(teamSaleCommissions)
    .innerJoin(users, eq(users.id, teamSaleCommissions.userId))
    .where(where)
    .orderBy(desc(teamSaleCommissions.createdAt));

  return NextResponse.json(commissions);
}

export async function POST(request: Request) {
  const ctx = await getHrRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = saleCommissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    await assertSaleInTeam(ctx.team.id, parsed.data.saleId);
    await assertTeamMemberUser(ctx.team.id, parsed.data.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_input';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const [commission] = await db.transaction(async (tx) => {
      const created = await tx.insert(teamSaleCommissions).values({
        teamId: ctx.team.id,
        ...parsed.data,
        createdBy: ctx.user.id,
      }).returning();
      await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'HR_COMMISSION_CREATED', ipAddress: String(created[0].id) });
      return created;
    });
    return NextResponse.json(commission, { status: 201 });
  } catch (error) {
    if (String(error).includes('team_sale_commissions_team_sale_user_uidx')) {
      return NextResponse.json({ error: 'duplicate_commission' }, { status: 409 });
    }
    throw error;
  }
}
