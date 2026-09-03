import { NextResponse } from 'next/server';
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { accountStats, leadStats, listAccounts, listEvents, listLeads, listTasks } from '@/lib/desktop/crm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Listados del CRM para las vistas del Escritorio.
 *
 * Un solo endpoint con `?view=` en vez de tres rutas: las tres devuelven
 * `{ rows, stats }` y comparten el guardia. Cada vista pide sólo la suya.
 */
export async function GET(request: Request) {
  const context = await getUserPermissionContext();
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const view = url.searchParams.get('view') ?? 'leads';
  const search = url.searchParams.get('q') ?? undefined;
  const limit = Number(url.searchParams.get('limit')) || undefined;

  if (view === 'accounts') {
    const canRead =
      context.role === 'owner' || context.role === 'admin' || context.permissions.customersRead;
    // Sin permiso se devuelve la forma vacía, no un 403: la vista muestra su
    // estado vacío en vez de una pantalla de error.
    if (!canRead) return NextResponse.json({ rows: [], stats: null, allowed: false });
    const [rows, stats] = await Promise.all([
      listAccounts(context.teamId, { search, status: url.searchParams.get('status') ?? undefined, limit }),
      accountStats(context.teamId),
    ]);
    return NextResponse.json({ rows, stats, allowed: true });
  }

  if (view === 'tasks') {
    const canTasks =
      context.role === 'owner' || context.role === 'admin' || context.permissions.tasksRead;
    if (!canTasks) return NextResponse.json({ rows: [], stats: null, allowed: false });
    return NextResponse.json({ rows: await listTasks(context.teamId), stats: null, allowed: true });
  }

  if (view === 'calendar') {
    const canCalendar =
      context.role === 'owner' || context.role === 'admin' || context.permissions.calendarRead;
    if (!canCalendar) return NextResponse.json({ rows: [], stats: null, allowed: false });
    return NextResponse.json({ rows: await listEvents(context.teamId), stats: null, allowed: true });
  }

  const canRead = context.role === 'owner' || context.role === 'admin' || context.permissions.contacts;
  if (!canRead) return NextResponse.json({ rows: [], stats: null, allowed: false });

  const [rows, stats] = await Promise.all([
    listLeads(context.teamId, {
      search,
      temperature: url.searchParams.get('temperature') ?? undefined,
      // "Prospectos" son los contactos que están en el embudo; "Contactos" son
      // todos. Es la misma tabla vista con dos criterios distintos.
      onlyStaged: view === 'leads',
      limit,
    }),
    leadStats(context.teamId),
  ]);
  return NextResponse.json({ rows, stats, allowed: true });
}
