import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contactTags,
  contacts,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
  funnelStageGroupMembers,
  funnelStageGroups,
  funnelStages,
  tags,
  teamCommercialAnalysis,
  teamCustomerContacts,
  teamCustomers,
  teamMembershipSubscriptions,
  departments,
  users,
} from '@/lib/db/schema';
import { situacionExpr, vigentesSnoozes } from '@/lib/plugins/sales-ops/server/queries';
import { teamPromptRuns } from '@/lib/db/schema';
import type { CrmEmpresa, CrmEtapa, CrmContacto, CrmGrupo, MontoPorMoneda } from '../shared/api-types';

/**
 * El CRM visto desde el negocio.
 *
 * Es la MISMA información que Contactos y que el Command Center —las mismas
 * `contacts`, `funnel_stages`, `tags` y el mismo análisis comercial—, mirada
 * por otra puerta: acá se entra por marca, por cliente y por plan, que es como
 * se mira un negocio, y no chat por chat.
 *
 * Dos límites que hacen que esto sea usable con 900 contactos:
 *
 * 1. **Por columna se traen las primeras `PORCOLUMNA`,** ordenadas por lo más
 *    movido. El total de cada etapa se cuenta aparte y siempre es el real: una
 *    columna que dice "23" y muestra 20 tarjetas es honesta; una que cuenta las
 *    tarjetas que alcanzó a traer, no.
 * 2. **La marca filtra por derivación:** un contacto es de una marca si el
 *    cliente al que está vinculado tiene una suscripción de esa marca. Los
 *    contactos no tienen `company_id` y no se lo vamos a inventar.
 */

const PORCOLUMNA = 400;

/**
 * Cuántas tarjetas trae cada columna.
 *
 * Alto a propósito: el tablero muestra los contactos ENTEROS y scrollea la
 * página, no cada columna por separado. Con 927 contactos repartidos en 27
 * etapas, la más grande tiene 211: recortar acá dejaría columnas mintiendo el
 * total justo en las que más importa mirar.
 */

/** Contactos que pertenecen a una marca, vía cliente con suscripción de esa marca. */
async function idsDeMarca(teamId: number, marcaId: number): Promise<number[]> {
  const filas = await db
    .selectDistinct({ contactId: teamCustomerContacts.contactId })
    .from(teamCustomerContacts)
    .innerJoin(
      teamMembershipSubscriptions,
      and(
        eq(teamMembershipSubscriptions.customerId, teamCustomerContacts.customerId),
        eq(teamMembershipSubscriptions.teamId, teamId),
        eq(teamMembershipSubscriptions.companyId, marcaId),
      ),
    )
    .where(eq(teamCustomerContacts.teamId, teamId));
  return filas.map((f) => f.contactId);
}

export async function getCrmEmpresa(
  teamId: number,
  marcaId: number | null,
  busqueda: string | null,
  etiquetaId: number | null = null,
): Promise<CrmEmpresa> {
  const idsMarca = marcaId == null ? null : await idsDeMarca(teamId, marcaId);
  /**
   * La situación sale de `situacionExpr`, que es la ÚNICA definición del
   * sistema: así el ícono de este tablero y el del Command Center no pueden
   * discrepar. Los pospuestos viven en los ajustes, no en una columna.
   */
  const snoozes = await vigentesSnoozes(teamId).catch(() => []);
  const snoozeIds = snoozes.map((x) => x.chatId);

  /**
   * Las etiquetas que ofrece el selector.
   *
   * Sólo las que algún contacto del equipo tiene puestas —el catálogo entero
   * incluye etiquetas viejas sin un solo contacto— y SIN aplicar los filtros
   * actuales: si se filtraran por la etiqueta elegida, el selector se quedaría
   * con una sola opción y no habría cómo volver.
   */
  const etiquetasDisponibles = await db
    .selectDistinct({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .innerJoin(contactTags, eq(contactTags.tagId, tags.id))
    .innerJoin(contacts, and(eq(contacts.id, contactTags.contactId), eq(contacts.teamId, teamId)))
    .where(eq(tags.teamId, teamId))
    .orderBy(asc(tags.name));

  // Marca sin un solo contacto: se responde vacío en vez de armar un
  // `inArray` con lista vacía, que en SQL queda como `in ()` y revienta.
  if (idsMarca != null && idsMarca.length === 0) {
    const etapasVacias = await db
      .select({ id: funnelStages.id, name: funnelStages.name, emoji: funnelStages.emoji })
      .from(funnelStages)
      .where(eq(funnelStages.teamId, teamId))
      .orderBy(asc(funnelStages.order));
    return {
      grupos: [],
      etapas: etapasVacias.map((e) => ({ ...e, total: 0, grupos: [], valor: [], contactos: [] })),
      sinEtapa: { total: 0, contactos: [] },
      totales: { contactos: 0, sinEtapa: 0, sinAgente: 0, conCorreccion: 0, pipeline: [] },
      etiquetas: etiquetasDisponibles,
    };
  }

  const filtroMarca = idsMarca == null ? undefined : inArray(contacts.id, idsMarca);
  const filtroBusqueda = busqueda ? sql`lower(${contacts.name}) like ${`%${busqueda.toLowerCase()}%`}` : undefined;
  /**
   * Etiqueta: un `exists` y no un join.
   *
   * La consulta principal ya trae una fila por contacto; sumarle el join de
   * `contact_tags` multiplicaría al contacto con tres etiquetas por tres y
   * los totales de cada columna quedarían inflados.
   */
  const filtroEtiqueta =
    etiquetaId == null
      ? undefined
      : sql`exists (select 1 from ${contactTags} where ${contactTags.contactId} = ${contacts.id} and ${contactTags.tagId} = ${etiquetaId})`;
  const base = and(eq(contacts.teamId, teamId), filtroMarca, filtroBusqueda, filtroEtiqueta);

  const [etapas, porEtapa, filas, etiquetasFilas, totales, gruposFilas, miembros] = await Promise.all([
    db
      .select({ id: funnelStages.id, name: funnelStages.name, emoji: funnelStages.emoji })
      .from(funnelStages)
      .where(eq(funnelStages.teamId, teamId))
      .orderBy(asc(funnelStages.order)),
    db
      .select({ stageId: contacts.funnelStageId, n: count() })
      .from(contacts)
      .where(base)
      .groupBy(contacts.funnelStageId),
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        chatId: contacts.chatId,
        stageId: contacts.funnelStageId,
        asignadoUsuario: contacts.assignedUserId,
        asignadoSector: contacts.assignedDepartmentId,
        actualizado: contacts.updatedAt,
        datos: contacts.customData,
        gate: teamCommercialAnalysis.currentGate,
        temperatura: teamCommercialAnalysis.temperature,
        tieneCorreccion: sql<boolean>`${teamCommercialAnalysis.crmFix} is not null`,
        situacion: situacionExpr(teamId, snoozeIds),
        /**
         * Un prompt ESPERANDO, no cualquiera de la historia.
         *
         * Contando todas las corridas daban 925 de 927 contactos "con prompt"
         * —hubo clasificaciones masivas—, y un indicador que se prende en el
         * 99,8 % de las tarjetas no dice nada. Lo accionable es si hay algo
         * encolado o corriendo ahora.
         */
        tienePrompt: sql<boolean>`exists (
          select 1 from ${teamPromptRuns} pr
           where pr.team_id = ${teamId} and pr.target_kind = 'chat'
             and pr.target_id = ${contacts.chatId}::text
             and pr.status in ('queued', 'in_progress')
        )`,
        // `quoted_price` está en UNIDADES, no en centavos: dividirlo por 100 le
        // dijo "ARS 600" a alguien cotizado en $60.000.
        cotizado: teamCommercialAnalysis.quotedPrice,
        moneda: teamCommercialAnalysis.quotedCurrency,
        // `source` es el canal ("publicidad", "referido"); `source_detail`
        // guarda el primer mensaje del cliente y en una tarjeta se lee como si
        // fuera el origen.
        origen: teamCommercialAnalysis.source,
        foto: chats.profilePicUrl,
        cliente: teamCustomers.name,
        customerId: teamCustomerContacts.customerId,
        responsable: users.name,
        sector: departments.name,
      })
      .from(contacts)
      .leftJoin(teamCommercialAnalysis, and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, contacts.chatId)))
      .leftJoin(teamCustomerContacts, eq(teamCustomerContacts.contactId, contacts.id))
      .leftJoin(teamCustomers, eq(teamCustomers.id, teamCustomerContacts.customerId))
      // `situacionExpr` cruza los mensajes programados por el jid del chat:
      // sin este join, la consulta falla con "missing FROM-clause entry for
      // table chats" recién al ejecutarse.
      .leftJoin(chats, eq(chats.id, contacts.chatId))
      .leftJoin(users, eq(users.id, contacts.assignedUserId))
      .leftJoin(departments, eq(departments.id, contacts.assignedDepartmentId))
      .where(base)
      .orderBy(desc(contacts.updatedAt))
      // Se pide de más y se recorta por columna: traer exactamente
      // PORCOLUMNA×etapas dejaría columnas vacías cuando el orden global
      // concentra los más recientes en pocas etapas.
      .limit(2000),
    db
      .select({ contactId: contactTags.contactId, name: tags.name, color: tags.color })
      .from(contactTags)
      .innerJoin(tags, and(eq(tags.id, contactTags.tagId), eq(tags.teamId, teamId)))
      .innerJoin(contacts, eq(contacts.id, contactTags.contactId))
      .where(base),
    db
      .select({
        contactos: count(),
        sinEtapa: sql<string>`count(*) filter (where ${contacts.funnelStageId} is null)`,
        sinAgente: sql<string>`count(*) filter (where ${contacts.assignedUserId} is null and ${contacts.assignedDepartmentId} is null)`,
      })
      .from(contacts)
      .where(base),
    db
      .select({ id: funnelStageGroups.id, name: funnelStageGroups.name, descripcion: funnelStageGroups.description })
      .from(funnelStageGroups)
      .where(eq(funnelStageGroups.teamId, teamId))
      .orderBy(asc(funnelStageGroups.order)),
    db
      .select({ groupId: funnelStageGroupMembers.groupId, stageId: funnelStageGroupMembers.stageId })
      .from(funnelStageGroupMembers)
      .innerJoin(funnelStageGroups, eq(funnelStageGroups.id, funnelStageGroupMembers.groupId))
      .where(eq(funnelStageGroups.teamId, teamId)),
  ]);

  /**
   * Membresía y proyectos por contacto.
   *
   * Van en consultas aparte y no como más joins de la principal: cada uno
   * multiplica filas (un contacto con dos proyectos y tres etiquetas daría seis
   * copias de la misma tarjeta) y después habría que deduplicar a mano.
   */
  const contactIds = [...new Set(filas.map((f) => f.id))];
  const customerIds = [...new Set(filas.map((f) => f.customerId).filter((x): x is number => typeof x === 'number'))];

  const [membresias, vinculos] = await Promise.all([
    customerIds.length
      ? db
          .select({
            customerId: teamMembershipSubscriptions.customerId,
            plan: teamMembershipSubscriptions.planNameSnapshot,
            estadoPago: teamMembershipSubscriptions.paymentStatus,
          })
          .from(teamMembershipSubscriptions)
          .where(
            and(
              eq(teamMembershipSubscriptions.teamId, teamId),
              eq(teamMembershipSubscriptions.status, 'active'),
              inArray(teamMembershipSubscriptions.customerId, customerIds),
            ),
          )
      : Promise.resolve([]),
    contactIds.length
      ? db
          .select({
            contactId: teamTaskRelations.targetId,
            projectId: teamTaskRelations.sourceId,
            nombre: teamTaskProjects.name,
          })
          .from(teamTaskRelations)
          .innerJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskRelations.sourceId))
          .where(
            and(
              eq(teamTaskRelations.teamId, teamId),
              eq(teamTaskRelations.sourceType, 'project'),
              eq(teamTaskRelations.targetType, 'contact'),
              inArray(teamTaskRelations.targetId, contactIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const projectIds = [...new Set(vinculos.map((v) => v.projectId))];
  const avances = projectIds.length
    ? await db
        .select({
          projectId: teamTaskItems.projectId,
          total: count(),
          hechas: sql<string>`count(*) filter (where ${teamTaskItems.status} = 'done')`,
        })
        .from(teamTaskItems)
        .where(and(eq(teamTaskItems.teamId, teamId), inArray(teamTaskItems.projectId, projectIds)))
        .groupBy(teamTaskItems.projectId)
    : [];
  const avancePorProyecto = new Map(avances.map((a) => [a.projectId, { total: Number(a.total), hechas: Number(a.hechas) }]));

  const membresiaPorCliente = new Map<number, { plan: string; estadoPago: string }>();
  for (const m of membresias) {
    if (m.customerId == null || membresiaPorCliente.has(m.customerId)) continue;
    membresiaPorCliente.set(m.customerId, { plan: m.plan, estadoPago: m.estadoPago });
  }

  const proyectosPorContacto = new Map<number, Array<{ id: number; nombre: string; hechas: number; total: number }>>();
  for (const v of vinculos) {
    const avance = avancePorProyecto.get(v.projectId) ?? { total: 0, hechas: 0 };
    const lista = proyectosPorContacto.get(v.contactId) ?? [];
    if (!lista.some((p) => p.id === v.projectId)) lista.push({ id: v.projectId, nombre: v.nombre, ...avance });
    proyectosPorContacto.set(v.contactId, lista);
  }

  const etiquetasPorContacto = new Map<number, Array<{ name: string; color: string | null }>>();
  for (const e of etiquetasFilas) {
    const lista = etiquetasPorContacto.get(e.contactId) ?? [];
    if (lista.length < 3) lista.push({ name: e.name, color: e.color });
    etiquetasPorContacto.set(e.contactId, lista);
  }

  /** Un contacto puede estar vinculado a más de un cliente: se queda el primero. */
  const vistos = new Set<number>();
  const contactosUnicos = filas.filter((f) => (vistos.has(f.id) ? false : (vistos.add(f.id), true)));

  /** Días enteros desde que la ficha se movió por última vez. */
  const diasDesde = (fecha: Date | null): number | null => {
    if (!fecha) return null;
    const dias = Math.floor((Date.now() - fecha.getTime()) / 86_400_000);
    return dias >= 0 ? dias : null;
  };

  const textoDe = (datos: unknown, clave: string): string | null => {
    if (!datos || typeof datos !== 'object') return null;
    const valor = (datos as Record<string, unknown>)[clave];
    if (valor == null) return null;
    const texto = String(valor).trim();
    return texto ? texto : null;
  };

  const aContacto = (f: (typeof contactosUnicos)[number]): CrmContacto => ({
    id: f.id,
    nombre: f.name,
    chatId: f.chatId,
    gate: f.gate ?? null,
    temperatura: f.temperatura ?? null,
    cliente: f.cliente ?? null,
    sinAgente: f.asignadoUsuario == null && f.asignadoSector == null,
    tieneCorreccion: Boolean(f.tieneCorreccion),
    etiquetas: etiquetasPorContacto.get(f.id) ?? [],
    actualizado: f.actualizado ? f.actualizado.toISOString() : null,
    situacion: f.situacion ?? null,
    tienePrompt: Boolean(f.tienePrompt),
    foto: f.foto ?? null,
    membresia: f.customerId == null ? null : membresiaPorCliente.get(f.customerId) ?? null,
    proyectos: proyectosPorContacto.get(f.id) ?? [],
    cotizado: f.cotizado ?? null,
    moneda: f.moneda ?? null,
    // El ciclo de cobro es uno de los seis campos personalizados que el equipo
    // sí completa; el resto del formulario está casi siempre vacío.
    ciclo: textoDe(f.datos, 'ciclo_cobro') ?? textoDe(f.datos, 'frecuencia'),
    diasQuieto: diasDesde(f.actualizado ?? null),
    responsable: f.responsable ?? f.sector ?? null,
    origen: f.origen ?? textoDe(f.datos, 'origen_lead'),
  });

  const totalPorEtapa = new Map(porEtapa.map((p) => [p.stageId ?? 0, Number(p.n)]));

  /** Grupos a los que pertenece cada etapa. Más de uno = etapa compartida. */
  const gruposPorEtapa = new Map<number, number[]>();
  for (const m of miembros) {
    const lista = gruposPorEtapa.get(m.stageId) ?? [];
    if (!lista.includes(m.groupId)) lista.push(m.groupId);
    gruposPorEtapa.set(m.stageId, lista);
  }

  /** Junta lo cotizado por moneda. NUNCA se suman entre sí. */
  const porMoneda = (filas: Array<{ moneda: string | null; monto: number | null }>): MontoPorMoneda[] => {
    const mapa = new Map<string, number>();
    for (const fila of filas) {
      if (!fila.monto) continue;
      const currency = (fila.moneda ?? '').trim().toUpperCase() || 'ARS';
      mapa.set(currency, (mapa.get(currency) ?? 0) + fila.monto);
    }
    return [...mapa.entries()].map(([currency, cents]) => ({ currency, cents })).sort((a, b) => b.cents - a.cents);
  };

  const columnas: CrmEtapa[] = etapas.map((e) => {
    const dentro = contactosUnicos.filter((f) => f.stageId === e.id);
    return {
      id: e.id,
      name: e.name,
      emoji: e.emoji,
      total: totalPorEtapa.get(e.id) ?? 0,
      grupos: gruposPorEtapa.get(e.id) ?? [],
      valor: porMoneda(dentro.map((f) => ({ moneda: f.moneda, monto: f.cotizado }))),
      contactos: dentro.slice(0, PORCOLUMNA).map(aContacto),
    };
  });

  const grupos: CrmGrupo[] = gruposFilas.map((g) => ({
    id: g.id,
    name: g.name,
    descripcion: g.descripcion?.trim() || null,
    etapas: miembros.filter((m) => m.groupId === g.id).length,
  }));

  const conCorreccion = contactosUnicos.filter((f) => f.tieneCorreccion).length;

  return {
    grupos,
    etapas: columnas,
    sinEtapa: {
      total: totalPorEtapa.get(0) ?? 0,
      contactos: contactosUnicos.filter((f) => f.stageId == null).slice(0, PORCOLUMNA).map(aContacto),
    },
    totales: {
      contactos: Number(totales[0]?.contactos ?? 0),
      sinEtapa: Number(totales[0]?.sinEtapa ?? 0),
      sinAgente: Number(totales[0]?.sinAgente ?? 0),
      conCorreccion,
      pipeline: porMoneda(contactosUnicos.map((f) => ({ moneda: f.moneda, monto: f.cotizado }))),
    },
    etiquetas: etiquetasDisponibles,
  };
}
