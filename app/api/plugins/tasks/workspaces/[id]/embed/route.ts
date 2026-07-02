import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { getEmbedState, setEmbedState, type TaskEmbedAccess } from '@/lib/plugins/tasks/server/embed';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function parseAccess(value: unknown): TaskEmbedAccess | undefined {
  if (value === 'read' || value === 'manage') return value;
  return undefined;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const state = await getEmbedState(ctx.team.id, 'workspace', Number(id));
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(state);
}

export async function POST(req: Request, { params }: RouteContext) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action === 'regenerate' ? 'regenerate' : body?.action === 'disable' ? 'disable' : 'enable';

  const state = await setEmbedState({
    teamId: ctx.team.id,
    type: 'workspace',
    id: Number(id),
    action,
    access: parseAccess(body?.access),
  });
  if (!state) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(state);
}
