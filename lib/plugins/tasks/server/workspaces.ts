import { db } from '@/lib/db/drizzle';
import { teamTaskProjects, teamTaskWorkspaces } from '@/lib/db/schema';
import { eq, isNull, and } from 'drizzle-orm';

export async function ensureDefaultTaskWorkspace(teamId: number, userId?: number | null) {
  const existing = await db.query.teamTaskWorkspaces.findFirst({
    where: eq(teamTaskWorkspaces.teamId, teamId),
    orderBy: (t, { asc }) => [asc(t.order), asc(t.createdAt)],
  });
  if (existing) {
    await assignUnscopedProjects(teamId, existing.id);
    return existing;
  }

  const [workspace] = await db.insert(teamTaskWorkspaces).values({
    teamId,
    name: 'Principal',
    order: 0,
    createdBy: userId ?? null,
  }).returning();

  await assignUnscopedProjects(teamId, workspace.id);
  return workspace;
}

export async function assignUnscopedProjects(teamId: number, workspaceId: number) {
  await db.update(teamTaskProjects)
    .set({ workspaceId, updatedAt: new Date() })
    .where(and(eq(teamTaskProjects.teamId, teamId), isNull(teamTaskProjects.workspaceId)));
}

