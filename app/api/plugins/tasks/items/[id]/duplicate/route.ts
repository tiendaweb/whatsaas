import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { duplicateTask } from '@/lib/plugins/tasks/server/duplicate';
import { TaskOpsError } from '@/lib/plugins/tasks/server/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const duplicate = await duplicateTask(ctx.team.id, ctx.user.id, Number(id), {
      columnId: body.columnId ? Number(body.columnId) : null,
      projectId: body.projectId ? Number(body.projectId) : null,
    });
    return NextResponse.json(duplicate, { status: 201 });
  } catch (error) {
    if (error instanceof TaskOpsError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
