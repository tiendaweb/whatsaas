import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { checklistToTasks } from '@/lib/plugins/tasks/server/checklist';
import { TaskOpsError } from '@/lib/plugins/tasks/server/errors';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;

  try {
    const { created } = await checklistToTasks(ctx.team.id, ctx.user.id, Number(id));
    return NextResponse.json({ created }, { status: 201 });
  } catch (error) {
    if (error instanceof TaskOpsError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
