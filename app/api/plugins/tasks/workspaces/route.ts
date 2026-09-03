import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { teamTaskWorkspaces } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { assignUnscopedProjects, ensureDefaultTaskWorkspace } from '@/lib/plugins/tasks/server/workspaces';
import { loadTaskOsData, mergeDuplicateNamedProjects } from '@/lib/plugins/tasks/server/task-os';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const defaultWorkspace = await ensureDefaultTaskWorkspace(ctx.team.id, ctx.user.id);
  await assignUnscopedProjects(ctx.team.id, defaultWorkspace.id);

  return NextResponse.json(await loadTaskOsData(ctx.team.id));
}

export async function POST(req: Request) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json();
  if (body.action === 'merge-dups') {
    try {
      const res = await mergeDuplicateNamedProjects(ctx.team.id, body.workspaceId ? Number(body.workspaceId) : undefined);
      return NextResponse.json({ ok: true, ...res });
    } catch (e: any) {
      console.error('merge-dups error', e);
      return NextResponse.json({ ok: false, error: e?.message || 'merge failed' }, { status: 500 });
    }
  }
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const maxOrder = await db.query.teamTaskWorkspaces.findMany({
    where: eq(teamTaskWorkspaces.teamId, ctx.team.id),
    orderBy: (t, { desc }) => [desc(t.order)],
    limit: 1,
  });
  const order = maxOrder.length ? maxOrder[0].order + 1 : 0;

  const [workspace] = await db.insert(teamTaskWorkspaces).values({
    teamId: ctx.team.id,
    name,
    order,
    color: body.color ?? null,
    icon: body.icon ?? null,
    createdBy: ctx.user.id,
  }).returning();

  return NextResponse.json(workspace, { status: 201 });
}
