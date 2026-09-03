import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getOperationsAiStatus, listOperationsAiMessages, sendOperationsAiMessage } from '@/lib/operations-ai/service';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  content: z.string().trim().min(1).max(8000),
  surface: z.enum(['tasks', 'command-center']),
});

export async function GET() {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (context.role !== 'owner' && context.role !== 'admin' && !context.permissions.tasksRead) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const [messages, status] = await Promise.all([
    listOperationsAiMessages(context.teamId),
    getOperationsAiStatus(context.teamId),
  ]);
  return NextResponse.json({ messages, status });
}

export async function POST(request: NextRequest) {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (context.role !== 'owner' && context.role !== 'admin' && !context.permissions.tasksRead) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Mensaje inválido' }, { status: 400 });

  try {
    return NextResponse.json(await sendOperationsAiMessage({
      teamId: context.teamId,
      userId: context.userId,
      content: parsed.data.content,
      surface: parsed.data.surface,
    }));
  } catch (error) {
    console.error('[operations-ai] message failed', { teamId: context.teamId, error });
    return NextResponse.json({ error: 'No se pudo guardar o responder el mensaje' }, { status: 500 });
  }
}
