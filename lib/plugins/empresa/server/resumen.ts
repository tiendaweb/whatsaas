import { and, eq, inArray, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamArticles,
  teamContracts,
  teamCustomers,
  teamDeals,
  teamFinancialEntries,
  teamMembershipCompanies,
  teamMembershipPlans,
  teamMembershipSubscriptions,
  teamPurchaseOrders,
  teamSales,
  teamSupportTickets,
} from '@/lib/db/schema';
import { OPEN_STAGES } from '@/lib/deals/types';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { fechaEnZona, sumarDias } from '@/lib/time/zona';
import { APPS_AGRUPADAS, PLUGIN_POR_VISTA, VISTAS } from '../shared/vistas';
import type { MarcaResumen, MontoPorMoneda, ResumenEmpresa, VencimientoProximo } from '../shared/api-types';

/**
 * Los números del Inicio de Empresa.
 *
 * Tres reglas que valen para todo el archivo:
 *
 * 1. **Las monedas no se suman entre sí.** Cada total es una lista
 *    `[{currency, cents}]`. El negocio cobra en USD, ARS y PYG; un único
 *    número "total" sería mentira y encima se movería solo con el dólar.
 * 2. **Las fechas se comparan como texto `YYYY-MM-DD` en la zona del
 *    negocio.** Las columnas de vencimiento son `date`, no `timestamp`, y
 *    meter un `Date` de JS adentro de un filtro SQL revienta en runtime sin
 *    que el build diga nada.
 * 3. **La marca filtra directo sólo donde la columna existe** (planes,
 *    suscripciones y asientos financieros tienen `company_id`). Ventas,
 *    oportunidades y clientes se atan a la marca por el cliente que tiene una
 *    suscripción de esa marca: es una derivación, y por eso está acá y no
 *    repartida en cada consulta.
 */

/** Cuánto entra por mes por una suscripción, según su forma de cobro. */
function recurrenteMensual(billingType: string, price: number): number {
  if (billingType === 'monthly') return price;
  if (billingType === 'annual') return Math.round(price / 12);
  // free, lifetime, setup_maintenance y custom no tienen un mensual que se
  // pueda afirmar desde la suscripción: el mantenimiento vive en el plan y su
  // intervalo puede ser cualquiera. Contarlos como 0 es preferible a inventar.
  return 0;
}

/** Junta montos por moneda, ordenados de mayor a menor. */
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

/**
 * Clientes atados a una marca: los que tienen alguna suscripción de esa marca.
 *
 * Devuelve `null` cuando no hay filtro de marca —"no recortes nada"— y un
 * array vacío cuando la marca existe pero no tiene clientes. La diferencia
 * importa: `inArray(col, [])` en drizzle genera SQL inválido, así que quien lo
 * use tiene que cortar antes.
 */
async function clientesDeMarca(teamId: number, marcaId: number | null): Promise<number[] | null> {
  if (marcaId == null) return null;
  const filas = await db
    .selectDistinct({ customerId: teamMembershipSubscriptions.customerId })
    .from(teamMembershipSubscriptions)
    .where(
      and(
        eq(teamMembershipSubscriptions.teamId, teamId),
        eq(teamMembershipSubscriptions.companyId, marcaId),
        isNotNull(teamMembershipSubscriptions.customerId),
      ),
    );
  return filas.map((f) => Number(f.customerId)).filter((id) => Number.isInteger(id));
}

export async function getResumenEmpresa(teamId: number, marcaId: number | null, userId?: number): Promise<ResumenEmpresa> {
  const hoy = fechaEnZona();
  const en30 = sumarDias(hoy, 30);
  const en60 = sumarDias(hoy, 60);
  const hace30 = sumarDias(hoy, -30);

  const clientesMarca = await clientesDeMarca(teamId, marcaId);
  /** Hay filtro de marca y esa marca no tiene ni un cliente atado. */
  const marcaSinClientes = clientesMarca != null && clientesMarca.length === 0;

  const [
    marcasFilas,
    planesFilas,
    subsFilas,
    ventasFilas,
    dealsFilas,
    contratosFilas,
    comprasFilas,
    ticketsFilas,
    articulosFilas,
    activos,
  ] = await Promise.all([
    // Marcas con sus planes y suscripciones, para el panorama y el filtro.
    db
      .select({
        id: teamMembershipCompanies.id,
        name: teamMembershipCompanies.name,
        logoUrl: teamMembershipCompanies.logoUrl,
        status: teamMembershipCompanies.status,
      })
      .from(teamMembershipCompanies)
      .where(eq(teamMembershipCompanies.teamId, teamId))
      .orderBy(teamMembershipCompanies.position, teamMembershipCompanies.name),

    db
      .select({ id: teamMembershipPlans.id, companyId: teamMembershipPlans.companyId })
      .from(teamMembershipPlans)
      .where(and(eq(teamMembershipPlans.teamId, teamId), eq(teamMembershipPlans.status, 'active'))),

    // Las suscripciones se traen enteras (una por fila) y SIN el filtro de
    // marca: alimentan cinco números distintos, la lista de vencimientos y el
    // panorama por marca, que tiene que seguir mostrando todas las marcas
    // aunque haya una elegida —si no, el selector de marca se quedaría sin de
    // dónde elegir. El recorte por marca se hace más abajo, en memoria: un
    // equipo tiene cientos de suscripciones, no millones.
    db
      .select({
        id: teamMembershipSubscriptions.id,
        numero: teamMembershipSubscriptions.subscriptionNumber,
        companyId: teamMembershipSubscriptions.companyId,
        customerId: teamMembershipSubscriptions.customerId,
        plan: teamMembershipSubscriptions.planNameSnapshot,
        price: teamMembershipSubscriptions.price,
        currency: teamMembershipSubscriptions.currency,
        billingType: teamMembershipSubscriptions.billingType,
        status: teamMembershipSubscriptions.status,
        paymentStatus: teamMembershipSubscriptions.paymentStatus,
        endDate: teamMembershipSubscriptions.endDate,
        clienteNombre: teamCustomers.name,
      })
      .from(teamMembershipSubscriptions)
      .leftJoin(teamCustomers, eq(teamCustomers.id, teamMembershipSubscriptions.customerId))
      .where(eq(teamMembershipSubscriptions.teamId, teamId)),

    // Ventas: cobradas en los últimos 30 días y confirmadas sin cobrar.
    marcaSinClientes
      ? Promise.resolve([])
      : db
          .select({
            status: teamSales.status,
            currency: teamSales.currency,
            total: teamSales.total,
            paidAt: teamSales.paidAt,
          })
          .from(teamSales)
          .where(
            and(
              eq(teamSales.teamId, teamId),
              inArray(teamSales.status, ['confirmed', 'paid']),
              clientesMarca ? inArray(teamSales.customerId, clientesMarca) : undefined,
            ),
          ),

    marcaSinClientes
      ? Promise.resolve([])
      : db
          .select({ value: teamDeals.value, currency: teamDeals.currency, probability: teamDeals.probability })
          .from(teamDeals)
          .where(
            and(
              eq(teamDeals.teamId, teamId),
              inArray(teamDeals.stage, [...OPEN_STAGES]),
              clientesMarca ? inArray(teamDeals.customerId, clientesMarca) : undefined,
            ),
          ),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamContracts)
      .where(
        and(
          eq(teamContracts.teamId, teamId),
          eq(teamContracts.status, 'active'),
          isNotNull(teamContracts.endDate),
          lte(teamContracts.endDate, en60),
        ),
      ),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamPurchaseOrders)
      .where(and(eq(teamPurchaseOrders.teamId, teamId), inArray(teamPurchaseOrders.status, ['draft', 'sent', 'confirmed']))),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamSupportTickets)
      .where(and(eq(teamSupportTickets.teamId, teamId), inArray(teamSupportTickets.status, ['open', 'in_progress']))),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamArticles)
      .where(and(eq(teamArticles.teamId, teamId), eq(teamArticles.status, 'active'))),

    resolveActivePluginsForTeam(teamId, userId),
  ]);

  // Lo que falta cobrar según Finanzas: asientos de entrada sin pagar. Es el
  // único lugar donde la marca filtra por columna propia (`company_id`).
  const finanzasFilas = await db
    .select({
      currency: teamFinancialEntries.currency,
      cents: sql<number>`sum(${teamFinancialEntries.amount})::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(teamFinancialEntries)
    .where(
      and(
        eq(teamFinancialEntries.teamId, teamId),
        eq(teamFinancialEntries.type, 'income'),
        inArray(teamFinancialEntries.status, ['pending', 'overdue']),
        marcaId == null ? undefined : eq(teamFinancialEntries.companyId, marcaId),
      ),
    )
    .groupBy(teamFinancialEntries.currency);

  const activas = new Set(activos.map((p) => p.pluginId));

  // ── Suscripciones: un solo recorrido alimenta contadores, dinero y marcas ──
  const subsActivas = subsFilas.filter((s) => s.status === 'active');
  const porMarca = new Map<number, MarcaResumen>();
  for (const marca of marcasFilas) {
    porMarca.set(marca.id, {
      id: marca.id,
      name: marca.name,
      logoUrl: marca.logoUrl,
      status: marca.status,
      planes: 0,
      suscripcionesActivas: 0,
      porVencer: 0,
      impagas: 0,
      recurrente: [],
      clientes: 0,
    });
  }
  for (const plan of planesFilas) {
    if (plan.companyId == null) continue;
    const marca = porMarca.get(plan.companyId);
    if (marca) marca.planes += 1;
  }

  const recurrentePorMarca = new Map<number, Array<{ currency: string; cents: number }>>();
  const clientesPorMarca = new Map<number, Set<number>>();
  const recurrenteTotal: Array<{ currency: string; cents: number }> = [];
  const vencimientos: VencimientoProximo[] = [];
  let porVencer30 = 0;

  let suscripcionesActivas = 0;

  for (const sub of subsActivas) {
    const mensual = recurrenteMensual(sub.billingType, sub.price);
    const marca = sub.companyId == null ? null : porMarca.get(sub.companyId);
    /** ¿Esta suscripción entra en los números de arriba, con el filtro puesto? */
    const cuenta = marcaId == null || sub.companyId === marcaId;

    // La fila de la marca se llena SIEMPRE, haya filtro o no: el panorama de
    // marcas y el selector muestran todas, y con el filtro aplicado acá las
    // demás quedarían en cero como si no tuvieran nada.
    if (marca) {
      marca.suscripcionesActivas += 1;
      if (sub.paymentStatus === 'overdue') marca.impagas += 1;
      const acumulado = recurrentePorMarca.get(marca.id) ?? [];
      acumulado.push({ currency: sub.currency, cents: mensual });
      recurrentePorMarca.set(marca.id, acumulado);
      if (sub.customerId != null) {
        const set = clientesPorMarca.get(marca.id) ?? new Set<number>();
        set.add(sub.customerId);
        clientesPorMarca.set(marca.id, set);
      }
    }

    // `endDate` es `date` en modo string: se compara como texto, sin `Date`.
    const vence = Boolean(sub.endDate && sub.endDate <= en30);
    if (vence && marca) marca.porVencer += 1;

    if (!cuenta) continue;

    suscripcionesActivas += 1;
    recurrenteTotal.push({ currency: sub.currency, cents: mensual });

    if (vence && sub.endDate) {
      porVencer30 += 1;
      vencimientos.push({
        subscriptionId: sub.id,
        numero: sub.numero,
        plan: sub.plan || 'Sin plan',
        marca: marca?.name ?? null,
        cliente: sub.clienteNombre ?? null,
        endDate: sub.endDate,
        dias: diasEntre(hoy, sub.endDate),
        price: sub.price,
        currency: sub.currency,
        paymentStatus: sub.paymentStatus,
      });
    }
  }

  for (const [id, filas] of recurrentePorMarca) {
    const marca = porMarca.get(id);
    if (marca) marca.recurrente = porMoneda(filas);
  }
  for (const [id, set] of clientesPorMarca) {
    const marca = porMarca.get(id);
    if (marca) marca.clientes = set.size;
  }

  vencimientos.sort((a, b) => a.endDate.localeCompare(b.endDate));

  // ── Ventas ────────────────────────────────────────────────────────────────
  const ventasDelMes: Array<{ currency: string; cents: number }> = [];
  const porCobrar: Array<{ currency: string; cents: number }> = [];
  for (const venta of ventasFilas) {
    if (venta.status === 'paid') {
      // `paidAt` es timestamp: se pasa a fecha local antes de comparar.
      const fecha = venta.paidAt ? fechaEnZona(venta.paidAt) : null;
      if (fecha && fecha >= hace30) ventasDelMes.push({ currency: venta.currency, cents: venta.total });
    } else {
      porCobrar.push({ currency: venta.currency, cents: venta.total });
    }
  }

  const embudo = dealsFilas.map((deal) => ({
    currency: deal.currency,
    cents: Math.round((deal.value * Math.min(100, Math.max(0, deal.probability))) / 100),
  }));

  const clientesDelEquipo = marcaId == null
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(teamCustomers)
        .where(and(eq(teamCustomers.teamId, teamId), ne(teamCustomers.status, 'archived')))
        .then((filas) => Number(filas[0]?.n ?? 0))
    : (clientesMarca?.length ?? 0);

  // Van todas las marcas aunque haya una elegida: es lo que alimenta el
  // selector del rail, y un selector que sólo se ofrece a sí mismo no deja
  // volver a "Todas".
  const marcas = [...porMarca.values()];

  const vistasDisponibles = VISTAS.filter((vista) => {
    const plugin = PLUGIN_POR_VISTA[vista];
    return plugin == null || activas.has(plugin);
  });

  return {
    marcaId,
    vistasDisponibles,
    contadores: {
      marcas: marcasFilas.length,
      planes: planesFilas.filter((plan) => marcaId == null || plan.companyId === marcaId).length,
      suscripcionesActivas,
      porVencer30,
      clientes: clientesDelEquipo,
      oportunidadesAbiertas: dealsFilas.length,
    },
    dinero: {
      recurrente: porMoneda(recurrenteTotal),
      ventasDelMes: porMoneda(ventasDelMes),
      porCobrar: porMoneda(porCobrar),
      embudo: porMoneda(embudo),
    },
    vencimientos: vencimientos.slice(0, 12),
    marcas,
    apps: {
      activas: APPS_AGRUPADAS.filter((app) => activas.has(app.pluginId)).map((app) => app.pluginId),
      contadores: {
        // Cuántos asientos de entrada están sin cobrar. El monto NO se
        // resume acá: son varias monedas y en un mosaico de una línea
        // cualquier número único sería una suma inventada.
        finanzasPorCobrar: finanzasFilas.reduce((n, fila) => n + Number(fila.n ?? 0), 0),
        comprasPendientes: Number(comprasFilas[0]?.n ?? 0),
        soporteAbiertos: Number(ticketsFilas[0]?.n ?? 0),
        articulos: Number(articulosFilas[0]?.n ?? 0),
      },
      contratosPorVencer: Number(contratosFilas[0]?.n ?? 0),
    },
  };
}

/** Días entre dos fechas `YYYY-MM-DD`. Negativo = la segunda ya pasó. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}
