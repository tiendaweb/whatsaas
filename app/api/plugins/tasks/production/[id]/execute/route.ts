import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { executeProductionPromptWithBank } from '@/lib/plugins/tasks/server/production-os';

export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const taskId = Number((await params).id);
  if (!Number.isInteger(taskId) || taskId <= 0) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  try {
    const result = await executeProductionPromptWithBank(ctx.team.id, ctx.user.id, taskId);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    console.error('[tasks/production/:id/execute POST]', error);
    const message = error instanceof Error ? error.message : 'No se pudo ejecutar el prompt.';
    return NextResponse.json({ error: message }, { status: message.includes('No existe') ? 404 : 422 });
  }
}
