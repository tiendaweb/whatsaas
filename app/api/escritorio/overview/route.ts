import { NextResponse } from 'next/server';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getDesktopOverview } from '@/lib/desktop/service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Antes se exigía `tasksRead` para TODO el escritorio: un agente sin tareas
  // veía la pantalla vacía con un 403. Ahora basta con tener contexto y cada
  // bloque se apaga solo según su permiso, devolviendo ceros.


  try {
    return NextResponse.json(await getDesktopOverview(context));
  } catch (error) {
    console.error('[desktop] overview failed', { teamId: context.teamId, userId: context.userId, error });
    return NextResponse.json({ error: 'No se pudo cargar el escritorio' }, { status: 500 });
  }
}
