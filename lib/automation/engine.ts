import { db } from '@/lib/db/drizzle';
import { 
  automations, 
  automationSessions, 
  contacts, 
  contactTags, 
  messages, 
  evolutionInstances, 
  aiSessions, 
  chats 
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { Node, Edge } from '@xyflow/react';
import fs from 'fs/promises';
import path from 'path';
import { pusherServer } from '@/lib/pusher-server';

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";
const GRAPH_API_URL = "https://graph.facebook.com";
const GRAPH_API_VERSION = "v21.0";

type FlowData = {
  nodes: Node[];
  edges: Edge[];
};

type StartNodeData = {
    triggerType: 'exact_match' | 'contains' | 'first_message' | 'fallback';
    keywords?: string[];
    conditions?: {
        funnelStageId?: string;
        tagId?: string;
        assignedUserId?: string;
        departmentId?: string;
    }
};

type InstanceConfig = {
    instanceName: string;
    accessToken: string;
    metaToken?: string | null;
    metaPhoneNumberId?: string | null;
};

function replaceVariables(text: string, variables: Record<string, any> | null): string {
    if (!text || !variables) return text;
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key] || "";
    });
}

async function fileToBase64(filePath: string): Promise<string | null> {
    try {
        const fileBuffer = await fs.readFile(filePath);
        return fileBuffer.toString('base64');
    } catch (error) {
        return null;
    }
}

function evaluateCondition(condition: any, text: string, variables: Record<string, string>): boolean {
    let valueToCheck = text;
    let targetValue = condition.value;
    let targetValue2 = condition.value2;

    if (condition.type === 'variable') {
        const varName = condition.value;
        const varValue = variables[varName];
        return !!varValue;
    }

    if (condition.type === 'time') {
        const now = new Date();
        const currentHours = now.getHours().toString().padStart(2, '0');
        const currentMinutes = now.getMinutes().toString().padStart(2, '0');
        valueToCheck = `${currentHours}:${currentMinutes}`;
    }

    if (condition.type === 'number') {
        const numCheck = parseFloat(valueToCheck);
        const numTarget = parseFloat(targetValue);
        const numTarget2 = parseFloat(targetValue2);

        if (isNaN(numCheck) || isNaN(numTarget)) return false;

        switch (condition.operator) {
            case 'equals': return numCheck === numTarget;
            case 'greater_than': return numCheck > numTarget;
            case 'less_than': return numCheck < numTarget;
            case 'gte': return numCheck >= numTarget;
            case 'lte': return numCheck <= numTarget;
            case 'between': return numCheck >= numTarget && numCheck <= numTarget2;
            default: return false;
        }
    }

    const strCheck = String(valueToCheck).toLowerCase();
    const strTarget = String(targetValue).toLowerCase();
    const strTarget2 = String(targetValue2).toLowerCase();

    switch (condition.operator) {
        case 'equals': return strCheck === strTarget;
        case 'not_equals': return strCheck !== strTarget;
        case 'contains': return strCheck.includes(strTarget);
        case 'starts_with': return strCheck.startsWith(strTarget);
        case 'ends_with': return strCheck.endsWith(strTarget);
        case 'greater_than': return strCheck > strTarget;
        case 'less_than': return strCheck < strTarget;
        case 'gte': return strCheck >= strTarget;
        case 'lte': return strCheck <= strTarget;
        case 'between': return strCheck >= strTarget && strCheck <= strTarget2;
        default: return false;
    }
}

export async function processAutomation(
  teamId: number,
  chatId: number,
  remoteJid: string,
  incomingText: string,
  instanceData: { instanceName: string; accessToken: string }, 
  instanceId: number
): Promise<boolean> {
  const text = incomingText.trim();
  
  const instance = await db.query.evolutionInstances.findFirst({
      where: eq(evolutionInstances.id, instanceId),
      columns: { accessToken: true, instanceName: true, metaToken: true, metaPhoneNumberId: true }
  });

  if (!instance || !instance.accessToken) {
      return false;
  }

  const config: InstanceConfig = {
      accessToken: instance.accessToken,
      instanceName: instance.instanceName,
      metaToken: instance.metaToken,
      metaPhoneNumberId: instance.metaPhoneNumberId
  };

  let session = await db.query.automationSessions.findFirst({
    where: and(
      eq(automationSessions.chatId, chatId),
      eq(automationSessions.status, 'active')
    ),
    with: { automation: true }
  });

  if (session && session.automation.instanceId !== instanceId) return false;

  if (!session) {
    const activeAutomations = await db.query.automations.findMany({
      where: and(
        eq(automations.teamId, teamId),
        eq(automations.isActive, true),
        eq(automations.instanceId, instanceId)
      )
    });

    if (activeAutomations.length === 0) return false;

    const contactData = await db.query.contacts.findFirst({
        where: eq(contacts.chatId, chatId),
        with: { contactTags: true }
    });

    const messageCount = await db.$count(messages, eq(messages.chatId, chatId));
    const isFirstMessage = messageCount <= 1;

    let matchedAutomation = null;
    let fallbackAutomation = null;

    for (const automation of activeAutomations) {
        const nodes = automation.nodes as Node[];
        const startNode = nodes.find(n => n.type === 'start');
        if (!startNode) continue;

        const data = startNode.data as unknown as StartNodeData;
        
        if (data.conditions) {
            if (data.conditions.funnelStageId && (!contactData || contactData.funnelStageId?.toString() !== data.conditions.funnelStageId)) continue;
            if (data.conditions.assignedUserId && (!contactData || contactData.assignedUserId?.toString() !== data.conditions.assignedUserId)) continue;
            if (data.conditions.departmentId && (!contactData || contactData.assignedDepartmentId?.toString() !== data.conditions.departmentId)) continue;
            if (data.conditions.tagId && (!contactData || !contactData.contactTags.some(ct => ct.tagId.toString() === data.conditions?.tagId))) continue;
        }

        const keywords = data.keywords || [];
        let isMatch = false;

        switch (data.triggerType) {
            case 'exact_match': if (keywords.some(k => k.toLowerCase() === text.toLowerCase())) isMatch = true; break;
            case 'contains': if (keywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) isMatch = true; break;
            case 'first_message': if (isFirstMessage) isMatch = true; break;
            case 'fallback': fallbackAutomation = automation; break;
            default: if (keywords.length === 0 || keywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) isMatch = true;
        }

        if (isMatch) { matchedAutomation = automation; break; }
    }

    const finalAutomation = matchedAutomation || fallbackAutomation;

    if (finalAutomation) {
        const flow = { nodes: finalAutomation.nodes as Node[], edges: finalAutomation.edges as Edge[] };
        const startNode = flow.nodes.find(n => n.type === 'start');
        
        if (startNode) {
            const [newSession] = await db.insert(automationSessions).values({
                teamId, automationId: finalAutomation.id, chatId, currentNodeId: startNode.id, status: 'active'
            }).returning();
            
            session = { ...newSession, automation: finalAutomation } as any;

            await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
                chatId, type: 'automation', status: 'active'
            });

            const edge = flow.edges.find(e => e.source === startNode.id);
            if (edge) {
                await executeStep(session!, flow, edge.target, text, config, remoteJid, teamId, chatId);
            }
            return true;
        }
    }
    return false;
  }

  const flow = {
      nodes: session.automation.nodes as Node[],
      edges: session.automation.edges as Edge[]
  };

  const currentNode = flow.nodes.find(n => n.id === session?.currentNodeId);
  
  if (!currentNode) return false;

  let nextNodeId: string | undefined;

  if (currentNode.type === 'collect') {
      const variableName = currentNode.data.variable as string;
      if (variableName) {
          const currentVars = (session.variables as Record<string, string>) || {};
          const newVars = { ...currentVars, [variableName]: text };
          
          await db.update(automationSessions)
            .set({ variables: newVars, updatedAt: new Date() })
            .where(eq(automationSessions.id, session.id));
          
          session.variables = newVars;
      }
      const edge = flow.edges.find(e => e.source === currentNode.id);
      nextNodeId = edge?.target;
  } 
  else if (currentNode.type === 'options' || currentNode.type === 'button_message' || currentNode.type === 'list_message') {
      let selectedEdge: Edge | undefined;

      if (currentNode.type === 'options') {
          const options = (currentNode.data.options as string[]) || [];
          let selectedIndex = -1;

          if (!isNaN(Number(text)) && Number(text) > 0 && Number(text) <= options.length) {
              selectedIndex = Number(text) - 1;
          } else {
              selectedIndex = options.findIndex(opt => opt.toLowerCase() === text.toLowerCase());
          }

          if (selectedIndex !== -1) {
              const handleId = `option-${selectedIndex}`;
              selectedEdge = flow.edges.find(e => e.source === currentNode.id && e.sourceHandle === handleId);
          }
      } 
      else if (currentNode.type === 'button_message') {
          const buttons = (currentNode.data.buttons as any[]) || [];
          const buttonIndex = buttons.findIndex(b => b.text.toLowerCase() === text.toLowerCase() || b.value === text);
          if (buttonIndex !== -1) {
              const handleId = `btn-${buttons[buttonIndex].id || buttonIndex}`;
              selectedEdge = flow.edges.find(e => e.source === currentNode.id && e.sourceHandle === handleId);
          }
      }
      else if (currentNode.type === 'list_message') {
          const items = (currentNode.data.items as any[]) || [];
          const itemIndex = items.findIndex(i => i.title.toLowerCase() === text.toLowerCase() || i.rowId === text);
          if (itemIndex !== -1) {
              const handleId = `list-${items[itemIndex].id || itemIndex}`;
              selectedEdge = flow.edges.find(e => e.source === currentNode.id && e.sourceHandle === handleId);
          }
      }

      if (selectedEdge) {
          nextNodeId = selectedEdge.target;
      } else {
          await sendEvolutionMessage(config, remoteJid, "sendText", { 
             text: "Opção inválida. Por favor, tente novamente." 
          }, teamId, chatId);
          return true;
      }
  } 
  else {
      const edge = flow.edges.find(e => e.source === currentNode.id);
      nextNodeId = edge?.target;
  }

  if (nextNodeId) {
      await executeStep(session, flow, nextNodeId, text, config, remoteJid, teamId, chatId);
      return true;
  }

  return false;
}

async function executeStep(
    session: typeof automationSessions.$inferSelect, 
    flow: FlowData, 
    nodeId: string,
    input: string, 
    instance: InstanceConfig,
    remoteJid: string,
    teamId: number,
    chatId: number
) {
    const nextNode = flow.nodes.find(n => n.id === nodeId);
    const variables = (session.variables as Record<string, string>) || {};

    await db.update(automationSessions)
        .set({ currentNodeId: nodeId, updatedAt: new Date() })
        .where(eq(automationSessions.id, session.id));
    
    const updatedSession = { ...session, currentNodeId: nodeId };

    if (!nextNode) {
        await db.update(automationSessions).set({ status: 'completed' }).where(eq(automationSessions.id, session.id));
        await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
            chatId, type: 'automation', status: 'completed'
        });
        return;
    }

    if (nextNode.type === 'end') {
        await db.update(automationSessions)
            .set({ status: 'completed', updatedAt: new Date() })
            .where(eq(automationSessions.id, session.id));
        
        await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
            chatId, type: 'automation', status: 'completed'
        });
        return;
    }

    if (nextNode.type === 'condition') {
        const conditions = (nextNode.data.conditions as any[]) || [];
        let matchedConditionId: string | null = null;
        
        for (const cond of conditions) {
            if (evaluateCondition(cond, input, variables)) {
                matchedConditionId = cond.id;
                break;
            }
        }

        let targetEdge = null;
        if (matchedConditionId) {
            targetEdge = flow.edges.find(e => e.source === nextNode.id && e.sourceHandle === matchedConditionId);
        }
        if (!targetEdge) {
            targetEdge = flow.edges.find(e => e.source === nextNode.id && e.sourceHandle === 'fallback');
        }

        if (targetEdge) {
            await new Promise(r => setTimeout(r, 500));
            await executeStep(updatedSession, flow, targetEdge.target, input, instance, remoteJid, teamId, chatId);
        } else {
             await db.update(automationSessions).set({ status: 'completed' }).where(eq(automationSessions.id, session.id));
             await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
                 chatId, type: 'automation', status: 'completed'
             });
        }
        return;
    }

    if (nextNode.type === 'delay') {
        const seconds = Number(nextNode.data.seconds) || 2;
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'save_contact') {
        await processSaveContact(nextNode, updatedSession, teamId, chatId);
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'message' || nextNode.type === 'options') {
        await processTextOutput(nextNode, instance, remoteJid, teamId, chatId, variables);
        if (nextNode.type === 'message') {
             await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
        }
    }
    else if (nextNode.type === 'media') {
        await processMediaOutput(nextNode, instance, remoteJid, teamId, chatId, variables);
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'collect') {
        let text = nextNode.data.label as string;
        text = replaceVariables(text, variables);
        await sendEvolutionMessage(instance, remoteJid, "sendText", { text: text }, teamId, chatId);
    }
    else if (nextNode.type === 'button_message' || nextNode.type === 'list_message') {
        await processMetaInteractiveOutput(nextNode, instance, remoteJid, teamId, chatId, variables);
    }
    else if (nextNode.type === 'call_to_action') {
        const body = replaceVariables(nextNode.data.bodyText as string || '', variables);
        const footer = nextNode.data.footerText as string;
        const btnText = nextNode.data.buttonText as string || "Visit";
        const url = replaceVariables(nextNode.data.url as string || '', variables);

        let finalMsg = `${body}`;
        if(url) finalMsg += `\n\n🔗 ${btnText}: ${url}`;
        if(footer) finalMsg += `\n\n_${footer}_`;

        await sendEvolutionMessage(instance, remoteJid, "sendText", { text: finalMsg }, teamId, chatId);
        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
    else if (nextNode.type === 'ai_control') {
        const action = nextNode.data.action as string || 'active';
        
        const existingAiSession = await db.query.aiSessions.findFirst({
            where: eq(aiSessions.chatId, chatId)
        });

        if (existingAiSession) {
            await db.update(aiSessions)
                .set({ status: action, updatedAt: new Date() })
                .where(eq(aiSessions.id, existingAiSession.id));
        } else {
            await db.insert(aiSessions).values({
                chatId,
                status: action,
                history: []
            });
        }

        await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
            chatId, type: 'ai', status: action
        });

        await moveToNextAuto(updatedSession, flow, nextNode.id, instance, remoteJid, teamId, chatId);
    }
}

async function moveToNextAuto(session: any, flow: FlowData, currentNodeId: string, instance: InstanceConfig, remoteJid: string, teamId: number, chatId: number) {
    const edge = flow.edges.find(e => e.source === currentNodeId);
    if (edge) {
        await new Promise(r => setTimeout(r, 500)); 
        await executeStep(session, flow, edge.target, '', instance, remoteJid, teamId, chatId);
    } else {
        await db.update(automationSessions).set({ status: 'completed' }).where(eq(automationSessions.id, session.id));
        await pusherServer.trigger(`team-${teamId}`, 'chat-status-update', {
            chatId, type: 'automation', status: 'completed'
        });
    }
}

async function processTextOutput(node: Node, instance: InstanceConfig, remoteJid: string, teamId: number, chatId: number, variables: Record<string, any>) {
    if (node.type === 'message') {
        let text = node.data.label as string;
        text = replaceVariables(text, variables);
        await sendEvolutionMessage(instance, remoteJid, "sendText", { text }, teamId, chatId);
    }
    else if (node.type === 'options') {
        let title = node.data.label as string;
        title = replaceVariables(title, variables);
        const options = (node.data.options as string[]) || [];
        
        let message = `${title}\n\n`;
        options.forEach((opt, idx) => {
            message += `${idx + 1}. ${opt}\n`;
        });
        await sendEvolutionMessage(instance, remoteJid, "sendText", { text: message }, teamId, chatId);
    }
}

async function processMediaOutput(node: Node, instance: InstanceConfig, remoteJid: string, teamId: number, chatId: number, variables: Record<string, any> = {}) {
    const data = node.data as any;
    if (!data.mediaUrl) return;

    try {
        const absolutePath = path.join(process.cwd(), 'public', data.mediaUrl);
        const base64 = await fileToBase64(absolutePath);
        if (!base64) return;

        const caption = replaceVariables(data.caption || '', variables);
        
        let mediaType = data.mediaType || 'image';
        const mimetype = data.mediaMimetype || 'application/octet-stream';

        const payload = {
            media: base64,
            mediatype: mediaType,
            mimetype: mimetype,
            caption: caption,
            fileName: data.fileName || "file"
        };

        await sendEvolutionMessage(instance, remoteJid, "sendMedia", payload, teamId, chatId, data.mediaUrl);

    } catch (e) {
        console.error(e);
    }
}

async function processMetaInteractiveOutput(node: Node, instance: InstanceConfig, remoteJid: string, teamId: number, chatId: number, variables: Record<string, any>) {
    if (!instance.metaToken || !instance.metaPhoneNumberId) return;

    const data = node.data as any;
    const bodyText = replaceVariables(data.bodyText || '', variables);
    const footerText = replaceVariables(data.footerText || '', variables);
    const titleText = replaceVariables(data.title || '', variables);

    let interactiveObject: any = {
        body: { text: bodyText }
    };

    if (footerText) interactiveObject.footer = { text: footerText };
    if (titleText && node.type === 'list_message') interactiveObject.header = { type: "text", text: titleText }; 

    if (node.type === 'button_message') {
        const buttons = (data.buttons as any[]) || [];
        interactiveObject.type = "button";
        interactiveObject.action = {
            buttons: buttons.slice(0, 3).map((b, idx) => ({
                type: "reply",
                reply: {
                    id: b.value || `btn-${idx}`,
                    title: b.text?.substring(0, 20) || "Button"
                }
            }))
        };
    } 
    else if (node.type === 'list_message') {
        const buttonText = data.buttonText || "Options";
        const items = (data.items as any[]) || [];
        
        interactiveObject.type = "list";
        interactiveObject.action = {
            button: buttonText.substring(0, 20),
            sections: [
                {
                    title: "Menu",
                    rows: items.slice(0, 10).map((item, idx) => ({
                        id: item.rowId || `row-${idx}`,
                        title: item.title?.substring(0, 24) || "Item",
                        description: item.description?.substring(0, 72) || ""
                    }))
                }
            ]
        };
    }

    const payload = {
        type: "interactive",
        interactive: interactiveObject
    };

    await sendMetaMessage(instance, remoteJid, payload, teamId, chatId);
}

async function sendEvolutionMessage(
    instance: InstanceConfig, 
    remoteJid: string, 
    endpoint: "sendText" | "sendMedia", 
    contentPayload: any, 
    teamId: number, 
    chatId: number, 
    localMediaUrl?: string
) {
    try {
        const number = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        
        const payload = {
            number: number,
            delay: 1000,
            linkPreview: true,
            mentionsEveryOne: false,
            ...contentPayload
        };

        const response = await fetch(
            `${EVOLUTION_API_URL}/message/${endpoint}/${instance.instanceName}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': instance.accessToken
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10000)
            }
        );

        const data = await response.json();
        
        if (response.ok && data?.key?.id) {
            const messageId = data.key.id;
            const timestamp = new Date();
            
            let previewText = "Message";
            if (endpoint === 'sendText') previewText = contentPayload.text;
            else if (endpoint === 'sendMedia') previewText = contentPayload.caption || "Media";

            let messageType = 'conversation';
            if (endpoint === 'sendMedia') {
                messageType = `${contentPayload.mediatype}Message`;
            }

            let mediaDetails = {};
            if (localMediaUrl) {
                mediaDetails = {
                    mediaUrl: localMediaUrl,
                    mediaMimetype: contentPayload.mimetype,
                    mediaCaption: contentPayload.caption
                };
            }

            const newMessage = {
                id: messageId, 
                chatId: chatId, 
                fromMe: true, 
                messageType: messageType, 
                text: previewText, 
                timestamp, 
                status: 'sent' as const, 
                isInternal: false,
                isAutomation: true, 
                quotedMessageText: null, 
                ...mediaDetails
            };

            await db.insert(messages).values(newMessage).onConflictDoNothing();

            await db.update(chats).set({ 
                lastMessageText: previewText, 
                lastMessageTimestamp: timestamp, 
                lastMessageFromMe: true, 
                lastMessageStatus: 'sent' 
            }).where(eq(chats.id, chatId));

            const pusherChannel = `team-${teamId}`;
            
            await pusherServer.trigger(pusherChannel, 'new-message', { 
                ...newMessage,
                timestamp: timestamp.toISOString(),
                remoteJid, 
                instance: instance.instanceName,
            });

            await pusherServer.trigger(pusherChannel, 'chat-list-update', { 
                id: chatId, 
                lastMessageText: previewText, 
                lastMessageTimestamp: timestamp.toISOString(), 
                lastMessageFromMe: true, 
                lastMessageStatus: 'sent', 
                remoteJid 
            });
        }
    } catch (e) { 
        console.error(e); 
    }
}

async function sendMetaMessage(instance: InstanceConfig, remoteJid: string, messagePayload: any, teamId: number, chatId: number) {
    if (!instance.metaToken || !instance.metaPhoneNumberId) return;

    try {
        const cleanPhone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        const payload = {
            messaging_product: "whatsapp",
            to: cleanPhone,
            ...messagePayload
        };

        const response = await fetch(`${GRAPH_API_URL}/${GRAPH_API_VERSION}/${instance.metaPhoneNumberId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${instance.metaToken}`
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
        });

        const data = await response.json();
        
        if (response.ok && data?.messages?.[0]?.id) {
            const messageId = data.messages[0].id;
            const timestamp = new Date();
            
            let previewText = "Interactive Message";
            let interactiveMetadata = null;

            if (messagePayload.type === 'interactive') {
                const interactive = messagePayload.interactive;
                previewText = interactive.body.text;
                interactiveMetadata = JSON.stringify(interactive);
            }

            const newMessage = {
                id: messageId, 
                chatId: chatId, 
                fromMe: true, 
                messageType: 'interactiveMessage', 
                text: previewText, 
                timestamp, 
                status: 'sent' as const, 
                isInternal: false,
                quotedMessageText: interactiveMetadata
            };

            await db.insert(messages).values(newMessage).onConflictDoNothing();

            await db.update(chats).set({ 
                lastMessageText: previewText, 
                lastMessageTimestamp: timestamp, 
                lastMessageFromMe: true, 
                lastMessageStatus: 'sent' 
            }).where(eq(chats.id, chatId));

            const pusherChannel = `team-${teamId}`;
            
            await pusherServer.trigger(pusherChannel, 'new-message', { 
                ...newMessage,
                timestamp: timestamp.toISOString(),
                remoteJid, 
                instance: instance.instanceName,
            });

            await pusherServer.trigger(pusherChannel, 'chat-list-update', { 
                id: chatId, 
                lastMessageText: previewText, 
                lastMessageTimestamp: timestamp.toISOString(), 
                lastMessageFromMe: true, 
                lastMessageStatus: 'sent', 
                remoteJid 
            });
        }
    } catch (e) { 
        console.error(e); 
    }
}

async function processSaveContact(node: Node, session: any, teamId: number, chatId: number) {
    const data = node.data as any;
    const variables = (session.variables as Record<string, string>) || {};
    

    let contactName = undefined;
    if (data.nameVariable) {
        contactName = replaceVariables(data.nameVariable, variables);
    } 

    const currentContact = await db.query.contacts.findFirst({
        where: eq(contacts.chatId, chatId)
    });

    let newCustomData = currentContact?.customData || {};

    if (data.customFields && Object.keys(data.customFields).length > 0) {
        const updates: Record<string, any> = {};
        for (const [key, valueTemplate] of Object.entries(data.customFields)) {
            const resolvedValue = replaceVariables(valueTemplate as string, variables);
            
            if (resolvedValue.toLowerCase() === 'true') updates[key] = true;
            else if (resolvedValue.toLowerCase() === 'false') updates[key] = false;
            else updates[key] = resolvedValue;
        }
        newCustomData = { ...newCustomData, ...updates };
    }

    const valuesToSet: any = {
        updatedAt: new Date()
    };
    
    if (contactName) valuesToSet.name = contactName;
    if (data.agentId && data.agentId !== 'null') valuesToSet.assignedUserId = parseInt(data.agentId);
    if (data.departmentId && data.departmentId !== 'null') valuesToSet.assignedDepartmentId = parseInt(data.departmentId);
    if (data.funnelStageId && data.funnelStageId !== 'null') valuesToSet.funnelStageId = parseInt(data.funnelStageId);
    if (Object.keys(newCustomData).length > 0) valuesToSet.customData = newCustomData;

    if (currentContact) {
        await db.update(contacts)
            .set(valuesToSet)
            .where(eq(contacts.id, currentContact.id));
            
        if (data.tagId && data.tagId !== 'null') {
             await db.insert(contactTags).values({
                contactId: currentContact.id,
                tagId: parseInt(data.tagId)
            }).onConflictDoNothing();
        }
    } else {
        if (!valuesToSet.name) {
             const chat = await db.query.chats.findFirst({ where: eq(chats.id, chatId), columns: { name: true, pushName: true } });
             valuesToSet.name = chat?.name || chat?.pushName || 'New Contact';
        }
        valuesToSet.teamId = teamId;
        valuesToSet.chatId = chatId;
        
        const [newContact] = await db.insert(contacts).values(valuesToSet).returning();
        
        if (data.tagId && data.tagId !== 'null' && newContact) {
            await db.insert(contactTags).values({
                contactId: newContact.id,
                tagId: parseInt(data.tagId)
            }).onConflictDoNothing();
        }
    }
}