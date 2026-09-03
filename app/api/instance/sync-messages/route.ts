import { NextResponse, NextRequest } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { getTeamForUser } from '@/lib/db/queries';
import { evolutionInstances, chats, messages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
  extractEvolutionMediaParts,
  getAlbumMessagePreview,
  getEvolutionMediaMimetype,
  getMediaCaption,
  getMediaTextFallback,
  saveEvolutionMediaPart,
  type SavedEvolutionMediaDetails,
} from '@/lib/evolution-message-media';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";

function normalizeJid(jid: string): string {
  if (!jid) return '';
  if (jid.includes('@g.us')) return jid;
  if (jid.includes('@s.whatsapp.net')) {
    const [user] = jid.split('@');
    const cleanUser = user.split(':')[0];
    return `${cleanUser}@s.whatsapp.net`;
  }
  return jid;
}

function extractMessageText(msg: any): string | null {
  if (!msg) return null;
  const albumParts = extractEvolutionMediaParts(msg, 'albumMessage');
  if (albumParts.length > 1) return getAlbumMessagePreview(albumParts);

  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.documentMessage?.fileName ||
    msg.contactMessage?.displayName ||
    msg.locationMessage?.name ||
    msg.locationMessage?.address ||
    null
  );
}

function getMessageType(evoMsg: any): string {
  return evoMsg.messageType || 'conversation';
}

function getStatusFromUpdate(updates: any[]): string {
  if (!updates || updates.length === 0) return 'delivered';
  const last = updates[updates.length - 1];
  const status = last.status;
  if (status === 'READ' || status === 'PLAYED') return 'read';
  if (status === 'DELIVERY_ACK') return 'delivered';
  if (status === 'SERVER_ACK') return 'sent';
  return 'delivered';
}

export async function POST(request: NextRequest) {
  try {
    const team = await getTeamForUser();
    if (!team) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { instanceId, remoteJid, limit = 50 } = await request.json();
    if (!instanceId || !remoteJid) {
      return NextResponse.json({ error: 'instanceId and remoteJid are required' }, { status: 400 });
    }

    const instance = await db.query.evolutionInstances.findFirst({
      where: and(
        eq(evolutionInstances.id, instanceId),
        eq(evolutionInstances.teamId, team.id)
      ),
    });

    if (!instance || !instance.accessToken) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    const chat = await db.query.chats.findFirst({
      where: and(
        eq(chats.teamId, team.id),
        eq(chats.remoteJid, remoteJid),
        eq(chats.instanceId, instance.id)
      ),
    });

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found. Import the chat first.' }, { status: 404 });
    }

    const response = await fetch(
      `${EVOLUTION_API_URL}/chat/findMessages/${instance.instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': instance.accessToken,
        },
        body: JSON.stringify({
          where: { key: { remoteJid } },
          limit: Math.min(limit, 500),
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.message || 'Failed to fetch messages from Evolution API' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const evoMessages = data.messages?.records || data;

    if (!Array.isArray(evoMessages)) {
      return NextResponse.json({ error: 'Unexpected response from Evolution API' }, { status: 500 });
    }

    const isGroup = remoteJid.includes('@g.us');
    let imported = 0;
    let skipped = 0;

    const batchSize = 50;
    for (let i = 0; i < evoMessages.length; i += batchSize) {
      const batch = evoMessages.slice(i, i + batchSize);
      const messagesToInsert = [];

      for (const evoMsg of batch) {
        const messageId = evoMsg.key?.id;
        if (!messageId) { skipped++; continue; }

        const msgType = getMessageType(evoMsg);
        if (['protocolMessage', 'reactionMessage', 'senderKeyDistributionMessage'].includes(msgType)) {
          skipped++;
          continue;
        }

        const fromMe = evoMsg.key?.fromMe || false;
        const text = extractMessageText(evoMsg.message);
        const timestamp = evoMsg.messageTimestamp
          ? new Date(evoMsg.messageTimestamp * 1000)
          : new Date();

        const status = fromMe
          ? getStatusFromUpdate(evoMsg.MessageUpdate)
          : 'delivered';

        let participant = null;
        let participantName = null;
        if (isGroup && !fromMe) {
          const participantJid = evoMsg.key?.participant || evoMsg.key?.participantAlt;
          if (participantJid && participantJid.includes('@s.whatsapp.net')) {
            participant = normalizeJid(participantJid);
          }
          participantName = evoMsg.pushName || null;
        }

        const msg = evoMsg.message || {};
        const mediaParts = extractEvolutionMediaParts(msg, msgType);
        const savedMediaMessages: Array<{
          id: string;
          messageType: string;
          mediaDetails: SavedEvolutionMediaDetails;
          text: string | null;
        }> = [];

        for (let mediaIndex = 0; mediaIndex < mediaParts.length; mediaIndex++) {
          const part = mediaParts[mediaIndex];
          try {
            const mediaDetails = await saveEvolutionMediaPart(part, { metaToken: (instance as any).metaToken });
            savedMediaMessages.push({
              id: mediaParts.length > 1 && mediaIndex > 0 ? `${messageId}:album:${mediaIndex}` : messageId,
              messageType: part.messageType,
              mediaDetails,
              text: mediaDetails.text ?? getMediaTextFallback(part),
            });
          } catch (mediaError) {
            console.error('Error saving synced media:', mediaError);
            savedMediaMessages.push({
              id: mediaParts.length > 1 && mediaIndex > 0 ? `${messageId}:album:${mediaIndex}` : messageId,
              messageType: part.messageType,
              mediaDetails: {
                mediaUrl: null,
                mediaMimetype: getEvolutionMediaMimetype(part.mediaContent, part.messageType),
                mediaCaption: getMediaCaption(part),
              },
              text: getMediaTextFallback(part),
            });
          }
        }

        const contextInfo = msg.extendedTextMessage?.contextInfo ||
          msg.imageMessage?.contextInfo ||
          msg.videoMessage?.contextInfo ||
          msg.audioMessage?.contextInfo ||
          msg.documentMessage?.contextInfo;
        const quotedMessageId = contextInfo?.stanzaId || null;

        const locationMsg = msg.locationMessage;

        const contactMsg = msg.contactMessage;

        const baseMessage = {
          contactName: contactMsg?.displayName || null,
          contactVcard: contactMsg?.vcard || null,
          locationLatitude: locationMsg?.degreesLatitude?.toString() || null,
          locationLongitude: locationMsg?.degreesLongitude?.toString() || null,
          locationName: locationMsg?.name || null,
          locationAddress: locationMsg?.address || null,
          quotedMessageId,
          quotedMessageText: null,
          participant,
          participantName,
          isInternal: false,
        };

        if (savedMediaMessages.length > 0) {
          savedMediaMessages.forEach((mediaMessage, mediaIndex) => {
            messagesToInsert.push({
              ...baseMessage,
              id: mediaMessage.id,
              chatId: chat.id,
              fromMe,
              messageType: mediaMessage.messageType,
              text: mediaMessage.text,
              timestamp: new Date(timestamp.getTime() + mediaIndex),
              status,
              ...mediaMessage.mediaDetails,
            });
          });
        } else {
          messagesToInsert.push({
            ...baseMessage,
            id: messageId,
            chatId: chat.id,
            fromMe,
            messageType: msgType,
            text: text || 'Message',
            timestamp,
            status,
            mediaUrl: null,
            mediaMimetype: null,
            mediaCaption: null,
            mediaFileLength: null,
            mediaSeconds: null,
            mediaIsPtt: null,
          });
        }
      }

      if (messagesToInsert.length > 0) {
        await db.insert(messages).values(messagesToInsert).onConflictDoNothing();
        imported += messagesToInsert.length;
      }
    }

    // Update chat last message info based on the most recent imported (if any new)
    if (imported > 0 && evoMessages.length > 0) {
      try {
        // The evoMessages may not be sorted; find the latest by timestamp
        let latest = evoMessages[0];
        for (const m of evoMessages) {
          const t1 = latest.messageTimestamp || 0;
          const t2 = m.messageTimestamp || 0;
          if (t2 > t1) latest = m;
        }
        const latestText = extractMessageText(latest.message) || 'Message';
        const latestTs = latest.messageTimestamp ? new Date(latest.messageTimestamp * 1000) : new Date();
        const latestFromMe = latest.key?.fromMe || false;

        await db.update(chats)
          .set({
            lastMessageText: latestText,
            lastMessageTimestamp: latestTs,
            lastMessageFromMe: latestFromMe,
            lastMessageStatus: latestFromMe ? 'sent' : 'delivered'
          })
          .where(eq(chats.id, chat.id));
      } catch (e) { /* non fatal */ }
    }

    return NextResponse.json({
      imported,
      skipped,
      total: evoMessages.length,
      chatId: chat.id,
    });
  } catch (error: any) {
    console.error('Error in sync-messages:', error.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
