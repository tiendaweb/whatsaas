import { ToolDefinition } from './types';
import { ensureCustomFieldsTable } from '@/lib/contacts/custom-fields';
import { db } from '@/lib/db/drizzle';
import { chats, aiTools, messages, contacts, funnelStages, teamMembers, users, customFields, tags, contactTags } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { pusherServer } from '@/lib/pusher-server';
import { createSystemMessage } from '@/lib/db/system-messages';
import { triggerAutomationManually } from '@/lib/automation/engine';
import { getBuiltinToolDefinition, getBuiltinToolsForTeam } from './builtin';

const BASE_URL =  process.env.BASE_URL || "http://localhost:3000";
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";

async function sendMediaToEvolution(
    instance: any, 
    remoteJid: string, 
    mediaUrl: string, 
    caption: string, 
    type: 'image' | 'document' | 'audio' | 'video',
    chatId: number, 
    teamId: number
) {
    if (!instance.accessToken) return { error: 'No access token' };

    const finalMediaUrl = mediaUrl.startsWith('http')
        ? mediaUrl
        : `${BASE_URL}${mediaUrl.startsWith('/') ? '' : '/'}${mediaUrl}`;

    // WhatsApp sends voice/audio as a distinct audioMessage (PTT), not a generic media
    // attachment. The generic sendMedia endpoint acks the request but never delivers it —
    // mirrors the working /api/messages/sendAudio route and app/api/v1/send.
    const isAudio = type === 'audio';
    const evolutionEndpoint = isAudio ? 'sendWhatsAppAudio' : 'sendMedia';
    const payload = isAudio
        ? {
            number: remoteJid.replace(/\D/g, ''),
            audio: finalMediaUrl,
            mimetype: 'audio/mpeg',
            ptt: true,
        }
        : {
            number: remoteJid.replace(/\D/g, ''),
            mediatype: type,
            mimetype: type === 'image' ? 'image/jpeg' : 'application/pdf',
            media: finalMediaUrl,
            caption: caption,
            fileName: "file"
        };

    try {
        const response = await fetch(`${EVOLUTION_API_URL}/message/${evolutionEndpoint}/${instance.instanceName}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': instance.accessToken
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000)
        });
        
        const data = await response.json();

        if (!response.ok) {
            console.error("Evolution API Error:", data);
            throw new Error(`Evolution API failed: ${response.status}`);
        }

        if (data?.key?.id) {
            const messageId = data.key.id;
            const timestamp = new Date(); 
            
            const newMessage = {
                id: messageId, 
                chatId: chatId, 
                fromMe: true, 
                messageType: `${type}Message`, 
                text: caption || "", 
                timestamp, 
                status: 'sent' as const, 
                isInternal: false,
                isAi: true,
                mediaUrl: finalMediaUrl,
                mediaMimetype: payload.mimetype,
                mediaCaption: caption,
            };

            await db.insert(messages).values(newMessage).onConflictDoNothing();

            const pusherChannel = `team-${teamId}`;
            await pusherServer.trigger(pusherChannel, 'new-message', { 
                ...newMessage,
                timestamp: timestamp.toISOString(),
                remoteJid, 
                instance: instance.instanceName,
            });
            
            await pusherServer.trigger(pusherChannel, 'chat-list-update', {
                id: chatId,
                lastMessageText: caption || "Media sent",
                lastMessageTimestamp: timestamp.toISOString(),
                lastMessageFromMe: true,
                remoteJid
            });
        }

        return { success: true, data };
    } catch (error: any) {
        console.error("Error sending media:", error);
        return { success: false, error: error.message };
    }
}

const baseTools: ToolDefinition[] = [
  {
    name: 'handover_to_human',
    description: 'Transfers the conversation to a human agent and stops the AI.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for transfer' }
      }
    },
    execute: async (args, context) => {
       return { success: true, message: "Transferred to human" };
    }
  }
];

async function executeFunnelStageAction(
    actionData: any,
    context: { chatId: number; teamId: number }
): Promise<{ success: boolean; message: string }> {
    const { funnelStageId } = actionData;
    if (!funnelStageId) return { success: false, message: "No funnel stage configured" };

    const chat = await db.query.chats.findFirst({
        where: eq(chats.id, context.chatId),
    });
    if (!chat) return { success: false, message: "Chat not found" };

    let contact = await db.query.contacts.findFirst({
        where: and(
            eq(contacts.teamId, context.teamId),
            eq(contacts.chatId, context.chatId)
        )
    });

    if (!contact) {
        const contactName = chat.name || chat.pushName || 'New Contact';
        const [newContact] = await db.insert(contacts).values({
            teamId: context.teamId,
            chatId: context.chatId,
            name: contactName,
        }).returning();
        contact = newContact;

        await createSystemMessage(context.teamId, context.chatId, `@@syslog_contact_auto_created|name=${contactName}`);
    }

    const stage = await db.query.funnelStages.findFirst({
        where: and(
            eq(funnelStages.id, funnelStageId),
            eq(funnelStages.teamId, context.teamId)
        )
    });
    if (!stage) return { success: false, message: "Funnel stage not found" };

    await db.update(contacts)
        .set({ funnelStageId: stage.id, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id));

    const logText = `@@syslog_ai_moved_to_stage|stage=${stage.name}`;
    await createSystemMessage(context.teamId, context.chatId, logText);

    await pusherServer.trigger(`team-${context.teamId}`, 'contact-update', {
        chatId: context.chatId,
        remoteJid: chat.remoteJid,
        contactId: contact.id,
        funnelStageId: stage.id,
    });

    return { success: true, message: `Contact moved to funnel stage "${stage.name}"` };
}

async function executeAssignAgentAction(
    actionData: any,
    context: { chatId: number; teamId: number }
): Promise<{ success: boolean; message: string }> {
    const { agentId } = actionData;
    if (!agentId) return { success: false, message: "No agent configured" };

    const chat = await db.query.chats.findFirst({
        where: eq(chats.id, context.chatId),
    });
    if (!chat) return { success: false, message: "Chat not found" };

    const member = await db.query.teamMembers.findFirst({
        where: and(
            eq(teamMembers.teamId, context.teamId),
            eq(teamMembers.userId, agentId)
        ),
        with: { user: { columns: { id: true, name: true, email: true } } }
    });
    if (!member) return { success: false, message: "Agent not found in team" };

    let contact = await db.query.contacts.findFirst({
        where: and(
            eq(contacts.teamId, context.teamId),
            eq(contacts.chatId, context.chatId)
        )
    });

    if (!contact) {
        const contactName = chat.name || chat.pushName || 'New Contact';
        const [newContact] = await db.insert(contacts).values({
            teamId: context.teamId,
            chatId: context.chatId,
            name: contactName,
        }).returning();
        contact = newContact;

        await createSystemMessage(context.teamId, context.chatId, `@@syslog_contact_auto_created|name=${contactName}`);
    }

    await db.update(contacts)
        .set({ assignedUserId: agentId, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id));

    const agentName = member.user.name || member.user.email;
    await createSystemMessage(context.teamId, context.chatId, `@@syslog_ai_assigned_agent|agent=${agentName}`);

    await pusherServer.trigger(`team-${context.teamId}`, 'contact-update', {
        chatId: context.chatId,
        remoteJid: chat.remoteJid,
        contactId: contact.id,
        assignedUserId: agentId,
    });

    return { success: true, message: `Contact assigned to agent "${agentName}"` };
}

async function executeSetCustomFieldAction(
    actionData: any,
    args: Record<string, any>,
    context: { chatId: number; teamId: number }
): Promise<{ success: boolean; message: string }> {
    await ensureCustomFieldsTable();

    const { fieldId, fieldKey } = actionData;
    if (!fieldId || !fieldKey) return { success: false, message: "No custom field configured" };

    const value = args[fieldKey];
    if (!value) return { success: false, message: `No value provided for field "${fieldKey}"` };

    const field = await db.query.customFields.findFirst({
        where: and(
            eq(customFields.id, fieldId),
            eq(customFields.teamId, context.teamId)
        )
    });
    if (!field) return { success: false, message: "Custom field not found" };

    const chat = await db.query.chats.findFirst({
        where: eq(chats.id, context.chatId),
    });
    if (!chat) return { success: false, message: "Chat not found" };

    let contact = await db.query.contacts.findFirst({
        where: and(
            eq(contacts.teamId, context.teamId),
            eq(contacts.chatId, context.chatId)
        )
    });

    if (!contact) {
        const contactName = chat.name || chat.pushName || 'New Contact';
        const [newContact] = await db.insert(contacts).values({
            teamId: context.teamId,
            chatId: context.chatId,
            name: contactName,
        }).returning();
        contact = newContact;

        await createSystemMessage(context.teamId, context.chatId, `@@syslog_contact_auto_created|name=${contactName}`);
    }

    const currentCustomData = (contact.customData as Record<string, any>) || {};
    const updatedCustomData = { ...currentCustomData, [fieldKey]: value };

    await db.update(contacts)
        .set({ customData: updatedCustomData, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id));

    await createSystemMessage(context.teamId, context.chatId, `@@syslog_ai_set_field|field=${field.name}|value=${value}`);

    await pusherServer.trigger(`team-${context.teamId}`, 'contact-update', {
        chatId: context.chatId,
        remoteJid: chat.remoteJid,
        contactId: contact.id,
        customData: updatedCustomData,
    });

    return { success: true, message: `Field "${field.name}" set to "${value}"` };
}

async function executeAddNoteAction(
    args: Record<string, any>,
    context: { chatId: number; teamId: number }
): Promise<{ success: boolean; message: string }> {
    const note = args.note;
    if (!note) return { success: false, message: "No note content provided" };

    const chat = await db.query.chats.findFirst({
        where: eq(chats.id, context.chatId),
    });
    if (!chat) return { success: false, message: "Chat not found" };

    let contact = await db.query.contacts.findFirst({
        where: and(
            eq(contacts.teamId, context.teamId),
            eq(contacts.chatId, context.chatId)
        )
    });

    if (!contact) {
        const contactName = chat.name || chat.pushName || 'New Contact';
        const [newContact] = await db.insert(contacts).values({
            teamId: context.teamId,
            chatId: context.chatId,
            name: contactName,
        }).returning();
        contact = newContact;

        await createSystemMessage(context.teamId, context.chatId, `@@syslog_contact_auto_created|name=${contactName}`);
    }

    const existingNotes = contact.notes || '';
    const timestamp = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const updatedNotes = existingNotes
        ? `${existingNotes}\n\n[AI - ${timestamp}]\n${note}`
        : `[AI - ${timestamp}]\n${note}`;

    await db.update(contacts)
        .set({ notes: updatedNotes, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id));

    await createSystemMessage(context.teamId, context.chatId, `@@syslog_ai_added_note`);

    await pusherServer.trigger(`team-${context.teamId}`, 'contact-update', {
        chatId: context.chatId,
        remoteJid: chat.remoteJid,
        contactId: contact.id,
        notes: updatedNotes,
    });

    return { success: true, message: `Note added to contact` };
}

async function executeAddTagAction(
    actionData: any,
    context: { chatId: number; teamId: number }
): Promise<{ success: boolean; message: string }> {
    const { tagId } = actionData;
    if (!tagId) return { success: false, message: "No tag configured" };

    const tag = await db.query.tags.findFirst({
        where: and(eq(tags.id, tagId), eq(tags.teamId, context.teamId))
    });
    if (!tag) return { success: false, message: "Tag not found" };

    const chat = await db.query.chats.findFirst({
        where: eq(chats.id, context.chatId),
    });
    if (!chat) return { success: false, message: "Chat not found" };

    let contact = await db.query.contacts.findFirst({
        where: and(
            eq(contacts.teamId, context.teamId),
            eq(contacts.chatId, context.chatId)
        )
    });

    if (!contact) {
        const contactName = chat.name || chat.pushName || 'New Contact';
        const [newContact] = await db.insert(contacts).values({
            teamId: context.teamId,
            chatId: context.chatId,
            name: contactName,
        }).returning();
        contact = newContact;

        await createSystemMessage(context.teamId, context.chatId, `@@syslog_contact_auto_created|name=${contactName}`);
    }

    await db.insert(contactTags)
        .values({ contactId: contact.id, tagId: tag.id })
        .onConflictDoNothing();

    await createSystemMessage(context.teamId, context.chatId, `@@syslog_ai_added_tag|tag=${tag.name}`);

    await pusherServer.trigger(`team-${context.teamId}`, 'contact-update', {
        chatId: context.chatId,
        remoteJid: chat.remoteJid,
        contactId: contact.id,
    });

    return { success: true, message: `Tag "${tag.name}" added to contact` };
}

export async function getDynamicTools(teamId: number): Promise<ToolDefinition[]> {
    const [dbTools, builtinTools] = await Promise.all([
        db.query.aiTools.findMany({
            where: and(
                eq(aiTools.teamId, teamId),
                eq(aiTools.isActive, true)
            )
        }),
        getBuiltinToolsForTeam(teamId).catch((error) => {
            // Una app rota no debe dejar mudo al agente: sigue con las manuales.
            console.error('[ai-chat] builtin tools unavailable:', error);
            return [] as ToolDefinition[];
        }),
    ]);

    const dynamicTools: ToolDefinition[] = dbTools.map(t => {
        const actions: any[] = (t.actionData as any)?.actions || [];

        if (actions.length === 0) {
            const oldType = t.type || 'media';
            if (oldType === 'media' && t.mediaUrl) {
                actions.push({ type: 'media', mediaUrl: t.mediaUrl, mediaType: t.mediaType, caption: t.caption });
            } else if (oldType === 'crm_funnel_stage') {
                actions.push({ type: 'crm_funnel_stage', funnelStageId: (t.actionData as any)?.funnelStageId });
            }
        }

        const properties: Record<string, any> = {};
        for (const action of actions) {
            if (action.type === 'set_custom_field' && action.fieldKey) {
                properties[action.fieldKey] = {
                    type: 'string',
                    description: `Value for the field "${action.fieldLabel || action.fieldKey}"`,
                };
            }
            if (action.type === 'add_note') {
                properties['note'] = {
                    type: 'string',
                    description: 'Note content: summary of the conversation, key insights, and relevant details',
                };
            }
            // Acciones de apps: la IA completa los datos que el equipo no fijó.
            if (action.type === 'create_task') {
                if (!action.taskTitle) {
                    properties['task_title'] = { type: 'string', description: 'Título breve de la tarea para el equipo humano' };
                }
                properties['task_notes'] = { type: 'string', description: 'Contexto para quien tome la tarea: qué pidió el cliente' };
            }
            if (action.type === 'create_deal') {
                properties['deal_title'] = { type: 'string', description: 'Qué quiere comprar/contratar el cliente' };
                properties['deal_value'] = { type: 'number', description: 'Valor estimado en unidades de la moneda (opcional)' };
            }
            if (action.type === 'open_ticket') {
                properties['ticket_subject'] = { type: 'string', description: 'Título breve del problema o reclamo' };
                properties['ticket_description'] = { type: 'string', description: 'Detalle completo: qué pasó, cuándo, qué producto/servicio' };
            }
            if (action.type === 'schedule_message' && !action.message) {
                properties['reminder_message'] = { type: 'string', description: 'Texto final del mensaje que recibirá el cliente' };
            }
            if (action.type === 'book_appointment') {
                properties['appointment_starts_at'] = { type: 'string', description: 'Inicio del turno en ISO 8601 en hora local del negocio, sin zona (ej. 2026-09-03T15:00:00). Confirmá día y hora con el cliente antes.' };
                properties['appointment_title'] = { type: 'string', description: 'Título breve del turno (opcional)' };
                properties['appointment_notes'] = { type: 'string', description: 'Motivo o detalles que dio el cliente (opcional)' };
            }
            if (action.type === 'register_customer') {
                properties['customer_name'] = { type: 'string', description: 'Nombre o razón social si lo dijo (opcional, por defecto el del contacto)' };
                properties['customer_email'] = { type: 'string', description: 'Email del cliente si lo dio (opcional)' };
                properties['customer_notes'] = { type: 'string', description: 'Qué compró o contrató y cómo llegó (opcional)' };
            }
            if (action.type === 'register_membership') {
                if (!action.planId) {
                    properties['membership_plan_id'] = { type: 'integer', description: 'id del plan elegido por el cliente (obtenelo con list_membership_plans)' };
                }
                properties['membership_notes'] = { type: 'string', description: 'Medio de pago prometido o aclaraciones (opcional)' };
            }
            if (action.type === 'report_payment') {
                properties['payment_amount'] = { type: 'number', description: 'Importe que el cliente dice haber pagado, en unidades de la moneda' };
                if (!action.currency) {
                    properties['payment_currency'] = { type: 'string', description: 'Código ISO de 3 letras (ARS, USD, PYG…)' };
                }
                if (!action.paymentMethod) {
                    properties['payment_method'] = { type: 'string', description: 'Medio: transferencia, efectivo, Mercado Pago, tarjeta… (opcional)' };
                }
                properties['payment_reference'] = { type: 'string', description: 'Número de operación o comprobante si lo dio (opcional)' };
            }
            if (action.type === 'register_sale') {
                properties['sale_items'] = {
                    type: 'array',
                    description: 'Ítems acordados con el cliente. Confirmá ítems y total antes.',
                    items: {
                        type: 'object',
                        required: ['name', 'quantity', 'unit_price'],
                        properties: {
                            name: { type: 'string', description: 'Producto o servicio' },
                            quantity: { type: 'number', description: 'Cantidad' },
                            unit_price: { type: 'number', description: 'Precio unitario en unidades de la moneda' },
                        },
                    },
                };
                properties['sale_notes'] = { type: 'string', description: 'Forma de entrega, pago acordado, etc. (opcional)' };
            }
            if (action.type === 'update_contact') {
                properties['contact_name'] = { type: 'string', description: 'Nombre completo tal como lo dijo la persona (opcional)' };
                properties['contact_email'] = { type: 'string', description: 'Email (opcional)' };
                properties['contact_company'] = { type: 'string', description: 'Empresa u organización (opcional)' };
                properties['contact_job_title'] = { type: 'string', description: 'Cargo o rol (opcional)' };
            }
        }

        return {
            name: t.name,
            description: t.description,
            parameters: { type: 'object', properties },
            execute: async (args, context) => {
                const results: any[] = [];

                for (const action of actions) {
                    if (action.type === 'crm_funnel_stage') {
                        const result = await executeFunnelStageAction({ funnelStageId: action.funnelStageId }, context);
                        results.push(result);
                    } else if (action.type === 'assign_agent') {
                        const result = await executeAssignAgentAction({ agentId: action.agentId }, context);
                        results.push(result);
                    } else if (action.type === 'set_custom_field') {
                        const result = await executeSetCustomFieldAction(action, args, context);
                        results.push(result);
                    } else if (action.type === 'add_note') {
                        const result = await executeAddNoteAction(args, context);
                        results.push(result);
                    } else if (action.type === 'add_tag') {
                        const result = await executeAddTagAction(action, context);
                        results.push(result);
                    } else if (action.type === 'media') {
                        const chat = await db.query.chats.findFirst({
                            where: eq(chats.id, context.chatId),
                            with: { instance: true }
                        });

                        if (chat?.instance) {
                            await sendMediaToEvolution(
                                chat.instance,
                                chat.remoteJid,
                                action.mediaUrl,
                                action.caption || '',
                                action.mediaType as any,
                                context.chatId,
                                teamId
                            );
                            results.push({ success: true });
                        } else {
                            results.push({ success: false, message: "Instance not found" });
                        }
                    } else if (action.type === 'create_task') {
                        // Reusa la función integrada de Tareas: misma lógica, otro disparador.
                        const def = getBuiltinToolDefinition('create_followup_task');
                        results.push(def
                            ? await def.execute({ title: action.taskTitle || args.task_title, notes: args.task_notes }, context)
                            : { success: false, message: 'Tasks action unavailable' });
                    } else if (action.type === 'create_deal') {
                        const def = getBuiltinToolDefinition('create_opportunity');
                        results.push(def
                            ? await def.execute({ title: args.deal_title || action.dealTitle, value: args.deal_value, currency: action.currency }, context)
                            : { success: false, message: 'Deals action unavailable' });
                    } else if (action.type === 'open_ticket') {
                        const def = getBuiltinToolDefinition('open_support_ticket');
                        results.push(def
                            ? await def.execute({ subject: args.ticket_subject, description: args.ticket_description || args.ticket_subject, priority: action.priority, category: action.category }, context)
                            : { success: false, message: 'Support action unavailable' });
                    } else if (action.type === 'schedule_message') {
                        const def = getBuiltinToolDefinition('schedule_message');
                        const hours = Number(action.delayHours) > 0 ? Number(action.delayHours) : 24;
                        const sendAt = new Date(Date.now() + hours * 3_600_000);
                        results.push(def
                            ? await def.execute({ message: action.message || args.reminder_message, send_at: sendAt.toISOString() }, context)
                            : { success: false, message: 'Scheduled messages action unavailable' });
                    } else if (action.type === 'book_appointment') {
                        const def = getBuiltinToolDefinition('book_appointment');
                        results.push(def
                            ? await def.execute({ starts_at: args.appointment_starts_at, duration_minutes: action.durationMinutes, kind: action.kind, title: args.appointment_title, notes: args.appointment_notes }, context)
                            : { success: false, message: 'Calendar action unavailable' });
                    } else if (action.type === 'register_customer') {
                        const def = getBuiltinToolDefinition('register_customer');
                        results.push(def
                            ? await def.execute({ name: args.customer_name, email: args.customer_email, notes: args.customer_notes }, context)
                            : { success: false, message: 'Customers action unavailable' });
                    } else if (action.type === 'register_membership') {
                        const def = getBuiltinToolDefinition('register_membership');
                        results.push(def
                            ? await def.execute({ plan_id: action.planId || args.membership_plan_id, notes: args.membership_notes }, context)
                            : { success: false, message: 'Memberships action unavailable' });
                    } else if (action.type === 'report_payment') {
                        const def = getBuiltinToolDefinition('report_payment');
                        results.push(def
                            ? await def.execute({ amount: args.payment_amount, currency: action.currency || args.payment_currency, method: action.paymentMethod || args.payment_method, reference: args.payment_reference }, context)
                            : { success: false, message: 'Finance action unavailable' });
                    } else if (action.type === 'register_sale') {
                        const def = getBuiltinToolDefinition('register_sale');
                        results.push(def
                            ? await def.execute({ items: args.sale_items, currency: action.currency, notes: args.sale_notes }, context)
                            : { success: false, message: 'Sales action unavailable' });
                    } else if (action.type === 'update_contact') {
                        const def = getBuiltinToolDefinition('update_contact_details');
                        results.push(def
                            ? await def.execute({ name: args.contact_name, email: args.contact_email, company: args.contact_company, job_title: args.contact_job_title }, context)
                            : { success: false, message: 'CRM action unavailable' });
                    } else if (action.type === 'trigger_automation') {
                        const chat = await db.query.chats.findFirst({
                            where: eq(chats.id, context.chatId),
                        });

                        if (chat?.instanceId) {
                            const started = await triggerAutomationManually(
                                teamId,
                                context.chatId,
                                chat.remoteJid,
                                chat.instanceId,
                                { automationId: action.automationId, startNodeId: action.startNodeId }
                            );
                            results.push({ success: started });
                        } else {
                            results.push({ success: false, message: "Instance not found" });
                        }
                    }
                }

                const finalMessage = t.confirmationMessage && t.confirmationMessage.trim() !== ''
                    ? `[SYSTEM_INSTRUCTION] Output EXACTLY this text to the user: "${t.confirmationMessage}"`
                    : `[SYSTEM_INSTRUCTION] Tell the user the action was executed successfully.`;

                return { success: true, results, message: finalMessage };
            }
        };
    });

    // Si el equipo definió a mano una herramienta con el mismo nombre, gana la suya.
    const taken = new Set([...baseTools, ...dynamicTools].map((t) => t.name));
    return [...baseTools, ...builtinTools.filter((t) => !taken.has(t.name)), ...dynamicTools];
}
