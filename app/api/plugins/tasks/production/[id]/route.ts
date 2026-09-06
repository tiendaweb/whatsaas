import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { updateProductionOrder } from '@/lib/plugins/tasks/server/production-os';
import { WORK_KINDS, WORK_STATUSES } from '@/lib/plugins/tasks/shared/produccion';

export const dynamic = 'force-dynamic';

const checklistItem = z.object({ id: z.string().min(1).max(100), text: z.string().min(1).max(500), completed: z.boolean() });
const updateSchema = z.object({
  workKind: z.enum(WORK_KINDS).optional(),
  workStatus: z.enum(WORK_STATUSES).optional(),
  title: z.string().trim().min(2).max(500).optional(),
  notes: z.string().max(20000).optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  deliveryUrl: z.string().url().max(2000).nullable().optional(),
  blockedReason: z.string().max(2000).nullable().optional(),
  checklist: z.array(checklistItem).max(100).optional(),
  aiPrompt: z.string().max(20000).optional(),
  aiReadyAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios.' });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId <= 0) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Los cambios tienen campos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await updateProductionOrder(ctx.team.id, ctx.user.id, taskId, parsed.data, 'user'));
  } catch (error) {
    console.error('[tasks/production/:id PATCH]', error);
    const message = error instanceof Error ? error.message : 'No se pudo actualizar el pedido.';
    return NextResponse.json({ error: message }, { status: message.includes('No existe') ? 404 : 409 });
  }
}
