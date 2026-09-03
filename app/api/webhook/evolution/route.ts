import { NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { chats, messages, evolutionInstances, webhookEvents, messageReactions } from '@/lib/db/schema';
import { eq, and, gt, sql, desc } from 'drizzle-orm';
import { pusherServer } from '@/lib/pusher-server';
import { processAutomation } from '@/lib/automation/engine';
import { scheduleAIProcessing } from '@/lib/plugins/ai-chat/service';
import {
    extractEvolutionMediaParts,
    getAlbumMessagePreview,
    getMediaTextFallback,
    saveEvolutionMediaPart,
    type SavedEvolutionMediaDetails,
} from '@/lib/evolution-message-media';

async function safePusherTrigger(channel: string, event: string, data: any): Promise<void> {
    try {
        await pusherServer.trigger(channel, event, data);
    } catch (err: any) {
        console.error(`[Pusher Error] ${channel}/${event}:`, err.message);
    }
}

async function logWebhookEvent(
    teamId: number,
    instanceName: string,
    event: string,
    messageId: string | null,
    remoteJid: string | null,
    status: 'processed' | 'duplicate' | 'ignored' | 'error',
    error?: string
): Promise<void> {
    try {
        await db.insert(webhookEvents).values({
            teamId,
            instanceName,
            event,
            messageId,
            remoteJid,
            status,
            error: error || null,
            processedAt: status !== 'error' ? new Date() : null,
        });
    } catch (e) {

    }
}

function normalizeJid(jid: string): string {
    if (!jid) return '';
    if (jid.includes('@g.us')) {
        return jid;
    }
    if (jid.includes('@s.whatsapp.net')) {
        const [user] = jid.split('@');
        const cleanUser = user.split(':')[0];
        return `${cleanUser}@s.whatsapp.net`;
    }
    return jid;
}

function getBestRemoteJid(key: any): string {
    const remoteJid = key.remoteJid;

    if (remoteJid && remoteJid.includes('@g.us')) {
        return remoteJid;
    }

    const remoteJidAlt = key.remoteJidAlt;
    const participant = key.participant;

    const candidates = [remoteJid, remoteJidAlt, participant];

    for (const cand of candidates) {
        if (cand && cand.includes('@s.whatsapp.net')) {
            return normalizeJid(cand);
        }
    }
    return normalizeJid(remoteJid);
}

function getParticipantJid(key: any): string | null {
    const participant = key.participant;
    if (participant && participant.includes('@s.whatsapp.net')) {
        return normalizeJid(participant);
    }
    return null;
}

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";

async function fetchGroupName(instanceName: string, accessToken: string, groupJid: string): Promise<string | null> {
    try {
        const res = await fetch(`${EVOLUTION_API_URL}/group/findGroupInfos/${instanceName}?groupJid=${groupJid}`, {
            method: 'GET',
            headers: { 'apikey': accessToken },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data?.subject || data?.name || null;
    } catch {
        return null;
    }
}

function getMessagePreview(messageData: any): string {
  const messagePayload = messageData.message;
  const messageType = messageData.messageType;

  if (messageType === 'conversation' && messagePayload?.conversation) return messagePayload.conversation;
  if (messageType === 'extendedTextMessage' && messagePayload?.extendedTextMessage?.text) return messagePayload.extendedTextMessage.text;

  if (messageType === 'templateMessage') {
      const template = messagePayload?.templateMessage?.hydratedTemplate;
      if (template) {
          const contentText = template.hydratedContentText || template.hydratedTitleText || 'Template Message';
          return `📋 ${contentText}`;
      }
      return '📋 Template Message';
  }
  
  if (messageType === 'templateButtonReplyMessage') {
      const btn = messagePayload?.templateButtonReplyMessage;
      return `🔘 ${btn?.selectedDisplayText || 'Button Reply'}`;
  }

  const caption = messagePayload?.imageMessage?.caption || messagePayload?.videoMessage?.caption || messagePayload?.documentMessage?.caption || null;

  if (messageType === 'imageMessage') return caption ? `📷 ${caption}` : '📷 Image';
  if (messageType === 'audioMessage') return '🎤 Audio';
  if (messageType === 'stickerMessage') return 'Sticker';
  if (messageType === 'videoMessage') return caption ? `📹 ${caption}` : '📹 Video';
  if (messageType === 'documentMessage') {
      const filename = messagePayload?.documentMessage?.fileName || messagePayload?.documentMessage?.filename || 'Document';
      return caption ? `📄 ${caption}` : `📄 ${filename}`;
  }
  if (messageType === 'contactMessage') return `👤 Contact: ${messagePayload?.contactMessage?.displayName || 'Unknown'}`;
  if (messageType === 'contactsArrayMessage') return '👤 Contacts';
  if (messageType === 'locationMessage') return `📍 Location: ${messagePayload?.locationMessage?.name || messagePayload?.locationMessage?.address || 'Unknown'}`;

  return 'New message';
}

function getStatusWeight(status: string | null): number {
    if (!status) return 0;
    const s = status.toLowerCase();
    if (s === 'error') return -1;
    if (s === 'pending') return 1;
    if (s === 'sent') return 2;
    if (s === 'delivered' || s === 'delivery_ack') return 3;
    if (s === 'read' || s === 'played') return 4;
    return 0;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const instanceName = body.instance || body.instanceName;
    
    if (!instanceName) {
      return NextResponse.json({ error: 'Instance name missing' }, { status: 400 });
    }

    const instance = await db.query.evolutionInstances.findFirst({
        where: eq(evolutionInstances.instanceName, instanceName),
        columns: {
            id: true,
            teamId: true,
            metaToken: true,
            accessToken: true
        }
    });

    if (!instance || !instance.teamId) {
        return NextResponse.json({ received_but_ignored: true });
    }

    const teamId = instance.teamId;
    const instanceId = instance.id;
    const metaToken = instance.metaToken;
    const pusherChannel = `team-${teamId}`;

    const eventName = String(body.event || '').toLowerCase().replace(/_/g, '.');
    if (eventName === 'messages.upsert' && body.data) {
      const messageData = body.data;
      if (!messageData.key) {
          return NextResponse.json({ received_with_error: 'invalid message structure' });
      }
      
      const remoteJid = getBestRemoteJid(messageData.key);

      if (
          remoteJid === 'status@broadcast' ||
          remoteJid.endsWith('@newsletter') ||
          remoteJid.includes('@lid')
      ) {
          return NextResponse.json({ received_but_ignored: true, reason: 'status_or_lid_message' });
      }

      const isGroup = remoteJid.endsWith('@g.us');
      const participantJid = isGroup ? getParticipantJid(messageData.key) : null;

      const messageType = messageData.messageType;

      const reactionMsg = messageData.message?.reactionMessage;
      if (messageType === 'reactionMessage' || reactionMsg) {
          if (reactionMsg) {
              const targetMessageId = reactionMsg.key?.id;
              const reactionEmoji = reactionMsg.text || '';
              const isFromMe = messageData.key.fromMe;
              const reactorJid = isFromMe ? null : (participantJid || remoteJid);
              const reactorName = isFromMe ? null : (messageData.pushName || null);

              if (targetMessageId) {
                  const targetMsg = await db.query.messages.findFirst({
                      where: eq(messages.id, targetMessageId),
                      columns: { id: true, chatId: true },
                  });

                  if (targetMsg) {
                      if (reactionEmoji) {
                          await db
                              .insert(messageReactions)
                              .values({
                                  messageId: targetMessageId,
                                  chatId: targetMsg.chatId,
                                  emoji: reactionEmoji,
                                  fromMe: isFromMe,
                                  remoteJid: reactorJid,
                                  participantName: reactorName,
                                  timestamp: new Date(),
                              })
                              .onConflictDoUpdate({
                                  target: [messageReactions.messageId, messageReactions.remoteJid, messageReactions.fromMe],
                                  set: { emoji: reactionEmoji, timestamp: new Date() },
                              });
                      } else {
                          await db
                              .delete(messageReactions)
                              .where(
                                  and(
                                      eq(messageReactions.messageId, targetMessageId),
                                      isFromMe
                                          ? eq(messageReactions.fromMe, true)
                                          : eq(messageReactions.remoteJid, reactorJid!),
                                  )
                              );
                      }

                      await safePusherTrigger(pusherChannel, 'message-reaction', {
                          messageId: targetMessageId,
                          chatId: targetMsg.chatId,
                          emoji: reactionEmoji || null,
                          fromMe: isFromMe,
                          remoteJid: reactorJid,
                          participantName: reactorName,
                          action: reactionEmoji ? 'add' : 'remove',
                      });
                  }
              }
          }
          return NextResponse.json({ received: true, reaction_processed: true });
      }

      if (
          messageType === 'protocolMessage' ||
          messageType === 'senderKeyDistributionMessage' ||
          !messageData.message
      ) {
          return NextResponse.json({ received_but_ignored: true, reason: 'protocol_message' });
      }

      let groupName: string | null = null;
      if (isGroup) {
          groupName = messageData.groupMetadata?.subject || null;
          if (!groupName && instance.accessToken) {
              groupName = await fetchGroupName(instanceName, instance.accessToken, remoteJid);
          }
      }

      let chatIdForAutomation: number | null = null;
      let textForAutomation: string | null = null;
      let newMessageData: any[] = [];
      let chatUpdateData: any = null;

      const messagePayload = messageData.message;
      const mediaParts = extractEvolutionMediaParts(messagePayload, messageType);
      const savedMediaMessages: Array<{
        id: string;
        messageType: string;
        mediaDetails: SavedEvolutionMediaDetails;
        text: string | null;
      }> = [];

      for (let i = 0; i < mediaParts.length; i++) {
          const part = mediaParts[i];
          try {
              const mediaDetails = await saveEvolutionMediaPart(part, { metaToken });
              savedMediaMessages.push({
                  id: mediaParts.length > 1 && i > 0 ? `${messageData.key.id}:album:${i}` : messageData.key.id,
                  messageType: part.messageType,
                  mediaDetails,
                  text: mediaDetails.text ?? getMediaTextFallback(part),
              });
          } catch (fileError: any) {
              console.error('Error saving media:', fileError);
              savedMediaMessages.push({
                  id: mediaParts.length > 1 && i > 0 ? `${messageData.key.id}:album:${i}` : messageData.key.id,
                  messageType: part.messageType,
                  mediaDetails: { mediaUrl: null },
                  text: getMediaTextFallback(part),
              });
          }
      }

      await db.transaction(async (tx) => {
        const isFromMe = messageData.key.fromMe;
        const incrementValue = isFromMe ? 0 : 1;
        const messageTimestamp = messageData.messageTimestamp ? new Date(messageData.messageTimestamp * 1000) : new Date();
        const rawMessagePreview = savedMediaMessages.length > 1 ? getAlbumMessagePreview(mediaParts) : getMessagePreview(messageData);
        const messagePreview = isGroup && !isFromMe && messageData.pushName
            ? `${messageData.pushName}: ${rawMessagePreview}`
            : rawMessagePreview;

        const customerInteractionUpdate = !isFromMe ? messageTimestamp : undefined;

        let initialChatName = remoteJid.split('@')[0];
        if (!isGroup && !isFromMe && messageData.pushName) {
            initialChatName = messageData.pushName;
        }
        if (isGroup && groupName) {
            initialChatName = groupName;
        }

        const updateData: any = {
            lastMessageText: messagePreview,
            lastMessageTimestamp: messageTimestamp,
            unreadCount: sql`${chats.unreadCount} + ${incrementValue}`,
            lastMessageFromMe: isFromMe,
            lastMessageStatus: isFromMe ? (isGroup ? 'delivered' : 'sent') : null,
        };

        if (!isGroup && !isFromMe && messageData.pushName) {
            updateData.name = messageData.pushName;
            updateData.pushName = messageData.pushName;
        }
        if (isGroup && groupName) {
            updateData.name = groupName;
        }

        if (customerInteractionUpdate) {
            updateData.lastCustomerInteraction = customerInteractionUpdate;
        }

        const [chat] = await tx
          .insert(chats)
          .values({
            teamId: teamId,
            remoteJid: remoteJid,
            instanceId: instanceId,
            name: initialChatName,
            pushName: messageData.pushName,
            lastMessageText: messagePreview,
            lastMessageTimestamp: messageTimestamp,
            unreadCount: incrementValue,
            lastMessageFromMe: isFromMe,
            lastMessageStatus: isFromMe ? (isGroup ? 'delivered' : 'sent') : null,
            lastCustomerInteraction: customerInteractionUpdate,
          })
          .onConflictDoUpdate({
            target: [chats.teamId, chats.remoteJid, chats.instanceId],
            set: updateData,
          })
          .returning({
            id: chats.id,
            remoteJid: chats.remoteJid,
            lastMessageStatus: chats.lastMessageStatus,
            lastMessageFromMe: chats.lastMessageFromMe,
            unreadCount: chats.unreadCount,
            instanceId: chats.instanceId,
            lastCustomerInteraction: chats.lastCustomerInteraction,
            name: chats.name,
            profilePicUrl: chats.profilePicUrl
          });

        chatIdForAutomation = chat.id;

        let mainTextContent = messagePayload?.conversation || messagePayload?.extendedTextMessage?.text || null;
        
        if (messageType === 'templateMessage') {
            const template = messagePayload?.templateMessage?.hydratedTemplate;
            mainTextContent = template?.hydratedContentText || template?.hydratedTitleText || 'Template Message';
        } else if (messageType === 'templateButtonReplyMessage') {
            mainTextContent = messagePayload?.templateButtonReplyMessage?.selectedDisplayText || 'Button Reply';
        }

        let contactData: any = {};
        let locationData: any = {};

        if (messageType === 'contactMessage' && messagePayload?.contactMessage) {
          contactData.contactName = messagePayload.contactMessage.displayName;
          contactData.contactVcard = messagePayload.contactMessage.vcard;
        } else if (messageType === 'locationMessage' && messagePayload?.locationMessage) {
          locationData.locationLatitude = messagePayload.locationMessage.degreesLatitude?.toString();
          locationData.locationLongitude = messagePayload.locationMessage.degreesLongitude?.toString();
          locationData.locationName = messagePayload.locationMessage.name || null;
          locationData.locationAddress = messagePayload.locationMessage.address || null;
        }

        if (!mainTextContent) {
            const primaryMedia = savedMediaMessages[0];
            if (primaryMedia?.messageType === 'documentMessage') {
                 mainTextContent = primaryMedia.text || primaryMedia.mediaDetails.mediaCaption || null;
            } else if (primaryMedia) {
                 mainTextContent = primaryMedia.text || primaryMedia.mediaDetails.mediaCaption || null;
            } else if (messageType === 'documentMessage') {
                 mainTextContent = null;
            } else {
                 mainTextContent = null;
            }
        }

        textForAutomation = mainTextContent;

        const quotedMessageText = messageType === 'templateMessage' 
            ? JSON.stringify(messagePayload?.templateMessage) 
            : (messageData.quotedMessage ? JSON.stringify(messageData.quotedMessage) : null);

        const baseMessage = {
            chatId: chat.id,
            fromMe: isFromMe,
            status: isFromMe ? (isGroup ? 'delivered' : 'sent') : 'delivered',
            participant: participantJid,
            participantName: isGroup ? (messageData.pushName || null) : null,
            ...contactData,
            ...locationData,
        };

        const messagesToInsert = savedMediaMessages.length > 0
          ? savedMediaMessages.map((mediaMessage, index) => ({
              ...baseMessage,
              id: mediaMessage.id,
              messageType: mediaMessage.messageType,
              text: mediaMessage.text,
              timestamp: new Date(messageTimestamp.getTime() + index),
              quotedMessageText: index === 0 ? quotedMessageText : null,
              quotedMessageId: index === 0 && messageData.quotedMessage ? 'quoted' : null,
              ...mediaMessage.mediaDetails,
            }))
          : [{
              ...baseMessage,
              id: messageData.key.id,
              messageType: messageType,
              text: mainTextContent,
              timestamp: messageTimestamp,
              quotedMessageText,
              quotedMessageId: messageData.quotedMessage ? 'quoted' : null,
            }];

        const insertedMessages = await tx
          .insert(messages)
          .values(messagesToInsert)
          .onConflictDoNothing()
          .returning({ id: messages.id });

        if (insertedMessages.length === 0) {
            return;
        }

        /**
         * Contestar desde el celular marca el chat como leído.
         *
         * El síntoma era este: el cliente escribía tres veces, el agente le
         * respondía desde WhatsApp en el teléfono, y WhatsPro seguía mostrando
         * el chat con 3 sin leer para siempre — porque un mensaje `fromMe`
         * sumaba 0 al contador pero nunca lo bajaba.
         *
         * La distinción que importa: sólo se limpia si el mensaje es NUEVO en
         * la base. Todo lo que manda WhatsPro (envío manual, automatización,
         * campaña, programado, conector) inserta su fila ANTES de que llegue el
         * eco de Evolution, así que ahí `insertedMessages` viene vacío y no se
         * toca nada. Sin ese filtro, una automatización que contesta sola
         * escondería un chat que ningún humano leyó — peor que el bug original.
         */
        let unreadAfterInsert: number | null = null;
        if (isFromMe && insertedMessages.length > 0) {
            const [reset] = await tx.update(chats)
                .set({ unreadCount: 0 })
                .where(and(eq(chats.id, chat.id), gt(chats.unreadCount, 0)))
                .returning({ id: chats.id });
            if (reset) unreadAfterInsert = 0;
        }

        const insertedIds = new Set(insertedMessages.map((message) => message.id));
        newMessageData = messagesToInsert
          .filter((message) => insertedIds.has(message.id))
          .map((message) => ({
            ...message,
            remoteJid: remoteJid,
            instance: instanceName,
            instanceId: instanceId,
            lastMessageTextPreview: messagePreview,
            timestamp: message.timestamp.toISOString(),
          }));

        chatUpdateData = {
            id: chat.id, 
            lastMessageStatus: chat.lastMessageStatus,
            lastMessageFromMe: chat.lastMessageFromMe, 
            unreadCount: unreadAfterInsert ?? chat.unreadCount,
            remoteJid: chat.remoteJid, 
            lastMessageText: messagePreview,
            lastMessageTimestamp: messageTimestamp.toISOString(),
            instanceId: chat.instanceId,
            name: chat.name,
            profilePicUrl: chat.profilePicUrl
        };
      });

      if (newMessageData.length > 0) {
          for (const message of newMessageData) {
              await safePusherTrigger(pusherChannel, 'new-message', message);
          }
      }

      if (chatUpdateData) {
          await safePusherTrigger(pusherChannel, 'chat-list-update', chatUpdateData);
      }

      if (newMessageData.length > 0) {
          await logWebhookEvent(teamId, instanceName, 'messages.upsert', messageData.key.id, remoteJid, 'processed');
      } else {
          await logWebhookEvent(teamId, instanceName, 'messages.upsert', messageData.key.id, remoteJid, 'duplicate');
      }

      if (!isGroup && !messageData.key.fromMe && chatIdForAutomation) {
        let automationProcessed = false;

        if (textForAutomation) {
            const fullInstance = await db.query.evolutionInstances.findFirst({
                where: eq(evolutionInstances.id, instanceId),
                columns: { instanceName: true, accessToken: true }
            });

            if (fullInstance && fullInstance.accessToken) {
                automationProcessed = await processAutomation(
                    teamId,
                    chatIdForAutomation,
                    remoteJid,
                    textForAutomation,
                    { instanceName: fullInstance.instanceName, accessToken: fullInstance.accessToken },
                    instanceId
                );
            }
        }

        if (!automationProcessed) {
            try {
                scheduleAIProcessing(teamId, chatIdForAutomation, instanceId);
            } catch (error) {
                console.error('[Webhook] Failed to schedule AI processing:', error);
            }
        }
      }

    } else if (eventName === 'messages.update' && body.data) {
      const updates = Array.isArray(body.data) ? body.data : [body.data];

      for (const updateData of updates) {
          const messageKeyId = updateData.key?.id || updateData.keyId;
          const remoteJidRaw = updateData.key?.remoteJid || updateData.remoteJid;

          const newApiStatus = updateData.status || updateData.update?.status;

          if (!messageKeyId || !newApiStatus) {
             continue;
          }

          if (remoteJidRaw && (remoteJidRaw === 'status@broadcast' || remoteJidRaw.endsWith('@newsletter'))) {
              continue;
          }

          let dbStatus: 'sent' | 'delivered' | 'read' | null = null;

          const statusValue = String(newApiStatus).toUpperCase();

          if (statusValue === 'SENT' || statusValue === 'SERVER_ACK' || statusValue === '2') dbStatus = 'sent';
          else if (statusValue === 'DELIVERY_ACK' || statusValue === 'DELIVERED' || statusValue === '3') dbStatus = 'delivered';
          else if (statusValue === 'READ' || statusValue === 'PLAYED' || statusValue === '4' || statusValue === '5') dbStatus = 'read';

          if (dbStatus) {
            const pusherEvents: { event: string; data: any }[] = [];

            await db.transaction(async (tx) => {
                const currentMessage = await tx.query.messages.findFirst({
                   where: and(
                      eq(messages.id, messageKeyId),
                      eq(messages.fromMe, true)
                   ),
                   columns: { id: true, status: true, timestamp: true, chatId: true }
                });

                if (!currentMessage) return;

                const currentWeight = getStatusWeight(currentMessage.status);
                const newWeight = getStatusWeight(dbStatus!);

                if (newWeight <= currentWeight) return;

                const updatedMessages = await tx.update(messages)
                    .set({ status: dbStatus! })
                    .where(eq(messages.id, messageKeyId))
                    .returning({
                        id: messages.id, status: messages.status, chatId: messages.chatId,
                        timestamp: messages.timestamp
                    });

                if (updatedMessages.length === 0) return;

                const updatedMsg = updatedMessages[0];

                const chat = await tx.query.chats.findFirst({
                    where: eq(chats.id, currentMessage.chatId),
                    columns: { id: true, lastMessageStatus: true, remoteJid: true }
                });

                if (!chat) return;

                pusherEvents.push({
                    event: 'message-status-update',
                    data: {
                        messageId: updatedMsg.id,
                        status: updatedMsg.status,
                        instance: instanceName,
                        remoteJid: chat.remoteJid
                    }
                });

                const latestMessage = await tx.query.messages.findFirst({
                    where: eq(messages.chatId, chat.id),
                    orderBy: [desc(messages.timestamp)],
                    columns: { id: true }
                });

                if (latestMessage && latestMessage.id === messageKeyId) {
                    const chatCurrentWeight = getStatusWeight(chat.lastMessageStatus);
                    if (newWeight > chatCurrentWeight) {
                        const updatedChats = await tx.update(chats)
                            .set({ lastMessageStatus: dbStatus! })
                            .where(eq(chats.id, chat.id))
                            .returning({
                                id: chats.id,
                                lastMessageStatus: chats.lastMessageStatus,
                                remoteJid: chats.remoteJid,
                                instanceId: chats.instanceId
                            });

                        if (updatedChats.length > 0) {
                            pusherEvents.push({
                                event: 'chat-list-update',
                                data: {
                                    id: updatedChats[0].id,
                                    lastMessageStatus: updatedChats[0].lastMessageStatus,
                                    remoteJid: updatedChats[0].remoteJid,
                                    instanceId: updatedChats[0].instanceId
                                }
                            });
                        }
                    }
                }
            });

            for (const evt of pusherEvents) {
                await safePusherTrigger(pusherChannel, evt.event, evt.data);
            }

            if (pusherEvents.length > 0) {
                await logWebhookEvent(teamId, instanceName, 'messages.update', messageKeyId, remoteJidRaw || null, 'processed');
            }
          }
      }

    } else if (eventName === 'contacts.update') {
        const contactsData = Array.isArray(body.data) ? body.data : [body.data];
        
        for (const contact of contactsData) {
            const rawId = contact.remoteJid || contact.id; 
            if (rawId && (contact.profilePicUrl || contact.imgUrl)) { 
                
                const remoteJid = normalizeJid(rawId);
                const newPicUrl = contact.profilePicUrl || contact.imgUrl;

                if (remoteJid === 'status@broadcast' || remoteJid.includes('@lid')) continue;

                const updatedChats = await db.update(chats)
                    .set({ profilePicUrl: newPicUrl })
                    .where(and(
                        eq(chats.remoteJid, remoteJid),
                        eq(chats.teamId, teamId),
                        eq(chats.instanceId, instanceId)
                    ))
                    .returning({ id: chats.id });

                if (updatedChats.length > 0) {
                    await safePusherTrigger(pusherChannel, 'chat-list-update', {
                        remoteJid: remoteJid,
                        instanceId: instanceId,
                        profilePicUrl: newPicUrl
                    });
                }
            }
        }
    } else if (eventName === 'chats.update') {
        const chatsData = Array.isArray(body.data) ? body.data : [body.data];
        for (const chatData of chatsData) {
             const rawId = chatData.remoteJid || chatData.id;

             /**
              * El teléfono avisa cuándo se leyó un chat.
              *
              * Baileys manda `chats.update` con `unreadCount: 0` cuando alguien
              * abre la conversación en el celular, aunque no conteste nada. Este
              * handler sólo miraba la foto de perfil, así que ese aviso se
              * tiraba a la basura y el chat quedaba marcado como no leído en
              * WhatsPro.
              *
              * Se honra SÓLO el 0. Un número positivo del teléfono no se copia:
              * si el equipo ya leyó esos mensajes desde WhatsPro, resucitarlos
              * porque el celular todavía no se sincronizó sería peor que el
              * problema que arregla. La sincronía es en un sentido:
              * leído en el teléfono ⇒ leído acá.
              */
             const unreadFromDevice = chatData.unreadCount ?? chatData.unread ?? null;
             if (rawId && unreadFromDevice === 0) {
                 const remoteJid = normalizeJid(rawId);
                 if (!remoteJid.includes('@lid')) {
                     const leidos = await db.update(chats)
                        .set({ unreadCount: 0 })
                        .where(and(
                            eq(chats.remoteJid, remoteJid),
                            eq(chats.teamId, teamId),
                            eq(chats.instanceId, instanceId),
                            gt(chats.unreadCount, 0)
                        ))
                        .returning({ id: chats.id });

                     if (leidos.length > 0) {
                         await safePusherTrigger(pusherChannel, 'chat-list-update', {
                             id: leidos[0].id,
                             remoteJid: remoteJid,
                             instanceId: instanceId,
                             unreadCount: 0
                         });
                         await logWebhookEvent(teamId, instanceName, 'chats.update', null, remoteJid, 'processed');
                     }
                 }
             }

             if(rawId && (chatData.profilePicUrl || chatData.image)) {
                 const remoteJid = normalizeJid(rawId);
                 const newPicUrl = chatData.profilePicUrl || chatData.image;

                 if (remoteJid.includes('@lid')) continue;

                 const updatedChats = await db.update(chats)
                    .set({ profilePicUrl: newPicUrl })
                    .where(and(
                        eq(chats.remoteJid, remoteJid),
                        eq(chats.teamId, teamId),
                        eq(chats.instanceId, instanceId)
                    ))
                    .returning({ id: chats.id });

                 if (updatedChats.length > 0) {
                    await safePusherTrigger(pusherChannel, 'chat-list-update', {
                        remoteJid: remoteJid,
                        instanceId: instanceId,
                        profilePicUrl: newPicUrl
                    });
                 }
             }
        }

    } else if (eventName === 'qrcode.updated' && body.data?.qrcode?.base64) {
      await safePusherTrigger(pusherChannel, 'qr-update-needed', { instance: instanceName });
    } else if (eventName === 'connection.update' && body.data?.state) {
      await safePusherTrigger(pusherChannel, 'connection-status', { status: body.data.state, instance: instanceName });
    }

    return NextResponse.json({ received: true });

  } catch (error: any) {
    console.error('Webhook Error:', error.message);
    try {
        await logWebhookEvent(0, 'unknown', 'unknown', null, null, 'error', error.message);
    } catch (_) { /* ignore log errors */ }
    return NextResponse.json({ received: true, error: 'Internal processing error' });
  }
}
