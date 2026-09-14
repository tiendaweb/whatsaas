import { and, asc, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  teamCommercialAnalysis,
  funnelStageGroupMembers,
  funnelStageGroups,
  teamCustomers,
  teamDeals,
  teamFinancialEntries,
  teamMembershipCompanies,
  teamMembershipSubscriptions,
} from '@/lib/db/schema';
import { OPEN_STAGES } from '@/lib/deals/types';
import { fechaEnZona, sumarDias } from '@/lib/time/zona';
import type { MontoPorMoneda, PanoramaEmpresa, SerieMes } from '../shared/api-types';

/**
 * El panorama del negocio: lo que dibuja el Inicio de Empresa.
 *
 * Es el mismo tablero de la maqueta de ChatPro (chatpro-nuevo-diseno.aapp.pro →
 * Inicio) atado a los datos reales del equipo. La maqueta trabaja con una sola
 * moneda inventada y puede permitirse un número por bloque; acá no:
 *
 * 1. **Las monedas no se suman entre sí.** Cada total es una lista
 *    `[{currency, cents}]`, igual que en `resumen.ts`. El gráfico de barras SÍ
 *    necesita una sola moneda para poder comparar alturas, así que devuelve una
 *    serie POR MONEDA y la pantalla deja elegir cuál mirar; la elegida por
 *    defecto es la de más movimiento, y se dice cuál es.
 * 2. **Las fechas son texto `YYYY-MM-DD` en la zona del negocio.** Las columnas
 *    son `date`; meter un `Date` de JS adentro de un filtro SQL pasa el build y
 *    revienta en runtime.
 * 3. **Donde no hay dato, no se inventa.** La maqueta muestra "margen de julio"
 *    porque su demo siempre factura; si este mes no hay un solo asiento de
 *    ingreso, el margen viaja como `null` y la pantalla dice que no hay con qué
 *    calcularlo, en vez de mostrar 0 % o −100 %.
 *
 * Vive aparte de `resumen.ts` a propósito: el resumen lo pide el shell entero
 * cada dos minutos para armar el rail, y estas consultas —seis meses de
 * asientos, el conteo de contactos por grupo— sólo las necesita el Inicio.
 */

/** Cuántos meses de historia dibuja el gráfico. La maqueta muestra seis. */
const MESES = 6;

/** Cuántas filas trae cada lista de "próximos". La maqueta muestra cinco. */
const PROXIMOS = 5;

const ETIQUETA_MES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

/** Junta montos por moneda, ordenados de mayor a menor. Nunca los suma entre sí. */
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

const normalizarMoneda = (v: string | null | undefined) => (v ?? '').trim().toUpperCase() || 'USD';

/**
 * Cuánto pesa por mes un gasto recurrente.
 *
 * Un anual dividido por doce es una equivalencia, no una factura: se usa para
 * poder comparar el gasto fijo contra el recurrente que entra, que es lo que
 * mira el bloque de arriba. Los de recurrencia `none` no entran: son gastos de
 * una vez y contarlos como fijos infla el número todos los meses.
 */
function mensualDeGasto(recurrence: string, amount: number): number {
  if (recurrence === 'monthly') return amount;
  if (recurrence === 'annual') return Math.round(amount / 12);
  return 0;
}

/** Los últimos `MESES` meses en `YYYY-MM`, del más viejo al más nuevo. */
function ultimosMeses(hoy: string): string[] {
  const [anio, mes] = hoy.split('-').map(Number);
  const salida: string[] = [];
  for (let i = MESES - 1; i >= 0; i -= 1) {
    const total = anio * 12 + (mes - 1) - i;
    const a = Math.floor(total / 12);
    const m = (total % 12) + 1;
    salida.push(`${a}-${String(m).padStart(2, '0')}`);
  }
  return salida;
}

/** Clientes atados a una marca: los que tienen alguna suscripción de esa marca. */
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

export async function getPanoramaEmpresa(teamId: number, marcaId: number | null): Promise<PanoramaEmpresa> {
  const hoy = fechaEnZona();
  const meses = ultimosMeses(hoy);
  const desde = `${meses[0]}-01`;
  const mesActual = hoy.slice(0, 7);
  const en90 = sumarDias(hoy, 90);

  const clientesMarca = await clientesDeMarca(teamId, marcaId);
  /** Hay filtro de marca y esa marca no tiene ni un cliente atado. */
  const marcaSinClientes = clientesMarca != null && clientesMarca.length === 0;

  /**
   * El filtro de marca sobre asientos financieros va por `company_id`, que es
   * columna propia; el de oportunidades, por el cliente. Son dos caminos
   * distintos porque los datos son distintos, no por gusto.
   */
  const filtroMarcaFinanzas = marcaId == null ? undefined : eq(teamFinancialEntries.companyId, marcaId);

  const [
    serieFilas,
    gastosFijos,
    cobrosFilas,
    egresosFilas,
    dealsFilas,
    gruposFilas,
    miembrosFilas,
    porEtapaFilas,
    cotizadoFilas,
    sinLeerFilas,
    marcasActivasFilas,
  ] = await Promise.all([
    /**
     * Seis meses de movimiento, por mes / tipo / moneda.
     *
     * `to_char` sobre la columna y no `date_trunc` con un parámetro: pasarle un
     * parámetro al `group by` hace que Postgres agrupe por la constante y
     * devuelva una sola fila —pasa el build y explota como dato equivocado en
     * producción—.
     *
     * Entra todo lo que no está cancelado, cobrado o no: es el movimiento
     * registrado en Finanzas. Mirar sólo lo `paid` dejaría el mes en curso casi
     * vacío y el gráfico diría que el negocio se frenó.
     */
    db
      .select({
        mes: sql<string>`to_char(${teamFinancialEntries.occurredOn}, 'YYYY-MM')`,
        tipo: teamFinancialEntries.type,
        currency: teamFinancialEntries.currency,
        cents: sql<number>`sum(${teamFinancialEntries.amount})::int`,
      })
      .from(teamFinancialEntries)
      .where(
        and(
          eq(teamFinancialEntries.teamId, teamId),
          gte(teamFinancialEntries.occurredOn, desde),
          ne(teamFinancialEntries.status, 'cancelled'),
          filtroMarcaFinanzas,
        ),
      )
      .groupBy(
        sql`to_char(${teamFinancialEntries.occurredOn}, 'YYYY-MM')`,
        teamFinancialEntries.type,
        teamFinancialEntries.currency,
      ),

    // El gasto fijo: egresos con recurrencia, para el KPI de arriba.
    db
      .select({
        currency: teamFinancialEntries.currency,
        amount: teamFinancialEntries.amount,
        recurrence: teamFinancialEntries.recurrence,
      })
      .from(teamFinancialEntries)
      .where(
        and(
          eq(teamFinancialEntries.teamId, teamId),
          eq(teamFinancialEntries.type, 'expense'),
          inArray(teamFinancialEntries.recurrence, ['monthly', 'annual']),
          ne(teamFinancialEntries.status, 'cancelled'),
          filtroMarcaFinanzas,
        ),
      ),

    // Próximos cobros: entradas que todavía no se cobraron, con fecha puesta.
    db
      .select({
        id: teamFinancialEntries.id,
        titulo: teamFinancialEntries.title,
        contraparte: teamFinancialEntries.counterparty,
        metodo: teamFinancialEntries.paymentMethod,
        categoria: teamFinancialEntries.category,
        fecha: sql<string>`coalesce(${teamFinancialEntries.dueOn}, ${teamFinancialEntries.nextDueOn}, ${teamFinancialEntries.occurredOn})`,
        cents: teamFinancialEntries.amount,
        currency: teamFinancialEntries.currency,
        estado: teamFinancialEntries.status,
        cliente: teamCustomers.name,
        marca: teamMembershipCompanies.name,
      })
      .from(teamFinancialEntries)
      .leftJoin(teamCustomers, eq(teamCustomers.id, teamFinancialEntries.customerId))
      .leftJoin(teamMembershipCompanies, eq(teamMembershipCompanies.id, teamFinancialEntries.companyId))
      .where(
        and(
          eq(teamFinancialEntries.teamId, teamId),
          eq(teamFinancialEntries.type, 'income'),
          inArray(teamFinancialEntries.status, ['pending', 'overdue']),
          filtroMarcaFinanzas,
        ),
      )
      .orderBy(sql`coalesce(${teamFinancialEntries.dueOn}, ${teamFinancialEntries.nextDueOn}, ${teamFinancialEntries.occurredOn}) asc`)
      .limit(PROXIMOS),

    // Próximos egresos: lo que hay que pagar, ordenado por cuándo.
    db
      .select({
        id: teamFinancialEntries.id,
        titulo: teamFinancialEntries.title,
        contraparte: teamFinancialEntries.counterparty,
        categoria: teamFinancialEntries.category,
        recurrence: teamFinancialEntries.recurrence,
        fecha: sql<string>`coalesce(${teamFinancialEntries.nextDueOn}, ${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn})`,
        cents: teamFinancialEntries.amount,
        currency: teamFinancialEntries.currency,
        estado: teamFinancialEntries.status,
      })
      .from(teamFinancialEntries)
      .where(
        and(
          eq(teamFinancialEntries.teamId, teamId),
          eq(teamFinancialEntries.type, 'expense'),
          inArray(teamFinancialEntries.status, ['pending', 'overdue']),
          sql`coalesce(${teamFinancialEntries.nextDueOn}, ${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn}) <= ${en90}`,
          filtroMarcaFinanzas,
        ),
      )
      .orderBy(sql`coalesce(${teamFinancialEntries.nextDueOn}, ${teamFinancialEntries.dueOn}, ${teamFinancialEntries.occurredOn}) asc`)
      .limit(PROXIMOS),

    // Oportunidades: para el anillo de conversión y el pipeline abierto.
    marcaSinClientes
      ? Promise.resolve([] as Array<{ stage: string; value: number; currency: string }>)
      : db
          .select({ stage: teamDeals.stage, value: teamDeals.value, currency: teamDeals.currency })
          .from(teamDeals)
          .where(
            and(
              eq(teamDeals.teamId, teamId),
              clientesMarca ? inArray(teamDeals.customerId, clientesMarca) : undefined,
            ),
          ),

    db
      .select({ id: funnelStageGroups.id, name: funnelStageGroups.name })
      .from(funnelStageGroups)
      .where(eq(funnelStageGroups.teamId, teamId))
      .orderBy(asc(funnelStageGroups.order), asc(funnelStageGroups.id)),

    db
      .select({ groupId: funnelStageGroupMembers.groupId, stageId: funnelStageGroupMembers.stageId })
      .from(funnelStageGroupMembers)
      .innerJoin(funnelStageGroups, eq(funnelStageGroups.id, funnelStageGroupMembers.groupId))
      .where(eq(funnelStageGroups.teamId, teamId)),

    db
      .select({ stageId: contacts.funnelStageId, n: sql<number>`count(*)::int` })
      .from(contacts)
      .where(and(eq(contacts.teamId, teamId), isNotNull(contacts.funnelStageId)))
      .groupBy(contacts.funnelStageId),

    /**
     * Lo cotizado en el CRM: el pipeline real de un equipo que trabaja por
     * chat y no carga oportunidades.
     *
     * `quoted_price` está en UNIDADES, no en centavos —dividirlo por 100 le
     * dijo "ARS 600" a alguien cotizado en $60.000—, así que acá se multiplica
     * por 100 para que viaje en la misma unidad que todo el resto de Empresa.
     *
     * Sólo cuentan los contactos que hoy están parados en alguna etapa: un
     * presupuesto de hace un año a alguien que ya salió del embudo no es
     * pipeline.
     */
    db
      .select({
        currency: teamCommercialAnalysis.quotedCurrency,
        cents: sql<number>`(sum(${teamCommercialAnalysis.quotedPrice}) * 100)::bigint`,
        n: sql<number>`count(*)::int`,
      })
      .from(teamCommercialAnalysis)
      .innerJoin(contacts, eq(contacts.chatId, teamCommercialAnalysis.chatId))
      .where(
        and(
          eq(teamCommercialAnalysis.teamId, teamId),
          eq(contacts.teamId, teamId),
          isNotNull(contacts.funnelStageId),
          sql`coalesce(${teamCommercialAnalysis.quotedPrice}, 0) > 0`,
        ),
      )
      .groupBy(teamCommercialAnalysis.quotedCurrency),

    /**
     * Conversaciones pendientes: las que tienen mensajes sin leer.
     *
     * Es el mismo contador que la bandeja de entrada, y por eso NO se recorta
     * por marca: un chat no pertenece a una marca, y fingir que sí daría un
     * número que no coincide con el que se ve al lado en la bandeja.
     */
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(chats)
      .where(and(eq(chats.teamId, teamId), sql`coalesce(${chats.unreadCount}, 0) > 0`)),

    db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamMembershipCompanies)
      .where(
        and(
          eq(teamMembershipCompanies.teamId, teamId),
          eq(teamMembershipCompanies.status, 'active'),
          marcaId == null ? undefined : eq(teamMembershipCompanies.id, marcaId),
        ),
      ),
  ]);

  // ── La serie, una por moneda ───────────────────────────────────────────────
  const porMonedaSerie = new Map<string, Map<string, { ingresos: number; egresos: number }>>();
  const movimientoPorMoneda = new Map<string, number>();
  for (const fila of serieFilas) {
    const currency = normalizarMoneda(fila.currency);
    const cents = Number(fila.cents ?? 0);
    if (!Number.isFinite(cents)) continue;
    const serie = porMonedaSerie.get(currency) ?? new Map();
    const punto = serie.get(fila.mes) ?? { ingresos: 0, egresos: 0 };
    if (fila.tipo === 'income') punto.ingresos += cents;
    else punto.egresos += cents;
    serie.set(fila.mes, punto);
    porMonedaSerie.set(currency, serie);
    movimientoPorMoneda.set(currency, (movimientoPorMoneda.get(currency) ?? 0) + Math.abs(cents));
  }

  const monedas = [...movimientoPorMoneda.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([currency]) => currency);

  const series: Record<string, SerieMes[]> = {};
  for (const currency of monedas) {
    const serie = porMonedaSerie.get(currency);
    series[currency] = meses.map((mes) => {
      const punto = serie?.get(mes) ?? { ingresos: 0, egresos: 0 };
      const [, m] = mes.split('-').map(Number);
      return {
        mes,
        etiqueta: ETIQUETA_MES[m - 1] ?? mes.slice(5),
        ingresos: punto.ingresos,
        egresos: punto.egresos,
      };
    });
  }

  // ── El mes en curso: ingresos, egresos, resultado y margen ────────────────
  const ingresosMes: Array<{ currency: string; cents: number }> = [];
  const egresosMes: Array<{ currency: string; cents: number }> = [];
  for (const [currency, serie] of porMonedaSerie) {
    const punto = serie.get(mesActual);
    if (!punto) continue;
    ingresosMes.push({ currency, cents: punto.ingresos });
    egresosMes.push({ currency, cents: punto.egresos });
  }
  /**
   * El resultado del mes por moneda.
   *
   * Sólo entran las monedas que se movieron ESTE mes: una moneda que facturó
   * en mayo y nada en septiembre aparecería como "USD 0", que se lee como "no
   * ganamos nada en dólares" cuando lo que pasa es que no hubo operaciones.
   * Un resultado de cero con movimiento real —cobrado y gastado lo mismo— sí
   * se muestra, porque eso sí es un dato.
   */
  const resultadoMes = [...porMonedaSerie.entries()]
    .filter(([, serie]) => {
      const punto = serie.get(mesActual);
      return Boolean(punto && (punto.ingresos !== 0 || punto.egresos !== 0));
    })
    .map(([currency, serie]) => {
      const punto = serie.get(mesActual) ?? { ingresos: 0, egresos: 0 };
      return { currency, cents: punto.ingresos - punto.egresos };
    });

  /**
   * El margen se calcula sobre UNA moneda: la de más movimiento.
   *
   * Un margen "global" con tres monedas mezcladas no existe. Si esa moneda no
   * facturó nada este mes, el margen viaja en `null` y la pantalla lo dice.
   */
  const monedaPrincipal = monedas[0] ?? null;
  const puntoPrincipal = monedaPrincipal ? porMonedaSerie.get(monedaPrincipal)?.get(mesActual) : undefined;
  const margen = puntoPrincipal && puntoPrincipal.ingresos > 0
    ? Math.round(((puntoPrincipal.ingresos - puntoPrincipal.egresos) / puntoPrincipal.ingresos) * 100)
    : null;

  // ── Gasto fijo mensual ────────────────────────────────────────────────────
  const gastoFijo = gastosFijos.map((g) => ({
    currency: g.currency,
    cents: mensualDeGasto(g.recurrence, g.amount),
  }));

  // ── Oportunidades ─────────────────────────────────────────────────────────
  const abiertas = dealsFilas.filter((d) => (OPEN_STAGES as readonly string[]).includes(d.stage));
  const ganados = dealsFilas.filter((d) => d.stage === 'closed_won').length;
  const perdidos = dealsFilas.filter((d) => d.stage === 'closed_lost').length;

  // ── Grupos de etapas: cuántos contactos hay en cada uno ───────────────────
  const contactosPorEtapa = new Map<number, number>();
  for (const fila of porEtapaFilas) {
    if (fila.stageId == null) continue;
    contactosPorEtapa.set(fila.stageId, Number(fila.n ?? 0));
  }
  const etapasPorGrupo = new Map<number, Set<number>>();
  for (const m of miembrosFilas) {
    const set = etapasPorGrupo.get(m.groupId) ?? new Set<number>();
    set.add(m.stageId);
    etapasPorGrupo.set(m.groupId, set);
  }
  const grupos = gruposFilas.map((g) => {
    const etapas = etapasPorGrupo.get(g.id);
    let contactos = 0;
    if (etapas) for (const stageId of etapas) contactos += contactosPorEtapa.get(stageId) ?? 0;
    return { id: g.id, name: g.name, etapas: etapas?.size ?? 0, contactos };
  });

  return {
    marcaId,
    mes: mesActual,
    moneda: monedaPrincipal,
    monedas,
    series,
    saludo: {
      conversacionesPendientes: Number(sinLeerFilas[0]?.n ?? 0),
      cobrosProgramados: cobrosFilas.length,
    },
    kpis: {
      egresosFijos: porMoneda(gastoFijo),
      egresosFijosCount: gastosFijos.length,
      ingresosMes: porMoneda(ingresosMes),
      egresosMes: porMoneda(egresosMes),
      // El resultado puede ser negativo y por eso NO pasa por `porMoneda`, que
      // descarta los ceros: un mes empatado es información, no ausencia de dato.
      resultadoMes: resultadoMes.sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents)),
      margen,
      pipeline: porMoneda(abiertas.map((d) => ({ currency: d.currency, cents: d.value }))),
      oportunidadesAbiertas: abiertas.length,
      cotizado: porMoneda(cotizadoFilas),
      cotizados: cotizadoFilas.reduce((n, f) => n + Number(f.n ?? 0), 0),
      marcasActivas: Number(marcasActivasFilas[0]?.n ?? 0),
    },
    conversion: { ganados, perdidos, total: dealsFilas.length },
    grupos,
    cobros: cobrosFilas.map((c) => ({
      id: c.id,
      titulo: c.titulo,
      quien: c.cliente ?? c.contraparte ?? null,
      detalle: [c.marca, c.metodo || c.categoria].filter(Boolean).join(' · ') || null,
      fecha: c.fecha,
      cents: c.cents,
      currency: c.currency,
      vencido: c.estado === 'overdue' || c.fecha < hoy,
    })),
    egresos: egresosFilas.map((e) => ({
      id: e.id,
      titulo: e.titulo,
      quien: e.contraparte ?? null,
      detalle: [e.categoria, e.recurrence === 'none' ? null : e.recurrence === 'monthly' ? 'mensual' : 'anual']
        .filter(Boolean)
        .join(' · ') || null,
      fecha: e.fecha,
      cents: e.cents,
      currency: e.currency,
      vencido: e.estado === 'overdue' || e.fecha < hoy,
    })),
  };
}
