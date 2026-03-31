import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { checkRoutePermission } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { automationTemplates, evolutionInstances } from '@/lib/db/schema';
import { createTemplateBaseSchema, normalizeTemplateDescription } from '../_lib';

const createTemplateFromSelectionSchema = createTemplateBaseSchema.extend({
  selectedNodeIds: createTemplateBaseSchema.shape.nodes.element.shape.id.array().min(1),
});

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

    const parsed = createTemplateFromSelectionSchema.safeParse(payload);
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

    const selectedSet = new Set(data.selectedNodeIds);
    const selectedNodes = data.nodes.filter((node) => selectedSet.has(node.id));

    if (selectedNodes.length === 0) {
      return NextResponse.json({ error: 'No selected nodes found in nodes payload' }, { status: 400 });
    }

    const selectedEdges = data.edges.filter(
      (edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target),
    );

    const [template] = await db
      .insert(automationTemplates)
      .values({
        teamId: context.teamId,
        instanceId: data.instanceId ?? null,
        name: data.name,
        description: normalizeTemplateDescription(data.description),
        isPublic: data.isPublic,
        nodes: selectedNodes,
        edges: selectedEdges,
        createdBy: context.userId,
      })
      .returning();

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Error creating automation template from selection:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
