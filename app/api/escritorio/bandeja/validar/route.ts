import { NextResponse, type NextRequest } from 'next/server';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { executeCommandBatch } from '@/lib/desktop/command-center/execute';
import { validateBodySchema } from '@/lib/desktop/command-center/schema';
import type { PlannedAction } from '@/lib/desktop/command-center/types';

export const dynamic = 'force-dynamic';

/**
 * Vista previa del plan. Ruta separada de la que ejecuta a propósito: con un
 * `dryRun?: boolean` opcional en la misma ruta, cualquier cosa que pierda el
 * campo —un body recortado, un replay, un bug de cliente— manda los mensajes de
 * verdad en el momento en que el usuario abre el diálogo para revisarlos.
 */
export async function POST(request: NextRequest) {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = validateBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  if (parsed.data.teamId !== context.teamId) {
    return NextResponse.json({ error: 'Equipo ambiguo' }, { status: 409 });
  }

  try {
    const result = await executeCommandBatch(context, {
      batchId: parsed.data.batchId,
      actions: parsed.data.actions as PlannedAction[],
      validation: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[command-center] validar failed', { teamId: context.teamId, error });
    return NextResponse.json({ error: 'No se pudo validar el plan' }, { status: 500 });
  }
}
