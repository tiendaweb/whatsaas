import 'server-only';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { teamMembers } from '@/lib/db/schema';
import { buildPermissionContext } from '@/lib/auth/permissions-guard';
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  updateQuickReply,
} from '@/lib/quick-replies/service';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { PluginToggleError, setPluginEnabledByMember } from '@/lib/plugins/core/service';
import { listBuiltinToolCatalog, setBuiltinToolEnabled } from '@/lib/plugins/ai-chat/builtin/index';
import { AI_PROVIDERS, getTeamAiConfigPublic, patchTeamAiConfig } from '@/lib/plugins/ai-chat/config';
import { getPrefs, listarSectores, sectoresDe, setPrefs, setSector } from '@/lib/notifications/service';
import { ALCANCES_CHAT, CANALES, KINDS } from '@/lib/notifications/tipos';
import { resolveMenuForTeam, setItemPinned, setMainNavOrder } from '@/lib/menu/service';
import { fetchInstanceLiveDetails, listTeamInstances } from '@/lib/instances/live-status';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from './actions';

/**
 * Ajustes del equipo y del usuario por MCP: respuestas rápidas, apps activas,
 * funciones integradas del bot, configuración del agente IA (sin la clave),
 * preferencias de avisos, menú e instancias de WhatsApp.
 *
 * Nada de acá devuelve secretos: ni `ai_configs.apiKey`, ni tokens de
 * Evolution, ni teléfonos completos.
 */

const enumOf = (values: readonly string[]) => [...values];

function maskPhone(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `•••${digits.slice(-4)}`;
}

async function memberRole(context: GrokActionContext) {
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, context.teamId), eq(teamMembers.userId, context.userId)),
    columns: { role: true },
  });
  if (!member) throw new Error('No hay membresía activa para este usuario en este equipo.');
  return member.role;
}

async function activePluginsSummary(teamId: number, userId: number) {
  const active = await resolveActivePluginsForTeam(teamId, userId);
  return active.map((p) => ({ pluginId: p.pluginId, displayName: p.manifest.displayName, activationMode: p.manifest.activationMode }));
}

// ---------------------------------------------------------------------------
// Esquemas zod (validación en el handler; los inputSchema de abajo son JSON Schema puro)
// ---------------------------------------------------------------------------

const quickReplySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    shortcut: z.string().trim().min(1).max(50),
    content: z.string().min(1).max(10000),
  }).strict(),
  z.object({
    action: z.literal('update'),
    id: z.number().int().positive(),
    shortcut: z.string().trim().min(1).max(50).optional(),
    content: z.string().min(1).max(10000).optional(),
  }).strict(),
  z.object({
    action: z.literal('delete'),
    id: z.number().int().positive(),
    confirm: z.literal(true),
  }).strict(),
]);

const pluginsManageSchema = z.object({
  plugin_id: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
  user_id: z.number().int().positive().optional(),
}).strict();

const builtinToolsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({
    action: z.literal('set'),
    tool_name: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
  }).strict(),
]);

const aiConfigSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get') }).strict(),
  z.object({
    action: z.literal('patch'),
    is_active: z.boolean().optional(),
    provider: z.enum(AI_PROVIDERS).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    system_prompt: z.string().max(60000).nullable().optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_output_tokens: z.number().int().min(1).max(32000).optional(),
  }).strict(),
]);

const kindsPatchSchema = z.partialRecord(z.enum(KINDS), z.array(z.enum(CANALES)).max(4));

const notificationPrefsSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('get') }).strict(),
  z.object({
    action: z.literal('set'),
    whatsapp_enabled: z.boolean().optional(),
    push_enabled: z.boolean().optional(),
    inapp_enabled: z.boolean().optional(),
    chat_alerts: z.enum(ALCANCES_CHAT).optional(),
    quiet_from: z.number().int().min(0).max(23).nullable().optional(),
    quiet_to: z.number().int().min(0).max(23).nullable().optional(),
    kinds: kindsPatchSchema.optional(),
    group_jid: z.string().trim().max(64).nullable().optional(),
    department_id: z.number().int().positive().nullable().optional(),
  }).strict(),
]);

const menuManageSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('reorder'),
    ordered_keys: z.array(z.string().trim().min(1).max(200)).min(1).max(60),
  }).strict(),
  z.object({
    action: z.literal('pin'),
    item_key: z.string().trim().min(1).max(200),
    pinned: z.boolean(),
  }).strict(),
]);

const instancesStatusSchema = z.object({
  live: z.boolean().optional(),
}).strict();

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const settingsReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_quick_replies_list',
    description:
      'Lista las respuestas rápidas del equipo: los atajos "/algo" que el compositor del chat expande a un texto. Devuelve id, atajo (sin la barra) y contenido completo, de la más nueva a la más vieja. Usala antes de whatspro_manage_quick_reply para no repetir atajos, o para saber qué respuestas ya existen antes de proponer una nueva. No son plantillas oficiales de WhatsApp Business (esas son whatspro_list_records(resource="templates")).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'whatspro_instances_status',
    description:
      'Las instancias (números) de WhatsApp conectadas al equipo, con nombre, integración (Baileys o Cloud API), número enmascarado (sólo últimos 4 dígitos), si es la instancia por defecto para enviar cuando un chat no tiene una propia, y el estado de conexión en vivo consultado a Evolution API (open, close, connecting…). Si la consulta en vivo falla o está apagada, live_status viene null y el resto igual. Usala para diagnosticar "no salen los mensajes" antes de reintentar envíos. Nunca devuelve tokens ni claves de la instancia, ni el número completo.',
    inputSchema: {
      type: 'object',
      properties: {
        live: { type: 'boolean', description: 'false = sólo lo guardado en la base, sin consultar Evolution (más rápido). Por defecto true.' },
      },
      additionalProperties: false,
    },
  },
];

export const settingsActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_manage_quick_reply',
    description:
      'Crea, edita o borra una respuesta rápida del equipo (los atajos "/algo" del compositor). El atajo se guarda sin la barra y en minúsculas y tiene que ser único en el equipo. update es parcial: mandá sólo shortcut o content. delete exige confirm=true y es irreversible. Leé primero whatspro_quick_replies_list para no pisar un atajo existente. No envía mensajes ni toca plantillas de WhatsApp Business.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        id: { type: 'integer', minimum: 1, description: 'Obligatorio para update y delete.' },
        shortcut: { type: 'string', minLength: 1, maxLength: 50, description: 'Atajo, con o sin "/" inicial. Obligatorio en create.' },
        content: { type: 'string', minLength: 1, maxLength: 10000, description: 'Texto que se expande. Obligatorio en create.' },
        confirm: { type: 'boolean', description: 'Obligatorio en delete: tiene que ser true.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_plugins_manage',
    description:
      'Activa o desactiva una app (plugin) con las mismas reglas que la pantalla de Apps: las apps "global" se prenden para todo el equipo y sólo owner/admin pueden tocarlas; las "user" e "hybrid" se prenden por persona (por defecto quien llama; user_id apunta a otro miembro y exige owner/admin). Las apps de sistema y Tareas no se apagan. Devuelve la lista de apps activas para esa persona después del cambio. Los ids de app salen de whatspro_list_resources o del catálogo (por ejemplo "finance", "calendar", "ai-chat"). No instala nada nuevo desde afuera: sólo prende lo que ya existe en el registro.',
    inputSchema: {
      type: 'object',
      required: ['plugin_id', 'enabled'],
      properties: {
        plugin_id: { type: 'string', minLength: 1, maxLength: 80 },
        enabled: { type: 'boolean' },
        user_id: { type: 'integer', minimum: 1, description: 'Sólo para apps por persona: a quién se le prende o apaga. Por defecto, quien llama.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_ai_builtin_tools',
    description:
      'Las funciones integradas del bot de WhatsApp (agendar reuniones, consultar clientes, registrar ventas, etc.). action=list devuelve el catálogo con la app que respalda cada una, si esa app está activa y si está habilitada. action=set la prende o apaga para el equipo: apagarla hace que el bot deje de poder invocarla aunque la app siga activa. Exige la app Agente IA. No crea funciones nuevas (eso es el creador de herramientas de Ajustes → IA) ni cambia el prompt del bot (eso es whatspro_ai_config).',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['list', 'set'] },
        tool_name: { type: 'string', minLength: 1, maxLength: 120, description: 'Nombre exacto de la función tal como sale en list. Obligatorio en set.' },
        enabled: { type: 'boolean', description: 'Obligatorio en set.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_ai_config',
    description:
      'Configuración del agente IA de WhatsApp del equipo. action=get devuelve proveedor, modelo, prompt de sistema, temperatura, máximo de tokens, si está activo y si hay clave cargada (nunca la clave). action=patch edita sólo los campos que mandes; los demás quedan igual. La clave del proveedor NO se puede leer ni escribir desde acá: se carga en Ajustes → IA, y sin ella el patch falla porque la config todavía no existe. Cambiar is_active apaga o prende el bot para todos los chats que no tengan un estado propio (para un chat puntual usá whatspro_chat_ai_status).',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['get', 'patch'] },
        is_active: { type: 'boolean' },
        provider: { type: 'string', enum: enumOf(AI_PROVIDERS) },
        model: { type: 'string', minLength: 1, maxLength: 100, description: 'Id del modelo del proveedor (por ejemplo "gemini-2.5-flash-lite" o "gpt-4o-mini").' },
        system_prompt: { type: ['string', 'null'], maxLength: 60000, description: 'Prompt de sistema completo. Reemplaza el anterior; null lo vacía.' },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
        max_output_tokens: { type: 'integer', minimum: 1, maximum: 32000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_notification_prefs',
    description:
      'Preferencias de avisos DEL PROPIO USUARIO en este equipo (no requiere permiso especial; no se pueden editar las de otra persona). action=get devuelve canales activos (app, push, WhatsApp, grupo), de qué chats quiere que le avisen, horario de silencio, canales por tipo de aviso, el sector (departamento) al que pertenece y la lista de sectores disponibles. action=set aplica un parche parcial; department_id cambia de sector (uno solo por persona: el sector decide a quién le suena cada chat; null lo saca de todos). El número de WhatsApp para recibir avisos NO se lee ni se cambia desde acá (sólo se informa enmascarado): se carga desde la pantalla de avisos.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['get', 'set'] },
        whatsapp_enabled: { type: 'boolean', description: 'Recibir avisos por WhatsApp (requiere número cargado desde la pantalla).' },
        push_enabled: { type: 'boolean' },
        inapp_enabled: { type: 'boolean' },
        chat_alerts: { type: 'string', enum: enumOf(ALCANCES_CHAT), description: 'todos = cada mensaje que entra; sector = los de mi sector, los míos y los sin asignar; mios = sólo los asignados a mí; ninguno.' },
        quiet_from: { type: ['integer', 'null'], minimum: 0, maximum: 23, description: 'Hora (0-23) desde la que no suena push ni WhatsApp. null desactiva el silencio.' },
        quiet_to: { type: ['integer', 'null'], minimum: 0, maximum: 23 },
        kinds: {
          type: 'object',
          description: 'Canales por tipo de aviso, por ejemplo {"calendar.reminder":["push","whatsapp"]}. Reemplaza el mapa entero. Vacío = todos por los canales activos.',
          additionalProperties: { type: 'array', maxItems: 4, uniqueItems: true, items: { type: 'string', enum: enumOf(CANALES) } },
        },
        group_jid: { type: ['string', 'null'], maxLength: 64, description: 'Grupo de WhatsApp del equipo para avisos generales (jid @g.us). null lo quita.' },
        department_id: { type: ['integer', 'null'], minimum: 1, description: 'Sector al que pasar al usuario. Los ids salen del propio get (sectores_disponibles). null lo saca de todos.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_menu_manage',
    description:
      'Edita el menú del equipo (el mismo para todos los miembros). action=reorder fija y ordena la barra principal de arriba hacia abajo con ordered_keys; los ítems que no mandes conservan su estado. action=pin fija (pinned=true) un ítem en la barra principal o lo manda (pinned=false) al lanzador de Apps. Las claves son las de whatspro_list_resources / el menú resuelto que devuelve esta misma tool (por ejemplo "/dashboard", "/contacts", "/plugins/finance"). Algunos destinos tienen ubicación fija y el cambio se ignora en silencio (la Bandeja y el Command Center siempre en la barra; Tareas clásicas siempre en Apps). Devuelve el menú resuelto después del cambio.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['reorder', 'pin'] },
        ordered_keys: { type: 'array', minItems: 1, maxItems: 60, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 200 }, description: 'Obligatorio en reorder.' },
        item_key: { type: 'string', minLength: 1, maxLength: 200, description: 'Obligatorio en pin.' },
        pinned: { type: 'boolean', description: 'Obligatorio en pin.' },
      },
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

export async function executeSettingsTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
): Promise<unknown> {
  if (name === 'whatspro_quick_replies_list') {
    await assertPermission(context, 'templates');
    const replies = await listQuickReplies(context.teamId);
    return { count: replies.length, quick_replies: replies.map((r) => ({ id: r.id, shortcut: r.shortcut, content: r.content, createdAt: r.createdAt.toISOString() })) };
  }

  if (name === 'whatspro_manage_quick_reply') {
    await assertPermission(context, 'templates');
    const args = parse(quickReplySchema, input);
    if (args.action === 'create') {
      const created = await createQuickReply(context.teamId, context.userId, { shortcut: args.shortcut, content: args.content });
      await audit(context, 'CONNECTOR_QUICK_REPLY_CREATED', created.id);
      return { success: true, quick_reply: created };
    }
    if (args.action === 'update') {
      const updated = await updateQuickReply(context.teamId, context.userId, args.id, { shortcut: args.shortcut, content: args.content });
      await audit(context, 'CONNECTOR_QUICK_REPLY_UPDATED', updated.id);
      return { success: true, quick_reply: updated };
    }
    const result = await deleteQuickReply(context.teamId, context.userId, args.id);
    if (!result.deleted) throw new Error('Quick reply not found.');
    await audit(context, 'CONNECTOR_QUICK_REPLY_DELETED', args.id);
    return { success: true, deleted_id: args.id };
  }

  if (name === 'whatspro_plugins_manage') {
    await assertPermission(context, 'settings');
    const args = parse(pluginsManageSchema, input);
    const role = await memberRole(context);
    let result: Awaited<ReturnType<typeof setPluginEnabledByMember>>;
    try {
      result = await setPluginEnabledByMember({
        teamId: context.teamId,
        actorUserId: context.userId,
        actorRole: role,
        pluginId: args.plugin_id,
        enabled: args.enabled,
        targetUserId: args.user_id,
      });
    } catch (error) {
      if (error instanceof PluginToggleError) throw new Error(error.message);
      throw error;
    }
    await audit(context, args.enabled ? 'CONNECTOR_PLUGIN_ENABLED' : 'CONNECTOR_PLUGIN_DISABLED', result.pluginId);
    const forUserId = result.userId ?? context.userId;
    return {
      success: true,
      ...result,
      active_plugins: await activePluginsSummary(context.teamId, forUserId),
    };
  }

  if (name === 'whatspro_ai_builtin_tools') {
    await assertPermission(context, 'aiAgent', 'ai-chat');
    const args = parse(builtinToolsSchema, input);
    if (args.action === 'list') {
      return { tools: await listBuiltinToolCatalog(context.teamId) };
    }
    await setBuiltinToolEnabled({ teamId: context.teamId, toolName: args.tool_name, enabled: args.enabled, userId: context.userId });
    await audit(context, args.enabled ? 'CONNECTOR_AI_BUILTIN_TOOL_ENABLED' : 'CONNECTOR_AI_BUILTIN_TOOL_DISABLED', args.tool_name);
    const catalog = await listBuiltinToolCatalog(context.teamId);
    return { success: true, tool: catalog.find((t) => t.name === args.tool_name) ?? null };
  }

  if (name === 'whatspro_ai_config') {
    await assertPermission(context, 'aiAgent', 'ai-chat');
    const args = parse(aiConfigSchema, input);
    if (args.action === 'get') {
      const config = await getTeamAiConfigPublic(context.teamId);
      return { configured: config !== null, config };
    }
    const patch = {
      isActive: args.is_active,
      provider: args.provider,
      model: args.model,
      systemPrompt: args.system_prompt,
      temperature: args.temperature,
      maxOutputTokens: args.max_output_tokens,
    };
    const touched = Object.entries(patch).filter(([, v]) => v !== undefined).map(([k]) => k);
    if (!touched.length) throw new Error('Nothing to update.');
    const config = await patchTeamAiConfig(context.teamId, context.userId, patch);
    await audit(context, 'CONNECTOR_AI_CONFIG_PATCHED', touched.join(','));
    return { success: true, updated_fields: touched, config };
  }

  if (name === 'whatspro_notification_prefs') {
    // Sin permiso especial: son las preferencias del propio usuario. Sólo se
    // exige que sea miembro del equipo.
    const ctx = await buildPermissionContext(context.teamId, context.userId);
    if (!ctx) throw new Error('No hay membresía activa para este usuario en este equipo.');
    const args = parse(notificationPrefsSchema, input);

    const present = async () => {
      const [prefs, sectores, disponibles] = await Promise.all([
        getPrefs(context.teamId, context.userId),
        sectoresDe(context.teamId, context.userId),
        listarSectores(context.teamId),
      ]);
      const { whatsappPhone, ...rest } = prefs;
      return {
        prefs: { ...rest, whatsappPhoneMasked: maskPhone(whatsappPhone) },
        department_ids: sectores,
        sectores_disponibles: disponibles,
      };
    };

    if (args.action === 'get') return present();

    const patch: Parameters<typeof setPrefs>[2] = {};
    if (args.whatsapp_enabled !== undefined) patch.whatsappEnabled = args.whatsapp_enabled;
    if (args.push_enabled !== undefined) patch.pushEnabled = args.push_enabled;
    if (args.inapp_enabled !== undefined) patch.inappEnabled = args.inapp_enabled;
    if (args.chat_alerts !== undefined) patch.chatAlerts = args.chat_alerts;
    if (args.quiet_from !== undefined) patch.quietFrom = args.quiet_from;
    if (args.quiet_to !== undefined) patch.quietTo = args.quiet_to;
    if (args.kinds !== undefined) patch.kinds = args.kinds as Record<string, string[]>;
    if (args.group_jid !== undefined) patch.groupJid = args.group_jid;

    const changed: string[] = Object.keys(patch);
    if (changed.length) await setPrefs(context.teamId, context.userId, patch);
    if (args.department_id !== undefined) {
      await setSector(context.teamId, context.userId, args.department_id);
      changed.push('departmentId');
    }
    if (!changed.length) throw new Error('Nothing to update.');
    await audit(context, 'CONNECTOR_NOTIFICATION_PREFS_SET', changed.join(','));
    return { success: true, updated_fields: changed, ...(await present()) };
  }

  if (name === 'whatspro_menu_manage') {
    await assertPermission(context, 'settings');
    const args = parse(menuManageSchema, input);
    if (args.action === 'reorder') {
      await setMainNavOrder(context.teamId, args.ordered_keys, context.userId);
      await audit(context, 'CONNECTOR_MENU_REORDERED', args.ordered_keys.length);
    } else {
      await setItemPinned(context.teamId, args.item_key, args.pinned, context.userId);
      await audit(context, args.pinned ? 'CONNECTOR_MENU_PINNED' : 'CONNECTOR_MENU_UNPINNED', args.item_key);
    }
    return { success: true, menu: await resolveMenuForTeam(context.teamId, context.userId) };
  }

  if (name === 'whatspro_instances_status') {
    await assertPermission(context, 'settings');
    const { live } = parse(instancesStatusSchema, input);
    const rows = await listTeamInstances(context.teamId);
    // `sendTeamTextMessage` cae en la primera instancia del equipo cuando el chat
    // no tiene una propia: esa es "la instancia por defecto" a efectos prácticos.
    const defaultId = rows.length ? Math.min(...rows.map((r) => r.id)) : null;
    const instances = await Promise.all(rows.map(async (row) => {
      let liveStatus: Awaited<ReturnType<typeof fetchInstanceLiveDetails>> | null = null;
      if (live !== false) {
        try {
          liveStatus = await fetchInstanceLiveDetails(row);
        } catch (error) {
          console.error('[settings-actions] instance live status failed', row.instanceName, error instanceof Error ? error.message : error);
          liveStatus = null;
        }
      }
      return {
        id: row.id,
        instanceName: row.instanceName,
        integration: row.integration,
        numberMasked: maskPhone(row.instanceNumber) ?? maskPhone(liveStatus?.number),
        is_default: row.id === defaultId,
        hasCredentials: Boolean(row.accessToken || row.metaToken),
        createdAt: row.createdAt.toISOString(),
        live_status: liveStatus
          ? {
              status: liveStatus.status,
              profileName: liveStatus.profileName,
              integration: liveStatus.integration,
            }
          : null,
      };
    }));
    return { count: instances.length, instances };
  }

  throw new Error(`Unknown settings tool: ${name}`);
}
