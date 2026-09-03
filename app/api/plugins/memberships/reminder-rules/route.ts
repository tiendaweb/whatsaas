import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import {
  createReminderRule,
  listReminderRules,
  MembershipReminderRuleError,
  reminderRuleSchema,
} from '@/lib/plugins/memberships/server/reminder-rules';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const ctx = await getPluginRequestContext('membershipsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await listReminderRules(ctx.team.id));
}

export async function POST(request: Request) {
  const ctx = await getPluginRequestContext('membershipsWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await request.json();
  const parsed = reminderRuleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const created = await createReminderRule(ctx.team.id, ctx.user.id, parsed.data);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof MembershipReminderRuleError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
