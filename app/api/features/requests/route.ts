import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getTeamForUser } from "@/lib/db/queries";
import {
  createFeatureRequest,
  getAllFeatureRequests,
} from "@/lib/plugins/marketplace/server/feature-requests";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId");
  const category = searchParams.get("category");
  const status = searchParams.get("status");

  if (!teamId) {
    return NextResponse.json(
      { error: "teamId is required" },
      { status: 400 }
    );
  }
  if (parseInt(teamId) !== team.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const requests = await getAllFeatureRequests({
      teamId: team.id,
      category: category || undefined,
      status: status || undefined,
    });

    return NextResponse.json(requests);
  } catch (error) {
    console.error("Error fetching feature requests:", error);
    return NextResponse.json(
      { error: "Error fetching feature requests" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const team = await getTeamForUser();
  if (!team) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { teamId, title, description, category, appId } = body;

    if (!teamId || !title || !description || !category) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }
    if (Number(teamId) !== team.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const newRequest = await createFeatureRequest({
      teamId: team.id,
      requestedBy: session.user.id,
      title,
      description,
      category,
      appId: appId || null,
    });

    return NextResponse.json(newRequest, { status: 201 });
  } catch (error) {
    console.error("Error creating feature request:", error);
    return NextResponse.json(
      { error: "Error creating feature request" },
      { status: 500 }
    );
  }
}
