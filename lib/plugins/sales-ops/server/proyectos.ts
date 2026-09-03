import 'server-only';

import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  contacts,
  teamCustomerContacts,
  teamCustomers,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskWorkspaces,
} from '@/lib/db/schema';

/**
 * Proyectos de Tareas OS que tienen que ver con un contacto.
 *
 * El vínculo no vive en una columna: está en `team_task_relations`, guardado en
 * cualquiera de las dos orientaciones y contra tres cosas distintas —el
 * contacto, el cliente al que pertenece, o una tarea suelta de un proyecto—.
 * Mirando una sola de esas puntas el resultado da vacío casi siempre, que es
 * exactamente lo que pasaba: desde la ficha no había forma de saber que ese
 * contacto tenía un proyecto abierto.
 *
 * El resultado dice de dónde salió cada uno (`origen`), porque un proyecto que
 * aparece por el cliente no es lo mismo que uno que alguien vinculó a mano y
 * mezclarlos hace que nadie confíe en la lista.
 */
export type ProyectoVinculado = {
  id: number;
  name: string;
  icon: string | null;
  color: string | null;
  workspace: string | null;
  origen: 'contacto' | 'cliente' | 'tarea';
  abiertas: number;
  total: number;
};

/** Relaciones donde `tipo:ids` es uno de los extremos y el otro es `contra`. */
function enAmbosSentidos(teamId: number, tipo: string, ids: number[], contra: string[]) {
  return and(
    eq(teamTaskRelations.teamId, teamId),
    or(
      and(eq(teamTaskRelations.sourceType, tipo), inArray(teamTaskRelations.sourceId, ids), inArray(teamTaskRelations.targetType, contra)),
      and(eq(teamTaskRelations.targetType, tipo), inArray(teamTaskRelations.targetId, ids), inArray(teamTaskRelations.sourceType, contra)),
    ),
  );
}

function otroExtremo(fila: { sourceType: string; sourceId: number; targetType: string; targetId: number }, tipoPropio: string, id: number) {
  const esOrigen = fila.sourceType === tipoPropio && fila.sourceId === id;
  return { tipo: esOrigen ? fila.targetType : fila.sourceType, id: esOrigen ? fila.targetId : fila.sourceId };
}

export async function proyectosDelContacto(teamId: number, chatId: number): Promise<ProyectoVinculado[]> {
  const contacto = await db.query.contacts.findFirst({
    where: and(eq(contacts.chatId, chatId), eq(contacts.teamId, teamId)),
    columns: { id: true },
  });
  if (!contacto) return [];

  const clienteFila = await db.query.teamCustomerContacts.findFirst({
    where: and(eq(teamCustomerContacts.contactId, contacto.id), eq(teamCustomerContacts.teamId, teamId)),
    columns: { customerId: true },
  });

  // Origen más fuerte primero: lo que se guarda gana a lo que se deduce.
  const origenes = new Map<number, ProyectoVinculado['origen']>();
  const anotar = (projectId: number, origen: ProyectoVinculado['origen']) => {
    const previo = origenes.get(projectId);
    if (previo === 'contacto' || (previo === 'cliente' && origen === 'tarea')) return;
    origenes.set(projectId, origen);
  };

  const tareasSueltas = new Map<number, ProyectoVinculado['origen']>();

  const relacionesContacto = await db.select().from(teamTaskRelations)
    .where(enAmbosSentidos(teamId, 'contact', [contacto.id], ['project', 'task']));
  for (const fila of relacionesContacto) {
    const otro = otroExtremo(fila, 'contact', contacto.id);
    if (otro.tipo === 'project') anotar(otro.id, 'contacto');
    else tareasSueltas.set(otro.id, 'contacto');
  }

  if (clienteFila?.customerId) {
    const relacionesCliente = await db.select().from(teamTaskRelations)
      .where(enAmbosSentidos(teamId, 'customer', [clienteFila.customerId], ['project', 'task']));
    for (const fila of relacionesCliente) {
      const otro = otroExtremo(fila, 'customer', clienteFila.customerId);
      if (otro.tipo === 'project') anotar(otro.id, 'cliente');
      else if (!tareasSueltas.has(otro.id)) tareasSueltas.set(otro.id, 'cliente');
    }
  }

  // Una tarea vinculada arrastra a su proyecto: es el acceso que se busca.
  if (tareasSueltas.size) {
    const tareas = await db.select({ id: teamTaskItems.id, projectId: teamTaskItems.projectId })
      .from(teamTaskItems)
      .where(and(eq(teamTaskItems.teamId, teamId), inArray(teamTaskItems.id, [...tareasSueltas.keys()])));
    for (const tarea of tareas) {
      if (tarea.projectId) anotar(tarea.projectId, tareasSueltas.get(tarea.id) === 'contacto' ? 'tarea' : 'cliente');
    }
  }

  const ids = [...origenes.keys()];
  if (!ids.length) return [];

  const [proyectos, tareas] = await Promise.all([
    db.select({
      id: teamTaskProjects.id,
      name: teamTaskProjects.name,
      icon: teamTaskProjects.icon,
      color: teamTaskProjects.color,
      workspace: teamTaskWorkspaces.name,
    })
      .from(teamTaskProjects)
      .leftJoin(teamTaskWorkspaces, eq(teamTaskWorkspaces.id, teamTaskProjects.workspaceId))
      .where(and(eq(teamTaskProjects.teamId, teamId), inArray(teamTaskProjects.id, ids))),
    db.select({ projectId: teamTaskItems.projectId, status: teamTaskItems.status })
      .from(teamTaskItems)
      .where(and(eq(teamTaskItems.teamId, teamId), inArray(teamTaskItems.projectId, ids))),
  ]);

  const conteo = new Map<number, { abiertas: number; total: number }>();
  for (const tarea of tareas) {
    const actual = conteo.get(tarea.projectId) ?? { abiertas: 0, total: 0 };
    actual.total += 1;
    if (tarea.status !== 'done') actual.abiertas += 1;
    conteo.set(tarea.projectId, actual);
  }

  return proyectos
    .map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon,
      color: p.color,
      workspace: p.workspace,
      origen: origenes.get(p.id) ?? 'tarea',
      abiertas: conteo.get(p.id)?.abiertas ?? 0,
      total: conteo.get(p.id)?.total ?? 0,
    }))
    // Los que tienen trabajo pendiente arriba: es lo que uno va a abrir.
    .sort((a, b) => b.abiertas - a.abiertas || a.name.localeCompare(b.name, 'es'));
}

/** Nombre del cliente del contacto, para el encabezado del bloque. */
export async function clienteDelContacto(teamId: number, chatId: number): Promise<{ id: number; name: string } | null> {
  const contacto = await db.query.contacts.findFirst({
    where: and(eq(contacts.chatId, chatId), eq(contacts.teamId, teamId)),
    columns: { id: true },
  });
  if (!contacto) return null;
  const fila = await db.query.teamCustomerContacts.findFirst({
    where: and(eq(teamCustomerContacts.contactId, contacto.id), eq(teamCustomerContacts.teamId, teamId)),
    columns: { customerId: true },
  });
  if (!fila?.customerId) return null;
  const cliente = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, fila.customerId), eq(teamCustomers.teamId, teamId)),
    columns: { id: true, name: true },
  });
  return cliente ? { id: cliente.id, name: cliente.name } : null;
}
