import 'server-only';

import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  teamCustomerContacts,
  teamCustomerTransactions,
  teamCustomers,
  teamDocumentFolders,
  teamDocuments,
  teamMembershipCompanies,
  teamMembershipSubscriptions,
  teamSales,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskWorkspaces,
} from '@/lib/db/schema';
import {
  ENTIDADES_VINCULABLES,
  entidadesDelCliente,
  resolverCliente,
  type EntidadVinculable,
} from '@/lib/links/resolver';
import { assertEntity, insertRelation, type TaskEntityType } from '@/lib/plugins/tasks/server/task-os';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Vinculación libre entre entidades, y lectura del vínculo con el cliente.
 *
 * Hasta ahora vincular sólo se podía desde el modal de una tarea y con una
 * lista cerrada de destinos. Un documento no podía pertenecer a un cliente, y
 * una tarea sólo "sabía" de qué cliente era si alguien lo había dicho tarea por
 * tarea: 74 filas apuntando a cliente sobre 516 tareas.
 *
 * Acá se abre la puerta en los dos sentidos:
 *  - `whatspro_link_entities` conecta CUALQUIER par soportado, sin combinación
 *    predefinida. Es la "opción libre".
 *  - la lectura devuelve además el cliente HEREDADO —el del proyecto que
 *    contiene la tarea, el de la carpeta que contiene el documento— y dice
 *    siempre de dónde salió, para que nadie confunda lo deducido con lo dicho.
 */

const TIPOS = [...ENTIDADES_VINCULABLES, 'document_folder'] as const;
type Tipo = (typeof TIPOS)[number];

export const linksActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_link_entities',
    description:
      'Vincula dos entidades cualesquiera del sistema: tarea↔cliente, documento↔cliente, tarea↔venta, proyecto↔empresa, '
      + 'carpeta de documentos↔cliente, contacto↔suscripción… No hay combinaciones predefinidas. '
      + 'Vincular una CARPETA de documentos o un PROYECTO a un cliente hace que todo lo que contengan lo herede, '
      + 'sin tener que vincular uno por uno. Repetir la misma llamada no duplica el vínculo.',
    inputSchema: {
      type: 'object',
      required: ['source_type', 'source_id', 'target_type', 'target_id'],
      properties: {
        source_type: { type: 'string', enum: [...TIPOS] },
        source_id: { type: 'integer', minimum: 1 },
        target_type: { type: 'string', enum: [...TIPOS] },
        target_id: { type: 'integer', minimum: 1 },
        relation_type: {
          type: 'string', maxLength: 40,
          description: 'Etiqueta del vínculo. Por defecto "related". Otros en uso: shared_in, generated_from, converted_to, checklist_source.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_unlink_entities',
    description: 'Quita un vínculo entre entidades, por su relation_id. No borra ninguna de las dos partes.',
    inputSchema: {
      type: 'object',
      required: ['relation_id', 'confirm'],
      properties: {
        relation_id: { type: 'integer', minimum: 1 },
        confirm: { type: 'boolean', const: true },
      },
      additionalProperties: false,
    },
  },
];

export const linksReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_entity_links',
    description:
      'Todo lo que está vinculado a una entidad, en las dos orientaciones, más el CLIENTE al que pertenece. '
      + 'El cliente puede ser directo (alguien lo vinculó), heredado (sale del proyecto o la carpeta que la contiene) '
      + 'o derivado (votado entre las tareas del proyecto). El campo "origen" siempre dice cuál es: no confundas lo deducido con lo dicho.',
    inputSchema: {
      type: 'object',
      required: ['entity_type', 'entity_id'],
      properties: {
        entity_type: { type: 'string', enum: [...TIPOS] },
        entity_id: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_customer_360',
    description:
      'La ficha completa de un cliente en UNA llamada: contactos de WhatsApp, suscripciones, ventas, movimientos financieros, '
      + 'documentos, tareas (directas y heredadas del proyecto) y todo lo demás vinculado. '
      + 'Reemplaza cruzar siete listados a mano.',
    inputSchema: {
      type: 'object',
      required: ['customer_id'],
      properties: {
        customer_id: { type: 'integer', minimum: 1 },
        include_inherited: { type: 'boolean', description: 'Incluir tareas y documentos que heredan el cliente sin vínculo propio. Por defecto true.' },
      },
      additionalProperties: false,
    },
  },
];

const linkSchema = z.object({
  source_type: z.enum(TIPOS),
  source_id: z.number().int().positive(),
  target_type: z.enum(TIPOS),
  target_id: z.number().int().positive(),
  relation_type: z.string().trim().max(40).optional(),
}).refine(
  (data) => !(data.source_type === data.target_type && data.source_id === data.target_id),
  'una entidad no se puede vincular consigo misma',
);

const unlinkSchema = z.object({
  relation_id: z.number().int().positive(),
  confirm: z.literal(true),
});

const linksSchema = z.object({
  entity_type: z.enum(TIPOS),
  entity_id: z.number().int().positive(),
});

const ficha360Schema = z.object({
  customer_id: z.number().int().positive(),
  include_inherited: z.boolean().default(true),
});

/**
 * Vincular toca dos plugins a la vez. Se exige el permiso de escritura del
 * dominio de CADA extremo: vincular una tarea a un cliente necesita poder
 * escribir tareas y clientes, no uno solo de los dos.
 */
async function assertPermisoDeTipo(context: GrokActionContext, tipo: Tipo) {
  if (tipo === 'task' || tipo === 'project' || tipo === 'workspace') {
    return assertPermission(context, 'tasksWrite', 'tasks');
  }
  if (tipo === 'document' || tipo === 'document_folder') {
    return assertPermission(context, 'documentsWrite', 'documents');
  }
  if (tipo === 'customer') return assertPermission(context, 'customersWrite', 'customers');
  if (tipo === 'contact') return assertPermission(context, 'contacts');
  if (tipo === 'sale') return assertPermission(context, 'salesWrite', 'sales');
  if (tipo === 'subscription' || tipo === 'company') {
    return assertPermission(context, 'membershipsWrite', 'memberships');
  }
  return assertPermission(context, 'financeWrite', 'finance');
}

/**
 * Nombres legibles de MUCHAS entidades de una sola vez.
 *
 * Antes esto era una función por ítem, y cada llamada era una consulta: la
 * ficha 360 de un cliente con 44 vínculos disparaba 44 consultas y tardaba
 * 401 ms, contra los 30-60 ms del resto de las tools. Ahora se agrupa por tipo
 * y va una consulta por tipo presente — como mucho once, sin importar cuántos
 * ítems haya.
 */
async function etiquetasDe(
  teamId: number,
  referencias: Array<{ tipo: Tipo; id: number }>,
): Promise<Map<string, string>> {
  const salida = new Map<string, string>();
  if (!referencias.length) return salida;

  const porTipo = new Map<Tipo, number[]>();
  for (const referencia of referencias) {
    const ids = porTipo.get(referencia.tipo) ?? [];
    if (!ids.includes(referencia.id)) ids.push(referencia.id);
    porTipo.set(referencia.tipo, ids);
  }

  const guardar = (tipo: Tipo, id: number, nombre: string | null | undefined) => {
    salida.set(`${tipo}:${id}`, nombre?.trim() || `${tipo} #${id}`);
  };

  await Promise.all([...porTipo.entries()].map(async ([tipo, ids]) => {
    if (tipo === 'task') {
      const filas = await db.select({ id: teamTaskItems.id, n: teamTaskItems.title }).from(teamTaskItems)
        .where(and(eq(teamTaskItems.teamId, teamId), inArray(teamTaskItems.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n);
    } else if (tipo === 'project') {
      const filas = await db.select({ id: teamTaskProjects.id, n: teamTaskProjects.name }).from(teamTaskProjects)
        .where(and(eq(teamTaskProjects.teamId, teamId), inArray(teamTaskProjects.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n);
    } else if (tipo === 'workspace') {
      const filas = await db.select({ id: teamTaskWorkspaces.id, n: teamTaskWorkspaces.name }).from(teamTaskWorkspaces)
        .where(and(eq(teamTaskWorkspaces.teamId, teamId), inArray(teamTaskWorkspaces.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n);
    } else if (tipo === 'document') {
      const filas = await db.select({ id: teamDocuments.id, n: teamDocuments.title }).from(teamDocuments)
        .where(and(eq(teamDocuments.teamId, teamId), inArray(teamDocuments.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n);
    } else if (tipo === 'document_folder') {
      const filas = await db.select({ id: teamDocumentFolders.id, n: teamDocumentFolders.name }).from(teamDocumentFolders)
        .where(and(eq(teamDocumentFolders.teamId, teamId), inArray(teamDocumentFolders.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n);
    } else if (tipo === 'customer') {
      const filas = await db.select({ id: teamCustomers.id, n: teamCustomers.name }).from(teamCustomers)
        .where(and(eq(teamCustomers.teamId, teamId), inArray(teamCustomers.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n);
    } else if (tipo === 'contact') {
      const filas = await db.select({ id: contacts.id, n: contacts.name }).from(contacts)
        .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n);
    } else if (tipo === 'sale') {
      const filas = await db.select({ id: teamSales.id, n: teamSales.saleNumber }).from(teamSales)
        .where(and(eq(teamSales.teamId, teamId), inArray(teamSales.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n);
    } else if (tipo === 'subscription') {
      const filas = await db.select({
        id: teamMembershipSubscriptions.id,
        n: teamMembershipSubscriptions.planNameSnapshot,
        alt: teamMembershipSubscriptions.subscriptionNumber,
      }).from(teamMembershipSubscriptions)
        .where(and(eq(teamMembershipSubscriptions.teamId, teamId), inArray(teamMembershipSubscriptions.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n || fila.alt);
    } else if (tipo === 'company') {
      const filas = await db.select({ id: teamMembershipCompanies.id, n: teamMembershipCompanies.name }).from(teamMembershipCompanies)
        .where(and(eq(teamMembershipCompanies.teamId, teamId), inArray(teamMembershipCompanies.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, fila.n);
    } else {
      const filas = await db.select({
        id: teamCustomerTransactions.id,
        amount: teamCustomerTransactions.amount,
        currency: teamCustomerTransactions.currency,
      }).from(teamCustomerTransactions)
        .where(and(eq(teamCustomerTransactions.teamId, teamId), inArray(teamCustomerTransactions.id, ids)));
      for (const fila of filas) guardar(tipo, fila.id, `${fila.amount ?? ''} ${fila.currency ?? ''}`.trim());
    }
  }));

  // Lo que no apareció existe como id pero no como fila: se etiqueta igual
  // para que la respuesta no tenga huecos.
  for (const referencia of referencias) {
    const clave = `${referencia.tipo}:${referencia.id}`;
    if (!salida.has(clave)) salida.set(clave, `${referencia.tipo} #${referencia.id}`);
  }
  return salida;
}

async function vincular(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(linkSchema, input);
  await assertPermisoDeTipo(context, data.source_type);
  await assertPermisoDeTipo(context, data.target_type);

  const [origenOk, destinoOk] = await Promise.all([
    assertEntity(context.teamId, data.source_type as TaskEntityType, data.source_id),
    assertEntity(context.teamId, data.target_type as TaskEntityType, data.target_id),
  ]);
  if (!origenOk) throw new Error(`No existe ${data.source_type} #${data.source_id} en este equipo.`);
  if (!destinoOk) throw new Error(`No existe ${data.target_type} #${data.target_id} en este equipo.`);

  const relationType = data.relation_type ?? 'related';

  // La unicidad de la tabla es por orientación, así que el mismo vínculo al
  // revés pasaría el índice y quedaría duplicado. Se chequea a mano.
  const yaExiste = await db.select().from(teamTaskRelations).where(and(
    eq(teamTaskRelations.teamId, context.teamId),
    eq(teamTaskRelations.relationType, relationType),
    or(
      and(
        eq(teamTaskRelations.sourceType, data.source_type), eq(teamTaskRelations.sourceId, data.source_id),
        eq(teamTaskRelations.targetType, data.target_type), eq(teamTaskRelations.targetId, data.target_id),
      ),
      and(
        eq(teamTaskRelations.sourceType, data.target_type), eq(teamTaskRelations.sourceId, data.target_id),
        eq(teamTaskRelations.targetType, data.source_type), eq(teamTaskRelations.targetId, data.source_id),
      ),
    ),
  )).limit(1);

  if (yaExiste.length) {
    return { success: true, already_linked: true, relation: yaExiste[0] };
  }

  const relation = await insertRelation({
    teamId: context.teamId,
    userId: context.userId,
    sourceType: data.source_type as TaskEntityType,
    sourceId: data.source_id,
    targetType: data.target_type as TaskEntityType,
    targetId: data.target_id,
    relationType,
    metadata: {},
  });

  await audit(context, 'GROK_ENTITIES_LINKED', relation?.id ?? 0);

  const hereda = data.source_type === 'document_folder' || data.source_type === 'project'
    || data.target_type === 'document_folder' || data.target_type === 'project';

  const nombres = await etiquetasDe(context.teamId, [
    { tipo: data.source_type, id: data.source_id },
    { tipo: data.target_type, id: data.target_id },
  ]);

  return {
    success: true,
    already_linked: false,
    relation,
    vinculo: `${nombres.get(`${data.source_type}:${data.source_id}`)} ↔ ${nombres.get(`${data.target_type}:${data.target_id}`)}`,
    nota: hereda
      ? 'Lo que esté dentro de ese contenedor hereda el vínculo automáticamente: no hace falta vincular uno por uno.'
      : undefined,
  };
}

async function desvincular(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(unlinkSchema, input);
  const relacion = await db.query.teamTaskRelations.findFirst({
    where: and(eq(teamTaskRelations.id, data.relation_id), eq(teamTaskRelations.teamId, context.teamId)),
  });
  if (!relacion) throw new Error('El vínculo no existe en este equipo.');

  await assertPermisoDeTipo(context, relacion.sourceType as Tipo);
  await assertPermisoDeTipo(context, relacion.targetType as Tipo);

  await db.delete(teamTaskRelations)
    .where(and(eq(teamTaskRelations.id, data.relation_id), eq(teamTaskRelations.teamId, context.teamId)));
  await audit(context, 'GROK_ENTITIES_UNLINKED', data.relation_id);
  return { success: true, deleted: true };
}

async function vinculosDe(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(linksSchema, input);

  const filas = await db.select().from(teamTaskRelations).where(and(
    eq(teamTaskRelations.teamId, context.teamId),
    or(
      and(eq(teamTaskRelations.sourceType, data.entity_type), eq(teamTaskRelations.sourceId, data.entity_id)),
      and(eq(teamTaskRelations.targetType, data.entity_type), eq(teamTaskRelations.targetId, data.entity_id)),
    ),
  ));

  const extremos = filas.map((fila) => {
    const esOrigen = fila.sourceType === data.entity_type && fila.sourceId === data.entity_id;
    return {
      relation_id: fila.id,
      relation_type: fila.relationType,
      tipo: (esOrigen ? fila.targetType : fila.sourceType) as Tipo,
      id: esOrigen ? fila.targetId : fila.sourceId,
    };
  });
  // Una consulta por tipo, no una por vínculo.
  const nombres = await etiquetasDe(context.teamId, [
    ...extremos,
    { tipo: data.entity_type, id: data.entity_id },
  ]);
  const vinculos = extremos.map((extremo) => ({
    ...extremo,
    nombre: nombres.get(`${extremo.tipo}:${extremo.id}`)!,
  }));

  const cliente = ENTIDADES_VINCULABLES.includes(data.entity_type as EntidadVinculable)
    ? await resolverCliente(context.teamId, data.entity_type as EntidadVinculable, data.entity_id)
    : null;

  return {
    object: 'entity_links',
    entity: {
      tipo: data.entity_type,
      id: data.entity_id,
      nombre: nombres.get(`${data.entity_type}:${data.entity_id}`)!,
    },
    cliente,
    count: vinculos.length,
    data: vinculos,
  };
}

async function ficha360(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'customersRead', 'customers');
  const data = parse(ficha360Schema, input);

  const cliente = await db.query.teamCustomers.findFirst({
    where: and(eq(teamCustomers.id, data.customer_id), eq(teamCustomers.teamId, context.teamId)),
  });
  if (!cliente) throw new Error('El cliente no existe en este equipo.');

  const [contactosVinculados, suscripciones, , transacciones, vinculadas] = await Promise.all([
    // El vínculo cliente↔contacto tiene su propia tabla; no pasa por relations.
    db.select({ id: contacts.id, name: contacts.name, remoteJid: chats.remoteJid })
      .from(teamCustomerContacts)
      .innerJoin(contacts, eq(teamCustomerContacts.contactId, contacts.id))
      .innerJoin(chats, eq(contacts.chatId, chats.id))
      .where(and(
        eq(teamCustomerContacts.teamId, context.teamId),
        eq(teamCustomerContacts.customerId, data.customer_id),
      )),
    db.select().from(teamMembershipSubscriptions).where(and(
      eq(teamMembershipSubscriptions.teamId, context.teamId),
      eq(teamMembershipSubscriptions.customerId, data.customer_id),
    )),
    // Antes acá se traían TODAS las ventas del equipo para filtrarlas en
    // memoria. Con la tabla vacía no se notaba; con mil ventas es traerse mil
    // filas para quedarse con tres. Ahora se acota en la consulta.
    Promise.resolve([]),
    // Con `.slice(0, 50)` más abajo se traían TODAS las transacciones del
    // cliente para descartar casi todas en memoria. El recorte va en la
    // consulta, y con orden explícito para que las 50 sean las últimas.
    db.select().from(teamCustomerTransactions).where(and(
      eq(teamCustomerTransactions.teamId, context.teamId),
      eq(teamCustomerTransactions.customerId, data.customer_id),
    )).orderBy(desc(teamCustomerTransactions.transactionDate)).limit(50),
    entidadesDelCliente(context.teamId, data.customer_id),
  ]);

  const porTipo = (tipo: string) => vinculadas.filter((fila) => fila.tipo === tipo);

  // Todos los nombres de los vínculos, en una tanda por tipo.
  const nombres = await etiquetasDe(
    context.teamId,
    vinculadas.map((fila) => ({ tipo: fila.tipo as Tipo, id: fila.id })),
  );
  const nombreDe = (tipo: Tipo, id: number) => nombres.get(`${tipo}:${id}`) ?? `${tipo} #${id}`;

  const tareasDirectas = porTipo('task').map((fila) => ({
    id: fila.id,
    titulo: nombreDe('task', fila.id),
    origen: 'directo' as const,
  }));

  let tareasHeredadas: Array<{ id: number; titulo: string; origen: 'heredado' }> = [];
  if (data.include_inherited) {
    // Tareas de los proyectos que pertenecen a este cliente y que no tienen
    // vínculo propio: son suyas igual, sólo que nadie las vinculó una por una.
    const proyectos = porTipo('project').map((fila) => fila.id);
    if (proyectos.length) {
      const directas = new Set(tareasDirectas.map((tarea) => tarea.id));
      const tareas = await db.select({ id: teamTaskItems.id, title: teamTaskItems.title })
        .from(teamTaskItems)
        .where(and(eq(teamTaskItems.teamId, context.teamId), inArray(teamTaskItems.projectId, proyectos)));
      tareasHeredadas = tareas
        .filter((tarea) => !directas.has(tarea.id))
        .map((tarea) => ({ id: tarea.id, titulo: tarea.title, origen: 'heredado' as const }));
    }
  }

  const documentosDirectos = porTipo('document').map((fila) => ({
    id: fila.id,
    titulo: nombreDe('document', fila.id),
    origen: 'directo' as const,
  }));

  let documentosHeredados: Array<{ id: number; titulo: string; origen: 'heredado' }> = [];
  if (data.include_inherited) {
    const carpetas = porTipo('document_folder').map((fila) => fila.id);
    if (carpetas.length) {
      const directos = new Set(documentosDirectos.map((doc) => doc.id));
      const docs = await db.select({ id: teamDocuments.id, title: teamDocuments.title })
        .from(teamDocuments)
        .where(and(eq(teamDocuments.teamId, context.teamId), inArray(teamDocuments.folderId, carpetas)));
      documentosHeredados = docs
        .filter((doc) => !directos.has(doc.id))
        .map((doc) => ({ id: doc.id, titulo: doc.title, origen: 'heredado' as const }));
    }
  }

  const idsVenta = porTipo('sale').map((fila) => fila.id);
  const idsContacto = contactosVinculados.map((contacto) => contacto.id);
  const ventasDelCliente = (idsVenta.length || idsContacto.length)
    ? await db.select().from(teamSales).where(and(
        eq(teamSales.teamId, context.teamId),
        or(
          idsVenta.length ? inArray(teamSales.id, idsVenta) : undefined,
          idsContacto.length ? inArray(teamSales.contactId, idsContacto) : undefined,
        ),
      ))
    : [];

  return {
    object: 'customer_360',
    cliente: {
      id: cliente.id,
      name: cliente.name,
      email: cliente.email,
      phone: cliente.phone,
      status: cliente.status,
      source: cliente.source,
      notes: cliente.notes,
    },
    contactos: contactosVinculados.map((contacto) => ({
      id: contacto.id,
      name: contacto.name,
      phone: contacto.remoteJid.replace(/@.*$/, ''),
    })),
    suscripciones: suscripciones.map((sub) => ({
      id: sub.id, plan: sub.planNameSnapshot, status: sub.status,
      payment_status: sub.paymentStatus, end_date: sub.endDate, price: sub.price, currency: sub.currency,
    })),
    ventas: ventasDelCliente.map((venta) => ({
      id: venta.id, numero: venta.saleNumber, status: venta.status, total: venta.total, currency: venta.currency,
    })),
    transacciones: transacciones.map((tx) => ({
      id: tx.id, amount: tx.amount, currency: tx.currency,
      payment_status: tx.paymentStatus, date: tx.transactionDate?.toISOString().slice(0, 10) ?? null,
    })),
    tareas: [...tareasDirectas, ...tareasHeredadas],
    documentos: [...documentosDirectos, ...documentosHeredados],
    otros_vinculos: vinculadas.filter(
      (fila) => !['task', 'document', 'project', 'document_folder', 'contact', 'sale'].includes(fila.tipo),
    ),
    resumen: {
      tareas_directas: tareasDirectas.length,
      tareas_heredadas: tareasHeredadas.length,
      documentos_directos: documentosDirectos.length,
      documentos_heredados: documentosHeredados.length,
    },
  };
}

export async function executeLinksTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_link_entities') return vincular(input, context);
  if (name === 'whatspro_unlink_entities') return desvincular(input, context);
  if (name === 'whatspro_entity_links') return vinculosDe(input, context);
  if (name === 'whatspro_customer_360') return ficha360(input, context);
  throw new Error(`Unknown links tool: ${name}`);
}
