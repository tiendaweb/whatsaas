import 'server-only';

import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  contacts,
  teamCustomerContacts,
  teamCustomers,
  teamDocumentFolders,
  teamDocuments,
  teamTaskItems,
  teamTaskRelations,
} from '@/lib/db/schema';

/**
 * A qué cliente pertenece una cosa.
 *
 * El vínculo con el cliente vive hoy en tres lugares distintos y ninguno los
 * junta: una relación explícita en `team_task_relations`, el cliente del
 * proyecto donde vive la tarea, o el cliente del contacto con el que se está
 * hablando. Cada consumidor lo resolvía a su manera —el route de
 * `client-projects` tiene 60 líneas de derivación propia— y los demás
 * simplemente no lo resolvían: un documento nunca supo de quién era.
 *
 * Acá se decide una sola vez, con una regla explícita:
 *
 *   1. VÍNCULO DIRECTO: alguien lo dijo. Manda siempre.
 *   2. HEREDADO: se deduce del contenedor (el proyecto de la tarea, la carpeta
 *      del documento) o del contacto vinculado.
 *   3. DERIVADO: se vota entre lo que apunta a ese contenedor. Es el más débil
 *      y sólo se usa para proyectos.
 *
 * El resultado SIEMPRE dice de dónde salió. Un vínculo heredado que se
 * presenta como si alguien lo hubiera puesto a mano es peor que no tenerlo:
 * nadie sabe si puede confiar en él ni dónde corregirlo.
 */

export type OrigenVinculo = 'directo' | 'heredado' | 'derivado';

export type VinculoCliente = {
  customerId: number;
  customerName: string | null;
  origen: OrigenVinculo;
  /** Qué lo explica, en texto: "proyecto «Ventas · Noelia»". */
  via: string;
};

/** Entidades que pueden colgar de un cliente. */
export const ENTIDADES_VINCULABLES = [
  'task', 'project', 'workspace', 'document', 'contact', 'customer',
  'sale', 'transaction', 'subscription', 'company',
] as const;
export type EntidadVinculable = (typeof ENTIDADES_VINCULABLES)[number];

/**
 * Una relación `task↔customer` está guardada en las dos orientaciones en la
 * base (74 filas en un sentido, 14 en el otro). Cualquier consulta que mire un
 * solo lado pierde la mitad, así que se busca siempre en ambos.
 */
function enAmbosSentidos(teamId: number, tipo: string, ids: number[], contra: string) {
  return and(
    eq(teamTaskRelations.teamId, teamId),
    or(
      and(eq(teamTaskRelations.sourceType, tipo), inArray(teamTaskRelations.sourceId, ids), eq(teamTaskRelations.targetType, contra)),
      and(eq(teamTaskRelations.targetType, tipo), inArray(teamTaskRelations.targetId, ids), eq(teamTaskRelations.sourceType, contra)),
    ),
  );
}

function otroExtremo(relacion: { sourceType: string; sourceId: number; targetId: number }, tipoPropio: string) {
  return relacion.sourceType === tipoPropio ? relacion.targetId : relacion.sourceId;
}

async function nombreDeCliente(teamId: number, customerId: number) {
  const cliente = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, customerId), eq(teamCustomers.teamId, teamId)),
    columns: { name: true },
  });
  return cliente?.name ?? null;
}

/** Vínculo explícito cliente↔entidad, en cualquier orientación. */
async function clienteDirecto(teamId: number, tipo: string, id: number): Promise<number | null> {
  const filas = await db.select().from(teamTaskRelations)
    .where(enAmbosSentidos(teamId, tipo, [id], 'customer'));
  if (!filas.length) return null;
  return otroExtremo(filas[0], tipo);
}

/** Cliente de un proyecto: explícito o votado entre las tareas que contiene. */
async function clienteDeProyecto(teamId: number, projectId: number): Promise<{ id: number; origen: OrigenVinculo } | null> {
  const directo = await clienteDirecto(teamId, 'project', projectId);
  if (directo) return { id: directo, origen: 'directo' };

  const tareas = await db.select({ id: teamTaskItems.id })
    .from(teamTaskItems)
    .where(and(eq(teamTaskItems.teamId, teamId), eq(teamTaskItems.projectId, projectId)));
  if (!tareas.length) return null;

  const filas = await db.select().from(teamTaskRelations)
    .where(enAmbosSentidos(teamId, 'task', tareas.map((t) => t.id), 'customer'));
  if (!filas.length) return null;

  const votos = new Map<number, number>();
  for (const fila of filas) {
    const customerId = otroExtremo(fila, 'task');
    votos.set(customerId, (votos.get(customerId) ?? 0) + 1);
  }
  // Desempate estable por id, para que dos llamadas den lo mismo.
  const ganador = [...votos.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  return { id: ganador, origen: 'derivado' };
}

/** Cliente al que pertenece un contacto del CRM. */
async function clienteDeContacto(teamId: number, contactId: number): Promise<number | null> {
  const fila = await db.query.teamCustomerContacts.findFirst({
    where: and(eq(teamCustomerContacts.contactId, contactId), eq(teamCustomerContacts.teamId, teamId)),
    columns: { customerId: true },
  });
  return fila?.customerId ?? null;
}

/** Sube por las carpetas del documento hasta encontrar una vinculada. */
async function clienteDeCarpeta(teamId: number, folderId: number | null): Promise<{ id: number; via: string } | null> {
  let actual = folderId;
  // Las carpetas llegan hasta 5 niveles; el tope evita un ciclo si algo quedó mal.
  for (let salto = 0; salto < 6 && actual != null; salto++) {
    const carpeta = await db.query.teamDocumentFolders.findFirst({
      where: and(eq(teamDocumentFolders.id, actual), eq(teamDocumentFolders.teamId, teamId)),
      columns: { id: true, name: true, parentId: true },
    });
    if (!carpeta) return null;
    const directo = await clienteDirecto(teamId, 'document_folder', carpeta.id);
    if (directo) return { id: directo, via: `carpeta «${carpeta.name}»` };
    actual = carpeta.parentId;
  }
  return null;
}

/**
 * Resuelve el cliente de una entidad. Devuelve `null` si no hay ninguno, en
 * vez de inventar uno.
 */
export async function resolverCliente(
  teamId: number,
  tipo: EntidadVinculable,
  id: number,
): Promise<VinculoCliente | null> {
  if (tipo === 'customer') {
    const nombre = await nombreDeCliente(teamId, id);
    return nombre === null ? null : { customerId: id, customerName: nombre, origen: 'directo', via: 'es el cliente' };
  }

  const directo = await clienteDirecto(teamId, tipo, id);
  if (directo) {
    return { customerId: directo, customerName: await nombreDeCliente(teamId, directo), origen: 'directo', via: 'vínculo directo' };
  }

  if (tipo === 'task') {
    const tarea = await db.query.teamTaskItems.findFirst({
      where: and(eq(teamTaskItems.id, id), eq(teamTaskItems.teamId, teamId)),
      columns: { projectId: true },
      with: { project: { columns: { name: true } } },
    });
    if (!tarea) return null;
    const delProyecto = await clienteDeProyecto(teamId, tarea.projectId);
    if (delProyecto) {
      return {
        customerId: delProyecto.id,
        customerName: await nombreDeCliente(teamId, delProyecto.id),
        // Aunque el proyecto lo tenga explícito, para la TAREA es heredado.
        origen: delProyecto.origen === 'directo' ? 'heredado' : 'derivado',
        via: `proyecto «${(tarea as { project?: { name: string } }).project?.name ?? tarea.projectId}»`,
      };
    }
    return null;
  }

  if (tipo === 'project') {
    const delProyecto = await clienteDeProyecto(teamId, id);
    if (!delProyecto) return null;
    return {
      customerId: delProyecto.id,
      customerName: await nombreDeCliente(teamId, delProyecto.id),
      origen: delProyecto.origen,
      via: delProyecto.origen === 'derivado' ? 'mayoría de sus tareas' : 'vínculo directo',
    };
  }

  if (tipo === 'document') {
    const documento = await db.query.teamDocuments.findFirst({
      where: and(eq(teamDocuments.id, id), eq(teamDocuments.teamId, teamId)),
      columns: { folderId: true },
    });
    if (!documento) return null;
    const deCarpeta = await clienteDeCarpeta(teamId, documento.folderId);
    if (!deCarpeta) return null;
    return {
      customerId: deCarpeta.id,
      customerName: await nombreDeCliente(teamId, deCarpeta.id),
      origen: 'heredado',
      via: deCarpeta.via,
    };
  }

  if (tipo === 'contact') {
    const delContacto = await clienteDeContacto(teamId, id);
    if (!delContacto) return null;
    return {
      customerId: delContacto,
      customerName: await nombreDeCliente(teamId, delContacto),
      origen: 'heredado',
      via: 'contacto vinculado al cliente',
    };
  }

  return null;
}

/**
 * Varias entidades de una vez. Las resoluciones son independientes entre sí,
 * así que van en paralelo: en serie, una lista de 50 ítems encadenaba 50
 * esperas de red que no dependían una de otra.
 *
 * Sigue siendo más caro que una consulta única —cada resolución puede tener que
 * subir por proyectos o carpetas— así que no la uses para pintar listas largas:
 * para eso conviene resolver el cliente del CONTENEDOR una sola vez.
 */
export async function resolverClientes(
  teamId: number,
  entidades: Array<{ tipo: EntidadVinculable; id: number }>,
): Promise<Map<string, VinculoCliente>> {
  const resueltas = await Promise.all(
    entidades.map(async (entidad) => [entidad, await resolverCliente(teamId, entidad.tipo, entidad.id)] as const),
  );
  const salida = new Map<string, VinculoCliente>();
  for (const [entidad, vinculo] of resueltas) {
    if (vinculo) salida.set(`${entidad.tipo}:${entidad.id}`, vinculo);
  }
  return salida;
}

/** Todo lo que cuelga de un cliente, mirando las dos orientaciones. */
export async function entidadesDelCliente(teamId: number, customerId: number) {
  // Una sola consulta: la condición "cualquier relación donde el cliente sea
  // uno de los dos extremos" ya incluye las de tipo tarea. Antes se hacían dos
  // —una de ellas subconjunto estricto de la otra— y encima en serie, para
  // después deduplicar en memoria lo que nunca hizo falta traer dos veces.
  const todas = await db.select().from(teamTaskRelations)
    .where(and(
      eq(teamTaskRelations.teamId, teamId),
      or(
        and(eq(teamTaskRelations.sourceType, 'customer'), eq(teamTaskRelations.sourceId, customerId)),
        and(eq(teamTaskRelations.targetType, 'customer'), eq(teamTaskRelations.targetId, customerId)),
      ),
    ));

  return todas.map((fila) => {
    const esOrigen = fila.sourceType === 'customer' && fila.sourceId === customerId;
    return {
      relation_id: fila.id,
      tipo: esOrigen ? fila.targetType : fila.sourceType,
      id: esOrigen ? fila.targetId : fila.sourceId,
      relation_type: fila.relationType,
    };
  });
}

/** Etiqueta legible de un contacto, para los resultados. */
export async function nombreDeContacto(teamId: number, contactId: number) {
  const contacto = await db.query.contacts.findFirst({
    where: and(eq(contacts.id, contactId), eq(contacts.teamId, teamId)),
    columns: { name: true },
  });
  return contacto?.name ?? null;
}
