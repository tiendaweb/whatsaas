import { NextResponse, NextRequest } from 'next/server';
import { getTeamForUser } from '@/lib/db/queries';
import { formatMessageForFrontend } from '@/lib/db/messages';
import { MessagingError, mediaKindFromMimetype, sendTeamMediaMessage } from '@/lib/messaging/send';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recipientJid, fileBase64, mimeType, fileName, caption, quotedMessageData, instanceId } = body;

    if (!recipientJid || !fileBase64 || !mimeType || !fileName) {
      return NextResponse.json({ error: 'recipientJid, fileBase64, mimeType and fileName are required' }, { status: 400 });
    }

    const team = await getTeamForUser();
    if (!team) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // El inbox manda audios por /sendAudio; acá un `audio/*` es un adjunto
    // común (por ejemplo un mp3 que el usuario arrastró), no una nota de voz.
    const kind = mediaKindFromMimetype(mimeType);

    const result = await sendTeamMediaMessage(team.id, {
      recipientJid,
      fileBase64,
      mimeType,
      fileName,
      caption: caption ?? null,
      kind: kind === 'audio' ? 'document' : kind,
      instanceId: instanceId ? Number(instanceId) : null,
      quotedMessage: quotedMessageData?.id ? { id: quotedMessageData.id, text: quotedMessageData.text } : null,
      origin: 'user',
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
      ? 'Evolution API request timed out while sending the media.'
      : `Media send failed: ${error?.message || 'Unknown error'}`;
    console.error('Error in API /api/messages/sendMedia:', error);
    return NextResponse.json({ error: message }, { status: isTimeout ? 504 : 500 });
  }
}
