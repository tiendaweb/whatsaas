import { NextResponse, type NextRequest } from 'next/server';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { getCommandCenter } from '@/lib/desktop/command-center/service';
import { COMMAND_ITEM_KINDS, type CommandItemKind } from '@/lib/desktop/command-center/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Igual que el resto del Escritorio: cada kind se apaga solo por permiso o por
  // plugin y devuelve su forma vacía. Nunca un 403 que deje la pantalla en blanco.
  const raw = request.nextUrl.searchParams.get('kinds');
  const kinds = raw
    ? (raw.split(',').filter((kind) => (COMMAND_ITEM_KINDS as readonly string[]).includes(kind)) as CommandItemKind[])
    : undefined;

  try {
    return NextResponse.json(await getCommandCenter(context, { kinds }));
  } catch (error) {
    console.error('[command-center] bandeja failed', { teamId: context.teamId, userId: context.userId, error });
    return NextResponse.json({ error: 'No se pudo cargar la bandeja' }, { status: 500 });
  }
}
