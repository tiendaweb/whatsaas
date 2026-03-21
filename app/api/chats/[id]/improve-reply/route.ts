import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { aiConfigs, chats, departmentMembers, messages } from '@/lib/db/schema';
import { getAIProviderForConfig } from '@/lib/plugins/ai-chat/service';
import type { AIMessage } from '@/lib/plugins/ai-chat/types';

export const dynamic = 'force-dynamic';

type ImproveReplyRequest = {
  composerText?: string;
  additionalContext?: string;
  savedContext?: string;
  metadata?: {
    chatName?: string | null;
    contactName?: string | null;
    remoteJid?: string | null;
    isGroup?: boolean;
  };
};

async function userCanAccessChat(chatId: number, permCtx: NonNullable<Awaited<ReturnType<typeof getUserPermissionContext>>>) {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, permCtx.teamId)),
    with: {
      contact: {
        columns: {
          id: true,
          name: true,
          notes: true,
          assignedUserId: true,
          assignedDepartmentId: true,
        },
      },
    },
  });

  if (!chat) {
    return { chat: null, allowed: false as const };
  }

  if (permCtx.canSeeAllChats) {
    return { chat, allowed: true as const };
  }

  const contact = chat.contact;
  if (!contact) {
    return { chat, allowed: false as const };
  }

  if (contact.assignedUserId === permCtx.userId) {
    return { chat, allowed: true as const };
  }

  if (permCtx.chatVisibility === 'department' && contact.assignedDepartmentId) {
    const memberships = await db.query.departmentMembers.findMany({
      where: eq(departmentMembers.userId, permCtx.userId),
      columns: { departmentId: true },
    });

    const departmentIds = memberships.map((membership) => membership.departmentId);
    return {
      chat,
      allowed: departmentIds.includes(contact.assignedDepartmentId),
    };
  }

  return { chat, allowed: false as const };
}

function buildSavedContext(params: {
  teamPrompt?: string | null;
  contactName?: string | null;
  contactNotes?: string | null;
  chatName?: string | null;
  remoteJid?: string | null;
}) {
  const sections = [
    params.teamPrompt?.trim() ? `Team prompt:\n${params.teamPrompt.trim()}` : null,
    params.contactName?.trim() ? `Contact name:\n${params.contactName.trim()}` : null,
    params.chatName?.trim() ? `Chat label:\n${params.chatName.trim()}` : null,
    params.remoteJid?.trim() ? `WhatsApp ID:\n${params.remoteJid.trim()}` : null,
    params.contactNotes?.trim() ? `Saved notes:\n${params.contactNotes.trim()}` : null,
  ].filter(Boolean);

  return sections.join('\n\n');
}

function buildConversationExcerpt(
  recentMessages: Array<{ fromMe: boolean; text: string | null; mediaCaption: string | null; messageType: string | null }>
) {
  return recentMessages
    .map((message) => {
      const speaker = message.fromMe ? 'Agent' : 'Customer';
      const content = message.text?.trim() || message.mediaCaption?.trim() || `[${message.messageType || 'message'}]`;
      return `${speaker}: ${content}`;
    })
    .join('\n');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permCtx = await getUserPermissionContext();
    if (!permCtx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const chatId = Number(id);

    if (!Number.isInteger(chatId) || chatId <= 0) {
      return NextResponse.json({ error: 'Invalid chat id' }, { status: 400 });
    }

    const body = (await request.json()) as ImproveReplyRequest;
    const composerText = body.composerText?.trim() || '';
    const additionalContext = body.additionalContext?.trim() || '';
    const savedContextOverride = body.savedContext?.trim();

    if (!composerText) {
      return NextResponse.json({ error: 'Composer text is required' }, { status: 400 });
    }

    const { chat, allowed } = await userCanAccessChat(chatId, permCtx);
    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [config, recentMessages] = await Promise.all([
      db.query.aiConfigs.findFirst({
        where: eq(aiConfigs.teamId, permCtx.teamId),
      }),
      db.query.messages.findMany({
        where: eq(messages.chatId, chatId),
        orderBy: [desc(messages.timestamp)],
        columns: {
          fromMe: true,
          text: true,
          mediaCaption: true,
          messageType: true,
        },
        limit: 12,
      }),
    ]);

    if (!config) {
      return NextResponse.json({ error: 'AI provider is not configured' }, { status: 400 });
    }

    const persistedSavedContext = buildSavedContext({
      teamPrompt: config.systemPrompt,
      contactName: chat.contact?.name || body.metadata?.contactName || chat.name || chat.pushName,
      contactNotes: chat.contact?.notes,
      chatName: body.metadata?.chatName || chat.name || chat.pushName,
      remoteJid: body.metadata?.remoteJid || chat.remoteJid,
    });

    const savedContext = savedContextOverride && savedContextOverride.length > 0
      ? savedContextOverride
      : persistedSavedContext;

    const orderedMessages = [...recentMessages].reverse();
    const conversationExcerpt = buildConversationExcerpt(orderedMessages);

    const improveReplyPrompt = [
      config.systemPrompt?.trim() ? `Base team instructions:\n${config.systemPrompt.trim()}` : null,
      'Task: rewrite the draft so it is ready to send through WhatsApp.',
      'Rules:',
      '- Preserve the original intent, tone, and important facts.',
      '- Keep it brief, natural, and conversational.',
      '- Use the saved context and recent conversation only when they are relevant.',
      '- Do not invent discounts, promises, dates, or unavailable information.',
      '- Do not mention that the text was rewritten by AI.',
      '- Return only the final WhatsApp-ready message with no markdown fences or explanations.',
    ].filter(Boolean).join('\n');

    const provider = await getAIProviderForConfig({
      ...config,
      systemPrompt: improveReplyPrompt,
    });

    const promptPayload = [
      `Current draft:\n${composerText}`,
      additionalContext ? `Additional context from agent:\n${additionalContext}` : null,
      savedContext ? `Saved context:\n${savedContext}` : null,
      conversationExcerpt ? `Recent conversation:\n${conversationExcerpt}` : null,
      chat.remoteJid ? `Chat id:\n${chat.remoteJid}` : null,
      body.metadata?.isGroup ? 'Chat type:\nWhatsApp group' : 'Chat type:\nWhatsApp direct chat',
    ].filter(Boolean).join('\n\n');

    const aiMessages: AIMessage[] = [
      {
        role: 'user',
        content: promptPayload,
      },
    ];

    const response = await provider.generateResponse(aiMessages);
    const suggestion = response.content?.trim();

    if (!suggestion) {
      return NextResponse.json({ error: 'The AI provider returned an empty suggestion' }, { status: 502 });
    }

    return NextResponse.json({
      suggestion,
      savedContext,
      contextSource: {
        usedPersistedContext: !savedContextOverride,
        messageCount: orderedMessages.length,
      },
    });
  } catch (error: any) {
    console.error('Error improving reply:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
