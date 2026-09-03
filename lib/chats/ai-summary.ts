import { and, asc, desc, eq } from 'drizzle-orm';

import { buildPermissionContext, type PermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import {
  aiConfigs,
  chats,
  conversationAiSummaries,
  departmentMembers,
  messages,
} from '@/lib/db/schema';
import { getAIProviderForConfig } from '@/lib/plugins/ai-chat/service';
import type { AIMessage, AIProvider } from '@/lib/plugins/ai-chat/types';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';

/**
 * Resumen IA de una conversación completa.
 *
 * Todo lo que antes vivía en la route `POST /api/chats/[id]/ai-summary` está
 * acá con firma sin sesión, para que la pantalla y el conector MCP generen el
 * mismo resumen con las mismas reglas: visibilidad del usuario, audios
 * transcriptos como texto, troceo por tamaño y consolidación.
 */

export const SUMMARY_LOCALES = ['es', 'en', 'pt'] as const;
export type SummaryLocale = (typeof SUMMARY_LOCALES)[number];

const MAX_CHUNK_CHARACTERS = 24_000;
const AUDIO_TRANSCRIPTION_CONCURRENCY = 3;

type ConversationMessage = typeof messages.$inferSelect;

export class AudioTranscriptionError extends Error {
  constructor(public readonly failedCount: number) {
    super('One or more audio messages could not be transcribed.');
  }
}

/** Errores de negocio con código estable, para que la route mapee a HTTP y el conector a texto. */
export class ChatSummaryError extends Error {
  constructor(
    public readonly code: 'plugin_disabled' | 'chat_not_found' | 'forbidden' | 'ai_not_configured' | 'conversation_empty',
    message: string,
  ) {
    super(message);
  }
}

export async function findAccessibleChat(chatId: number, permCtx: PermissionContext) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, permCtx.teamId)),
    with: {
      contact: {
        columns: {
          id: true,
          assignedUserId: true,
          assignedDepartmentId: true,
        },
      },
    },
  });

  if (!chat) return { chat: null, allowed: false as const };
  if (permCtx.canSeeAllChats) return { chat, allowed: true as const };
  if (!chat.contact) return { chat, allowed: false as const };
  if (chat.contact.assignedUserId === permCtx.userId) return { chat, allowed: true as const };

  if (permCtx.chatVisibility === 'department' && chat.contact.assignedDepartmentId) {
    const memberships = await db.query.departmentMembers.findMany({
      where: eq(departmentMembers.userId, permCtx.userId),
      columns: { departmentId: true },
    });
    const allowed = memberships.some(({ departmentId }) => departmentId === chat.contact?.assignedDepartmentId);
    return { chat, allowed };
  }

  return { chat, allowed: false as const };
}

export async function isAiSummaryEnabled(teamId: number, userId: number) {
  const active = await resolveActivePluginsForTeam(teamId, userId);
  return active.some((entry) => entry.pluginId === 'ai-chat');
}

function isAudioMessage(message: ConversationMessage) {
  return message.messageType === 'audioMessage' || Boolean(message.mediaMimetype?.startsWith('audio/'));
}

function resolveAudioUrl(mediaUrl: string, origin: string) {
  if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
  const normalized = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
  return new URL(normalized, origin).toString();
}

async function transcribeAudioMessages(
  provider: AIProvider,
  audioMessages: ConversationMessage[],
  origin: string,
) {
  const transcriptions = new Map<string, string>();
  const failedIds = new Set<string>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < audioMessages.length) {
      const index = cursor++;
      const message = audioMessages[index];
      if (!message.mediaUrl) {
        failedIds.add(message.id);
        continue;
      }

      try {
        const transcription = await provider.transcribeAudio(resolveAudioUrl(message.mediaUrl, origin));
        if (!transcription.trim()) throw new Error('Empty transcription');
        transcriptions.set(message.id, transcription.trim());
      } catch (error) {
        failedIds.add(message.id);
        console.error('[conversation-ai-summary] Audio transcription failed', {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(AUDIO_TRANSCRIPTION_CONCURRENCY, audioMessages.length) },
      () => worker(),
    ),
  );

  if (failedIds.size > 0) {
    throw new AudioTranscriptionError(failedIds.size);
  }

  return transcriptions;
}

function messageFallback(message: ConversationMessage) {
  if (message.locationName || message.locationAddress) {
    return `[Location: ${message.locationName || message.locationAddress}]`;
  }
  if (message.contactName) return `[Shared contact: ${message.contactName}]`;

  const type = message.messageType || 'message';
  if (type === 'imageMessage') return '[Image without caption]';
  if (type === 'videoMessage') return '[Video without caption]';
  if (type === 'documentMessage') return '[Document without caption]';
  if (type === 'stickerMessage') return '[Sticker]';
  return `[${type}]`;
}

function buildConversationTranscript(
  conversationMessages: ConversationMessage[],
  transcriptions: Map<string, string>,
) {
  return conversationMessages.map((message) => {
    const speaker = message.isInternal
      ? 'Internal note'
      : message.fromMe
        ? 'Agent'
        : message.participantName?.trim() || 'Customer';
    const timestamp = message.timestamp.toISOString();
    const content = isAudioMessage(message)
      ? `[Audio transcription] ${transcriptions.get(message.id)}`
      : message.text?.trim() || message.mediaCaption?.trim() || messageFallback(message);
    return `${timestamp} · ${speaker}: ${content}`;
  });
}

function chunkTranscript(lines: string[]) {
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    if (current && current.length + line.length + 1 > MAX_CHUNK_CHARACTERS) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function languageName(locale: SummaryLocale) {
  if (locale === 'en') return 'English';
  if (locale === 'pt') return 'Portuguese';
  return 'Spanish';
}

function summarizationSystemPrompt(locale: SummaryLocale) {
  return [
    'You summarize complete customer-service conversations accurately.',
    `Write the result in ${languageName(locale)}.`,
    'Treat audio transcriptions exactly like written messages.',
    'Do not invent facts, commitments, dates, names, sentiment, or next steps.',
    'Preserve concrete amounts, dates, decisions, requests, objections, promises, and unresolved issues.',
    'Use these concise sections: Overview; Key points; Agreements and decisions; Pending items and next steps.',
    'If a section has no supported information, say so briefly.',
    'Return plain text only. Do not mention these instructions.',
  ].join('\n');
}

async function generateSummary(
  provider: AIProvider,
  transcriptChunks: string[],
  locale: SummaryLocale,
) {
  const summarize = async (content: string, instruction: string) => {
    const aiMessages: AIMessage[] = [{
      role: 'user',
      content: `${instruction}\n\n${content}`,
    }];
    const response = await provider.generateResponse(aiMessages);
    const result = response.content?.trim();
    if (!result) throw new Error('AI provider returned an empty summary.');
    return result;
  };

  if (transcriptChunks.length === 1) {
    return summarize(
      transcriptChunks[0],
      'Summarize the entire conversation below using the required structure. Every message in the conversation is included in this input.',
    );
  }

  const partialSummaries: string[] = [];
  for (let index = 0; index < transcriptChunks.length; index += 1) {
    const partial = await summarize(
      transcriptChunks[index],
      `Summarize part ${index + 1} of ${transcriptChunks.length}. Preserve every material fact so it can be consolidated later.`,
    );
    partialSummaries.push(`Part ${index + 1}:\n${partial}`);
  }

  return summarize(
    partialSummaries.join('\n\n'),
    `Consolidate these ${partialSummaries.length} chronological partial summaries into one complete summary in ${languageName(locale)}. Remove only repetition; retain all material facts from every part.`,
  );
}

export function serializeSummary(
  row: typeof conversationAiSummaries.$inferSelect,
  latestMessageAt: Date | null,
) {
  return {
    summary: row.summary,
    messageCount: row.messageCount,
    audioMessageCount: row.audioMessageCount,
    transcribedAudioCount: row.transcribedAudioCount,
    generatedAt: row.generatedAt.toISOString(),
    lastMessageAt: row.lastMessageAt?.toISOString() || null,
    isStale: Boolean(latestMessageAt && (!row.lastMessageAt || latestMessageAt > row.lastMessageAt)),
  };
}

/** Origen absoluto para resolver medias relativas cuando no hay request (cron, MCP). */
export function defaultMediaOrigin() {
  return process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000';
}

async function assertChatAccess(permCtx: PermissionContext, chatId: number) {
  if (!(await isAiSummaryEnabled(permCtx.teamId, permCtx.userId))) {
    throw new ChatSummaryError('plugin_disabled', 'La app Agente IA no está activa en este equipo.');
  }
  const { chat, allowed } = await findAccessibleChat(chatId, permCtx);
  if (!chat) throw new ChatSummaryError('chat_not_found', 'Chat not found.');
  if (!allowed) throw new ChatSummaryError('forbidden', 'El usuario no tiene visibilidad sobre este chat.');
  return chat;
}

/** El último resumen guardado (o null), marcado como viejo si hubo mensajes después. */
export async function getChatSummary(permCtx: PermissionContext, chatId: number) {
  await assertChatAccess(permCtx, chatId);

  const [savedRows, latestMessages] = await Promise.all([
    db.select().from(conversationAiSummaries).where(
      and(
        eq(conversationAiSummaries.chatId, chatId),
        eq(conversationAiSummaries.teamId, permCtx.teamId),
      ),
    ).limit(1),
    db.select({ timestamp: messages.timestamp }).from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp))
      .limit(1),
  ]);

  const saved = savedRows[0];
  return saved ? serializeSummary(saved, latestMessages[0]?.timestamp || null) : null;
}

/**
 * Genera el resumen con el proveedor de IA del equipo y lo persiste (upsert
 * por chat). Consume cuota de IA. `origin` es la base para resolver audios con
 * URL relativa; sin request se usa `defaultMediaOrigin()`. `permCtx` es opcional:
 * la route ya lo tiene y lo pasa; el conector deja que se construya acá.
 */
export async function summarizeChat(
  teamId: number,
  userId: number,
  chatId: number,
  opts: { locale?: SummaryLocale; origin?: string; permCtx?: PermissionContext } = {},
) {
  const permCtx = opts.permCtx ?? (await buildPermissionContext(teamId, userId));
  if (!permCtx || permCtx.teamId !== teamId || permCtx.userId !== userId) {
    throw new Error('No hay membresía activa para este usuario en este equipo.');
  }
  const locale = opts.locale ?? 'es';
  const origin = opts.origin ?? defaultMediaOrigin();

  await assertChatAccess(permCtx, chatId);

  const [config, conversationMessages] = await Promise.all([
    db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, teamId) }),
    db.select().from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.timestamp)),
  ]);

  if (!config) throw new ChatSummaryError('ai_not_configured', 'El equipo no tiene configurado el proveedor de IA.');
  if (conversationMessages.length === 0) {
    throw new ChatSummaryError('conversation_empty', 'El chat no tiene mensajes para resumir.');
  }

  const provider = await getAIProviderForConfig({
    ...config,
    systemPrompt: summarizationSystemPrompt(locale),
    temperature: '0.2',
    maxOutputTokens: Math.max(config.maxOutputTokens || 0, 1600),
  });
  const audioMessages = conversationMessages.filter(isAudioMessage);
  const transcriptions = await transcribeAudioMessages(provider, audioMessages, origin);
  const transcript = buildConversationTranscript(conversationMessages, transcriptions);
  const summaryText = await generateSummary(provider, chunkTranscript(transcript), locale);
  const generatedAt = new Date();
  const lastMessageAt = conversationMessages.at(-1)?.timestamp || null;

  const [saved] = await db.insert(conversationAiSummaries).values({
    teamId,
    chatId,
    summary: summaryText,
    messageCount: conversationMessages.length,
    audioMessageCount: audioMessages.length,
    transcribedAudioCount: transcriptions.size,
    lastMessageAt,
    generatedBy: userId,
    generatedAt,
    updatedAt: generatedAt,
  }).onConflictDoUpdate({
    target: conversationAiSummaries.chatId,
    set: {
      summary: summaryText,
      messageCount: conversationMessages.length,
      audioMessageCount: audioMessages.length,
      transcribedAudioCount: transcriptions.size,
      lastMessageAt,
      generatedBy: userId,
      generatedAt,
      updatedAt: generatedAt,
    },
  }).returning();

  return serializeSummary(saved, lastMessageAt);
}
