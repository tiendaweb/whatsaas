import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamCommissionRules } from '@/lib/db/schema';
import { getHrRequestContext } from '@/lib/plugins/hr/server/access';
import { assertArticleInTeam, assertTeamMemberUser, commissionRuleSchema } from '@/lib/plugins/hr/server/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getHrRequestContext('read');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const rules = await db.select().from(teamCommissionRules)
    .where(eq(teamCommissionRules.teamId, ctx.team.id))
    .orderBy(asc(teamCommissionRules.name));

  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const ctx = await getHrRequestContext('write');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = commissionRuleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.appliesTo === 'article' && parsed.data.articleId) {
    try {
      await assertArticleInTeam(ctx.team.id, parsed.data.articleId);
    } catch {
      return NextResponse.json({ error: 'invalid_article' }, { status: 400 });
    }
  }
  if (parsed.data.appliesTo === 'user' && parsed.data.userId) {
    try {
      await assertTeamMemberUser(ctx.team.id, parsed.data.userId);
    } catch {
      return NextResponse.json({ error: 'invalid_user' }, { status: 400 });
    }
  }

  const [rule] = await db.transaction(async (tx) => {
    const created = await tx.insert(teamCommissionRules).values({
      teamId: ctx.team.id,
      ...parsed.data,
      createdBy: ctx.user.id,
    }).returning();
    await tx.insert(activityLogs).values({ teamId: ctx.team.id, userId: ctx.user.id, action: 'HR_COMMISSION_RULE_CREATED', ipAddress: parsed.data.name });
    return created;
  });
  return NextResponse.json(rule, { status: 201 });
}
