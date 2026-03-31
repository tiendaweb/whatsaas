import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { automations } from '@/lib/db/schema';
import type { AutomationCanvasNode } from '@/lib/automation/flow-schema';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { error } = await checkRoutePermission('automation');
    if (error) return error;

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const automationId = Number(id);

    if (!Number.isInteger(automationId) || automationId <= 0) {
      return NextResponse.json({ error: 'Invalid automation id' }, { status: 400 });
    }

    const automation = await db.query.automations.findFirst({
      where: and(eq(automations.id, automationId), eq(automations.teamId, team.id)),
      columns: {
        id: true,
        nodes: true,
      },
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: automation.id,
      nodes: (automation.nodes as AutomationCanvasNode[]) || [],
    });
  } catch (error) {
    console.error('Error fetching automation nodes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
