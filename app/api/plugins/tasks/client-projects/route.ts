import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { archiveClientProject, getClientProjects } from '@/lib/plugins/tasks/server/client-projects';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const archiveSchema = z.object({ projectId: z.number().int().positive() });

export async function GET() {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  return NextResponse.json(await getClientProjects(ctx.team.id));
}

export async function PATCH(request: Request) {
  const ctx = await getPluginRequestContext('customersWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const parsed = archiveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const result = await archiveClientProject(ctx.team.id, ctx.user.id, parsed.data.projectId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, projectId: result.projectId, customerId: result.customerId });
}
