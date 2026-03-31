import { NextResponse } from "next/server";
import { checkRoutePermission } from "@/lib/auth/permissions-guard";
import { db } from "@/lib/db/drizzle";
import { getTeamForUser, getUser } from "@/lib/db/queries";
import { automationTemplates } from "@/lib/db/schema";
import {
  type AutomationFlowEdge,
  type AutomationFlowNode,
  automationFlowNodeSchema,
  automationFlowEdgeSchema,
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
      nodes?: unknown[];
      edges?: unknown[];
      selectedNodeIds?: string[];
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }

    if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return NextResponse.json({ error: "Nodes and edges are required" }, { status: 400 });
    }

    const selectedNodeIds = Array.isArray(body.selectedNodeIds)
      ? body.selectedNodeIds.filter((value): value is string => typeof value === "string")
      : [];

    if (selectedNodeIds.length === 0) {
      return NextResponse.json({ error: "No selected nodes" }, { status: 400 });
    }

    const selectedSet = new Set(selectedNodeIds);

    const parsedNodes: AutomationFlowNode[] = [];
    for (const node of body.nodes) {
      const parsedNode = automationFlowNodeSchema.safeParse(node);
      if (!parsedNode.success) {
        return NextResponse.json(
          { error: parsedNode.error.issues[0]?.message ?? "Invalid node payload" },
          { status: 400 },
        );
      }
      if (selectedSet.has(parsedNode.data.id)) {
        parsedNodes.push(parsedNode.data);
      }
    }

    if (parsedNodes.length === 0) {
      return NextResponse.json({ error: "No valid selected nodes" }, { status: 400 });
    }

    if (parsedNodes.some((node) => node.type === "start")) {
      return NextResponse.json(
        { error: "Start node cannot be included in template selections" },
        { status: 400 },
      );
    }

    const availableNodeIds = new Set(parsedNodes.map((node) => node.id));
    const parsedEdges: AutomationFlowEdge[] = [];

    for (const edge of body.edges) {
      const parsedEdge = automationFlowEdgeSchema.safeParse(edge);
      if (!parsedEdge.success) {
        return NextResponse.json(
          { error: parsedEdge.error.issues[0]?.message ?? "Invalid edge payload" },
          { status: 400 },
        );
      }
      if (
        availableNodeIds.has(parsedEdge.data.source) &&
        availableNodeIds.has(parsedEdge.data.target)
      ) {
        parsedEdges.push(parsedEdge.data);
      }
    }

    const [createdTemplate] = await db
      .insert(automationTemplates)
      .values({
        teamId: team.id,
        instanceId: body.instanceId ?? null,
        name,
        description: body.description?.trim() || null,
        isPublic: body.isPublic ?? false,
        nodes: parsedNodes,
        edges: parsedEdges,
        createdBy: user.id,
      })
      .returning();

    return NextResponse.json({ template: createdTemplate }, { status: 201 });
  } catch (error) {
    console.error("Error creating template from selection:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
