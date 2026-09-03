import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { db } from '@/lib/db/drizzle';
import { aiConfigs, chats, departmentMembers, messages } from '@/lib/db/schema';
import { getAIProviderForConfig } from '@/lib/plugins/ai-chat/service';
import type { AIMessage } from '@/lib/plugins/ai-chat/types';
import { buildConversationExcerpt, buildSavedContext } from '@/lib/chats/reply-context';

export const dynamic = 'force-dynamic';

type ImproveReplyMode = 'improve' | 'orthography' | 'stylize' | 'suggest';

type ImproveReplyRequest = {
  composerText?: string;
  additionalContext?: string;
  savedContext?: string;
  mode?: ImproveReplyMode;
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

function buildTaskInstructions(mode: ImproveReplyMode) {
  switch (mode) {
    case 'orthography':
      return [
        'Task: fix and improve the spelling, accents, punctuation, and grammar of the draft so it is ready to send through WhatsApp.',
        'Rules:',
        '- Preserve the original meaning, intent, and factual content.',
        '- Keep the wording as close as possible to the draft unless a correction is needed for clarity or correctness.',
        '- Keep it brief, natural, and conversational.',
        '- Use the saved context and recent conversation only when they are relevant.',
        '- Do not invent discounts, promises, dates, or unavailable information.',
        '- Do not mention that the text was corrected by AI.',
        '- Return only the corrected WhatsApp-ready message with no markdown fences or explanations.',
      ].join('\n');
    case 'stylize':
      return [
        'Task: rewrite the draft to give it more style, polish, and impact while keeping it ready to send through WhatsApp.',
        'Rules:',
        '- Preserve the original intent and important facts.',
        '- Make it feel clearer, more polished, and more engaging without becoming robotic or exaggerated.',
        '- Keep it brief, natural, and conversational.',
        '- Use the saved context and recent conversation only when they are relevant.',
        '- Do not invent discounts, promises, dates, or unavailable information.',
        '- Do not mention that the text was rewritten by AI.',
        '- Return only the final WhatsApp-ready message with no markdown fences or explanations.',
      ].join('\n');
    case 'suggest':
      return [
        'Task: draft a brand-new reply to the customer, written as the human agent, based on the recent conversation and saved context below. There may be no existing draft — write the reply from scratch.',
        'Rules:',
        '- Read the recent conversation and respond to the customer\'s most recent message(s) in a helpful, relevant way.',
        '- Keep it brief, natural, and conversational, matching how a human agent would reply on WhatsApp.',
        '- Use the saved context (team instructions, contact notes) only when relevant.',
        '- Do not invent discounts, promises, dates, or unavailable information.',
        '- Do not mention that the reply was written by AI.',
        '- If the conversation gives no clear opening for a reply, propose a short, reasonable follow-up message instead of refusing.',
        '- Return only the final WhatsApp-ready message with no markdown fences or explanations.',
      ].join('\n');
    case 'improve':
    default:
      return [
        'Task: rewrite the draft so it is ready to send through WhatsApp.',
        'Rules:',
        '- Preserve the original intent, tone, and important facts.',
        '- Keep it brief, natural, and conversational.',
        '- Use the saved context and recent conversation only when they are relevant.',
        '- Do not invent discounts, promises, dates, or unavailable information.',
        '- Do not mention that the text was rewritten by AI.',
        '- Return only the final WhatsApp-ready message with no markdown fences or explanations.',
      ].join('\n');
  }
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
    const mode: ImproveReplyMode =
      body.mode === 'orthography' || body.mode === 'stylize' || body.mode === 'suggest' ? body.mode : 'improve';

    if (!composerText && mode !== 'suggest') {
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
      config.systemPrompt?.trim() ? `Base team instructions:
${config.systemPrompt.trim()}` : null,
      buildTaskInstructions(mode),
    ].filter(Boolean).join('\n');

    const provider = await getAIProviderForConfig({
      ...config,
      systemPrompt: improveReplyPrompt,
    });

    const promptPayload = [
      composerText ? `Current draft:\n${composerText}` : null,
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
