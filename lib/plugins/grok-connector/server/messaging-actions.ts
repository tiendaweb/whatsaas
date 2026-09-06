import 'server-only';
import { asegurarParrafos } from '@/lib/messaging/parrafos';

import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { triggerAutomationManually } from '@/lib/automation/engine';
import { db } from '@/lib/db/drizzle';
import { automations, chats, contacts, evolutionInstances, messages, wabaTemplates } from '@/lib/db/schema';
import {
  MessagingError,
  mediaKindFromMimetype,
  resolveSendingInstance,
  sendTeamMediaMessage,
  sendTeamTemplateMessage,
  sendTeamTextMessage,
} from '@/lib/messaging/send';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Envío inmediato de WhatsApp desde un conector.
 *
 * Hasta ahora la única puerta que tenía una IA para escribirle a un cliente era
 * programar un mensaje para dentro de un minuto (`whatspro_manage_scheduled_message`)
 * y esperar al cron: latencia, una fila basura por mensaje y ninguna forma de
 * saber si salió. Estas tools mandan de verdad, en el momento, y devuelven el
 * mensaje guardado con su estado.
 *
 * Todo lo que sale del sistema exige `idempotency_key` y acepta `dry_run`: un
 * reintento por timeout no puede escribirle dos veces a la misma persona.
 */

const IDEMPOTENCY_HELP = 'Clave estable e irrepetible de este envío (ej. "cotizacion-goldpampa-2026-08-25"). '
  + 'Repetir la llamada con la misma clave devuelve el mensaje original en vez de mandar otro.';

const targetProperties = {
  chat_id: { type: 'integer', minimum: 1, description: 'ID del chat de WhatsPro.' },
  contact_id: { type: 'integer', minimum: 1, description: 'ID del contacto de WhatsPro.' },
  phone: { type: 'string', minLength: 5, maxLength: 40, description: 'Número en formato internacional sin símbolos, ej. 5493511234567. Sólo si no tenés chat_id ni contact_id.' },
};

export const messagingActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_chat_send_message',
    description:
      'Manda AHORA un mensaje de texto real de WhatsApp a un contacto. Es la herramienta correcta para contestarle a alguien: '
      + 'no uses whatspro_manage_scheduled_message para "programarlo en un minuto", eso agrega latencia y ensucia el tablero de programados. '
      + 'El mensaje llega a una persona real y no se puede deshacer: si el texto no te lo dictó el usuario palabra por palabra, mostráselo antes con dry_run: true. '
      + 'Fuera de la ventana de 24 h de WhatsApp el envío de texto libre puede rebotar; en ese caso el resultado vuelve con ok: false y el motivo.',
    inputSchema: {
      type: 'object',
      required: ['text', 'idempotency_key'],
      properties: {
        ...targetProperties,
        text: { type: 'string', minLength: 1, maxLength: 20000, description: 'Con párrafos separados por una línea en blanco cuando tiene más de dos o tres oraciones: WhatsApp muestra los saltos y un bloque largo se lee como un muro. Si viene largo y sin saltos, el servidor lo parte por oración.' },
        instance_id: { type: ['integer', 'null'], minimum: 1, description: 'Número desde el cual enviar. Por defecto, el del chat existente o la primera instancia conectada del equipo.' },
        quoted_message_id: { type: ['string', 'null'], maxLength: 255, description: 'ID de un mensaje del chat para responderlo citándolo.' },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80, description: IDEMPOTENCY_HELP },
        dry_run: { type: 'boolean', description: 'Devuelve destinatario, número emisor y texto resuelto SIN enviar nada.' },
      },
      anyOf: [{ required: ['chat_id'] }, { required: ['contact_id'] }, { required: ['phone'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_send_media',
    description:
      'Manda AHORA una imagen, video, documento (PDF) o nota de voz por WhatsApp. Pasá media_url (una URL pública) o media_base64. '
      + 'Mismo criterio que el envío de texto: llega a una persona real, exige idempotency_key y admite dry_run.',
    inputSchema: {
      type: 'object',
      required: ['mime_type', 'file_name', 'idempotency_key'],
      properties: {
        ...targetProperties,
        media_url: { type: 'string', maxLength: 2000, description: 'URL pública del archivo. Evolution la descarga.' },
        media_base64: { type: 'string', maxLength: 12000000, description: 'Contenido en base64 sin el prefijo data:. Usalo sólo si no hay URL.' },
        mime_type: { type: 'string', minLength: 3, maxLength: 120, description: 'Ej. image/jpeg, application/pdf, audio/ogg.' },
        file_name: { type: 'string', minLength: 1, maxLength: 200 },
        caption: { type: ['string', 'null'], maxLength: 2000, description: 'Texto al pie. No aplica a notas de voz.' },
        kind: { type: 'string', enum: ['image', 'video', 'document', 'audio'], description: 'Por defecto se deduce del mime_type. "audio" manda una nota de voz.' },
        instance_id: { type: ['integer', 'null'], minimum: 1 },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80, description: IDEMPOTENCY_HELP },
        dry_run: { type: 'boolean' },
      },
      anyOf: [{ required: ['chat_id'] }, { required: ['contact_id'] }, { required: ['phone'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_send_template',
    description:
      'Manda una plantilla WABA aprobada por Meta. Es LA ÚNICA forma de reabrir una conversación fuera de la ventana de 24 h de WhatsApp '
      + '(el texto libre rebota; la plantilla no). OJO: cada plantilla enviada la FACTURA Meta — cuesta plata real. '
      + 'Sale por una instancia WABA (conectada a Meta Cloud API), no por Evolution: si el equipo no tiene ninguna, la tool lo dice. '
      + 'Las plantillas disponibles con sus variables se listan con whatspro_list_records(resource="waba-templates"). '
      + 'Usá dry_run: true primero para ver el cuerpo con las variables resueltas y el destinatario sin enviar ni pagar nada.',
    inputSchema: {
      type: 'object',
      required: ['template_id', 'idempotency_key'],
      properties: {
        ...targetProperties,
        template_id: { type: 'integer', minimum: 1, description: 'ID de la plantilla (resource="waba-templates").' },
        variables: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Variables del cuerpo, indexadas por posición: {"1": "Juan", "2": "jueves"} rellena {{1}} y {{2}}.',
        },
        instance_id: { type: ['integer', 'null'], minimum: 1, description: 'Instancia WABA desde la que sale. Si el equipo tiene una sola conectada a Meta, se usa esa.' },
        idempotency_key: { type: 'string', minLength: 8, maxLength: 80, description: IDEMPOTENCY_HELP },
        dry_run: { type: 'boolean', description: 'Devuelve plantilla, cuerpo resuelto y destinatario SIN enviar (y sin costo).' },
      },
      anyOf: [{ required: ['chat_id'] }, { required: ['contact_id'] }, { required: ['phone'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_trigger_automation',
    description:
      'Dispara un flujo de automatización sobre un chat, como si el contacto hubiera entrado por el disparador. '
      + 'OJO: el flujo manda mensajes reales al cliente, y cuántos depende del flujo, no de vos. '
      + 'Consultá el flujo con whatspro_inspect_automation antes de dispararlo, y avisale al usuario qué va a salir.',
    inputSchema: {
      type: 'object',
      required: ['automation_id', 'confirm'],
      properties: {
        ...targetProperties,
        automation_id: { type: 'integer', minimum: 1 },
        confirm: { type: 'boolean', const: true, description: 'Obligatorio en true: el flujo escribe al cliente y no se puede frenar a mitad.' },
      },
      anyOf: [{ required: ['chat_id'] }, { required: ['contact_id'] }, { required: ['phone'] }],
      additionalProperties: false,
    },
  },
];

const targetSchema = {
  chat_id: z.number().int().positive().optional(),
  contact_id: z.number().int().positive().optional(),
  phone: z.string().trim().min(5).max(40).optional(),
};

const sendTextSchema = z.object({
  ...targetSchema,
  text: z.string().min(1).max(20000),
  instance_id: z.number().int().positive().nullable().optional(),
  quoted_message_id: z.string().max(255).nullable().optional(),
  idempotency_key: z.string().trim().min(8).max(80),
  dry_run: z.boolean().optional(),
}).refine(hasTarget, 'chat_id, contact_id or phone is required');

const sendMediaSchema = z.object({
  ...targetSchema,
  media_url: z.string().max(2000).optional(),
  media_base64: z.string().max(12_000_000).optional(),
  mime_type: z.string().min(3).max(120),
  file_name: z.string().min(1).max(200),
  caption: z.string().max(2000).nullable().optional(),
  kind: z.enum(['image', 'video', 'document', 'audio']).optional(),
  instance_id: z.number().int().positive().nullable().optional(),
  idempotency_key: z.string().trim().min(8).max(80),
  dry_run: z.boolean().optional(),
}).refine(hasTarget, 'chat_id, contact_id or phone is required')
  .refine((value) => Boolean(value.media_url || value.media_base64), 'media_url or media_base64 is required');

const sendTemplateSchema = z.object({
  ...targetSchema,
  template_id: z.number().int().positive(),
  variables: z.record(z.string(), z.string()).optional(),
  instance_id: z.number().int().positive().nullable().optional(),
  idempotency_key: z.string().trim().min(8).max(80),
  dry_run: z.boolean().optional(),
}).refine(hasTarget, 'chat_id, contact_id or phone is required');

const triggerSchema = z.object({
  ...targetSchema,
  automation_id: z.number().int().positive(),
  confirm: z.literal(true),
}).refine(hasTarget, 'chat_id, contact_id or phone is required');

function hasTarget(value: { chat_id?: number; contact_id?: number; phone?: string }) {
  return Boolean(value.chat_id || value.contact_id || value.phone);
}

function toJid(phone: string) {
  const clean = phone.replace(/\D/g, '');
  if (!clean) throw new Error(`"${phone}" no tiene ningún dígito: no es un número de WhatsApp.`);
  return `${clean}@s.whatsapp.net`;
}

type ResolvedTarget = { remoteJid: string; chatId: number | null; contactName: string | null };

/**
 * Resuelve a quién se le escribe. Un `phone` suelto puede no tener chat todavía
 * — es válido, el chat se crea al enviar — pero un `chat_id` o `contact_id` que
 * no sea del equipo tiene que fallar, no caer en otro destinatario.
 */
async function resolveTarget(
  context: GrokActionContext,
  data: { chat_id?: number; contact_id?: number; phone?: string },
): Promise<ResolvedTarget> {
  if (data.chat_id) {
    const chat = await db.query.chats.findFirst({
      where: and(eq(chats.id, data.chat_id), eq(chats.teamId, context.teamId)),
      columns: { id: true, remoteJid: true, name: true, pushName: true },
    });
    if (!chat) throw new Error('Chat not found.');
    return { remoteJid: chat.remoteJid, chatId: chat.id, contactName: chat.name ?? chat.pushName ?? null };
  }

  if (data.contact_id) {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, data.contact_id), eq(contacts.teamId, context.teamId)),
      with: { chat: { columns: { id: true, remoteJid: true, name: true, pushName: true } } },
    });
    if (!contact?.chat) throw new Error('Contact not found or it has no WhatsApp chat.');
    return {
      remoteJid: contact.chat.remoteJid,
      chatId: contact.chat.id,
      contactName: contact.name ?? contact.chat.name ?? null,
    };
  }

  const remoteJid = toJid(data.phone!);
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.teamId, context.teamId), eq(chats.remoteJid, remoteJid)),
    columns: { id: true, name: true, pushName: true },
  });
  return { remoteJid, chatId: chat?.id ?? null, contactName: chat?.name ?? chat?.pushName ?? null };
}

function describeRecipient(target: ResolvedTarget) {
  const phone = target.remoteJid.split('@')[0];
  return target.contactName ? `${target.contactName} (${phone})` : phone;
}

async function sendMessage(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'messagesSend');
  const data = parse(sendTextSchema, input);
  const target = await resolveTarget(context, data);

  if (data.dry_run) {
    const { instance } = await resolveSendingInstance(context.teamId, {
      instanceId: data.instance_id,
      remoteJid: target.remoteJid,
    });
    return {
      success: true,
      dry_run: true,
      sent: false,
      preview: {
        recipient: describeRecipient(target),
        remote_jid: target.remoteJid,
        chat_id: target.chatId,
        from_instance: instance.instanceName,
        text: asegurarParrafos(data.text),
        creates_new_chat: target.chatId === null,
      },
    };
  }

  let quotedMessage: { id: string; text?: string | null } | null = null;
  if (data.quoted_message_id) {
    const quoted = await db.query.messages.findFirst({
      where: eq(messages.id, data.quoted_message_id),
      columns: { id: true, text: true, chatId: true },
    });
    if (!quoted || (target.chatId && quoted.chatId !== target.chatId)) {
      throw new Error('quoted_message_id no pertenece a este chat.');
    }
    quotedMessage = { id: quoted.id, text: quoted.text };
  }

  const result = await sendTeamTextMessage(context.teamId, {
    recipientJid: target.remoteJid,
    text: asegurarParrafos(data.text),
    instanceId: data.instance_id,
    quotedMessage,
    origin: 'mcp',
    idempotencyKey: data.idempotency_key,
  });

  if (!result.idempotent) await audit(context, 'GROK_MESSAGE_SENT', result.message.id);

  return {
    success: result.ok,
    ok: result.ok,
    idempotent: result.idempotent,
    sent: result.ok && !result.idempotent,
    recipient: describeRecipient(target),
    chat_id: result.chatId,
    from_instance: result.instance.instanceName || undefined,
    error: result.errorMessage,
    message: result.message,
  };
}

async function sendMedia(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'messagesSend');
  const data = parse(sendMediaSchema, input);
  const target = await resolveTarget(context, data);
  const kind = data.kind ?? mediaKindFromMimetype(data.mime_type);

  if (data.dry_run) {
    const { instance } = await resolveSendingInstance(context.teamId, {
      instanceId: data.instance_id,
      remoteJid: target.remoteJid,
    });
    return {
      success: true,
      dry_run: true,
      sent: false,
      preview: {
        recipient: describeRecipient(target),
        remote_jid: target.remoteJid,
        chat_id: target.chatId,
        from_instance: instance.instanceName,
        kind,
        file_name: data.file_name,
        mime_type: data.mime_type,
        source: data.media_url ? 'url' : 'base64',
        caption: data.caption ?? null,
      },
    };
  }

  const result = await sendTeamMediaMessage(context.teamId, {
    recipientJid: target.remoteJid,
    mediaUrl: data.media_url ?? null,
    fileBase64: data.media_base64 ?? null,
    mimeType: data.mime_type,
    fileName: data.file_name,
    caption: data.caption ?? null,
    kind,
    instanceId: data.instance_id,
    origin: 'mcp',
    idempotencyKey: data.idempotency_key,
  });

  if (!result.idempotent) await audit(context, 'GROK_MESSAGE_MEDIA_SENT', result.message.id);

  return {
    success: result.ok,
    ok: result.ok,
    idempotent: result.idempotent,
    sent: result.ok && !result.idempotent,
    recipient: describeRecipient(target),
    chat_id: result.chatId,
    kind,
    error: result.errorMessage,
    message: result.message,
  };
}

/**
 * Las plantillas salen por Meta Cloud API, no por Evolution: la instancia tiene
 * que tener metaToken y metaPhoneNumberId. Si no piden una explícita y el
 * equipo tiene exactamente una WABA conectada, se usa esa; con cero o varias,
 * se falla explicando qué mandar.
 */
async function resolveWabaInstanceId(context: GrokActionContext, instanceId?: number | null) {
  if (instanceId) return instanceId;
  const candidates = await db.query.evolutionInstances.findMany({
    where: eq(evolutionInstances.teamId, context.teamId),
    columns: { id: true, instanceName: true, metaToken: true, metaPhoneNumberId: true },
  });
  const waba = candidates.filter((row) => row.metaToken && row.metaPhoneNumberId);
  if (waba.length === 1) return waba[0].id;
  if (!waba.length) {
    throw new Error('El equipo no tiene ninguna instancia WABA conectada a Meta: las plantillas no pueden salir. Conectá una desde Ajustes o usá whatspro_chat_send_message si la conversación está dentro de la ventana de 24 h.');
  }
  throw new Error(
    `El equipo tiene ${waba.length} instancias WABA: elegí una con instance_id. Candidatas: ${waba.map((row) => `${row.id} (${row.instanceName})`).join(', ')}.`,
  );
}

async function sendTemplate(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'messagesSend');
  const data = parse(sendTemplateSchema, input);
  const target = await resolveTarget(context, data);
  const instanceId = await resolveWabaInstanceId(context, data.instance_id);

  if (data.dry_run) {
    const template = await db.query.wabaTemplates.findFirst({
      where: and(eq(wabaTemplates.id, data.template_id), eq(wabaTemplates.teamId, context.teamId)),
      columns: { id: true, name: true, language: true, status: true, components: true },
    });
    if (!template) throw new Error('Template not found. Listalas con whatspro_list_records(resource="waba-templates").');
    const bodyText: string = (template.components as Array<Record<string, any>>)?.find((c) => c.type === 'BODY')?.text ?? template.name;
    const vars = data.variables ?? {};
    const resolved = bodyText.replace(/\{\{(\d+)\}\}/g, (_m: string, num: string) =>
      vars[num] || vars[Object.keys(vars)[parseInt(num, 10) - 1]] || `{{${num}}}`);
    const missing = resolved.match(/\{\{\d+\}\}/g) ?? [];
    return {
      success: true,
      dry_run: true,
      sent: false,
      preview: {
        recipient: describeRecipient(target),
        remote_jid: target.remoteJid,
        template: { id: template.id, name: template.name, language: template.language, status: template.status },
        body: resolved,
        missing_variables: missing,
        instance_id: instanceId,
        billing_note: 'Enviar esta plantilla tiene costo: Meta factura cada plantilla.',
      },
    };
  }

  const result = await sendTeamTemplateMessage(context.teamId, {
    recipientJid: target.remoteJid,
    templateId: data.template_id,
    instanceId,
    variables: data.variables ?? null,
    origin: 'mcp',
    idempotencyKey: data.idempotency_key,
  });

  if (!result.idempotent) await audit(context, 'GROK_TEMPLATE_SENT', result.message.id);

  return {
    success: result.ok,
    ok: result.ok,
    idempotent: result.idempotent,
    sent: result.ok && !result.idempotent,
    recipient: describeRecipient(target),
    chat_id: result.chatId,
    from_instance: result.instance.instanceName || undefined,
    message: result.message,
  };
}

async function triggerAutomation(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'automation');
  const data = parse(triggerSchema, input);
  const target = await resolveTarget(context, data);

  const automation = await db.query.automations.findFirst({
    where: and(eq(automations.id, data.automation_id), eq(automations.teamId, context.teamId)),
    columns: { id: true, name: true, isActive: true },
  });
  if (!automation) throw new Error('Automation not found.');

  const { instance } = await resolveSendingInstance(context.teamId, { remoteJid: target.remoteJid });

  let chatId = target.chatId;
  if (!chatId) {
    // El motor de automatizaciones necesita un chat existente: no crea uno.
    const chat = await db.query.chats.findFirst({
      where: and(eq(chats.teamId, context.teamId), eq(chats.remoteJid, target.remoteJid)),
      columns: { id: true },
      orderBy: desc(chats.id),
    });
    if (!chat) throw new Error(`No hay ningún chat abierto con ${describeRecipient(target)}: mandale un mensaje primero.`);
    chatId = chat.id;
  }

  const triggered = await triggerAutomationManually(
    context.teamId,
    chatId,
    target.remoteJid,
    instance.id,
    { automationId: data.automation_id },
  );

  if (triggered) await audit(context, 'GROK_AUTOMATION_TRIGGERED', automation.id);

  return {
    success: triggered,
    triggered,
    automation: { id: automation.id, name: automation.name, is_active: automation.isActive },
    recipient: describeRecipient(target),
    chat_id: chatId,
    error: triggered ? null : 'El motor no pudo disparar el flujo: revisá que la instancia esté conectada y que el flujo tenga un nodo de inicio.',
  };
}

export async function executeMessagingAction(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  try {
    if (name === 'whatspro_chat_send_message') return await sendMessage(input, context);
    if (name === 'whatspro_chat_send_media') return await sendMedia(input, context);
    if (name === 'whatspro_chat_send_template') return await sendTemplate(input, context);
    if (name === 'whatspro_chat_trigger_automation') return await triggerAutomation(input, context);
  } catch (error) {
    // MessagingError trae el motivo redactado para un humano ("el equipo no
    // tiene ninguna instancia conectada"); dejarlo pasar como error genérico
    // haría que el modelo reintente en lugar de avisar.
    if (error instanceof MessagingError) throw new Error(error.message);
    throw error;
  }
  throw new Error(`Unknown messaging action: ${name}`);
}
