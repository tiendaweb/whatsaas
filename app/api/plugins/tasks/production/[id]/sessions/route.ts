import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamTaskItems } from '@/lib/db/schema';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { abrirSesion, cerrarSesion, registrarSesionManual, resumenHorasPorTarea } from '@/lib/plugins/tasks/server/work-sessions';

export const dynamic = 'force-dynamic';

/**
 * Sesiones de trabajo de un pedido: el reloj de 25 minutos de las pantallas
 * abre una al arrancar el bloque y la cierra al terminarlo o pausarlo; el
 * botón «Registrar tiempo» carga minutos a mano. Es de donde salen las horas
 * reales del pedido.
 */
const schema = z.object({
  action: z.enum(['open', 'close', 'manual']),
  kind: z.enum(['foco', 'descanso']).optional(),
  minutes: z.number().int().min(1).max(600).optional(),
  note: z.string().max(2000).optional(),
}).refine((value) => value.action !== 'manual' || value.minutes != null, { message: 'Registrar tiempo a mano necesita los minutos.' });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId) || taskId <= 0) return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'La sesión tiene campos inválidos.', details: parsed.error.flatten() }, { status: 400 });
  try {
    // Sólo pedidos de producción del equipo: una tarea común no lleva horas de producción.
    const pedido = await db.query.teamTaskItems.findFirst({
      where: and(eq(teamTaskItems.teamId, ctx.team.id), eq(teamTaskItems.id, taskId), isNotNull(teamTaskItems.workKind)),
      columns: { id: true },
    });
    if (!pedido) return NextResponse.json({ error: 'No existe el pedido de producción.' }, { status: 404 });
    const data = parsed.data;
    if (data.action === 'open') await abrirSesion(ctx.team.id, ctx.user.id, taskId, data.kind ?? 'foco');
    else if (data.action === 'close') await cerrarSesion(ctx.team.id, ctx.user.id);
    else await registrarSesionManual(ctx.team.id, ctx.user.id, taskId, data.minutes!, data.note);
    const resumen = (await resumenHorasPorTarea(ctx.team.id, [taskId])).get(taskId) ?? { minutosFoco: 0, sesiones: 0, sesionAbierta: null };
    return NextResponse.json({ ok: true, resumen });
  } catch (error) {
    console.error('[tasks/production/:id/sessions POST]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo registrar la sesión.' }, { status: 500 });
  }
}
