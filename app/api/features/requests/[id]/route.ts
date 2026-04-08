import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getFeatureRequestById,
  updateFeatureRequestStatus,
} from "@/lib/plugins/marketplace/server/feature-requests";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const requestId = parseInt(id);

    if (isNaN(requestId)) {
      return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
    }

    const featureRequest = await getFeatureRequestById(requestId);

    if (!featureRequest) {
      return NextResponse.json(
        { error: "Feature request not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(featureRequest);
  } catch (error) {
    console.error("Error fetching feature request:", error);
    return NextResponse.json(
      { error: "Error fetching feature request" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const requestId = parseInt(id);
    if (isNaN(requestId)) {
      return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
    }

    if (!["pending", "reviewed", "in_progress", "completed", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updatedRequest = await updateFeatureRequestStatus(requestId, status);

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error("Error updating feature request:", error);
    return NextResponse.json(
      { error: "Error updating feature request" },
      { status: 500 }
    );
  }
}
