import { NextResponse } from "next/server";
import { checkRoutePermission } from "@/lib/auth/permissions-guard";
import { db } from "@/lib/db/drizzle";
import { getTeamForUser, getUser } from "@/lib/db/queries";
import { automationTemplates } from "@/lib/db/schema";
import {
  type AutomationFlowEdge,
  type AutomationFlowNode,
  automationFlowCanvasSchema,
} from "@/lib/automation/flow-schema";

export async function POST(request: Request) {
  try {
    const { error } = await checkRoutePermission("automation");
    if (error) return error;

    const [team, user] = await Promise.all([getTeamForUser(), getUser()]);

    if (!team || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      name?: string;
      description?: string;
      isPublic?: boolean;
      instanceId?: number | null;
      nodes?: AutomationFlowNode[];
      edges?: AutomationFlowEdge[];
    };

    const name = body.name?.trim();

    if (!name) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }

    if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return NextResponse.json({ error: "Nodes and edges are required" }, { status: 400 });
    }

    const parsedFlow = automationFlowCanvasSchema.safeParse({
      nodes: body.nodes,
      edges: body.edges,
    });

    if (!parsedFlow.success) {
      return NextResponse.json(
        { error: parsedFlow.error.issues[0]?.message ?? "Invalid flow" },
        { status: 400 },
      );
    }

    const [createdTemplate] = await db
      .insert(automationTemplates)
      .values({
        teamId: team.id,
        instanceId: body.instanceId ?? null,
        name,
        description: body.description?.trim() || null,
        isPublic: body.isPublic ?? false,
        nodes: parsedFlow.data.nodes,
        edges: parsedFlow.data.edges,
        createdBy: user.id,
      })
      .returning();

    return NextResponse.json({ template: createdTemplate }, { status: 201 });
  } catch (error) {
    console.error("Error creating template from flow:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
