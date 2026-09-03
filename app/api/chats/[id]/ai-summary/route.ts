import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import {
  AudioTranscriptionError,
  ChatSummaryError,
  getChatSummary,
  summarizeChat,
} from '@/lib/chats/ai-summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const requestSchema = z.object({
  locale: z.enum(['es', 'en', 'pt']).default('es'),
});

const STATUS_BY_CODE: Record<ChatSummaryError['code'], number> = {
  plugin_disabled: 404,
  chat_not_found: 404,
  forbidden: 403,
  ai_not_configured: 400,
  conversation_empty: 400,
};

function parseChatId(value: string) {
  const chatId = Number(value);
  return Number.isInteger(chatId) && chatId > 0 ? chatId : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const chatId = parseChatId((await params).id);
    if (!chatId) return NextResponse.json({ error: 'invalid_chat' }, { status: 400 });

    return NextResponse.json({ summary: await getChatSummary(permCtx, chatId) });
  } catch (error) {
    if (error instanceof ChatSummaryError) {
      return NextResponse.json({ error: error.code }, { status: STATUS_BY_CODE[error.code] });
    }
    console.error('[conversation-ai-summary GET]', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permCtx = await getUserPermissionContext();
    if (!permCtx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const chatId = parseChatId((await params).id);
    if (!chatId) return NextResponse.json({ error: 'invalid_chat' }, { status: 400 });

    const parsedBody = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }

    const summary = await summarizeChat(permCtx.teamId, permCtx.userId, chatId, {
      locale: parsedBody.data.locale,
      origin: request.nextUrl.origin,
      permCtx,
    });

    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof ChatSummaryError) {
      return NextResponse.json({ error: error.code }, { status: STATUS_BY_CODE[error.code] });
    }
    if (error instanceof AudioTranscriptionError) {
      return NextResponse.json({
        error: 'audio_transcription_failed',
        failedAudioCount: error.failedCount,
      }, { status: 422 });
    }

    console.error('[conversation-ai-summary POST]', error);
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 });
  }
}
