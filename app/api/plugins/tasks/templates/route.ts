import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { TaskOpsError } from '@/lib/plugins/tasks/server/errors';
import { createTaskTemplate, isTaskTemplateType, listTaskTemplates } from '@/lib/plugins/tasks/server/templates';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const rows = await listTaskTemplates(ctx.team.id, isTaskTemplateType(type) ? type : null);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json();

  try {
    const template = await createTaskTemplate(ctx.team.id, ctx.user.id, {
      type: String(body.type ?? ''),
      name: String(body.name ?? ''),
      payload: body.payload ?? {},
    });
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof TaskOpsError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
