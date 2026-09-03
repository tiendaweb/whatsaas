import 'server-only';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { chats } from '@/lib/db/schema';
import { buildPermissionContext, type PermissionContext } from '@/lib/auth/permissions-guard';
import { markChatsRead } from '@/lib/chats/mark-read';
import { closeChat } from '@/lib/chats/close';
import { setChatAiStatus } from '@/lib/chats/ai-status';
import {
  AudioTranscriptionError,
  ChatSummaryError,
  findAccessibleChat,
  getChatSummary,
  SUMMARY_LOCALES,
  summarizeChat,
} from '@/lib/chats/ai-summary';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from './actions';

/**
 * Operaciones sobre un chat que hasta ahora sólo existían como botones de la
 * bandeja: marcar leído, cortar, prender/pausar el agente IA, resumir y
 * pausar automatizaciones. Toda la lógica vive en `lib/chats/**` con firma
 * `(teamId, userId, chatId, …)`; acá sólo se validan argumentos y permisos.
 *
 * Ningún argumento ni resultado lleva teléfonos: el chat se identifica por id.
 */

async function ctxOf(context: GrokActionContext): Promise<PermissionContext> {
  const ctx = await buildPermissionContext(context.teamId, context.userId);
  if (!ctx) throw new Error('No hay membresía activa para este usuario en este equipo.');
  return ctx;
}

/** Ids que el usuario realmente puede ver, con la misma regla que la pantalla del chat. */
async function visibleChatIds(ctx: PermissionContext, ids: number[]) {
  const checks = await Promise.all(ids.map(async (id) => ({ id, ...(await findAccessibleChat(id, ctx)) })));
  return {
    visible: checks.filter((c) => c.chat && c.allowed).map((c) => c.id),
    notFound: checks.filter((c) => !c.chat).map((c) => c.id),
    forbidden: checks.filter((c) => c.chat && !c.allowed).map((c) => c.id),
  };
}

const chatIdSchema = z.number().int().positive();

const markReadSchema = z.object({
  chat_ids: z.array(chatIdSchema).min(1).max(50),
}).strict();

const closeSchema = z.object({ chat_id: chatIdSchema }).strict();

const aiStatusSchema = z.object({
  chat_id: chatIdSchema,
  enabled: z.boolean(),
}).strict();

const summarizeSchema = z.object({
  chat_id: chatIdSchema,
  locale: z.enum(SUMMARY_LOCALES).optional(),
  force: z.boolean().optional(),
}).strict();

const automationSchema = z.object({
  chat_id: chatIdSchema,
  enabled: z.boolean(),
}).strict();

export const chatReadTools: GrokActionTool[] = [];

export const chatActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_chat_mark_read',
    description:
      'Marca como leídos hasta 50 chats de una vez (pone el contador de no leídos en cero y refresca la bandeja de todos los agentes). Usala después de atender o revisar conversaciones desde el conector, para que no queden como pendientes en la pantalla. Sólo toca chats del equipo que este usuario puede ver: los demás vuelven en not_found o forbidden sin cortar el lote. No envía ningún mensaje ni cambia el estado del chat en WhatsApp.',
    inputSchema: {
      type: 'object',
      required: ['chat_ids'],
      properties: {
        chat_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
          items: { type: 'integer', minimum: 1 },
          description: 'Ids de chat tal como los devuelven whatspro_command_center_inbox, whatspro_list_records(resource="chats") o el ítem chat:<id> de la cola.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_close',
    description:
      'Cierra ("corta") un chat a mano, igual que el botón de la bandeja: completa las sesiones de automatización activas, deja las automatizaciones apagadas para ese chat hasta que alguien dispare una a mano y escribe un mensaje de sistema con quién lo cerró. Usala cuando la conversación terminó y no querés que un flujo la reabra solo. No archiva ni borra el chat, no le avisa nada al cliente y no cambia el contador de no leídos (para eso está whatspro_chat_mark_read). Para volver a habilitar automatizaciones usá whatspro_chat_set_automation.',
    inputSchema: {
      type: 'object',
      required: ['chat_id'],
      properties: {
        chat_id: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_ai_status',
    description:
      'Activa o pausa el agente IA de WhatsApp en un chat concreto. enabled=false frena al bot sólo en esa conversación (para que la atienda una persona); enabled=true vuelve a dejar que conteste. Sin un estado propio el chat hereda el estado global del equipo: devuelve teamEnabled, el estado efectivo y si cambió algo. Si cambió, deja mensaje de sistema y avisa a la pantalla. No cambia la configuración global del agente (eso es whatspro_ai_config) ni envía mensajes.',
    inputSchema: {
      type: 'object',
      required: ['chat_id', 'enabled'],
      properties: {
        chat_id: { type: 'integer', minimum: 1 },
        enabled: { type: 'boolean', description: 'true = el bot contesta en este chat; false = pausado en este chat.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_summarize',
    description:
      'Genera el resumen IA de la conversación completa de un chat (panorama, puntos clave, acuerdos, pendientes) con el proveedor de IA del equipo, transcribiendo los audios, y lo guarda en la ficha del chat. CONSUME CUOTA DE IA DEL EQUIPO: por defecto, si ya hay un resumen guardado y no entraron mensajes nuevos desde entonces, devuelve ese sin volver a generar; mandá force=true para regenerar igual. Exige la app Agente IA activa y una configuración de IA cargada; respeta la visibilidad de chats del usuario. No envía nada al cliente. Si algún audio no se pudo transcribir, falla entero en vez de resumir a medias.',
    inputSchema: {
      type: 'object',
      required: ['chat_id'],
      properties: {
        chat_id: { type: 'integer', minimum: 1 },
        locale: { type: 'string', enum: [...SUMMARY_LOCALES], description: 'Idioma del resumen. Por defecto es (castellano).' },
        force: { type: 'boolean', description: 'true = regenerar aunque el resumen guardado esté al día. Gasta cuota.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_set_automation',
    description:
      'Pausa o reanuda las automatizaciones (flujos) para un chat. enabled=false hace que ningún flujo se dispare solo en esa conversación; enabled=true vuelve a permitirlo. Es la misma marca que deja whatspro_chat_close, pero sin cerrar el chat ni completar sesiones activas. Usala para sacar a un cliente de los flujos automáticos mientras lo atiende una persona, o para devolverlo. No dispara ningún flujo (eso es whatspro_chat_trigger_automation) y no toca al agente IA (eso es whatspro_chat_ai_status).',
    inputSchema: {
      type: 'object',
      required: ['chat_id', 'enabled'],
      properties: {
        chat_id: { type: 'integer', minimum: 1 },
        enabled: { type: 'boolean', description: 'true = las automatizaciones pueden dispararse en este chat; false = pausadas.' },
      },
      additionalProperties: false,
    },
  },
];

export async function executeChatTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
): Promise<unknown> {
  if (name === 'whatspro_chat_mark_read') {
    await assertPermission(context, 'messagesRead');
    const { chat_ids } = parse(markReadSchema, input);
    const ctx = await ctxOf(context);
    // markChatsRead espera ids ya filtrados por visibilidad (ver nota en lib/chats/mark-read.ts).
    const { visible, notFound, forbidden } = await visibleChatIds(ctx, [...new Set(chat_ids)]);
    const marked = visible.length ? await markChatsRead(context.teamId, visible) : [];
    if (marked.length) await audit(context, 'CONNECTOR_CHAT_MARK_READ', marked.join(','));
    return { success: true, marked, not_found: notFound, forbidden };
  }

  if (name === 'whatspro_chat_close') {
    await assertPermission(context, 'contacts');
    const { chat_id } = parse(closeSchema, input);
    const ctx = await ctxOf(context);
    const { chat, allowed } = await findAccessibleChat(chat_id, ctx);
    if (!chat) throw new Error('Chat not found.');
    if (!allowed) throw new Error('El usuario no tiene visibilidad sobre este chat.');
    const result = await closeChat(context.teamId, context.userId, chat_id);
    await audit(context, 'CONNECTOR_CHAT_CLOSED', chat_id);
    return { success: true, ...result };
  }

  if (name === 'whatspro_chat_ai_status') {
    await assertPermission(context, 'aiAgent');
    const { chat_id, enabled } = parse(aiStatusSchema, input);
    const ctx = await ctxOf(context);
    const { chat, allowed } = await findAccessibleChat(chat_id, ctx);
    if (!chat) throw new Error('Chat not found.');
    if (!allowed) throw new Error('El usuario no tiene visibilidad sobre este chat.');
    const result = await setChatAiStatus(context.teamId, context.userId, chat_id, enabled);
    await audit(context, enabled ? 'CONNECTOR_CHAT_AI_ACTIVATED' : 'CONNECTOR_CHAT_AI_PAUSED', chat_id);
    return { success: true, chatId: chat_id, ...result };
  }

  if (name === 'whatspro_chat_summarize') {
    await assertPermission(context, 'messagesRead', 'ai-chat');
    const { chat_id, locale, force } = parse(summarizeSchema, input);
    const ctx = await ctxOf(context);
    try {
      if (!force) {
        const saved = await getChatSummary(ctx, chat_id);
        if (saved && !saved.isStale) return { chatId: chat_id, cached: true, ...saved };
      }
      const summary = await summarizeChat(context.teamId, context.userId, chat_id, { locale, permCtx: ctx });
      await audit(context, 'CONNECTOR_CHAT_SUMMARIZED', chat_id);
      return { chatId: chat_id, cached: false, ...summary };
    } catch (error) {
      if (error instanceof ChatSummaryError) throw new Error(error.message);
      if (error instanceof AudioTranscriptionError) {
        throw new Error(`No se pudieron transcribir ${error.failedCount} audio(s); el resumen no se generó.`);
      }
      throw error;
    }
  }

  if (name === 'whatspro_chat_set_automation') {
    await assertPermission(context, 'automation');
    const { chat_id, enabled } = parse(automationSchema, input);
    const ctx = await ctxOf(context);
    const { chat, allowed } = await findAccessibleChat(chat_id, ctx);
    if (!chat) throw new Error('Chat not found.');
    if (!allowed) throw new Error('El usuario no tiene visibilidad sobre este chat.');
    const [updated] = await db
      .update(chats)
      .set({ automationDisabled: !enabled })
      .where(and(eq(chats.id, chat_id), eq(chats.teamId, context.teamId)))
      .returning({ id: chats.id, automationDisabled: chats.automationDisabled });
    if (!updated) throw new Error('Chat not found.');
    await audit(context, enabled ? 'CONNECTOR_CHAT_AUTOMATION_ENABLED' : 'CONNECTOR_CHAT_AUTOMATION_PAUSED', chat_id);
    return { success: true, chatId: updated.id, automationEnabled: !updated.automationDisabled };
  }

  throw new Error(`Unknown chat tool: ${name}`);
}
