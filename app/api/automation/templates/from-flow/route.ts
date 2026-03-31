import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { automationTemplates, evolutionInstances } from '@/lib/db/schema';
import { createTemplateBaseSchema, normalizeTemplateDescription } from '../_lib';

export async function POST(request: NextRequest) {
  try {
    const { error, context } = await checkRoutePermission('automation');
    if (error || !context) {
      return error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = createTemplateBaseSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
    }

    const data = parsed.data;

    if (data.instanceId) {
      const instance = await db.query.evolutionInstances.findFirst({
        where: and(eq(evolutionInstances.id, data.instanceId), eq(evolutionInstances.teamId, context.teamId)),
        columns: { id: true },
      });

      if (!instance) {
        return NextResponse.json({ error: 'Invalid instance for this team' }, { status: 400 });
      }
    }

    const [template] = await db
      .insert(automationTemplates)
      .values({
        teamId: context.teamId,
        instanceId: data.instanceId ?? null,
        name: data.name,
        description: normalizeTemplateDescription(data.description),
        isPublic: data.isPublic,
        nodes: data.nodes,
        edges: data.edges,
        createdBy: context.userId,
      })
      .returning();

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Error creating automation template from flow:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
