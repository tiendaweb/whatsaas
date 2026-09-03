import { NextResponse, type NextRequest } from 'next/server';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { executeCommandBatch } from '@/lib/desktop/command-center/execute';
import { executeBodySchema } from '@/lib/desktop/command-center/schema';
import type { PlannedAction } from '@/lib/desktop/command-center/types';

export const dynamic = 'force-dynamic';

/**
 * Ejecuta el plan. Como mucho UN envío por request: el cliente los dispara en
 * serie para poder detener el resto, y así dos mensajes al mismo destinatario no
 * pueden salir del mismo lote.
 *
 * Devuelve 200 con el resultado fila por fila incluso si todo falló: un 403
 * global no le dice al usuario qué salió y qué no.
 */
export async function POST(request: NextRequest) {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = executeBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Cuerpo inválido' }, { status: 400 });
  }
  if (parsed.data.teamId !== context.teamId) {
    return NextResponse.json({ error: 'Equipo ambiguo' }, { status: 409 });
  }

  try {
    const result = await executeCommandBatch(context, {
      batchId: parsed.data.batchId,
      actions: parsed.data.actions as PlannedAction[],
      validation: false,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[command-center] ejecutar failed', { teamId: context.teamId, error });
    return NextResponse.json({ error: 'No se pudo ejecutar el plan' }, { status: 500 });
  }
}
