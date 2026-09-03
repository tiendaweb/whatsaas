import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  messages,
  teamCustomers,
  teamTaskItems,
  teamTaskMedia,
  teamTaskProjects,
} from '@/lib/db/schema';
import { resolveMediaUrl } from '@/lib/media-url';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/**
 * Vincular un archivo que YA está en un chat a un cliente, una tarea o un
 * proyecto.
 *
 * El conector podía leer adjuntos y no adjuntar nada: subir sólo existía dentro
 * de App Maker. La consecuencia concreta era que los comprobantes que el
 * cliente mandaba por WhatsApp había que transcribirlos a mano a las notas.
 *
 * Esto NO sube bytes: crea la referencia al archivo que ya está guardado. Es la
 * versión barata que cubre el caso frecuente —comprobantes, capturas, fotos de
 * obra— sin construir un endpoint de subida. Un `upload` de verdad sigue
 * faltando y es otra herramienta.
 */

const OWNER_TYPES = ['customer', 'contact', 'task', 'project'] as const;

export const attachmentsActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_files_link_chat_media',
    description:
      'Vincula un archivo que ya llegó por WhatsApp (comprobante, captura, foto, PDF) a un cliente, contacto, tarea o proyecto, '
      + 'para que quede en su ficha en vez de perdido en la conversación. Necesitás el message_id del mensaje que trae el adjunto: '
      + 'sacalo con whatspro_chat_media_list. No copia el archivo, sólo lo referencia — si lo borrás de la ficha, el mensaje sigue intacto.',
    inputSchema: {
      type: 'object',
      required: ['message_id', 'owner_type', 'owner_id'],
      properties: {
        message_id: { type: 'string', minLength: 1, maxLength: 255, description: 'ID del mensaje de WhatsApp que contiene el adjunto.' },
        owner_type: { type: 'string', enum: [...OWNER_TYPES], description: 'A qué se lo vinculás.' },
        owner_id: { type: 'integer', minimum: 1 },
        file_name: { type: 'string', maxLength: 255, description: 'Nombre con el que se guarda. Por defecto se deduce del mensaje.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_files_unlink',
    description: 'Quita un archivo vinculado de una ficha. No borra el mensaje original ni el archivo.',
    inputSchema: {
      type: 'object',
      required: ['media_id', 'confirm'],
      properties: {
        media_id: { type: 'integer', minimum: 1 },
        confirm: { type: 'boolean', const: true },
      },
      additionalProperties: false,
    },
  },
];

export const attachmentsReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_files_linked',
    description: 'Lista los archivos vinculados a un cliente, contacto, tarea o proyecto, con su origen (subido a mano o traído de un chat).',
    inputSchema: {
      type: 'object',
      required: ['owner_type', 'owner_id'],
      properties: {
        owner_type: { type: 'string', enum: [...OWNER_TYPES] },
        owner_id: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
];

const linkSchema = z.object({
  message_id: z.string().trim().min(1).max(255),
  owner_type: z.enum(OWNER_TYPES),
  owner_id: z.number().int().positive(),
  file_name: z.string().max(255).optional(),
});

const unlinkSchema = z.object({
  media_id: z.number().int().positive(),
  confirm: z.literal(true),
});

const listSchema = z.object({
  owner_type: z.enum(OWNER_TYPES),
  owner_id: z.number().int().positive(),
});

/** Cada tipo de dueño vive en su plugin y con su permiso. */
async function assertOwner(context: GrokActionContext, tipo: typeof OWNER_TYPES[number], id: number) {
  if (tipo === 'customer') {
    await assertPermission(context, 'customersWrite', 'customers');
    const fila = await db.query.teamCustomers.findFirst({
      where: and(eq(teamCustomers.id, id), eq(teamCustomers.teamId, context.teamId)),
      columns: { id: true, name: true },
    });
    if (!fila) throw new Error('El cliente no existe en este equipo.');
    return fila.name;
  }
  if (tipo === 'contact') {
    await assertPermission(context, 'contacts');
    const fila = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, id), eq(contacts.teamId, context.teamId)),
      columns: { id: true, name: true },
    });
    if (!fila) throw new Error('El contacto no existe en este equipo.');
    return fila.name;
  }
  if (tipo === 'task') {
    await assertPermission(context, 'tasksWrite', 'tasks');
    const fila = await db.query.teamTaskItems.findFirst({
      where: and(eq(teamTaskItems.id, id), eq(teamTaskItems.teamId, context.teamId)),
      columns: { id: true, title: true },
    });
    if (!fila) throw new Error('La tarea no existe en este equipo.');
    return fila.title;
  }
  await assertPermission(context, 'tasksWrite', 'tasks');
  const fila = await db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.id, id), eq(teamTaskProjects.teamId, context.teamId)),
    columns: { id: true, name: true },
  });
  if (!fila) throw new Error('El proyecto no existe en este equipo.');
  return fila.name;
}

function nombreSugerido(mensaje: { mediaUrl: string | null; mediaMimetype: string | null; text: string | null; id: string }) {
  const desdeUrl = (mensaje.mediaUrl ?? '').split('/').pop()?.split('?')[0];
  if (desdeUrl && desdeUrl.includes('.')) return desdeUrl.slice(0, 255);
  const extension = (mensaje.mediaMimetype ?? '').split('/')[1]?.split(';')[0] || 'bin';
  return `${(mensaje.text || 'adjunto').slice(0, 40).replace(/[^\w.-]+/g, '_')}-${mensaje.id.slice(0, 8)}.${extension}`;
}

async function vincularMedia(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(linkSchema, input);
  const nombreDueno = await assertOwner(context, data.owner_type, data.owner_id);

  // El mensaje tiene que ser de un chat del equipo: `messages` no tiene teamId,
  // así que la pertenencia se comprueba por el chat.
  const mensaje = await db
    .select({
      id: messages.id,
      mediaUrl: messages.mediaUrl,
      mediaMimetype: messages.mediaMimetype,
      mediaFileLength: messages.mediaFileLength,
      text: messages.text,
      chatId: messages.chatId,
      remoteJid: chats.remoteJid,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(messages.id, data.message_id), eq(chats.teamId, context.teamId)))
    .limit(1)
    .then((filas) => filas[0]);

  if (!mensaje) throw new Error('El mensaje no existe o no pertenece a este equipo.');
  if (!mensaje.mediaUrl) throw new Error('Ese mensaje no tiene ningún archivo adjunto.');

  const url = mensaje.mediaUrl;
  const fileName = data.file_name?.trim() || nombreSugerido(mensaje);

  // Volver a vincular el mismo archivo al mismo dueño no crea un duplicado.
  const existente = await db.query.teamTaskMedia.findFirst({
    where: and(
      eq(teamTaskMedia.teamId, context.teamId),
      eq(teamTaskMedia.ownerType, data.owner_type),
      eq(teamTaskMedia.ownerId, data.owner_id),
      eq(teamTaskMedia.url, url),
    ),
  });
  if (existente) {
    return { success: true, already_linked: true, media: { ...existente, url: resolveMediaUrl(existente.url) } };
  }

  const [media] = await db.insert(teamTaskMedia).values({
    teamId: context.teamId,
    ownerType: data.owner_type,
    ownerId: data.owner_id,
    url,
    fileName,
    mimeType: mensaje.mediaMimetype,
    size: mensaje.mediaFileLength ? Number(mensaje.mediaFileLength) || null : null,
    source: 'chat',
    metadata: { messageId: mensaje.id, chatId: mensaje.chatId, remoteJid: mensaje.remoteJid },
    createdBy: context.userId,
  }).returning();

  await audit(context, 'GROK_FILE_LINKED', media.id);
  return {
    success: true,
    already_linked: false,
    vinculado_a: `${data.owner_type} · ${nombreDueno}`,
    media: { ...media, url: resolveMediaUrl(media.url) },
  };
}

async function desvincularMedia(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(unlinkSchema, input);
  const media = await db.query.teamTaskMedia.findFirst({
    where: and(eq(teamTaskMedia.id, data.media_id), eq(teamTaskMedia.teamId, context.teamId)),
  });
  if (!media) throw new Error('El archivo vinculado no existe en este equipo.');
  await assertOwner(context, media.ownerType as typeof OWNER_TYPES[number], media.ownerId);

  await db.delete(teamTaskMedia)
    .where(and(eq(teamTaskMedia.id, data.media_id), eq(teamTaskMedia.teamId, context.teamId)));
  await audit(context, 'GROK_FILE_UNLINKED', data.media_id);
  return { success: true, deleted: true };
}

async function listarVinculados(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(listSchema, input);
  await assertOwner(context, data.owner_type, data.owner_id);

  const filas = await db.select().from(teamTaskMedia)
    .where(and(
      eq(teamTaskMedia.teamId, context.teamId),
      eq(teamTaskMedia.ownerType, data.owner_type),
      eq(teamTaskMedia.ownerId, data.owner_id),
    ))
    .orderBy(desc(teamTaskMedia.createdAt));

  return {
    object: 'linked_files',
    count: filas.length,
    data: filas.map((fila) => ({
      media_id: fila.id,
      file_name: fila.fileName,
      mime_type: fila.mimeType,
      size: fila.size,
      source: fila.source,
      url: resolveMediaUrl(fila.url),
      created_at: fila.createdAt.toISOString(),
    })),
  };
}

export async function executeAttachmentsTool(
  name: string,
  input: Record<string, unknown>,
  context: GrokActionContext,
) {
  if (name === 'whatspro_files_link_chat_media') return vincularMedia(input, context);
  if (name === 'whatspro_files_unlink') return desvincularMedia(input, context);
  if (name === 'whatspro_files_linked') return listarVinculados(input, context);
  throw new Error(`Unknown attachments tool: ${name}`);
}
