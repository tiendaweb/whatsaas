import 'server-only';

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Buffer } from 'buffer';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db/drizzle';
import { chats, evolutionInstances, messages, teamMessageSendKeys, wabaTemplates } from '@/lib/db/schema';
import {
  getEvolutionErrorMessage,
  getEvolutionRecipientNumber,
  sendEvolutionRequestWithRetry,
} from '@/lib/evolution';
import { pusherServer } from '@/lib/pusher-server';

/**
 * Capa de envío de WhatsApp con firma `(teamId, …)`.
 *
 * Antes toda esta lógica vivía dentro de `app/api/messages/send/route.ts` y
 * `sendMedia/route.ts`, atada a la sesión del navegador. Eso dejaba el envío
 * inalcanzable para cualquier cosa sin cookie — en particular para las tools
 * MCP de los conectores, que corren sólo con `{ teamId, userId }`. El síntoma
 * era que la IA programaba un mensaje para dentro de un minuto porque era la
 * única puerta que tenía para escribirle a un cliente.
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';

export type SendOrigin = 'user' | 'mcp' | 'automation';

export type SendableInstance = {
  id: number;
  instanceName: string;
  accessToken: string;
};

type ResolvedTarget = {
  instance: SendableInstance;
  chatId: number | null;
};

export class MessagingError extends Error {
  constructor(
    message: string,
    readonly code: 'no_instance' | 'invalid_recipient' | 'chat_not_found' | 'template_not_found' | 'template_rejected',
  ) {
    super(message);
    this.name = 'MessagingError';
  }
}

/**
 * Elige desde qué número sale el mensaje. El orden importa: la instancia que
 * pidieron explícitamente, después la del chat que ya existe con ese contacto
 * (para no partir la conversación en dos), y recién al final cualquiera del
 * equipo.
 */
export async function resolveSendingInstance(
  teamId: number,
  options: { instanceId?: number | null; remoteJid?: string | null } = {},
): Promise<ResolvedTarget> {
  let instance: typeof evolutionInstances.$inferSelect | undefined;
  let chatId: number | null = null;

  if (options.instanceId) {
    instance = await db.query.evolutionInstances.findFirst({
      where: and(eq(evolutionInstances.id, options.instanceId), eq(evolutionInstances.teamId, teamId)),
    });
    if (!instance) {
      throw new MessagingError(`La instancia #${options.instanceId} no existe en este equipo.`, 'no_instance');
    }
    if (options.remoteJid) {
      const chat = await db.query.chats.findFirst({
        where: and(eq(chats.teamId, teamId), eq(chats.remoteJid, options.remoteJid), eq(chats.instanceId, instance.id)),
        columns: { id: true },
      });
      chatId = chat?.id ?? null;
    }
  }

  if (!instance && options.remoteJid) {
    const chat = await db.query.chats.findFirst({
      where: and(eq(chats.teamId, teamId), eq(chats.remoteJid, options.remoteJid)),
      with: { instance: true },
    });
    if (chat?.instance) {
      instance = chat.instance;
      chatId = chat.id;
    }
  }

  if (!instance) {
    instance = await db.query.evolutionInstances.findFirst({ where: eq(evolutionInstances.teamId, teamId) });
  }

  if (!instance || !instance.instanceName || !instance.accessToken) {
    throw new MessagingError(
      instance
        ? `La instancia "${instance.instanceName}" no tiene token de acceso: volvé a conectarla desde Ajustes.`
        : 'El equipo no tiene ninguna instancia de WhatsApp conectada.',
      'no_instance',
    );
  }

  return {
    instance: { id: instance.id, instanceName: instance.instanceName, accessToken: instance.accessToken },
    chatId,
  };
}

/**
 * Un mensaje que salió no se deshace. Toda entrada que no venga de un humano
 * apretando "enviar" pasa por acá: la misma clave devuelve el mensaje original
 * en vez de escribirle dos veces al cliente.
 */
async function findIdempotentMessage(teamId: number, idempotencyKey: string) {
  const keyHash = hashIdempotencyKey(teamId, idempotencyKey);
  const existing = await db.query.teamMessageSendKeys.findFirst({
    where: and(eq(teamMessageSendKeys.teamId, teamId), eq(teamMessageSendKeys.keyHash, keyHash)),
  });
  if (!existing) return null;
  const message = await db.query.messages.findFirst({ where: eq(messages.id, existing.messageId) });
  return message ? { message, chatId: existing.chatId } : null;
}

function hashIdempotencyKey(teamId: number, key: string) {
  return crypto.createHash('sha256').update(`${teamId}:${key}`).digest('hex');
}

async function claimIdempotencyKey(
  teamId: number,
  idempotencyKey: string,
  messageId: string,
  chatId: number,
  source: SendOrigin,
) {
  await db.insert(teamMessageSendKeys).values({
    teamId,
    keyHash: hashIdempotencyKey(teamId, idempotencyKey),
    messageId,
    chatId,
    source,
  }).onConflictDoNothing();
}

async function upsertChat(
  teamId: number,
  remoteJid: string,
  instanceId: number,
  existingChatId: number | null,
  preview: string,
  status: string,
  timestamp: Date,
) {
  if (existingChatId) {
    await db.update(chats).set({
      lastMessageText: preview,
      lastMessageTimestamp: timestamp,
      lastMessageFromMe: true,
      unreadCount: 0,
      lastMessageStatus: status,
    }).where(eq(chats.id, existingChatId));
    return existingChatId;
  }

  const [created] = await db.insert(chats).values({
    teamId,
    remoteJid,
    instanceId,
    name: remoteJid.split('@')[0],
    lastMessageText: preview,
    lastMessageTimestamp: timestamp,
    lastMessageFromMe: true,
    unreadCount: 0,
    lastMessageStatus: status,
  }).onConflictDoNothing().returning({ id: chats.id });

  if (created) return created.id;

  const recovered = await db.query.chats.findFirst({
    where: and(eq(chats.teamId, teamId), eq(chats.remoteJid, remoteJid), eq(chats.instanceId, instanceId)),
    columns: { id: true },
  });
  if (!recovered) throw new MessagingError(`No se pudo abrir el chat con ${remoteJid}.`, 'chat_not_found');
  return recovered.id;
}

async function broadcast(teamId: number, chatId: number, remoteJid: string, instanceId: number, message: Record<string, unknown>, preview: string, timestamp: Date, status: string) {
  const channel = `team-${teamId}`;
  const payload = { ...message, timestamp: timestamp.toISOString(), remoteJid, instanceId };
  await Promise.all([
    pusherServer.trigger(channel, 'new-message', payload),
    pusherServer.trigger(channel, 'chat-list-update', {
      id: chatId,
      remoteJid,
      instanceId,
      lastMessageText: preview,
      lastMessageTimestamp: timestamp.toISOString(),
      lastMessageFromMe: true,
      lastMessageStatus: status,
      unreadCount: 0,
    }),
  ]).catch((error) => console.error('[messaging] No se pudo publicar el mensaje por Pusher', error));
}

export type SendTextInput = {
  recipientJid: string;
  text: string;
  instanceId?: number | null;
  quotedMessage?: { id: string; text?: string | null } | null;
  /** Prefijo "*Nombre:*" que usa la firma del agente en el inbox. */
  signatureName?: string | null;
  origin?: SendOrigin;
  idempotencyKey?: string | null;
  /** Emitir por Pusher. El inbox lo necesita cuando el envío no lo hizo él. */
  broadcast?: boolean;
};

export type SendResult = {
  ok: boolean;
  idempotent: boolean;
  chatId: number;
  instance: { id: number; instanceName: string };
  message: Record<string, any>;
  errorMessage: string | null;
  connectionClosed: boolean;
};

export async function sendTeamTextMessage(teamId: number, input: SendTextInput): Promise<SendResult> {
  const origin = input.origin ?? 'user';

  if (input.idempotencyKey) {
    const previous = await findIdempotentMessage(teamId, input.idempotencyKey);
    if (previous) {
      return {
        ok: previous.message.status !== 'error',
        idempotent: true,
        chatId: previous.chatId ?? previous.message.chatId,
        instance: { id: 0, instanceName: '' },
        message: previous.message,
        errorMessage: previous.message.errorMessage ?? null,
        connectionClosed: false,
      };
    }
  }

  const { instance, chatId: existingChatId } = await resolveSendingInstance(teamId, {
    instanceId: input.instanceId,
    remoteJid: input.recipientJid,
  });

  const evolutionNumber = getEvolutionRecipientNumber(input.recipientJid);
  if (!evolutionNumber) {
    throw new MessagingError(`"${input.recipientJid}" no es un destinatario válido de WhatsApp.`, 'invalid_recipient');
  }

  const finalText = input.signatureName ? `*${input.signatureName}:*\n${input.text}` : input.text;

  const payload: Record<string, unknown> = { number: evolutionNumber, text: finalText };
  if (input.quotedMessage?.id) {
    payload.quoted = {
      key: { id: input.quotedMessage.id },
      message: input.quotedMessage.text ? { conversation: input.quotedMessage.text } : undefined,
    };
  }

  const { response, data, parseError, retried, connectionClosed } = await sendEvolutionRequestWithRetry({
    url: `${EVOLUTION_API_URL}/message/sendText/${instance.instanceName}`,
    instanceName: instance.instanceName,
    accessToken: instance.accessToken,
    payload,
  });

  const sendFailed = Boolean(parseError) || !response.ok || !data?.key?.id;
  let errorMessage: string | null = null;
  if (sendFailed) {
    console.error(`[messaging] Evolution rechazó el envío por ${instance.instanceName}${retried ? ' tras reintento' : ''}:`, data);
    errorMessage = getEvolutionErrorMessage({ data, parseError, response, instanceName: instance.instanceName });
  }

  const isGroup = input.recipientJid.endsWith('@g.us');
  const status = sendFailed ? 'error' : (isGroup ? 'delivered' : 'sent');
  const timestamp = new Date();
  const chatId = await upsertChat(teamId, input.recipientJid, instance.id, existingChatId, input.text, status, timestamp);

  const messageContent = sendFailed ? null : (data.message?.extendedTextMessage || data.message);
  const newMessage = {
    id: sendFailed ? `error_${Date.now()}` : data.key.id,
    chatId,
    fromMe: true,
    messageType: sendFailed
      ? 'conversation'
      : (data.messageType || (messageContent?.text ? 'extendedTextMessage' : 'conversation')),
    text: sendFailed ? finalText : (messageContent?.text || data.message?.conversation || finalText),
    timestamp,
    status,
    errorMessage,
    isInternal: false,
    isAi: origin === 'mcp',
    isAutomation: origin === 'automation',
    quotedMessageId: input.quotedMessage?.id ?? null,
    quotedMessageText: input.quotedMessage ? JSON.stringify(input.quotedMessage) : null,
  };

  const [inserted] = await db.insert(messages).values(newMessage as any).onConflictDoNothing().returning();
  const saved = inserted ?? newMessage;

  if (!sendFailed && input.idempotencyKey) {
    await claimIdempotencyKey(teamId, input.idempotencyKey, saved.id, chatId, origin);
  }

  if (input.broadcast ?? origin !== 'user') {
    await broadcast(teamId, chatId, input.recipientJid, instance.id, saved as Record<string, unknown>, input.text, timestamp, status);
  }

  return {
    ok: !sendFailed,
    idempotent: false,
    chatId,
    instance: { id: instance.id, instanceName: instance.instanceName },
    message: saved,
    errorMessage,
    connectionClosed,
  };
}

// ─── Plantillas WABA ─────────────────────────────────────────────────────────

export type SendTemplateInput = {
  recipientJid: string;
  templateId: number;
  /** Instancia WABA (Meta Cloud API). Obligatoria: las plantillas no salen por Evolution. */
  instanceId: number;
  /** Variables de la plantilla, indexadas "1", "2", … según los {{n}} del cuerpo. */
  variables?: Record<string, string> | null;
  origin?: SendOrigin;
  idempotencyKey?: string | null;
  broadcast?: boolean;
};

/**
 * Manda una plantilla WABA aprobada por Meta. Es la única forma de reabrir una
 * conversación fuera de la ventana de 24 h — y cuesta plata: Meta factura cada
 * plantilla enviada. Extraída de `app/api/messages/send-template/route.ts` para
 * que la consuman la route y las tools MCP.
 */
export async function sendTeamTemplateMessage(teamId: number, input: SendTemplateInput): Promise<SendResult> {
  const origin = input.origin ?? 'user';

  if (input.idempotencyKey) {
    const previous = await findIdempotentMessage(teamId, input.idempotencyKey);
    if (previous) {
      return {
        ok: previous.message.status !== 'error',
        idempotent: true,
        chatId: previous.chatId ?? previous.message.chatId,
        instance: { id: 0, instanceName: '' },
        message: previous.message,
        errorMessage: previous.message.errorMessage ?? null,
        connectionClosed: false,
      };
    }
  }

  const [instance, template] = await Promise.all([
    db.query.evolutionInstances.findFirst({
      where: and(eq(evolutionInstances.id, input.instanceId), eq(evolutionInstances.teamId, teamId)),
    }),
    db.query.wabaTemplates.findFirst({
      where: and(eq(wabaTemplates.id, input.templateId), eq(wabaTemplates.teamId, teamId)),
    }),
  ]);

  if (!instance || !instance.metaToken || !instance.metaPhoneNumberId) {
    throw new MessagingError(
      instance
        ? `La instancia "${instance.instanceName}" no es una instancia WABA conectada a Meta (le falta el token o el phone number id).`
        : `La instancia #${input.instanceId} no existe en este equipo.`,
      'no_instance',
    );
  }
  if (!template) {
    throw new MessagingError(`La plantilla #${input.templateId} no existe en este equipo.`, 'template_not_found');
  }

  const dbComponents = (template.components ?? []) as Array<Record<string, any>>;
  const payloadComponents: Array<Record<string, unknown>> = [];
  for (const comp of dbComponents) {
    if (comp.type !== 'BODY') continue;
    const params: Array<{ type: 'text'; text: string }> = [];
    if (input.variables || (comp.text && comp.text.includes('{{'))) {
      const textMatch: string[] | null = comp.text?.match(/\{\{(\d+)\}\}/g) ?? null;
      if (textMatch) {
        const vars = input.variables ?? {};
        for (let i = 1; i <= textMatch.length; i += 1) {
          const val = vars[String(i)] || vars[Object.keys(vars)[i - 1]] || '';
          params.push({ type: 'text', text: val });
        }
      }
    }
    if (params.length > 0) payloadComponents.push({ type: 'body', parameters: params });
  }

  const metaPayload = {
    messaging_product: 'whatsapp',
    to: input.recipientJid.replace('@s.whatsapp.net', '').replace(/\D/g, ''),
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language },
      components: payloadComponents.length > 0 ? payloadComponents : undefined,
    },
  };

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${instance.metaPhoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${instance.metaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metaPayload),
      signal: AbortSignal.timeout(10000),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    const errorObj = data.error || {};
    const userMessage = errorObj.error_user_msg;
    const userTitle = errorObj.error_user_title;
    const techMessage = errorObj.message || 'Unknown Meta error';
    const finalMessage = userTitle ? `${userTitle}: ${userMessage || techMessage}` : (userMessage || techMessage);
    throw new MessagingError(finalMessage, 'template_rejected');
  }

  // Vista previa: el cuerpo de la plantilla con las variables resueltas.
  let previewText: string = dbComponents.find((c) => c.type === 'BODY')?.text || template.name;
  if (input.variables) {
    const vars = input.variables;
    previewText = previewText.replace(/\{\{(\d+)\}\}/g, (_match: string, num: string) =>
      vars[num] || vars[Object.keys(vars)[parseInt(num, 10) - 1]] || `{{${num}}}`);
  }

  const timestamp = new Date();
  const existingChat = await db.query.chats.findFirst({
    where: and(eq(chats.teamId, teamId), eq(chats.remoteJid, input.recipientJid)),
    columns: { id: true },
  });
  const chatId = await upsertChat(teamId, input.recipientJid, instance.id, existingChat?.id ?? null, previewText, 'sent', timestamp);

  const messageId = data.messages?.[0]?.id || `waba_${Date.now()}`;
  const newMessage = {
    id: messageId,
    chatId,
    fromMe: true,
    messageType: 'templateMessage',
    text: previewText,
    timestamp,
    status: 'sent' as const,
    isInternal: false,
    isAi: origin === 'mcp',
    isAutomation: origin === 'automation',
  };
  const [inserted] = await db.insert(messages).values(newMessage as any).onConflictDoNothing().returning();
  const saved = inserted ?? newMessage;

  if (input.idempotencyKey) {
    await claimIdempotencyKey(teamId, input.idempotencyKey, saved.id, chatId, origin);
  }

  if (input.broadcast ?? origin !== 'user') {
    await broadcast(teamId, chatId, input.recipientJid, instance.id, saved as Record<string, unknown>, previewText, timestamp, 'sent');
  }

  return {
    ok: true,
    idempotent: false,
    chatId,
    instance: { id: instance.id, instanceName: instance.instanceName },
    message: saved,
    errorMessage: null,
    connectionClosed: false,
  };
}

// ─── Media ───────────────────────────────────────────────────────────────────

export type MediaKind = 'image' | 'video' | 'document' | 'audio';

const MEDIA_PREVIEW: Record<MediaKind, string> = {
  image: '📷 Imagen',
  video: '📹 Video',
  document: '📄 Documento',
  audio: '🎤 Audio',
};

const MEDIA_MESSAGE_TYPE: Record<MediaKind, string> = {
  image: 'imageMessage',
  video: 'videoMessage',
  document: 'documentMessage',
  audio: 'audioMessage',
};

export function mediaKindFromMimetype(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}

export type SendMediaInput = {
  recipientJid: string;
  /** Base64 crudo (sin `data:`) o URL pública. Uno de los dos es obligatorio. */
  fileBase64?: string | null;
  mediaUrl?: string | null;
  mimeType: string;
  fileName: string;
  caption?: string | null;
  kind?: MediaKind;
  instanceId?: number | null;
  quotedMessage?: { id: string; text?: string | null } | null;
  origin?: SendOrigin;
  idempotencyKey?: string | null;
  broadcast?: boolean;
};

/** Guarda una copia local para que el inbox pueda mostrar la miniatura. */
async function persistLocalCopy(fileBase64: string, fileName: string, kind: MediaKind) {
  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    const safeFileName = `${uuidv4()}-${fileName.replace(/[^a-z0-9._-]/gi, '_')}`;
    const relativeDirPath = path.join('uploads', kind);
    const absoluteDirPath = path.join(process.cwd(), 'public', relativeDirPath);
    await fs.mkdir(absoluteDirPath, { recursive: true });
    await fs.writeFile(path.join(absoluteDirPath, safeFileName), buffer);
    return `/${relativeDirPath.split(path.sep).join('/')}/${safeFileName}`;
  } catch (error) {
    console.error('[messaging] No se pudo guardar la copia local del adjunto:', error);
    return null;
  }
}

export async function sendTeamMediaMessage(teamId: number, input: SendMediaInput): Promise<SendResult> {
  const origin = input.origin ?? 'user';

  if (!input.fileBase64 && !input.mediaUrl) {
    throw new MessagingError('Hace falta fileBase64 o mediaUrl para mandar un adjunto.', 'invalid_recipient');
  }

  if (input.idempotencyKey) {
    const previous = await findIdempotentMessage(teamId, input.idempotencyKey);
    if (previous) {
      return {
        ok: previous.message.status !== 'error',
        idempotent: true,
        chatId: previous.chatId ?? previous.message.chatId,
        instance: { id: 0, instanceName: '' },
        message: previous.message,
        errorMessage: previous.message.errorMessage ?? null,
        connectionClosed: false,
      };
    }
  }

  const { instance, chatId: existingChatId } = await resolveSendingInstance(teamId, {
    instanceId: input.instanceId,
    remoteJid: input.recipientJid,
  });

  const evolutionNumber = getEvolutionRecipientNumber(input.recipientJid);
  if (!evolutionNumber) {
    throw new MessagingError(`"${input.recipientJid}" no es un destinatario válido de WhatsApp.`, 'invalid_recipient');
  }

  const kind = input.kind ?? mediaKindFromMimetype(input.mimeType);
  const preview = MEDIA_PREVIEW[kind];
  const msgType = MEDIA_MESSAGE_TYPE[kind];

  const localUrl = input.fileBase64 ? await persistLocalCopy(input.fileBase64, input.fileName, kind) : null;

  // El audio de WhatsApp (nota de voz) es un endpoint distinto de Evolution.
  const isVoiceNote = kind === 'audio';
  const payload: Record<string, unknown> = isVoiceNote
    ? { number: evolutionNumber, audio: input.fileBase64 ?? input.mediaUrl, delay: 1200 }
    : {
        number: evolutionNumber,
        delay: 1200,
        mediatype: kind,
        media: input.fileBase64 ?? input.mediaUrl,
        mimetype: input.mimeType,
      };

  if (!isVoiceNote && input.caption) payload.caption = input.caption;
  if (kind === 'document') payload.fileName = input.fileName;
  if (input.quotedMessage?.id) {
    payload.quoted = {
      key: { id: input.quotedMessage.id },
      message: input.quotedMessage.text ? { conversation: input.quotedMessage.text } : undefined,
    };
  }

  const endpoint = isVoiceNote ? 'sendWhatsAppAudio' : 'sendMedia';
  const { response, data, parseError, retried, connectionClosed } = await sendEvolutionRequestWithRetry({
    url: `${EVOLUTION_API_URL}/message/${endpoint}/${instance.instanceName}`,
    instanceName: instance.instanceName,
    accessToken: instance.accessToken,
    payload,
  });

  const sendFailed = Boolean(parseError) || !response.ok || !data?.key?.id;
  let errorMessage: string | null = null;
  if (sendFailed) {
    console.error(`[messaging] Evolution rechazó el adjunto por ${instance.instanceName}${retried ? ' tras reintento' : ''}:`, data);
    errorMessage = getEvolutionErrorMessage({ data, parseError, response, instanceName: instance.instanceName });
  }

  const isGroup = input.recipientJid.endsWith('@g.us');
  const status = sendFailed ? 'error' : (isGroup ? 'delivered' : 'sent');
  const timestamp = new Date();
  const chatId = await upsertChat(teamId, input.recipientJid, instance.id, existingChatId, preview, status, timestamp);

  const mediaMsg = sendFailed ? null : data.message?.[msgType];
  const newMessage = {
    id: sendFailed ? `error_${Date.now()}` : data.key.id,
    chatId,
    fromMe: true,
    messageType: msgType,
    text: kind === 'document' ? input.fileName : null,
    timestamp,
    status,
    errorMessage,
    mediaUrl: localUrl || input.mediaUrl || mediaMsg?.url || null,
    mediaMimetype: input.mimeType,
    mediaCaption: sendFailed ? null : (input.caption || mediaMsg?.caption || null),
    mediaFileLength: sendFailed ? null : (mediaMsg?.fileLength?.toString() ?? null),
    mediaSeconds: sendFailed ? null : (kind === 'video' || kind === 'audio' ? mediaMsg?.seconds ?? null : null),
    mediaIsPtt: isVoiceNote ? true : null,
    isInternal: false,
    isAi: origin === 'mcp',
    isAutomation: origin === 'automation',
    quotedMessageId: input.quotedMessage?.id ?? null,
    quotedMessageText: input.quotedMessage ? JSON.stringify(input.quotedMessage) : null,
  };

  const [inserted] = await db.insert(messages).values(newMessage as any).onConflictDoNothing().returning();
  const saved = inserted ?? newMessage;

  if (!sendFailed && input.idempotencyKey) {
    await claimIdempotencyKey(teamId, input.idempotencyKey, saved.id, chatId, origin);
  }

  if (input.broadcast ?? origin !== 'user') {
    await broadcast(teamId, chatId, input.recipientJid, instance.id, saved as Record<string, unknown>, preview, timestamp, status);
  }

  return {
    ok: !sendFailed,
    idempotent: false,
    chatId,
    instance: { id: instance.id, instanceName: instance.instanceName },
    message: saved,
    errorMessage,
    connectionClosed,
  };
}
