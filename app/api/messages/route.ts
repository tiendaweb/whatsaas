import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle'; 
import { getUserPermissionContext } from '@/lib/auth/permissions-guard';
import { chats, messages } from '@/lib/db/schema'; 
import { eq, and, desc, lt, or } from 'drizzle-orm';
import { resolveMediaUrl } from '@/lib/media-url';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const permissionContext = await getUserPermissionContext();
    if (!permissionContext) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const jid = searchParams.get('jid');
    const instanceId = searchParams.get('instanceId');
    const chatId = searchParams.get('chatId');
    const requestedLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 200)
      : null;
    const before = searchParams.get('before');
    const beforeId = searchParams.get('beforeId');
    const beforeDate = before ? new Date(before) : null;

    if (beforeDate && Number.isNaN(beforeDate.getTime())) {
      return NextResponse.json({ error: 'Invalid before cursor' }, { status: 400 });
    }

    let chat;

    if (chatId) {
        chat = await db.query.chats.findFirst({
            where: and(
                eq(chats.teamId, permissionContext.teamId),
                eq(chats.id, parseInt(chatId))
            ),
            columns: { id: true }
        });
    } else {
        if (!jid) {
            return NextResponse.json({ error: 'jid (remoteJid) is required' }, { status: 400 });
        }

        const conditions = [
            eq(chats.teamId, permissionContext.teamId),
            eq(chats.remoteJid, jid)
        ];

        if (instanceId) {
            conditions.push(eq(chats.instanceId, parseInt(instanceId)));
        }

        chat = await db.query.chats.findFirst({
            where: and(...conditions),
            columns: { id: true } 
        });
    }

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found or unauthorized' }, { status: 404 });
    }

    const cursorCondition = beforeDate
      ? beforeId
        ? or(
            lt(messages.timestamp, beforeDate),
            and(eq(messages.timestamp, beforeDate), lt(messages.id, beforeId)),
          )
        : lt(messages.timestamp, beforeDate)
      : undefined;

    const chatMessagesDescending = await db.query.messages.findMany({
      where: cursorCondition
        ? and(eq(messages.chatId, chat.id), cursorCondition)
        : eq(messages.chatId, chat.id),
      orderBy: [desc(messages.timestamp), desc(messages.id)],
      ...(limit ? { limit } : {}),
      with: {
        reactions: {
          columns: {
            id: true,
            emoji: true,
            fromMe: true,
            remoteJid: true,
            participantName: true,
          },
        },
      },
    });
    const chatMessages = chatMessagesDescending.reverse();

    const normalizedMessages = chatMessages.map((message) => ({
      ...message,
      mediaUrl: resolveMediaUrl(message.mediaUrl),
    }));

    return NextResponse.json(normalizedMessages);

  } catch (error: any) {
    console.error('Error fetching messages:', error.message);
    return NextResponse.json({ error: 'Internal Server Error.' }, { status: 500 });
  }
}
