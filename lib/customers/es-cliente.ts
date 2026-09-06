import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  contactTags,
  contacts,
  funnelStages,
  tags,
  teamCustomerContacts,
  teamCustomerTransactions,
  teamCustomers,
  teamFinancialEntries,
  teamMembershipSubscriptions,
  teamSales,
} from '@/lib/db/schema';

/**
 * LA definición de "es cliente". Una sola, para todo el producto.
 *
 * Hasta acá "cliente" se decidía de cinco maneras distintas que se
 * contradecían entre sí: el vínculo en `team_customer_contacts`, el match por
 * teléfono de la ruta `by-contact`, el `custom_data.cliente` del CRM, la
 * etiqueta de producto y la suscripción activa buscada sólo por `contact_id`.
 * Resultado medido en el equipo 2: 33 contactos vinculados sin análisis porque
 * el prefiltro los excluía, y 3 con membresía activa que la UI mostraba como
 * cliente y el motor trataba como lead.
 *
 * Precedencia (la primera que aplica manda):
 *   1. `vinculo`            — fila en team_customer_contacts.
 *   2. `suscripcion_activa` — membresía activa por contact_id, o por customer_id
 *                             de una ficha cuyo teléfono coincide con el contacto.
 *   3. `venta_pagada`       — venta `paid` del contacto, ingreso `paid` de
 *                             Finanzas o transacción de la ficha coincidente.
 *   4. `telefono`           — hay ficha con el mismo teléfono y nada de lo anterior.
 *   5. evidencia débil      — custom_data.cliente, etiqueta de producto, etapa
 *                             "Cliente…". NUNCA alcanza para `esCliente`: son
 *                             hipótesis que alguien cargó a mano, no hechos.
 *
 * Todo con firma `(teamId, …)` y sin cruzar equipos: cada query lleva el team.
 */

export type FuenteCliente = 'vinculo' | 'suscripcion_activa' | 'venta_pagada' | 'telefono';
export type EvidenciaDebil = 'custom_data' | 'tag_producto' | 'etapa';
export type EstadoCliente = {
  esCliente: boolean;
  fuente: FuenteCliente | null;
  customerId: number | null;
  evidenciaDebil: EvidenciaDebil[];
};

/** Etiquetas de producto del equipo 2 que el CRM usaba como "ya compró". Misma expresión que `rules.ts`. */
export const PATRON_ETIQUETA_PRODUCTO = /membresia anual|a medida/;

export const SIN_CLIENTE: EstadoCliente = Object.freeze({ esCliente: false, fuente: null, customerId: null, evidenciaDebil: [] }) as EstadoCliente;

/** Teléfono a dígitos: es lo que `convertContactToCustomer` y `by-contact` ya hacían cada uno por su lado. */
export function soloDigitos(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Dígitos del JID de un chat (`549…@s.whatsapp.net` → `549…`). */
export function digitosDelJid(remoteJid: string | null | undefined): string {
  return soloDigitos((remoteJid ?? '').split('@')[0]);
}

/** La misma normalización en SQL, para que el match por teléfono sea uno solo en toda la base. */
export const telefonoDigitosSql = (col: SQL) => sql`regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g')`;

function normalizarTexto(text: string | null | undefined): string {
  return (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function esVerdadero(value: unknown): boolean {
  return value === true || value === 'true' || value === 'si' || value === 'sí' || value === 1;
}

const LOTE = 500;

function enLotes<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += LOTE) out.push(items.slice(i, i + LOTE));
  return out;
}

/**
 * Resuelve en lote, con pocas queries (una por hecho, no una por contacto).
 * Los ids que no son del equipo no aparecen en el mapa.
 */
export async function resolverClientes(teamId: number, contactIds: number[]): Promise<Map<number, EstadoCliente>> {
  const out = new Map<number, EstadoCliente>();
  const ids = [...new Set(contactIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return out;

  // Base: el contacto, su etapa y su custom_data.
  const filas: Array<{ id: number; customData: Record<string, unknown> | null; funnelStageId: number | null }> = [];
  for (const lote of enLotes(ids)) {
    filas.push(
      ...(await db
        .select({ id: contacts.id, customData: contacts.customData, funnelStageId: contacts.funnelStageId })
        .from(contacts)
        .where(and(eq(contacts.teamId, teamId), inArray(contacts.id, lote)))),
    );
  }
  if (!filas.length) return out;
  const idsReales = filas.map((f) => f.id);

  // 1. Vínculo explícito.
  const vinculo = new Map<number, number>();
  // 4. Ficha con el mismo teléfono (por el teléfono del contacto o por el JID de su chat).
  const porTelefono = new Map<number, number>();
  for (const lote of enLotes(idsReales)) {
    const links = await db
      .select({ contactId: teamCustomerContacts.contactId, customerId: teamCustomerContacts.customerId })
      .from(teamCustomerContacts)
      .where(and(eq(teamCustomerContacts.teamId, teamId), inArray(teamCustomerContacts.contactId, lote)));
    for (const l of links) if (!vinculo.has(l.contactId)) vinculo.set(l.contactId, l.customerId);

    const coincidencias = (await db.execute(sql`
      select c.id as contact_id, tc.id as customer_id
      from contacts c
      left join chats ch on ch.id = c.chat_id
      inner join team_customers tc
        on tc.team_id = ${teamId}
       and ${telefonoDigitosSql(sql`tc.phone`)} <> ''
       and ${telefonoDigitosSql(sql`tc.phone`)} in (
         ${telefonoDigitosSql(sql`c.phone`)},
         ${telefonoDigitosSql(sql`split_part(coalesce(ch.remote_jid, ''), '@', 1)`)}
       )
      where c.team_id = ${teamId} and c.id in (${sql.join(lote.map((id) => sql`${id}`), sql`, `)})
      order by c.id, tc.updated_at desc nulls last, tc.id desc
    `)) as unknown as Array<{ contact_id: number; customer_id: number }>;
    for (const m of coincidencias) if (!porTelefono.has(Number(m.contact_id))) porTelefono.set(Number(m.contact_id), Number(m.customer_id));
  }

  // La ficha "candidata" de cada contacto: la vinculada o, si no hay, la que coincide por teléfono.
  const fichaDe = (contactId: number): number | null => vinculo.get(contactId) ?? porTelefono.get(contactId) ?? null;
  const fichas = [...new Set(idsReales.map(fichaDe).filter((id): id is number => id != null))];
  const contactosDeFicha = new Map<number, number[]>();
  for (const id of idsReales) {
    const ficha = fichaDe(id);
    if (ficha != null) contactosDeFicha.set(ficha, [...(contactosDeFicha.get(ficha) ?? []), id]);
  }

  // 2. Suscripción activa: por contacto o por la ficha candidata.
  const suscripcion = new Map<number, number | null>();
  for (const lote of enLotes(idsReales)) {
    const subs = await db
      .select({ contactId: teamMembershipSubscriptions.contactId, customerId: teamMembershipSubscriptions.customerId })
      .from(teamMembershipSubscriptions)
      .where(and(eq(teamMembershipSubscriptions.teamId, teamId), eq(teamMembershipSubscriptions.status, 'active'), inArray(teamMembershipSubscriptions.contactId, lote)));
    for (const s of subs) if (s.contactId != null && !suscripcion.has(s.contactId)) suscripcion.set(s.contactId, s.customerId ?? null);
  }
  for (const lote of enLotes(fichas)) {
    const subs = await db
      .select({ customerId: teamMembershipSubscriptions.customerId })
      .from(teamMembershipSubscriptions)
      .where(and(eq(teamMembershipSubscriptions.teamId, teamId), eq(teamMembershipSubscriptions.status, 'active'), inArray(teamMembershipSubscriptions.customerId, lote)));
    for (const s of subs) {
      if (s.customerId == null) continue;
      for (const contactId of contactosDeFicha.get(s.customerId) ?? []) if (!suscripcion.has(contactId)) suscripcion.set(contactId, s.customerId);
    }
  }

  // 3. Venta pagada: venta del contacto, ingreso cobrado o transacción de la ficha.
  const ventaPagada = new Map<number, number | null>();
  for (const lote of enLotes(idsReales)) {
    const ventas = await db
      .select({ contactId: teamSales.contactId, customerId: teamSales.customerId })
      .from(teamSales)
      .where(and(eq(teamSales.teamId, teamId), eq(teamSales.status, 'paid'), inArray(teamSales.contactId, lote)));
    for (const v of ventas) if (v.contactId != null && !ventaPagada.has(v.contactId)) ventaPagada.set(v.contactId, v.customerId ?? null);
  }
  for (const lote of enLotes(fichas)) {
    const [ingresos, transacciones] = await Promise.all([
      db
        .select({ customerId: teamFinancialEntries.customerId })
        .from(teamFinancialEntries)
        .where(and(eq(teamFinancialEntries.teamId, teamId), eq(teamFinancialEntries.type, 'income'), eq(teamFinancialEntries.status, 'paid'), inArray(teamFinancialEntries.customerId, lote))),
      db
        .select({ customerId: teamCustomerTransactions.customerId })
        .from(teamCustomerTransactions)
        .where(and(eq(teamCustomerTransactions.teamId, teamId), inArray(teamCustomerTransactions.customerId, lote), sql`upper(coalesce(${teamCustomerTransactions.paymentStatus}, '')) not in ('FAILED', 'CANCELLED', 'REFUNDED')`)),
    ]);
    for (const r of [...ingresos, ...transacciones]) {
      if (r.customerId == null) continue;
      for (const contactId of contactosDeFicha.get(r.customerId) ?? []) if (!ventaPagada.has(contactId)) ventaPagada.set(contactId, r.customerId);
    }
  }

  // 5. Evidencia débil: etiqueta de producto y etapa "Cliente…".
  const conEtiqueta = new Set<number>();
  for (const lote of enLotes(idsReales)) {
    const etiquetas = await db
      .select({ contactId: contactTags.contactId, name: tags.name })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(and(eq(tags.teamId, teamId), inArray(contactTags.contactId, lote)));
    for (const e of etiquetas) if (PATRON_ETIQUETA_PRODUCTO.test(normalizarTexto(e.name))) conEtiqueta.add(e.contactId);
  }
  const etapasCliente = new Set<number>();
  const etapaIds = [...new Set(filas.map((f) => f.funnelStageId).filter((id): id is number => id != null))];
  if (etapaIds.length) {
    const etapas = await db
      .select({ id: funnelStages.id, name: funnelStages.name })
      .from(funnelStages)
      .where(and(eq(funnelStages.teamId, teamId), inArray(funnelStages.id, etapaIds)));
    for (const e of etapas) if (normalizarTexto(e.name).trim().startsWith('cliente')) etapasCliente.add(e.id);
  }

  for (const fila of filas) {
    const debil: EvidenciaDebil[] = [];
    if (esVerdadero((fila.customData ?? {}).cliente)) debil.push('custom_data');
    if (conEtiqueta.has(fila.id)) debil.push('tag_producto');
    if (fila.funnelStageId != null && etapasCliente.has(fila.funnelStageId)) debil.push('etapa');

    let estado: EstadoCliente;
    if (vinculo.has(fila.id)) {
      estado = { esCliente: true, fuente: 'vinculo', customerId: vinculo.get(fila.id)!, evidenciaDebil: debil };
    } else if (suscripcion.has(fila.id)) {
      estado = { esCliente: true, fuente: 'suscripcion_activa', customerId: suscripcion.get(fila.id) ?? fichaDe(fila.id), evidenciaDebil: debil };
    } else if (ventaPagada.has(fila.id)) {
      estado = { esCliente: true, fuente: 'venta_pagada', customerId: fichaDe(fila.id) ?? ventaPagada.get(fila.id) ?? null, evidenciaDebil: debil };
    } else if (porTelefono.has(fila.id)) {
      estado = { esCliente: true, fuente: 'telefono', customerId: porTelefono.get(fila.id)!, evidenciaDebil: debil };
    } else {
      estado = { esCliente: false, fuente: null, customerId: null, evidenciaDebil: debil };
    }
    out.set(fila.id, estado);
  }
  return out;
}

/** Contacto de un chat, si lo hay. Un chat sin ficha de contacto no puede ser cliente. */
async function contactoDelChat(teamId: number, chatId: number): Promise<number | null> {
  const row = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, teamId), eq(contacts.chatId, chatId)),
    columns: { id: true },
  });
  return row?.id ?? null;
}

export async function resolverCliente(teamId: number, ref: { contactId: number } | { chatId: number }): Promise<EstadoCliente> {
  const contactId = 'contactId' in ref ? ref.contactId : await contactoDelChat(teamId, ref.chatId);
  if (contactId == null) return SIN_CLIENTE;
  const mapa = await resolverClientes(teamId, [contactId]);
  return mapa.get(contactId) ?? SIN_CLIENTE;
}

/**
 * Vincula el contacto a la ficha que YA le corresponde (teléfono igual,
 * membresía o venta a nombre de esa ficha) sin crear ninguna ficha nueva. Es
 * la misma regla de dedupe que aplica `convertContactToCustomer`; acá sólo se
 * aplica sola, para que el motor no tenga que esperar a que alguien apriete
 * "Registrar como cliente" en una persona que ya paga.
 *
 * Avisa al motor comercial (análisis stale + reclasificación por reglas) salvo
 * que se pida `silencioso`: el dossier lo llama mientras arma un análisis y ahí
 * no tiene sentido disparar otro.
 */
export async function vincularSiCoincide(
  teamId: number,
  contactId: number,
  actorId: number | null,
  opts: { silencioso?: boolean } = {},
): Promise<{ linked: boolean; customerId: number | null }> {
  const estado = await resolverCliente(teamId, { contactId });
  if (estado.fuente === 'vinculo' || !estado.customerId) return { linked: false, customerId: estado.customerId };

  const [link] = await db
    .insert(teamCustomerContacts)
    .values({ teamId, customerId: estado.customerId, contactId })
    .onConflictDoNothing()
    .returning({ id: teamCustomerContacts.id });
  if (!link) return { linked: false, customerId: estado.customerId };

  await db.insert(activityLogs).values({
    teamId,
    userId: actorId,
    action: 'CUSTOMER_LINKED_AUTO',
    metadata: { customerId: estado.customerId, contactId, fuente: estado.fuente },
  });

  if (!opts.silencioso) await avisarAlMotorComercial(teamId, contactId);
  return { linked: true, customerId: estado.customerId };
}

/**
 * Import dinámico: `lib/customers` no depende del plugin comercial. Si el
 * plugin no está o falla, el vínculo ya quedó hecho igual y esto sólo se loguea.
 */
export async function avisarAlMotorComercial(teamId: number, contactId: number): Promise<void> {
  try {
    const { marcarAnalisisPorVinculo } = await import('@/lib/plugins/sales-ops/server/cliente-hook');
    await marcarAnalisisPorVinculo(teamId, contactId);
  } catch (error) {
    console.error('[customers/es-cliente] no se pudo avisar al motor comercial', error);
  }
}
