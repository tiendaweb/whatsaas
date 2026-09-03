import 'server-only';

import { eq, sql, type SQL } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
import { chats, contacts } from '@/lib/db/schema';
import type { PermissionContext } from '@/lib/auth/permissions-guard';
import { hasPermission } from '@/lib/permissions';
import { readOnlyResourcePolicy } from './resource-policies';
import { chatScope } from '@/lib/desktop/scope';
import type { ReadOnlyResource } from './catalog';

/**
 * El portero de lectura del catálogo para un actor identificado (pendientes A3 y A4).
 *
 * El permiso por recurso NO se decide acá: sale de
 * `lib/readonly-api/resource-policies.ts`, el mismo mapa que usa App Maker. Un
 * segundo mapa sería una segunda respuesta a la misma pregunta.
 *
 * Esto se aplica SÓLO cuando la lectura viene con un actor identificado —el
 * conector MCP, que sabe qué usuario está detrás del token—. La API de sólo
 * lectura por token sigue comportándose igual que siempre: cambiarle las reglas
 * a un token que ya está en producción rompe integraciones que hoy funcionan, y
 * ese es un cambio que merece su propia tanda.
 */

/**
 * Recursos que además se recortan por `chatVisibility` (A3).
 *
 * El valor es la columna por la que el recurso se ata a un chat. `chats` se ata
 * por su propio id. Un agente con visibilidad "assigned" veía, por el conector,
 * los 58.636 mensajes del equipo entero: la app cumple esa regla en once
 * lugares y el catálogo la cumplía en cero.
 */
const CHAT_SCOPED: Record<string, string> = {
  chats: 'id',
  messages: 'chatId',
  contacts: 'chatId',
  'message-reactions': 'chatId',
  'audio-insights': 'chatId',
  'chat-ai-summaries': 'chatId',
};

/**
 * ¿Puede este actor leer este recurso? Devuelve el motivo en vez de un booleano
 * pelado: el conector le muestra el motivo al modelo y el modelo deja de
 * reintentar la misma lectura.
 */
export function resourceAccessDenial(
  ctx: PermissionContext,
  resourceKey: string,
  activePluginIds: ReadonlySet<string>,
): string | null {
  const rule = readOnlyResourcePolicy(resourceKey);
  // Fail-closed, igual que App Maker: un recurso sin política no se lee. El
  // verificador de conectores falla si alguien agrega un recurso y se olvida del
  // mapa, así que este camino sólo se alcanza si el olvido llegó a producción.
  if (!rule) {
    return `El recurso "${resourceKey}" no tiene política de lectura declarada y por seguridad no se sirve. Es un error de configuración: hay que mapearlo en lib/readonly-api/resource-policies.ts.`;
  }
  if (!hasPermission(ctx.role, ctx.permissions, rule.permission)) {
    return `Permission denied: leer "${resourceKey}" necesita el permiso ${rule.permission}.`;
  }
  if (rule.pluginId && !activePluginIds.has(rule.pluginId)) {
    return `Plugin is not enabled: ${rule.pluginId} (recurso "${resourceKey}"). Activalo desde Ajustes para poder leerlo.`;
  }
  return null;
}

/**
 * Condición extra de visibilidad de chats para este recurso, o `undefined` si el
 * recurso no cuelga de un chat o el actor ve todo.
 *
 * Se resuelve como subconsulta y no como join porque `listReadOnlyResource`
 * arma un `select ... from <tabla>` plano: meterle un join cambiaría la forma de
 * las filas de los 131 recursos para arreglar seis.
 */
export async function chatVisibilityCondition(
  ctx: PermissionContext,
  resource: ReadOnlyResource,
): Promise<SQL | undefined> {
  const column = CHAT_SCOPED[resource.key];
  if (!column) return undefined;
  if (ctx.chatVisibility === 'all') return undefined;

  const scope = await chatScope(ctx);
  if (!scope) return undefined;

  const columns = getTableColumns(resource.table);
  const target = columns[column];
  if (!target) return undefined;

  return sql`${target} in (select ${chats.id} from ${chats} left join ${contacts} on ${eq(contacts.chatId, chats.id)} where ${scope})`;
}
