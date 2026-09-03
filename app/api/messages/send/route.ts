import { NextResponse, NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser, getUser } from '@/lib/db/queries';
import { chats, messages } from '@/lib/db/schema';
import { formatMessageForFrontend } from '@/lib/db/messages';
import { MessagingError, sendTeamTextMessage } from '@/lib/messaging/send';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recipientJid, text, quotedMessageData, isInternal, instanceId } = body;

    if (!recipientJid || !text) {
      return NextResponse.json({ error: 'recipientJid and text are required' }, { status: 400 });
    }

    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (isInternal) {
      const chatConditions = [eq(chats.teamId, team.id), eq(chats.remoteJid, recipientJid)];
      if (instanceId) chatConditions.push(eq(chats.instanceId, Number(instanceId)));

      const chat = await db.query.chats.findFirst({
        where: and(...chatConditions),
        columns: { id: true },
      });

      if (!chat) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
      }

      const internalMessageData = {
        id: `internal_${Date.now()}`,
        chatId: chat.id,
        fromMe: true,
        messageType: 'conversation',
        text,
        timestamp: new Date(),
        status: 'read' as const,
        isInternal: true,
      };

      await db.insert(messages).values(internalMessageData);

      return NextResponse.json(formatMessageForFrontend(internalMessageData));
    }

    const currentUser = await getUser();

    const result = await sendTeamTextMessage(team.id, {
      recipientJid,
      text,
      instanceId: instanceId ? Number(instanceId) : null,
      quotedMessage: quotedMessageData ? { id: quotedMessageData.id, text: quotedMessageData.text } : null,
      signatureName: currentUser?.enableSignature && currentUser?.name ? currentUser.name : null,
      origin: 'user',
      // El inbox del que envía ya inserta el mensaje con la respuesta; emitir
      // por Pusher acá duplicaría el trabajo del cliente sin agregar nada.
      broadcast: false,
    });

    return NextResponse.json(
      formatMessageForFrontend(result.message as any),
      { status: !result.ok && result.connectionClosed ? 503 : 200 },
    );
  } catch (error: any) {
    if (error instanceof MessagingError) {
      return NextResponse.json({ error: error.message }, { status: error.code === 'no_instance' ? 404 : 400 });
    }
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const message = isTimeout
      ? 'Evolution API request timed out while sending the message.'
      : `Message send failed: ${error?.message || 'Unknown error'}`;
    console.error('Error in /api/messages/send API:', error);
    return NextResponse.json({ error: message }, { status: isTimeout ? 504 : 500 });
  }
}
