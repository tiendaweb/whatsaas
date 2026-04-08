import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  addVoteToRequest,
  removeVoteFromRequest,
} from "@/lib/plugins/marketplace/server/feature-requests";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { action } = body; // "add" or "remove"

    const requestId = parseInt(id);
    if (isNaN(requestId)) {
      return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
    }

    let result;
    if (action === "remove") {
      result = await removeVoteFromRequest(requestId, session.user.id);
    } else {
      result = await addVoteToRequest(requestId, session.user.id);
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error voting on feature request:", error);
    return NextResponse.json(
      { error: "Error voting on feature request" },
      { status: 500 }
    );
  }
}
