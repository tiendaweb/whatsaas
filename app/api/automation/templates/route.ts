import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { automationTemplates } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { error, context } = await checkRoutePermission('automation');
    if (error || !context) {
      return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const instanceIdRaw = request.nextUrl.searchParams.get('instanceId');
    const instanceId = instanceIdRaw ? Number(instanceIdRaw) : null;

    const baseVisibility = or(
      eq(automationTemplates.teamId, context.teamId),
      eq(automationTemplates.isPublic, true),
    )!;

    const whereCondition = Number.isInteger(instanceId) && instanceId! > 0
      ? and(
          baseVisibility,
          or(eq(automationTemplates.instanceId, instanceId!), isNull(automationTemplates.instanceId)),
        )
      : baseVisibility;

    const templates = await db.query.automationTemplates.findMany({
      where: whereCondition,
      orderBy: [desc(automationTemplates.updatedAt)],
      columns: {
        id: true,
        teamId: true,
        instanceId: true,
        name: true,
        description: true,
        isPublic: true,
        nodes: true,
        edges: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error listing automation templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
