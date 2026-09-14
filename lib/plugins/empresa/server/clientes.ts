import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  teamCustomerContacts,
  teamCustomers,
  teamDeals,
  teamFinancialEntries,
  teamMembershipCompanies,
  teamMembershipSubscriptions,
  teamSales,
  teamTaskProjects,
  teamTaskRelations,
} from '@/lib/db/schema';
import { OPEN_STAGES } from '@/lib/deals/types';
import { fechaEnZona, sumarDias } from '@/lib/time/zona';
import type { ClienteFicha, ClientesEmpresa, MontoPorMoneda } from '../shared/api-types';

/**
 * Clientes con la ficha de la maqueta de ChatPro (Clientes y membresías).
 *
 * La maqueta muestra, por cliente: sus membresías, cuánto entra por mes, lo
 * facturado, los contactos vinculados, sus proyectos y el historial de pagos.
 * Todo eso ya existe repartido en Membresías, Ventas, Finanzas, Contactos y
 * Tareas OS; acá se junta en una consulta por tabla y se arma en memoria.
 *
 * Las reglas de siempre:
 *
 * 1. **Las monedas no se suman entre sí.** Cada total es una lista por moneda.
 * 2. **Las fechas son texto `YYYY-MM-DD`** en la zona del negocio; nunca entra
 *    un `Date` de JS adentro de un filtro SQL.
 * 3. **Un cliente sin contacto vinculado sigue siendo un cliente.** La maqueta
 *    lo dice explícitamente y acá pasa igual: se muestra "sin contacto
 *    vinculado" en vez de esconderlo.
 */

/** Cuántos clientes trae la pantalla. Con más, el filtro de arriba recorta. */
const TOPE = 400;

/** Cuántos pagos y cuántos proyectos guarda la ficha de cada cliente. */
const POR_FICHA = 12;

function porMoneda(filas: Array<{ currency: string | null; cents: number | string | null }>): MontoPorMoneda[] {
  const mapa = new Map<string, number>();
  for (const fila of filas) {
    const currency = (fila.currency ?? '').trim().toUpperCase() || 'USD';
    const cents = Number(fila.cents ?? 0);
    if (!Number.isFinite(cents) || cents === 0) continue;
    mapa.set(currency, (mapa.get(currency) ?? 0) + cents);
  }
  return [...mapa.entries()]
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => b.cents - a.cents);
}

/** Cuánto entra por mes por una suscripción, según su forma de cobro. */
function recurrenteMensual(billingType: string, price: number): number {
  if (billingType === 'monthly') return price;
  if (billingType === 'annual') return Math.round(price / 12);
  // free, lifetime, setup_maintenance y custom no tienen un mensual que se
  // pueda afirmar desde la suscripción. Contarlos como 0 es preferible a
  // inventar un número que después se mira como si fuera plata que entra.
  return 0;
}

export async function getClientesEmpresa(teamId: number, marcaId: number | null): Promise<ClientesEmpresa> {
  const hoy = fechaEnZona();
  const en30 = sumarDias(hoy, 30);

  const [subsFilas, marcasFilas] = await Promise.all([
    db
      .select({
        id: teamMembershipSubscriptions.id,
        numero: teamMembershipSubscriptions.subscriptionNumber,
        customerId: teamMembershipSubscriptions.customerId,
        companyId: teamMembershipSubscriptions.companyId,
        plan: teamMembershipSubscriptions.planNameSnapshot,
        price: teamMembershipSubscriptions.price,
        currency: teamMembershipSubscriptions.currency,
        billingType: teamMembershipSubscriptions.billingType,
        status: teamMembershipSubscriptions.status,
        paymentStatus: teamMembershipSubscriptions.paymentStatus,
        inicio: teamMembershipSubscriptions.startDate,
        vence: teamMembershipSubscriptions.endDate,
      })
      .from(teamMembershipSubscriptions)
      .where(eq(teamMembershipSubscriptions.teamId, teamId)),

    db
      .select({ id: teamMembershipCompanies.id, name: teamMembershipCompanies.name })
      .from(teamMembershipCompanies)
      .where(eq(teamMembershipCompanies.teamId, teamId)),
  ]);

  const nombreMarca = new Map(marcasFilas.map((m) => [m.id, m.name]));

  /**
   * El filtro de marca recorta por derivación: un cliente es "de una marca"
   * cuando tiene alguna suscripción de esa marca. Los clientes no tienen
   * `company_id` y no se lo vamos a inventar.
   */
  const idsDeMarca = marcaId == null
    ? null
    : new Set(subsFilas.filter((s) => s.companyId === marcaId && s.customerId != null).map((s) => s.customerId as number));

  const clientesFilas = await db
    .select({
      id: teamCustomers.id,
      name: teamCustomers.name,
      email: teamCustomers.email,
      phone: teamCustomers.phone,
      status: teamCustomers.status,
      industry: teamCustomers.industry,
      website: teamCustomers.website,
      location: teamCustomers.location,
      notes: teamCustomers.notes,
      desde: teamCustomers.customerSince,
      creado: teamCustomers.createdAt,
    })
    .from(teamCustomers)
    .where(
      and(
        eq(teamCustomers.teamId, teamId),
        ne(teamCustomers.status, 'archived'),
        idsDeMarca == null
          ? undefined
          : idsDeMarca.size === 0
            // `inArray(col, [])` genera SQL inválido en drizzle: cuando la
            // marca no tiene un solo cliente hay que cortar con una condición
            // imposible, no con una lista vacía.
            ? sql`false`
            : inArray(teamCustomers.id, [...idsDeMarca]),
      ),
    )
    .orderBy(desc(teamCustomers.updatedAt))
    .limit(TOPE);

  const ids = clientesFilas.map((c) => c.id);
  const sinClientes = ids.length === 0;

  const [ventasFilas, cobrosFilas, contactosFilas, dealsFilas] = await Promise.all([
    sinClientes
      ? Promise.resolve([] as Array<{ customerId: number | null; currency: string; total: number; status: string }>)
      : db
          .select({
            customerId: teamSales.customerId,
            currency: teamSales.currency,
            total: teamSales.total,
            status: teamSales.status,
          })
          .from(teamSales)
          .where(and(eq(teamSales.teamId, teamId), inArray(teamSales.customerId, ids))),

    // El historial de pagos de la ficha sale de Finanzas: es donde se registra
    // lo que efectivamente entró, con su fecha y su medio.
    sinClientes
      ? Promise.resolve([] as Array<{
          id: number; customerId: number | null; titulo: string; cents: number; currency: string;
          estado: string; fecha: string; metodo: string | null; companyId: number | null;
        }>)
      : db
          .select({
            id: teamFinancialEntries.id,
            customerId: teamFinancialEntries.customerId,
            titulo: teamFinancialEntries.title,
            cents: teamFinancialEntries.amount,
            currency: teamFinancialEntries.currency,
            estado: teamFinancialEntries.status,
            fecha: sql<string>`coalesce(${teamFinancialEntries.paidOn}, ${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn})`,
            metodo: teamFinancialEntries.paymentMethod,
            companyId: teamFinancialEntries.companyId,
          })
          .from(teamFinancialEntries)
          .where(
            and(
              eq(teamFinancialEntries.teamId, teamId),
              eq(teamFinancialEntries.type, 'income'),
              inArray(teamFinancialEntries.customerId, ids),
            ),
          )
          .orderBy(sql`coalesce(${teamFinancialEntries.paidOn}, ${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn}) desc`),

    /**
     * La foto y el número de WhatsApp viven en `chats`, no en `contacts`: el
     * `phone` del contacto es un texto que se carga a mano y puede estar vacío
     * o mal, mientras que el `remoteJid` del chat es el que abre la
     * conversación. Por eso el join.
     */
    sinClientes
      ? Promise.resolve([] as Array<{ customerId: number; contactId: number; nombre: string; telefono: string | null; jid: string | null; foto: string | null }>)
      : db
          .select({
            customerId: teamCustomerContacts.customerId,
            contactId: teamCustomerContacts.contactId,
            nombre: contacts.name,
            telefono: contacts.phone,
            jid: chats.remoteJid,
            foto: chats.profilePicUrl,
          })
          .from(teamCustomerContacts)
          .innerJoin(contacts, eq(contacts.id, teamCustomerContacts.contactId))
          .leftJoin(chats, eq(chats.id, contacts.chatId))
          .where(and(eq(teamCustomerContacts.teamId, teamId), inArray(teamCustomerContacts.customerId, ids))),

    sinClientes
      ? Promise.resolve([] as Array<{ customerId: number | null; stage: string; value: number; currency: string }>)
      : db
          .select({
            customerId: teamDeals.customerId,
            stage: teamDeals.stage,
            value: teamDeals.value,
            currency: teamDeals.currency,
          })
          .from(teamDeals)
          .where(and(eq(teamDeals.teamId, teamId), inArray(teamDeals.customerId, ids))),
  ]);

  // ── Se arma cada ficha ────────────────────────────────────────────────────
  const porCliente = new Map<number, ClienteFicha>();
  for (const c of clientesFilas) {
    porCliente.set(c.id, {
      id: c.id,
      nombre: c.name,
      email: c.email,
      telefono: c.phone,
      estado: c.status,
      rubro: c.industry,
      web: c.website,
      lugar: c.location,
      notas: c.notes || '',
      desde: fechaODia(c.desde ?? c.creado),
      marcas: [],
      suscripciones: [],
      contactos: [],
      proyectos: [],
      pagos: [],
      recurrente: [],
      facturado: [],
      porCobrar: [],
      embudo: [],
      activas: 0,
      porVencer: 0,
      impagas: 0,
    });
  }

  const recurrentePorCliente = new Map<number, Array<{ currency: string; cents: number }>>();
  for (const s of subsFilas) {
    if (s.customerId == null) continue;
    const ficha = porCliente.get(s.customerId);
    if (!ficha) continue;
    const marca = s.companyId == null ? null : nombreMarca.get(s.companyId) ?? null;
    const vence = Boolean(s.vence && s.vence <= en30 && s.status === 'active');
    ficha.suscripciones.push({
      id: s.id,
      numero: s.numero,
      plan: s.plan || 'Sin plan',
      marca,
      price: s.price,
      currency: s.currency,
      billingType: s.billingType,
      status: s.status,
      paymentStatus: s.paymentStatus,
      inicio: s.inicio,
      vence: s.vence,
      porVencer: vence,
    });
    if (marca && !ficha.marcas.includes(marca)) ficha.marcas.push(marca);
    if (s.status === 'active') {
      ficha.activas += 1;
      const acumulado = recurrentePorCliente.get(s.customerId) ?? [];
      acumulado.push({ currency: s.currency, cents: recurrenteMensual(s.billingType, s.price) });
      recurrentePorCliente.set(s.customerId, acumulado);
      if (vence) ficha.porVencer += 1;
      if (s.paymentStatus === 'overdue') ficha.impagas += 1;
    }
  }
  for (const [id, filas] of recurrentePorCliente) {
    const ficha = porCliente.get(id);
    if (ficha) ficha.recurrente = porMoneda(filas);
  }

  const facturadoPorCliente = new Map<number, Array<{ currency: string; cents: number }>>();
  const porCobrarPorCliente = new Map<number, Array<{ currency: string; cents: number }>>();
  for (const v of ventasFilas) {
    if (v.customerId == null) continue;
    const destino = v.status === 'paid' ? facturadoPorCliente : porCobrarPorCliente;
    const acumulado = destino.get(v.customerId) ?? [];
    acumulado.push({ currency: v.currency, cents: v.total });
    destino.set(v.customerId, acumulado);
  }
  for (const [id, filas] of facturadoPorCliente) {
    const ficha = porCliente.get(id);
    if (ficha) ficha.facturado = porMoneda(filas);
  }
  for (const [id, filas] of porCobrarPorCliente) {
    const ficha = porCliente.get(id);
    if (ficha) ficha.porCobrar = porMoneda(filas);
  }

  const embudoPorCliente = new Map<number, Array<{ currency: string; cents: number }>>();
  for (const d of dealsFilas) {
    if (d.customerId == null) continue;
    if (!(OPEN_STAGES as readonly string[]).includes(d.stage)) continue;
    const acumulado = embudoPorCliente.get(d.customerId) ?? [];
    acumulado.push({ currency: d.currency, cents: d.value });
    embudoPorCliente.set(d.customerId, acumulado);
  }
  for (const [id, filas] of embudoPorCliente) {
    const ficha = porCliente.get(id);
    if (ficha) ficha.embudo = porMoneda(filas);
  }

  for (const p of cobrosFilas) {
    if (p.customerId == null) continue;
    const ficha = porCliente.get(p.customerId);
    if (!ficha || ficha.pagos.length >= POR_FICHA) continue;
    ficha.pagos.push({
      id: p.id,
      titulo: p.titulo,
      cents: p.cents,
      currency: p.currency,
      estado: p.estado,
      fecha: p.fecha,
      metodo: p.metodo,
      marca: p.companyId == null ? null : nombreMarca.get(p.companyId) ?? null,
    });
  }

  const clientePorContacto = new Map<number, number>();
  for (const c of contactosFilas) {
    const ficha = porCliente.get(c.customerId);
    if (!ficha) continue;
    ficha.contactos.push({ id: c.contactId, nombre: c.nombre, telefono: c.telefono, jid: c.jid, foto: c.foto });
    clientePorContacto.set(c.contactId, c.customerId);
  }

  /**
   * Los proyectos cuelgan del CONTACTO, no del cliente.
   *
   * Tareas OS ata `project → contact` en `team_task_relations`; la tabla de
   * proyectos no tiene `customer_id`. Así que el camino es cliente → sus
   * contactos → sus proyectos, y por eso esta consulta va después de las otras
   * y no adentro del `Promise.all` de arriba: necesita los contactos ya
   * resueltos.
   */
  const contactIds = [...clientePorContacto.keys()];
  const proyectosFilas = contactIds.length
    ? await db
        .select({
          contactId: teamTaskRelations.targetId,
          id: teamTaskProjects.id,
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
    : [];

  for (const p of proyectosFilas) {
    const customerId = clientePorContacto.get(p.contactId);
    if (customerId == null) continue;
    const ficha = porCliente.get(customerId);
    if (!ficha || ficha.proyectos.length >= POR_FICHA) continue;
    if (ficha.proyectos.some((x) => x.id === p.id)) continue;
    ficha.proyectos.push({ id: p.id, nombre: p.nombre });
  }

  const clientes = [...porCliente.values()];

  return {
    marcaId,
    clientes,
    totales: {
      clientes: clientes.length,
      conSuscripcion: clientes.filter((c) => c.activas > 0).length,
      recurrente: porMoneda(clientes.flatMap((c) => c.recurrente)),
      facturado: porMoneda(clientes.flatMap((c) => c.facturado)),
      // El tope existe para que la pantalla no traiga 5.000 fichas; cuando se
      // alcanza hay que decirlo, o los totales de arriba mentirían en silencio.
      recortado: clientes.length >= TOPE,
    },
  };
}

/** Un timestamp a `YYYY-MM-DD` en la zona del negocio; `null` si no hay. */
function fechaODia(valor: Date | null): string | null {
  if (!valor) return null;
  try {
    return fechaEnZona(valor);
  } catch {
    return null;
  }
}
