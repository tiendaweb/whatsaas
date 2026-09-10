import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  campaigns,
  formBuilderForms,
  formBuilderSubmissions,
  messageDrafts,
  metaAdAccounts,
  metaCampaignInsightsDaily,
  metaCampaigns,
  socialAccounts,
  socialComments,
  socialPosts,
  wabaTemplates,
} from '@/lib/db/schema';
import { checkFeature } from '@/lib/limits';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { fechaEnZona, sumarDias } from '@/lib/time/zona';
import { APPS_AGRUPADAS, PLUGIN_POR_VISTA, VISTAS } from '../shared/vistas';
import type { CampanaMeta, MontoPorMoneda, ResumenMarketing } from '../shared/api-types';

/**
 * Los números del Inicio de Marketing.
 *
 * Tres reglas que valen para todo el archivo:
 *
 * 1. **Las monedas no se suman entre sí.** Las cuentas de Meta del equipo
 *    facturan en monedas distintas; el gasto es una lista `[{currency, cents}]`.
 * 2. **`meta_campaign_insights_daily.date` es una columna `date`.** El filtro
 *    va contra texto `YYYY-MM-DD` en la zona del negocio: meter un `Date` de JS
 *    adentro del SQL pasa el build y revienta en runtime.
 * 3. **`spend`, `results` y compañía son `numeric`,** o sea que llegan como
 *    string. Todo pasa por `Number(...)` antes de hacer cuentas, y el gasto se
 *    guarda en centavos para no arrastrar decimales flotantes.
 */

/** Meta informa importes en unidades (12.34), no en centavos. */
function aCentavos(valor: unknown): number {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function entero(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Junta montos por moneda, de mayor a menor. Nunca los suma entre sí. */
function porMoneda(filas: Array<{ currency: string | null; cents: number }>): MontoPorMoneda[] {
  const mapa = new Map<string, number>();
  for (const fila of filas) {
    const currency = (fila.currency ?? '').trim().toUpperCase() || 'USD';
    if (!fila.cents) continue;
    mapa.set(currency, (mapa.get(currency) ?? 0) + fila.cents);
  }
  return [...mapa.entries()]
    .map(([currency, cents]) => ({ currency, cents }))
    .sort((a, b) => b.cents - a.cents);
}

/** Los estados de Meta que significan "está corriendo". */
const ESTADOS_ACTIVOS = ['ACTIVE', 'IN_PROCESS', 'PENDING_REVIEW', 'WITH_ISSUES'];

export async function getResumenMarketing(teamId: number, rangoDias: number, userId?: number): Promise<ResumenMarketing> {
  const desde = sumarDias(fechaEnZona(), -rangoDias);

  const [activos, difusionHabilitada] = await Promise.all([
    resolveActivePluginsForTeam(teamId, userId),
    checkFeature(teamId, 'isCampaignsEnabled').catch(() => false),
  ]);
  // `resolveActivePluginsForTeam` devuelve la resolución completa de cada
  // plugin, no ids: acá sólo interesa cuáles quedaron encendidos.
  const activasSet = new Set(activos.filter((p) => p.enabled).map((p) => p.pluginId));

  const [
    cuentas,
    campanasMeta,
    insights,
    difusion,
    posts,
    cuentasSociales,
    comentariosNuevos,
    ultimoDia,
    formularios,
    envios,
    enviosRango,
    borradores,
    plantillas,
  ] = await Promise.all([
    db
      .select({
        id: metaAdAccounts.id,
        name: metaAdAccounts.name,
        sincronizada: metaAdAccounts.lastSyncedAt,
        estadoSync: metaAdAccounts.lastSyncStatus,
      })
      .from(metaAdAccounts)
      .where(eq(metaAdAccounts.teamId, teamId)),
    db
      .select({
        id: metaCampaigns.id,
        name: metaCampaigns.name,
        status: metaCampaigns.effectiveStatus,
        objective: metaCampaigns.objective,
        accountId: metaCampaigns.adAccountId,
      })
      .from(metaCampaigns)
      .where(eq(metaCampaigns.teamId, teamId)),
    db
      .select({
        campanaId: metaCampaignInsightsDaily.campaignRowId,
        currency: metaCampaignInsightsDaily.currency,
        gasto: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.spend}), 0)`,
        impresiones: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.impressions}), 0)`,
        clicks: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.clicks}), 0)`,
        resultados: sql<string>`coalesce(sum(${metaCampaignInsightsDaily.results}), 0)`,
      })
      .from(metaCampaignInsightsDaily)
      // `date` es una columna date: se compara con texto YYYY-MM-DD, nunca con
      // un Date de JS.
      .where(and(eq(metaCampaignInsightsDaily.teamId, teamId), gte(metaCampaignInsightsDaily.date, desde)))
      .groupBy(metaCampaignInsightsDaily.campaignRowId, metaCampaignInsightsDaily.currency),
    db
      .select({
        total: count(),
        enviados: sql<string>`coalesce(sum(${campaigns.sentCount}), 0)`,
        fallidos: sql<string>`coalesce(sum(${campaigns.failedCount}), 0)`,
        programadas: sql<string>`count(*) filter (where ${campaigns.status} in ('SCHEDULED', 'PENDING'))`,
      })
      .from(campaigns)
      .where(eq(campaigns.teamId, teamId)),
    db
      .select({
        programadas: sql<string>`count(*) filter (where ${socialPosts.status} = 'scheduled')`,
        publicadas: sql<string>`count(*) filter (where ${socialPosts.status} = 'published')`,
      })
      .from(socialPosts)
      .where(eq(socialPosts.teamId, teamId)),
    db.select({ n: count() }).from(socialAccounts).where(eq(socialAccounts.teamId, teamId)),
    // Comentarios sin responder: es el único contador de Marketing que pide
    // que alguien haga algo hoy.
    db
      .select({ n: count() })
      .from(socialComments)
      .where(and(eq(socialComments.teamId, teamId), eq(socialComments.status, 'nuevo'))),
    db
      .select({ ultimo: sql<string | null>`max(${metaCampaignInsightsDaily.date})` })
      .from(metaCampaignInsightsDaily)
      .where(eq(metaCampaignInsightsDaily.teamId, teamId)),
    db.select({ n: count() }).from(formBuilderForms).where(eq(formBuilderForms.teamId, teamId)),
    db.select({ n: count() }).from(formBuilderSubmissions).where(eq(formBuilderSubmissions.teamId, teamId)),
    db
      .select({ n: count() })
      .from(formBuilderSubmissions)
      .where(and(eq(formBuilderSubmissions.teamId, teamId), gte(formBuilderSubmissions.submittedAt, new Date(`${desde}T00:00:00.000Z`)))),
    db.select({ n: count() }).from(messageDrafts).where(eq(messageDrafts.teamId, teamId)),
    db.select({ n: count() }).from(wabaTemplates).where(eq(wabaTemplates.teamId, teamId)),
  ]);

  const nombreCuenta = new Map(cuentas.map((c) => [c.id, c.name]));

  /** Métricas del rango, por campaña. Una campaña factura en una sola moneda. */
  const porCampana = new Map<number, { currency: string | null; cents: number; impresiones: number; clicks: number; resultados: number }>();
  for (const fila of insights) {
    if (fila.campanaId == null) continue;
    const previo = porCampana.get(fila.campanaId);
    const cents = aCentavos(fila.gasto);
    porCampana.set(fila.campanaId, {
      currency: fila.currency ?? previo?.currency ?? null,
      cents: (previo?.cents ?? 0) + cents,
      impresiones: (previo?.impresiones ?? 0) + entero(fila.impresiones),
      clicks: (previo?.clicks ?? 0) + entero(fila.clicks),
      resultados: (previo?.resultados ?? 0) + entero(fila.resultados),
    });
  }

  const totales = { impresiones: 0, clicks: 0, resultados: 0 };
  for (const v of porCampana.values()) {
    totales.impresiones += v.impresiones;
    totales.clicks += v.clicks;
    totales.resultados += v.resultados;
  }

  const top: CampanaMeta[] = campanasMeta
    .map((c) => {
      const m = porCampana.get(c.id);
      const gasto = m && m.cents ? { currency: (m.currency ?? 'USD').toUpperCase(), cents: m.cents } : null;
      return {
        id: c.id,
        nombre: c.name ?? `Campaña ${c.id}`,
        estado: c.status ?? '—',
        objetivo: c.objective ?? null,
        cuenta: c.accountId == null ? null : nombreCuenta.get(c.accountId) ?? null,
        gasto,
        impresiones: m?.impresiones ?? 0,
        clicks: m?.clicks ?? 0,
        resultados: m?.resultados ?? 0,
        costoPorResultado:
          gasto && m && m.resultados > 0 ? { currency: gasto.currency, cents: Math.round(gasto.cents / m.resultados) } : null,
      };
    })
    .filter((c) => c.gasto !== null)
    .sort((a, b) => (b.gasto?.cents ?? 0) - (a.gasto?.cents ?? 0))
    .slice(0, 8);

  const ultimaSync = cuentas
    .map((c) => c.sincronizada)
    .filter((d): d is Date => d instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const contadores: ResumenMarketing['apps']['contadores'] = {
    metaCampanasActivas: campanasMeta.filter((c) => ESTADOS_ACTIVOS.includes((c.status ?? '').toUpperCase())).length,
    difusionCampanas: entero(difusion[0]?.total),
    publicacionesProgramadas: entero(posts[0]?.programadas),
    formulariosEnvios: entero(envios[0]?.n),
    borradores: entero(borradores[0]?.n),
  };

  /**
   * Una vista se dibuja si es propia o si su app está activa. La difusión no es
   * un plugin: se resuelve por feature flag del producto.
   */
  const vistasDisponibles = VISTAS.filter((v) => {
    if (v === 'difusion') return difusionHabilitada === true;
    const pluginId = PLUGIN_POR_VISTA[v];
    return pluginId === null || activasSet.has(pluginId);
  });

  return {
    rangoDias,
    vistasDisponibles,
    publicidad: {
      cuentas: cuentas.length,
      cuentasSincronizadas: cuentas.filter((c) => c.sincronizada != null).length,
      campanasActivas: contadores.metaCampanasActivas ?? 0,
      campanasTotales: campanasMeta.length,
      gasto: porMoneda([...porCampana.values()].map((v) => ({ currency: v.currency, cents: v.cents }))),
      impresiones: totales.impresiones,
      clicks: totales.clicks,
      resultados: totales.resultados,
      ultimaSync: ultimaSync ? ultimaSync.toISOString() : null,
      ultimoDiaConDatos: ultimoDia[0]?.ultimo ? String(ultimoDia[0].ultimo).slice(0, 10) : null,
      cuentasConProblema: cuentas.filter((c) => c.sincronizada == null || (c.estadoSync ?? '').toLowerCase() === 'error').length,
      top,
    },
    difusion: {
      disponible: difusionHabilitada === true,
      campanas: entero(difusion[0]?.total),
      enviados: entero(difusion[0]?.enviados),
      fallidos: entero(difusion[0]?.fallidos),
      programadas: entero(difusion[0]?.programadas),
    },
    publicaciones: {
      programadas: entero(posts[0]?.programadas),
      publicadas: entero(posts[0]?.publicadas),
      cuentas: entero(cuentasSociales[0]?.n),
      comentariosNuevos: entero(comentariosNuevos[0]?.n),
    },
    captacion: {
      formularios: entero(formularios[0]?.n),
      envios: entero(envios[0]?.n),
      enviosDelRango: entero(enviosRango[0]?.n),
      plantillas: entero(plantillas[0]?.n),
    },
    apps: {
      activas: APPS_AGRUPADAS.filter((a) => a.pluginId === null || activasSet.has(a.pluginId)).map((a) => a.href),
      contadores,
    },
  };
}
