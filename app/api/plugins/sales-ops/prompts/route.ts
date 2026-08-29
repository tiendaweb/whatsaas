import { NextResponse } from 'next/server';
import { getSalesOpsContext } from '@/lib/plugins/sales-ops/server/access';
import { listTeamPrompts } from '@/lib/plugins/sales-ops/server/prompts';

export const dynamic = 'force-dynamic';

/** GET → prompts versionados del equipo (team_prompts) más los defaults del motor. */
export async function GET() {
  const ctx = await getSalesOpsContext('salesOpsRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const teamId = ctx.team.id;

  try {
    const payload = await listTeamPrompts(teamId);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('[sales-ops/prompts]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error inesperado' }, { status: 500 });
  }
}
