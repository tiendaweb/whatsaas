import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { checkRoutePermission } from "@/lib/auth/permissions-guard";
import { db } from "@/lib/db/drizzle";
import { getTeamForUser } from "@/lib/db/queries";
import { automationTemplates } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  try {
    const { error } = await checkRoutePermission("automation");
    if (error) return error;

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const instanceIdParam = request.nextUrl.searchParams.get("instanceId");
    const instanceId = instanceIdParam ? Number(instanceIdParam) : null;

    if (instanceIdParam && (!Number.isInteger(instanceId) || Number(instanceId) <= 0)) {
      return NextResponse.json({ error: "Invalid instanceId" }, { status: 400 });
    }

    const visibilityFilter = or(
      eq(automationTemplates.teamId, team.id),
      eq(automationTemplates.isPublic, true),
    );

    const instanceFilter = instanceId
      ? or(eq(automationTemplates.instanceId, instanceId), isNull(automationTemplates.instanceId))
      : undefined;

    const templates = await db.query.automationTemplates.findMany({
      where:
        instanceFilter !== undefined
          ? and(visibilityFilter, instanceFilter)
          : visibilityFilter,
      orderBy: [asc(automationTemplates.name)],
      with: {
        author: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Error listing automation templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
