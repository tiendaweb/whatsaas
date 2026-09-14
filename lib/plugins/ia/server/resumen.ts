import { and, count, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  aiConfigs,
  aiSessions,
  aiTools,
  automationFolders,
  chats,
  automations,
  grokConnectorCredentials,
  teamGeminiKeys,
} from '@/lib/db/schema';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { listBuiltinToolCatalog } from '@/lib/plugins/ai-chat/builtin';
import { APPS_AGRUPADAS, PLUGIN_POR_VISTA, VISTAS } from '../shared/vistas';
import type { ResumenIa } from '../shared/api-types';

/**
 * Los números del Inicio del hub de IA.
 *
 * Todo lo de acá contesta una sola pregunta: **qué está prendido y con qué
 * cuota**. Por eso cada bloque muestra el total y lo activo por separado — 66
 * automatizaciones con 3 encendidas es una foto muy distinta de 66 corriendo, y
 * el número solo no lo dice.
 *
 * Las credenciales de conector se cuentan sólo si están vivas (sin revocar y
 * sin vencer): un token vencido no es una puerta abierta y contarlo asusta al
 * pedo.
 */

const CONECTORES: Array<{ pluginId: string; label: string }> = [
  { pluginId: 'grok-connector', label: 'Grok' },
  { pluginId: 'chatgpt-connector', label: 'ChatGPT' },
  { pluginId: 'claude-code-connector', label: 'Claude Code' },
];

function entero(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export async function getResumenIa(teamId: number, userId?: number): Promise<ResumenIa> {
  const activos = await resolveActivePluginsForTeam(teamId, userId);
  const activasSet = new Set(activos.filter((p) => p.enabled).map((p) => p.pluginId));

  const [config, sesiones, catalogo, propias, flujos, carpetas, credenciales, keys] = await Promise.all([
    db.query.aiConfigs.findFirst({
      where: eq(aiConfigs.teamId, teamId),
      columns: { isActive: true, provider: true, model: true, systemPrompt: true },
    }),
    // `ai_sessions` cuelga del chat, no del equipo: el equipo llega por el join.
    db
      .select({ n: count() })
      .from(aiSessions)
      .innerJoin(chats, eq(chats.id, aiSessions.chatId))
      .where(and(eq(chats.teamId, teamId), eq(aiSessions.status, 'active'))),
    /**
     * Las integradas se cuentan desde el CATÁLOGO, no desde `ai_builtin_tools`:
     * esa tabla guarda sólo los overrides, así que un equipo sin ninguna fila
     * las tiene TODAS habilitadas. Contarla directo daba "0 funciones" con las
     * treinta y pico funcionando, que es peor que no mostrar el número.
     *
     * `listBuiltinToolCatalog` además resuelve las apps que se activan por
     * usuario, que si no cuentan como apagadas.
     */
    listBuiltinToolCatalog(teamId),
    db
      .select({
        total: count(),
        activas: sql<string>`count(*) filter (where ${aiTools.isActive})`,
      })
      .from(aiTools)
      .where(eq(aiTools.teamId, teamId)),
    db
      .select({
        total: count(),
        activas: sql<string>`count(*) filter (where ${automations.isActive})`,
      })
      .from(automations)
      .where(eq(automations.teamId, teamId)),
    db.select({ n: count() }).from(automationFolders).where(eq(automationFolders.teamId, teamId)),
    db
      .select({ vivas: count(), ultimoUso: sql<Date | null>`max(${grokConnectorCredentials.lastUsedAt})` })
      .from(grokConnectorCredentials)
      .where(
        and(
          eq(grokConnectorCredentials.teamId, teamId),
          isNull(grokConnectorCredentials.revokedAt),
          // Sin vencimiento o todavía vigente: un token vencido no es una puerta abierta.
          or(isNull(grokConnectorCredentials.expiresAt), gte(grokConnectorCredentials.expiresAt, new Date())),
        ),
      ),
    db
      .select({
        total: count(),
        activas: sql<string>`count(*) filter (where ${teamGeminiKeys.status} = 'active')`,
        // El corte va como intervalo de SQL y NO como parámetro: un `Date` de
        // JS adentro de un template `sql` pasa el build y revienta al ejecutar.
        conError: sql<string>`count(*) filter (where ${teamGeminiKeys.lastErrorAt} >= now() - interval '24 hours')`,
        ultimoUso: sql<Date | null>`max(${teamGeminiKeys.lastUsedAt})`,
      })
      .from(teamGeminiKeys)
      .where(eq(teamGeminiKeys.teamId, teamId)),
  ]);

  const totalKeys = entero(keys[0]?.total);
  const keysActivas = entero(keys[0]?.activas);

  const contadores: ResumenIa['apps']['contadores'] = {
    automatizacionesActivas: entero(flujos[0]?.activas),
    funcionesActivas: catalogo.filter((t) => t.enabled && t.pluginActive).length + entero(propias[0]?.activas),
    conectoresActivos: CONECTORES.filter((c) => activasSet.has(c.pluginId)).length,
    keysActivas,
  };

  const vistasDisponibles = VISTAS.filter((v) => {
    const pluginId = PLUGIN_POR_VISTA[v];
    return pluginId === null || activasSet.has(pluginId);
  });

  return {
    vistasDisponibles,
    agente: {
      activo: config?.isActive ?? false,
      proveedor: config?.provider ?? null,
      modelo: config?.model ?? null,
      instrucciones: (config?.systemPrompt ?? '').length,
      sesiones: entero(sesiones[0]?.n),
    },
    funciones: {
      integradas: catalogo.length,
      // Habilitada Y con su app prendida: una función de una app apagada está
      // en el catálogo pero el agente no la puede llamar.
      integradasActivas: catalogo.filter((t) => t.enabled && t.pluginActive).length,
      propias: entero(propias[0]?.total),
      propiasActivas: entero(propias[0]?.activas),
    },
    automatizaciones: {
      total: entero(flujos[0]?.total),
      activas: entero(flujos[0]?.activas),
      carpetas: entero(carpetas[0]?.n),
    },
    conectores: CONECTORES.map((c) => ({
      pluginId: c.pluginId,
      label: c.label,
      activo: activasSet.has(c.pluginId),
      // Las credenciales viven en la tabla del conector Grok, que es la que
      // emite los tokens MCP de los tres.
      credenciales: c.pluginId === 'grok-connector' ? entero(credenciales[0]?.vivas) : 0,
      ultimoUso: c.pluginId === 'grok-connector' && credenciales[0]?.ultimoUso ? new Date(credenciales[0].ultimoUso).toISOString() : null,
    })),
    banco: {
      total: totalKeys,
      activas: keysActivas,
      apagadas: Math.max(0, totalKeys - keysActivas),
      conErrorReciente: entero(keys[0]?.conError),
      ultimoUso: keys[0]?.ultimoUso ? new Date(keys[0].ultimoUso).toISOString() : null,
    },
    apps: {
      activas: APPS_AGRUPADAS.filter((a) => a.pluginId === null || activasSet.has(a.pluginId)).map((a) => a.href),
      contadores,
    },
  };
}
