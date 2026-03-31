import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { checkRoutePermission } from "@/lib/auth/permissions-guard";
import { db } from "@/lib/db/drizzle";
import { getTeamForUser } from "@/lib/db/queries";
import { automationTemplates } from "@/lib/db/schema";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { error } = await checkRoutePermission("automation");
    if (error) return error;

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const templateId = Number(id);

    if (!Number.isInteger(templateId) || templateId <= 0) {
      return NextResponse.json({ error: "Invalid template id" }, { status: 400 });
    }

    const template = await db.query.automationTemplates.findFirst({
      where: and(
        eq(automationTemplates.id, templateId),
        or(
          eq(automationTemplates.teamId, team.id),
          eq(automationTemplates.isPublic, true),
        ),
      ),
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

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Error fetching automation template:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
