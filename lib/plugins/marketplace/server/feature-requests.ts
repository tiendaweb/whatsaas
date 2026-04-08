import { and, eq, desc, gt } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { featureRequests, featureRequestVotes } from "@/lib/db/schema";

export async function createFeatureRequest(data: {
  teamId: number;
  requestedBy: number;
  title: string;
  description: string;
  category: string;
  appId?: number | null;
}) {
  const request = await db
    .insert(featureRequests)
    .values({
      teamId: data.teamId,
      requestedBy: data.requestedBy,
      title: data.title,
      description: data.description,
      category: data.category,
      appId: data.appId || null,
      status: "pending",
      votes: 0,
    })
    .returning();

  return request[0];
}

export async function getAllFeatureRequests(filters?: {
  teamId?: number;
  category?: string;
  status?: string;
  appId?: number;
  limit?: number;
}) {
  const conditions = [];

  if (filters?.teamId) {
    conditions.push(eq(featureRequests.teamId, filters.teamId));
  }

  if (filters?.category) {
    conditions.push(eq(featureRequests.category, filters.category));
  }

  if (filters?.status) {
    conditions.push(eq(featureRequests.status, filters.status));
  }

  if (filters?.appId) {
    conditions.push(eq(featureRequests.appId, filters.appId));
  }

  const requests = await db.query.featureRequests.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    with: {
      requestedByUser: {
        columns: { id: true, name: true, email: true },
      },
      app: {
        columns: { id: true, title: true },
      },
      votes: true,
    },
    orderBy: desc(featureRequests.votes),
    limit: filters?.limit || 50,
  });

  return requests;
}

export async function getFeatureRequestById(id: number) {
  const request = await db.query.featureRequests.findFirst({
    where: eq(featureRequests.id, id),
    with: {
      requestedByUser: {
        columns: { id: true, name: true, email: true },
      },
      app: {
        columns: { id: true, title: true },
      },
      votes: {
        with: {
          user: {
            columns: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  return request;
}

export async function addVoteToRequest(requestId: number, userId: number) {
  try {
    // Try to insert the vote
    await db.insert(featureRequestVotes).values({
      requestId,
      userId,
    });

    // Increment the votes counter
    const request = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, requestId),
    });

    if (request) {
      await db
        .update(featureRequests)
        .set({ votes: request.votes + 1 })
        .where(eq(featureRequests.id, requestId));
    }

    return { success: true };
  } catch (error) {
    // Vote already exists for this user
    return { success: false, error: "Ya votaste por esta solicitud" };
  }
}

export async function removeVoteFromRequest(requestId: number, userId: number) {
  try {
    // Delete the vote
    await db
      .delete(featureRequestVotes)
      .where(
        and(
          eq(featureRequestVotes.requestId, requestId),
          eq(featureRequestVotes.userId, userId)
        )
      );

    // Decrement the votes counter
    const request = await db.query.featureRequests.findFirst({
      where: eq(featureRequests.id, requestId),
    });

    if (request && request.votes > 0) {
      await db
        .update(featureRequests)
        .set({ votes: request.votes - 1 })
        .where(eq(featureRequests.id, requestId));
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: "Error al remover voto" };
  }
}

export async function updateFeatureRequestStatus(
  id: number,
  status: "pending" | "reviewed" | "in_progress" | "completed" | "rejected"
) {
  const request = await db
    .update(featureRequests)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(featureRequests.id, id))
    .returning();

  return request[0];
}

export async function hasUserVoted(requestId: number, userId: number) {
  const vote = await db.query.featureRequestVotes.findFirst({
    where: and(
      eq(featureRequestVotes.requestId, requestId),
      eq(featureRequestVotes.userId, userId)
    ),
  });

  return !!vote;
}
