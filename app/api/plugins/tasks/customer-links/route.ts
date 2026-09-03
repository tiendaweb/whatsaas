import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { listEntityLinksForTasks } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Vínculos de MUCHAS tareas con clientes y con leads, en una sola llamada.
 *
 * Existe para que las tarjetas de la lista puedan mostrar el chip sin abrir
 * cada tarea (antes el mapa sólo se poblaba al abrir una), y para que el
 * filtro por cliente/lead pueda resolverse sin recorrer tarea por tarea.
 *
 * "Lead" es un contacto del CRM: mismo mecanismo de relaciones, distinto
 * tipo de entidad.
 */
export async function GET(request: Request) {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const raw = new URL(request.url).searchParams.get('task_ids');
  const taskIds = raw
    ? raw.split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0).slice(0, 500)
    : null;

  const [customers, contacts] = await Promise.all([
    listEntityLinksForTasks(ctx.team.id, taskIds, 'customer'),
    listEntityLinksForTasks(ctx.team.id, taskIds, 'contact'),
  ]);

  const asObject = (map: Map<number, number[]>) =>
    Object.fromEntries([...map.entries()].map(([taskId, ids]) => [String(taskId), ids]));

  return NextResponse.json({ customers: asObject(customers), contacts: asObject(contacts) });
}
