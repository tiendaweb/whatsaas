import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { and, count, desc, eq, gte, ilike, isNotNull, lte, max, min, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { chats, contacts, departmentMembers, messages, teamMembers, teamTaskMedia } from '@/lib/db/schema';
import { getAudioInsightsByMessageIds } from '@/lib/audio-insights';
import { resolveMediaFilePath, statMediaFile } from '@/lib/media-file-path';
import { canSeeAllChats, getChatVisibility, type MemberPermissions } from '@/lib/permissions';
import { MEDIA_LINK_MAX_TTL_SECONDS, crearEnlaceFirmado } from '@/lib/plugins/grok-connector/server/media-link';
import {
  assertPermission,
  audit,
  mcpContent,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/**
 * Tope duro para devolver un archivo embebido en la respuesta MCP.
 *
 * base64 infla el binario ~33%, así que 5 MB de archivo son ~6,7 MB de texto
 * plano viajando dentro de un JSON-RPC. Más que eso no lo aguanta ni el
 * contexto del modelo ni la mayoría de los clientes MCP (cortan la respuesta o
 * cierran la conexión). Por encima del tope devolvemos metadata + explicación,
 * nunca el archivo.
 */
export const MEDIA_MAX_INLINE_BYTES = 5 * 1024 * 1024;

/** Recorte al devolver un documento de texto: alcanza para leerlo sin comerse el contexto. */
const TEXT_DOCUMENT_MAX_CHARS = 20000;

const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 100;

/** De qué puede colgar un adjunto subido desde la app (tabla team_task_media).
 * Declarado ACÁ ARRIBA a propósito: lo usa el JSON Schema de las tools, que se
 * evalúa al cargar el módulo — si se declara más abajo, revienta por TDZ. */
const FILE_OWNER_TYPES = ['task', 'project', 'workspace', 'customer'] as const;

const MEDIA_TYPES = ['image', 'audio', 'video', 'document', 'sticker'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

/** Formatos de imagen que los clientes MCP saben mostrar. */
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Formatos de audio que los clientes MCP saben reproducir/transcribir. */
const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'audio/flac',
  'audio/x-wav',
]);

/** Documentos que se pueden leer como texto plano y devolver tal cual. */
const TEXT_DOCUMENT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/csv',
  'text/tab-separated-values',
  'text/html',
  'text/xml',
  'application/xml',
  'application/json',
  'application/x-ndjson',
]);

const TEXT_DOCUMENT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.ndjson',
  '.log', '.xml', '.html', '.htm', '.yml', '.yaml', '.srt', '.vtt',
]);

/** Misma tabla que usa app/api/media/route.ts para tapar mimetypes faltantes. */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.html': 'text/html',
};

function parseSizeBytes(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}

function normalizeMimeType(raw: string | null | undefined) {
  return (raw || '').split(';')[0]!.trim().toLowerCase();
}

/**
 * WhatsApp manda los audios como `audio/ogg; codecs=opus`. Muchos clientes MCP
 * rechazan el bloque si el mimeType trae parámetros, así que lo dejamos en
 * `audio/ogg` pelado. De paso, si el mimetype vino vacío o como
 * application/octet-stream, lo deducimos de la extensión del archivo.
 */
function cleanMimeType(raw: string | null | undefined, filePath: string | null) {
  const base = normalizeMimeType(raw);
  if (base && base !== 'application/octet-stream') return base;
  const extension = filePath ? path.extname(filePath).toLowerCase() : '';
  return EXTENSION_MIME_TYPES[extension] || base || 'application/octet-stream';
}

/** Misma clasificación que usan app/api/chats/media y el plugin Archivos, más stickers. */
function classifyMedia(messageType: string | null, mimeType: string | null): MediaType {
  if (messageType === 'imageMessage') return 'image';
  if (messageType === 'videoMessage') return 'video';
  if (messageType === 'stickerMessage') return 'sticker';
  if (messageType === 'documentMessage') return 'document';
  if (messageType === 'audioMessage' || normalizeMimeType(mimeType).startsWith('audio/')) return 'audio';
  return 'document';
}

function inferFileName(row: {
  messageType: string | null;
  text: string | null;
  mediaCaption: string | null;
  mediaUrl: string | null;
}) {
  if (row.messageType === 'documentMessage') {
    const explicit = row.text?.trim() || row.mediaCaption?.trim();
    if (explicit && explicit.length <= 255) return explicit;
  }
  if (row.mediaUrl) {
    const segment = row.mediaUrl.split('/').filter(Boolean).pop();
    if (segment && segment.includes('.')) return segment.slice(0, 255);
  }
  return null;
}

function isTextDocument(mimeType: string, fileName: string | null, absolutePath: string) {
  if (TEXT_DOCUMENT_MIME_TYPES.has(mimeType)) return true;
  if (mimeType.startsWith('text/')) return true;
  const extension = path.extname(fileName || absolutePath).toLowerCase();
  return TEXT_DOCUMENT_EXTENSIONS.has(extension);
}

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function formatBytes(bytes: number | null) {
  if (bytes == null) return 'tamaño desconocido';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatSeconds(seconds: number | null) {
  if (seconds == null || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

/* ------------------------------------------------------------------ */
/* Helpers de consulta                                                 */
/* ------------------------------------------------------------------ */

function typeCondition(type: MediaType): SQL {
  if (type === 'image') return eq(messages.messageType, 'imageMessage');
  if (type === 'video') return eq(messages.messageType, 'videoMessage');
  if (type === 'sticker') return eq(messages.messageType, 'stickerMessage');
  if (type === 'document') return eq(messages.messageType, 'documentMessage');
  return or(eq(messages.messageType, 'audioMessage'), ilike(messages.mediaMimetype, 'audio/%'))!;
}

const anyMediaCondition = or(...MEDIA_TYPES.map(typeCondition))!;

/**
 * Clasificación en SQL para el resumen. Los literales van escritos dentro del
 * template (no interpolados): si fueran parámetros, el GROUP BY que repite esta
 * expresión no matchearía y Postgres rechazaría la consulta.
 */
const mediaTypeExpression = sql<string>`case
  when ${messages.messageType} = 'imageMessage' then 'image'
  when ${messages.messageType} = 'videoMessage' then 'video'
  when ${messages.messageType} = 'stickerMessage' then 'sticker'
  when ${messages.messageType} = 'documentMessage' then 'document'
  when ${messages.messageType} = 'audioMessage' or lower(${messages.mediaMimetype}) like 'audio/%' then 'audio'
  else 'document'
end`;

type ChatTarget = {
  chatId: number;
  remoteJid: string;
  chatName: string | null;
  contactId: number | null;
  contactName: string | null;
  assignedUserId: number | null;
  assignedDepartmentId: number | null;
};

/**
 * `signedLinks` existe por los conectores que descartan todo bloque que no sea
 * texto (hoy, el de ChatGPT). Para ellos el bloque `image`/`audio`/`resource`
 * nunca llega, y el `resource_link` tampoco sirve porque apunta a una URL que
 * exige la cabecera `Authorization` de la conexión — que ese cliente no manda.
 * Resultado: el modelo recibía la metadata y jamás los bytes. Con la bandera
 * encendida, la respuesta incluye ADEMÁS un enlace firmado y efímero, que se
 * abre sin cabeceras y sigue revalidando equipo, permiso y visibilidad del chat.
 */
type MediaToolContext = GrokActionContext & { privateMediaBaseUrl?: string; signedLinks?: boolean };

async function assertChatVisible(context: GrokActionContext, target: ChatTarget) {
  const member = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, context.teamId), eq(teamMembers.userId, context.userId)),
    columns: { role: true, permissions: true },
  });
  if (!member) throw new Error('Permission denied: contacts');
  const permissions = member.permissions as MemberPermissions | null;
  if (canSeeAllChats(member.role, permissions)) return;
  if (target.assignedUserId === context.userId) return;
  if (getChatVisibility(member.role, permissions) === 'department' && target.assignedDepartmentId) {
    const membership = await db.query.departmentMembers.findFirst({
      where: and(
        eq(departmentMembers.userId, context.userId),
        eq(departmentMembers.departmentId, target.assignedDepartmentId),
      ),
      columns: { id: true },
    });
    if (membership) return;
  }
  throw new Error('Chat not found.');
}

/** Resuelve el chat del equipo a partir de contact_id o chat_id. Nunca cruza equipos. */
async function resolveChatTarget(
  context: GrokActionContext,
  reference: { contact_id?: number; chat_id?: number },
): Promise<ChatTarget> {
  if (reference.contact_id) {
    const contact = await db.query.contacts.findFirst({
      where: and(eq(contacts.id, reference.contact_id), eq(contacts.teamId, context.teamId)),
      columns: { id: true, name: true, chatId: true, assignedUserId: true, assignedDepartmentId: true },
      with: { chat: { columns: { id: true, remoteJid: true, name: true, pushName: true } } },
    });
    if (!contact?.chat) throw new Error('Contact not found.');
    const target = {
      chatId: contact.chat.id,
      remoteJid: contact.chat.remoteJid,
      chatName: contact.chat.name || contact.chat.pushName || null,
      contactId: contact.id,
      contactName: contact.name,
      assignedUserId: contact.assignedUserId,
      assignedDepartmentId: contact.assignedDepartmentId,
    };
    await assertChatVisible(context, target);
    return target;
  }

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, reference.chat_id!), eq(chats.teamId, context.teamId)),
    columns: { id: true, remoteJid: true, name: true, pushName: true },
  });
  if (!chat) throw new Error('Chat not found.');

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, context.teamId), eq(contacts.chatId, chat.id)),
    columns: { id: true, name: true, assignedUserId: true, assignedDepartmentId: true },
  });

  const target = {
    chatId: chat.id,
    remoteJid: chat.remoteJid,
    chatName: chat.name || chat.pushName || null,
    contactId: contact?.id ?? null,
    contactName: contact?.name ?? null,
    assignedUserId: contact?.assignedUserId ?? null,
    assignedDepartmentId: contact?.assignedDepartmentId ?? null,
  };
  await assertChatVisible(context, target);
  return target;
}

/* ------------------------------------------------------------------ */
/* Esquemas                                                            */
/* ------------------------------------------------------------------ */

const isoDateSchema = z.string().trim().min(4).max(40).transform((value, ctx) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    ctx.addIssue({ code: 'custom', message: 'debe ser una fecha ISO 8601 válida (ej. 2026-08-01 o 2026-08-01T10:00:00Z)' });
    return z.NEVER;
  }
  return parsed;
});

const chatReferenceShape = {
  contact_id: z.number().int().positive().optional(),
  chat_id: z.number().int().positive().optional(),
};

const listSchema = z.object({
  ...chatReferenceShape,
  type: z.enum(['all', ...MEDIA_TYPES]).optional(),
  from_me: z.boolean().optional(),
  since: isoDateSchema.optional(),
  until: isoDateSchema.optional(),
  limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
}).superRefine((data, ctx) => {
  if (data.contact_id == null && data.chat_id == null) {
    ctx.addIssue({ code: 'custom', message: 'contact_id o chat_id es obligatorio', path: ['contact_id'] });
  }
});

const getSchema = z.object({
  message_id: z.string().trim().min(1).max(255),
});

const summarySchema = z.object({
  ...chatReferenceShape,
  since: isoDateSchema.optional(),
  until: isoDateSchema.optional(),
}).superRefine((data, ctx) => {
  if (data.contact_id == null && data.chat_id == null) {
    ctx.addIssue({ code: 'custom', message: 'contact_id o chat_id es obligatorio', path: ['contact_id'] });
  }
});

/* ------------------------------------------------------------------ */
/* Herramientas de lectura                                             */
/* ------------------------------------------------------------------ */

const chatReferenceProperties = {
  contact_id: { type: 'integer', minimum: 1, description: 'ID del contacto de WhatsPro (el que devuelve whatspro_list_records con resource="contacts"). Alternativa a chat_id.' },
  chat_id: { type: 'integer', minimum: 1, description: 'ID del chat de WhatsPro (resource="chats"). Alternativa a contact_id.' },
};

export const mediaReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_chat_media_list',
    description:
      'Lista los archivos que se mandaron en UNA conversación de WhatsApp (fotos, audios, videos, documentos y stickers), del más nuevo al más viejo, con el message_id que después necesitás para abrirlos con whatspro_chat_media_get. Es el paso 1 obligatorio: en el historial de mensajes la media aparece como "[imageMessage]" o "[audioMessage]" y no se puede saber cuál es cuál sin esta herramienta. De cada archivo devuelve message_id, type (image/audio/video/document/sticker), mime_type, caption (el epígrafe que escribió la persona), seconds y is_voice_note para audios y videos, size_bytes, file_name para documentos, from_me (true = lo mandamos nosotros, false = lo mandó el cliente), timestamp, y available: true|false según si el archivo TODAVÍA EXISTE en el disco del servidor (hay mensajes viejos cuyo archivo ya se borró; si available es false, whatspro_chat_media_get no lo va a poder abrir y no hay que prometerle al usuario que se puede mirar). Ejemplos de pedidos que se resuelven empezando por acá: "fijate qué fotos mandó Hernán esta semana", "¿cuántos audios me dejó este cliente?", "buscá el comprobante que mandó ayer", "mirá la foto que mandó y decime qué medidas tiene el cartel" (listás con type="image" y from_me=false, agarrás el message_id más reciente y lo abrís con whatspro_chat_media_get). Podés acotar por tipo, por quién lo mandó y por fechas. Devuelve 30 ítems por defecto y como máximo 100: cuando hay más, la respuesta te dice total y omitted, nunca corta en silencio; si quedaron cosas afuera, volvé a llamar con since/until o con un type más específico.',
    inputSchema: {
      type: 'object',
      properties: {
        ...chatReferenceProperties,
        type: {
          type: 'string',
          enum: ['all', ...MEDIA_TYPES],
          description: 'Filtra por tipo de archivo. all (por defecto) trae todo; image = fotos; audio = audios y notas de voz; video = videos; document = PDFs, planillas, comprobantes y demás adjuntos; sticker = figuritas.',
        },
        from_me: {
          type: 'boolean',
          description: 'true = solo lo que mandamos nosotros desde WhatsPro; false = solo lo que mandó el cliente. Ausente = ambos. Para "qué me mandó el cliente" usá false.',
        },
        since: { type: 'string', description: 'Fecha ISO 8601 (ej. "2026-08-01" o "2026-08-01T10:00:00Z"). Solo archivos de esa fecha en adelante.' },
        until: { type: 'string', description: 'Fecha ISO 8601. Solo archivos hasta esa fecha inclusive.' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST_LIMIT, description: `Cuántos archivos devolver, del más nuevo al más viejo. Por defecto ${DEFAULT_LIST_LIMIT}, máximo ${MAX_LIST_LIMIT}.` },
      },
      anyOf: [{ required: ['contact_id'] }, { required: ['chat_id'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_media_get',
    description:
      'Abre UN archivo de una conversación de WhatsApp y lo entrega para poder utilizarlo de verdad. Se identifica solo por message_id, nunca por rutas. Las FOTOS/STICKERS y AUDIOS compatibles vuelven embebidos; los documentos de texto vuelven como contenido; y todos los archivos disponibles —incluidos videos, PDF, Office y ZIP— incluyen una descarga privada protegida por el mismo Bearer de la conexión. Esa URL no es pública, no usa cookies y vuelve a validar equipo, permiso y visibilidad del chat al descargar. Límite para contenido embebido: ' + `${Math.round(MEDIA_MAX_INLINE_BYTES / (1024 * 1024))} MB` + '. Los archivos mayores siguen pudiendo descargarse en privado. Si available=false, el archivo ya no existe y no se debe inventar su contenido.',
    inputSchema: {
      type: 'object',
      required: ['message_id'],
      properties: {
        message_id: {
          type: 'string',
          minLength: 1,
          maxLength: 255,
          description: 'ID del mensaje de WhatsApp que contiene el archivo, tal cual lo devuelve whatspro_chat_media_list en message_id (ej. "AC6B4068BB46C9DAD49761AFF682C810"). Solo funciona con mensajes de chats de tu propio equipo. NO es una ruta de archivo ni una URL: esta herramienta no acepta rutas.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_media_summary',
    description:
      'Resumen rápido de TODA la media de una conversación, sin traer archivo por archivo: cuántas fotos, audios, videos, documentos y stickers hay, cuántos mandó el cliente y cuántos mandamos nosotros, cuántos minutos de audio hay en total, y las fechas del primero y del último archivo de cada tipo. Sirve para decidir si vale la pena ir a mirar antes de gastar llamadas: si el cliente mandó 40 audios y 12 fotos, primero mirás el resumen y después listás con whatspro_chat_media_list acotando por tipo y fechas. Responde preguntas como "¿este cliente manda muchos audios?", "¿desde cuándo nos manda comprobantes?", "¿cuánto audio acumulado tengo de Hernán?". Es una sola consulta agregada, así que es barata incluso en chats con miles de archivos. OJO: para que sea barata NO verifica si los archivos siguen existiendo en el disco (eso lo dice available en whatspro_chat_media_list), así que los números son "lo que quedó registrado en la conversación", no necesariamente lo que se puede abrir hoy.',
    inputSchema: {
      type: 'object',
      properties: {
        ...chatReferenceProperties,
        since: { type: 'string', description: 'Fecha ISO 8601 opcional: cuenta solo desde esa fecha en adelante.' },
        until: { type: 'string', description: 'Fecha ISO 8601 opcional: cuenta solo hasta esa fecha inclusive.' },
      },
      anyOf: [{ required: ['contact_id'] }, { required: ['chat_id'] }],
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_chat_media_link',
    description:
      'Devuelve un ENLACE temporal y firmado para una o varias imágenes (o cualquier archivo) de una conversación, en vez del binario embebido. Sirve para cuando necesitás la URL en sí: ponerla en un informe HTML que estás generando, mostrar una galería, o pasársela a un paso que descarga por su cuenta. El enlace NO es público: sólo funciona con su firma, vence solo (15 minutos por defecto, máximo 60) y al abrirse vuelve a validar equipo, permiso y visibilidad del chat. Aun así, mientras dura es una credencial: quien tenga el link puede abrirlo, así que no lo pegues en lugares donde quede registrado de forma permanente ni se lo pases a terceros. Si lo que querés es MIRAR la imagen vos mismo, no uses esto: usá whatspro_chat_media_get, que te la entrega embebida y sin exponer ninguna URL. Los message_id salen de whatspro_chat_media_list.',
    inputSchema: {
      type: 'object',
      required: ['message_ids'],
      properties: {
        message_ids: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: { type: 'string', minLength: 1, maxLength: 255 },
          description: 'Ids de los mensajes con el archivo, tal como los devuelve whatspro_chat_media_list.',
        },
        ttl_seconds: {
          type: 'integer',
          minimum: 60,
          maximum: MEDIA_LINK_MAX_TTL_SECONDS,
          description: `Cuánto vive el enlace, en segundos. Por defecto 900 (15 min), máximo ${MEDIA_LINK_MAX_TTL_SECONDS}. Pedí el mínimo que te sirva.`,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_files_list',
    description:
      'Lista los ARCHIVOS ADJUNTOS de una tarea, un proyecto o un cliente (no los de una conversación de WhatsApp: para eso está whatspro_chat_media_list). Son los que se subieron desde la app: propuestas, presupuestos, comprobantes, fotos de obra, contratos escaneados. De cada uno devuelve file_id, file_name, mime_type, size_bytes, quién lo subió y cuándo, y available (si el archivo todavía existe en disco). El file_id es lo que después necesitás para abrirlo con whatspro_files_get. Ejemplos: "¿qué archivos tiene cargados este cliente?", "abrí el presupuesto que subieron a la tarea", "¿ya subieron el comprobante?".',
    inputSchema: {
      type: 'object',
      required: ['owner_type', 'owner_id'],
      properties: {
        owner_type: {
          type: 'string',
          enum: [...FILE_OWNER_TYPES],
          description: 'A qué está adjunto el archivo. task = una tarea; project = un tablero; workspace = un espacio de trabajo; customer = un cliente de la ficha de Clientes.',
        },
        owner_id: { type: 'integer', minimum: 1, description: 'Id de la tarea, proyecto, espacio o cliente, según owner_type.' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST_LIMIT, description: `Cuántos devolver, del más nuevo al más viejo. Por defecto ${DEFAULT_LIST_LIMIT}, máximo ${MAX_LIST_LIMIT}.` },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_files_get',
    description:
      'Abre UN archivo adjunto de una tarea, proyecto o cliente y lo entrega para poder usarlo: las imágenes vuelven embebidas para poder mirarlas, los audios para poder escucharlos y transcribirlos, los documentos de texto como contenido legible, y el resto (PDF, Office, ZIP) como recurso binario. Se identifica por file_id, el que devuelve whatspro_files_list. Límite para contenido embebido: ' + `${Math.round(MEDIA_MAX_INLINE_BYTES / (1024 * 1024))} MB` + '; por encima de eso devuelve la metadata y avisa, nunca inventa el contenido.',
    inputSchema: {
      type: 'object',
      required: ['file_id'],
      properties: {
        file_id: { type: 'integer', minimum: 1, description: 'Id del archivo, tal cual lo devuelve whatspro_files_list en file_id.' },
      },
      additionalProperties: false,
    },
  },
];

/** No hay herramientas de escritura de media: el conector solo lee lo que ya está en la conversación. */
export const mediaActionTools: GrokActionTool[] = [];

/* ------------------------------------------------------------------ */
/* Adjuntos de tareas, proyectos y clientes (team_task_media)          */
/* ------------------------------------------------------------------ */

const filesListSchema = z.object({
  owner_type: z.enum(FILE_OWNER_TYPES),
  owner_id: z.number().int().positive(),
  limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
});

const filesGetSchema = z.object({ file_id: z.number().int().positive() });

/**
 * Permiso según de quién cuelga el archivo: los adjuntos de cliente se rigen
 * por el permiso de Clientes y los de tarea/proyecto por el de Tareas. Sin
 * esto, un miembro sin acceso a Clientes podría leer sus adjuntos pidiendo
 * owner_type="customer".
 */
async function assertFilePermission(context: GrokActionContext, ownerType: string) {
  if (ownerType === 'customer') await assertPermission(context, 'customersRead');
  else await assertPermission(context, 'tasksRead', 'tasks');
}

const mediaLinkSchema = z.object({
  message_ids: z.array(z.string().trim().min(1).max(255)).min(1).max(30),
  ttl_seconds: z.number().int().min(60).max(MEDIA_LINK_MAX_TTL_SECONDS).optional(),
});

async function linkChatMedia(input: Record<string, unknown>, context: MediaToolContext) {
  await assertPermission(context, 'contacts');
  const data = parse(mediaLinkSchema, input);

  const items = await Promise.all(data.message_ids.map(async (messageId) => {
    // Se resuelve de verdad cada archivo antes de firmar: así un id ajeno o
    // inexistente no devuelve un enlace que después falle en silencio.
    try {
      const media = await resolvePrivateChatMediaDownload(messageId, context);
      const enlace = crearEnlaceFirmado({
        baseUrl: `${context.privateMediaBaseUrl}/${encodeURIComponent(messageId)}`,
        teamId: context.teamId,
        messageId,
        ttlSeconds: data.ttl_seconds,
      });
      await audit(context, 'GROK_CHAT_MEDIA_LINKED', messageId);
      return {
        message_id: messageId,
        available: true as const,
        file_name: media.fileName,
        mime_type: media.mimeType,
        size_bytes: media.sizeBytes,
        url: enlace.url,
        expires_at: enlace.expiresAt,
      };
    } catch (error) {
      return {
        message_id: messageId,
        available: false as const,
        error: error instanceof Error ? error.message : 'No se pudo resolver el archivo.',
      };
    }
  }));

  return {
    count: items.length,
    available: items.filter((item) => item.available).length,
    note: 'Enlaces firmados y temporales. No son públicos, pero mientras duran cualquiera que tenga la URL puede abrirla: usalos donde hagan falta y no los archives.',
    items,
  };
}

async function listOwnerFiles(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(filesListSchema, input);
  await assertFilePermission(context, data.owner_type);

  const rows = await db.query.teamTaskMedia.findMany({
    where: and(
      eq(teamTaskMedia.teamId, context.teamId),
      eq(teamTaskMedia.ownerType, data.owner_type),
      eq(teamTaskMedia.ownerId, data.owner_id),
    ),
    orderBy: (t, { desc: d }) => [d(t.createdAt)],
    limit: data.limit ?? DEFAULT_LIST_LIMIT,
  });

  const items = await Promise.all(rows.map(async (row) => {
    const resolved = resolveMediaFilePath(row.url);
    const stats = resolved ? await statMediaFile(resolved.absolutePath) : null;
    return {
      file_id: row.id,
      file_name: row.fileName,
      mime_type: row.mimeType || null,
      size_bytes: stats ? stats.size : row.size ?? null,
      source: row.source,
      created_at: row.createdAt.toISOString(),
      available: Boolean(stats),
    };
  }));

  return {
    owner_type: data.owner_type,
    owner_id: data.owner_id,
    total: items.length,
    missing_files: items.filter((item) => !item.available).length,
    items,
  };
}

async function getOwnerFile(input: Record<string, unknown>, context: GrokActionContext) {
  const data = parse(filesGetSchema, input);

  const row = await db.query.teamTaskMedia.findFirst({
    where: and(eq(teamTaskMedia.id, data.file_id), eq(teamTaskMedia.teamId, context.teamId)),
  });
  if (!row) throw new Error('Archivo no encontrado en este equipo.');
  await assertFilePermission(context, row.ownerType);

  const resolved = resolveMediaFilePath(row.url);
  if (!resolved) return { available: false, error: 'La ruta del archivo no es válida.' };
  const stats = await statMediaFile(resolved.absolutePath);
  if (!stats) {
    return { available: false, file_name: row.fileName, error: 'El archivo ya no existe en el servidor.' };
  }

  const mimeType = cleanMimeType(row.mimeType, resolved.absolutePath) || 'application/octet-stream';
  const meta = {
    available: true,
    file_id: row.id,
    owner_type: row.ownerType,
    owner_id: row.ownerId,
    file_name: row.fileName,
    mime_type: mimeType,
    size_bytes: stats.size,
  };

  if (stats.size > MEDIA_MAX_INLINE_BYTES) {
    return { ...meta, note: `El archivo pesa ${stats.size} bytes y supera el tope de ${MEDIA_MAX_INLINE_BYTES} para incrustarlo. No inventes su contenido.` };
  }

  const buffer = await fs.readFile(resolved.absolutePath);
  await audit(context, 'GROK_FILE_READ', row.id);

  if (SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return mcpContent([
      { type: 'text', text: JSON.stringify(meta, null, 2) },
      { type: 'image', data: buffer.toString('base64'), mimeType },
    ]);
  }
  if (SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
    return mcpContent([
      { type: 'text', text: JSON.stringify(meta, null, 2) },
      { type: 'audio', data: buffer.toString('base64'), mimeType },
    ]);
  }
  if (isTextDocument(mimeType, row.fileName, resolved.absolutePath)) {
    const raw = buffer.toString('utf8');
    const truncated = raw.length > TEXT_DOCUMENT_MAX_CHARS;
    return {
      ...meta,
      content: truncated ? raw.slice(0, TEXT_DOCUMENT_MAX_CHARS) : raw,
      content_truncated: truncated,
      omitted_chars: truncated ? raw.length - TEXT_DOCUMENT_MAX_CHARS : 0,
    };
  }
  return mcpContent([
    { type: 'text', text: JSON.stringify(meta, null, 2) },
    { type: 'resource', resource: { uri: `whatspro://file/${row.id}`, mimeType, blob: buffer.toString('base64') } },
  ]);
}

/* ------------------------------------------------------------------ */
/* Implementación                                                      */
/* ------------------------------------------------------------------ */

async function listChatMedia(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(listSchema, input);
  const target = await resolveChatTarget(context, data);

  const type = (data.type ?? 'all') as MediaType | 'all';
  const limit = data.limit ?? DEFAULT_LIST_LIMIT;

  const conditions: SQL[] = [
    eq(messages.chatId, target.chatId),
    isNotNull(messages.mediaUrl),
    type === 'all' ? anyMediaCondition : typeCondition(type),
  ];
  if (data.from_me !== undefined) conditions.push(eq(messages.fromMe, data.from_me));
  if (data.since) conditions.push(gte(messages.timestamp, data.since));
  if (data.until) conditions.push(lte(messages.timestamp, data.until));
  const where = and(...conditions)!;

  const [totalRow] = await db.select({ value: count() }).from(messages).where(where);
  const total = Number(totalRow?.value ?? 0);

  const rows = await db
    .select({
      id: messages.id,
      messageType: messages.messageType,
      text: messages.text,
      mediaUrl: messages.mediaUrl,
      mediaMimetype: messages.mediaMimetype,
      mediaCaption: messages.mediaCaption,
      mediaFileLength: messages.mediaFileLength,
      mediaSeconds: messages.mediaSeconds,
      mediaIsPtt: messages.mediaIsPtt,
      fromMe: messages.fromMe,
      timestamp: messages.timestamp,
    })
    .from(messages)
    .where(where)
    .orderBy(desc(messages.timestamp))
    .limit(limit);

  // La ficha de cada audio viaja pegada al ítem: sin esto el modelo ve
  // "audio de 34s" y tiene que ir a buscar qué dice de a uno. Una sola consulta
  // para toda la tanda.
  const insights = await getAudioInsightsByMessageIds(
    rows.filter((row) => classifyMedia(row.messageType, row.mediaMimetype) === 'audio').map((row) => row.id),
  );

  const items = await Promise.all(rows.map(async (row) => {
    const resolved = resolveMediaFilePath(row.mediaUrl);
    const stats = resolved ? await statMediaFile(resolved.absolutePath) : null;
    const itemType = classifyMedia(row.messageType, row.mediaMimetype);
    const insight = itemType === 'audio' ? insights.get(row.id) ?? null : null;
    return {
      message_id: row.id,
      type: itemType,
      mime_type: cleanMimeType(row.mediaMimetype, resolved?.absolutePath ?? null) || null,
      caption: row.mediaCaption?.trim() || (itemType === 'document' ? null : row.text?.trim() || null),
      seconds: itemType === 'audio' || itemType === 'video' ? row.mediaSeconds ?? null : null,
      size_bytes: stats ? stats.size : parseSizeBytes(row.mediaFileLength),
      is_voice_note: itemType === 'audio' ? row.mediaIsPtt === true : false,
      from_me: row.fromMe,
      timestamp: row.timestamp.toISOString(),
      file_name: itemType === 'document' ? inferFileName(row) : null,
      available: Boolean(stats),
      // Sólo en audios: qué dice, ya escuchado por el servidor. `null` significa
      // que todavía no se procesó (el cron lo va a tomar), no que esté vacío.
      transcript: insight ? insight.transcript : null,
      summary: insight ? insight.summary || null : null,
      intent: insight ? insight.intent || null : null,
      urgency: insight ? insight.urgency || null : null,
      sentiment: insight ? insight.sentiment || null : null,
    };
  }));

  const missing = items.filter((item) => !item.available).length;
  const omitted = Math.max(0, total - items.length);

  return {
    chat_id: target.chatId,
    contact_id: target.contactId,
    contact_name: target.contactName,
    chat_name: target.chatName,
    remote_jid: target.remoteJid,
    filters: {
      type,
      from_me: data.from_me ?? null,
      since: data.since?.toISOString() ?? null,
      until: data.until?.toISOString() ?? null,
      limit,
    },
    total,
    returned: items.length,
    omitted,
    missing_files: missing,
    notes: [
      omitted > 0
        ? `Se devolvieron los ${items.length} archivos más recientes de ${total}. Quedaron ${omitted} afuera: acotá con since/until o con type, o subí limit (máx ${MAX_LIST_LIMIT}).`
        : null,
      missing > 0
        ? `${missing} de los archivos listados ya no están en el disco del servidor (available=false): no se pueden abrir con whatspro_chat_media_get.`
        : null,
      items.length > 0
        ? 'Para mirar una foto llamá a whatspro_chat_media_get con el message_id del ítem.'
        : null,
      items.some((item) => item.type === 'audio' && item.transcript)
        ? 'Los audios ya vienen con transcript, summary, intent y urgency: NO hace falta abrirlos ni transcribirlos de nuevo para saber qué dicen.'
        : null,
      items.some((item) => item.type === 'audio' && !item.transcript)
        ? 'Hay audios sin transcript (todavía no procesados): pasá su message_id por whatspro_transcribe_media para escucharlos ahora.'
        : null,
    ].filter(Boolean),
    items,
  };
}

function describeContext(row: {
  type: MediaType;
  fromMe: boolean;
  timestamp: Date;
  caption: string | null;
  fileName: string | null;
  mimeType: string;
  sizeBytes: number | null;
  seconds: number | null;
  isVoiceNote: boolean;
}, target: ChatTarget) {
  const who = row.fromMe
    ? 'Lo mandamos nosotros desde WhatsPro'
    : `Lo mandó ${target.contactName || target.chatName || target.remoteJid.split('@')[0] || 'el contacto'}`;
  const label = row.type === 'image'
    ? 'Imagen de WhatsApp'
    : row.type === 'sticker'
      ? 'Sticker de WhatsApp'
      : row.type === 'audio'
        ? (row.isVoiceNote ? 'Nota de voz de WhatsApp' : 'Audio de WhatsApp')
        : row.type === 'video'
          ? 'Video de WhatsApp'
          : 'Documento de WhatsApp';

  const parts = [
    `${label} del chat ${target.chatId}${target.contactName ? ` (${target.contactName})` : ''}.`,
    `${who} el ${row.timestamp.toISOString()}.`,
    `Formato ${row.mimeType}, ${formatBytes(row.sizeBytes)}.`,
  ];
  const duration = formatSeconds(row.seconds);
  if (duration) parts.push(`Duración ${duration}.`);
  if (row.fileName) parts.push(`Nombre del archivo: ${row.fileName}.`);
  parts.push(row.caption ? `Epígrafe que escribió la persona: "${row.caption}".` : 'Sin epígrafe.');
  return parts.join(' ');
}

function privateDownloadLink(context: MediaToolContext, messageId: string) {
  if (!context.privateMediaBaseUrl) return null;
  return `${context.privateMediaBaseUrl}/${encodeURIComponent(messageId)}`;
}

/**
 * Enlace firmado del MISMO archivo, sólo para los clientes que no pueden mandar
 * la cabecera Bearer. Vive 15 minutos y es una credencial portable mientras
 * dura, así que no se genera por defecto: sólo cuando el conector lo necesita.
 */
function signedDownloadLink(context: MediaToolContext, messageId: string) {
  const base = privateDownloadLink(context, messageId);
  if (!base || !context.signedLinks) return null;
  try {
    const firmado = crearEnlaceFirmado({ baseUrl: base, teamId: context.teamId, messageId });
    return {
      url: firmado.url,
      expires_at: firmado.expiresAt,
      authentication: 'ninguna: la firma va en la URL y vence sola',
      note: 'Enlace temporal para descargar el archivo desde un cliente que no manda cabeceras. Es una credencial mientras dura: no lo guardes ni lo compartas.',
    };
  } catch {
    return null;
  }
}

async function getChatMedia(input: Record<string, unknown>, context: MediaToolContext) {
  await assertPermission(context, 'contacts');
  const data = parse(getSchema, input);

  // El join contra chats con eq(chats.teamId) es el aislamiento por equipo: un
  // message_id de otro equipo no matchea y sale por "not found", sin filtrar
  // siquiera que el mensaje existe.
  const [row] = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      messageType: messages.messageType,
      text: messages.text,
      mediaUrl: messages.mediaUrl,
      mediaMimetype: messages.mediaMimetype,
      mediaCaption: messages.mediaCaption,
      mediaFileLength: messages.mediaFileLength,
      mediaSeconds: messages.mediaSeconds,
      mediaIsPtt: messages.mediaIsPtt,
      fromMe: messages.fromMe,
      timestamp: messages.timestamp,
      remoteJid: chats.remoteJid,
      chatName: chats.name,
      chatPushName: chats.pushName,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(messages.id, data.message_id), eq(chats.teamId, context.teamId)))
    .limit(1);

  if (!row) throw new Error('Media message not found.');

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, context.teamId), eq(contacts.chatId, row.chatId)),
    columns: { id: true, name: true, assignedUserId: true, assignedDepartmentId: true },
  });

  const target: ChatTarget = {
    chatId: row.chatId,
    remoteJid: row.remoteJid,
    chatName: row.chatName || row.chatPushName || null,
    contactId: contact?.id ?? null,
    contactName: contact?.name ?? null,
    assignedUserId: contact?.assignedUserId ?? null,
    assignedDepartmentId: contact?.assignedDepartmentId ?? null,
  };
  await assertChatVisible(context, target);

  const type = classifyMedia(row.messageType, row.mediaMimetype);
  const resolved = resolveMediaFilePath(row.mediaUrl);
  // Solo los documentos tienen nombre real (lo manda WhatsApp y queda en text);
  // en fotos y audios el "nombre" es el uuid del archivo en disco y no le dice
  // nada al modelo, así que no se lo mostramos.
  const fileName = type === 'document' ? inferFileName(row) : null;
  const mimeType = cleanMimeType(row.mediaMimetype, resolved?.absolutePath ?? null);
  const caption = row.mediaCaption?.trim() || (type === 'document' ? null : row.text?.trim() || null);

  const metadata = {
    message_id: row.id,
    chat_id: target.chatId,
    contact_id: target.contactId,
    contact_name: target.contactName,
    type,
    mime_type: mimeType,
    caption,
    file_name: fileName,
    seconds: type === 'audio' || type === 'video' ? row.mediaSeconds ?? null : null,
    is_voice_note: type === 'audio' ? row.mediaIsPtt === true : false,
    from_me: row.fromMe,
    timestamp: row.timestamp.toISOString(),
    size_bytes: parseSizeBytes(row.mediaFileLength),
  };

  if (!row.mediaUrl || !resolved) {
    return {
      ...metadata,
      available: false,
      error: 'El mensaje no tiene un archivo guardado en el servidor (o la ruta registrada no es válida). No hay nada que mirar ni escuchar: decíselo al usuario en vez de suponer el contenido.',
    };
  }

  const stats = await statMediaFile(resolved.absolutePath);
  if (!stats) {
    return {
      ...metadata,
      available: false,
      error: 'El archivo figura en la conversación pero ya no está en el disco del servidor (mensaje viejo o limpieza de archivos). No se puede abrir: avisale al usuario que ese archivo se perdió.',
    };
  }

  const sizeBytes = stats.size;
  const available = { ...metadata, size_bytes: sizeBytes, available: true as const };
  const downloadUrl = privateDownloadLink(context, row.id);
  const privateDownload = downloadUrl ? {
    url: downloadUrl,
    authentication: 'Bearer token de esta conexión',
    cache: 'private, no-store',
  } : null;
  const signedDownload = signedDownloadLink(context, row.id);

  if (type === 'video') {
    return {
      ...available,
      private_download: privateDownload,
      ...(signedDownload ? { signed_download: signedDownload } : {}),
      note: 'El video no se incrusta en el contexto del modelo, pero el conector puede descargarlo de forma privada usando la misma autorización Bearer.',
    };
  }

  if (sizeBytes > MEDIA_MAX_INLINE_BYTES) {
    return {
      ...available,
      private_download: privateDownload,
      ...(signedDownload ? { signed_download: signedDownload } : {}),
      error: `El archivo pesa ${formatBytes(sizeBytes)} y el tope para mandarlo al modelo es ${formatBytes(MEDIA_MAX_INLINE_BYTES)} (en base64 ocuparía ~${formatBytes(Math.round(sizeBytes * 1.34))}). No se devolvió el contenido. Pedile al usuario una versión más liviana o que te cuente qué necesita del archivo.`,
    };
  }

  if (type === 'image' || type === 'sticker') {
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
      return {
        ...available,
        error: `El formato ${mimeType} no es una imagen que los clientes sepan mostrar (se admiten ${[...SUPPORTED_IMAGE_MIME_TYPES].join(', ')}). Se devolvió solo la metadata.`,
      };
    }
    const buffer = await fs.readFile(resolved.absolutePath);
    await audit(context, 'GROK_CHAT_MEDIA_READ', row.id);
    return mcpContent([
      {
        type: 'text',
        text: describeContext({
          type, fromMe: row.fromMe, timestamp: row.timestamp, caption,
          fileName, mimeType, sizeBytes, seconds: null, isVoiceNote: false,
        }, target),
      },
      { type: 'image', data: buffer.toString('base64'), mimeType },
      ...(signedDownload
        ? [{ type: 'text' as const, text: `Descarga directa sin cabeceras (vence ${signedDownload.expires_at}): ${signedDownload.url}` }]
        : []),
      ...(downloadUrl ? [{ type: 'resource_link' as const, name: fileName || `media-${row.id}`, uri: downloadUrl, mimeType, size: sizeBytes }] : []),
    ]);
  }

  if (type === 'audio') {
    if (!SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
      return {
        ...available,
        error: `El formato de audio ${mimeType} no está soportado (se admiten ${[...SUPPORTED_AUDIO_MIME_TYPES].join(', ')}). Se devolvió solo la metadata.`,
      };
    }
    const buffer = await fs.readFile(resolved.absolutePath);
    await audit(context, 'GROK_CHAT_MEDIA_READ', row.id);

    // El bloque `audio` va igual, para los pocos modelos que escuchan. Pero la
    // ficha viaja como texto en el MISMO resultado: los modelos de Claude y los
    // conectores de ChatGPT descartan el audio, y sin esto se quedan sin nada.
    const ficha = (await getAudioInsightsByMessageIds([row.id])).get(row.id) ?? null;
    const fichaTexto = ficha
      ? '\n\n' + [
          'Contenido del audio (ya escuchado por el servidor):',
          ficha.transcript ? `Transcripción: ${ficha.transcript}` : null,
          ficha.summary ? `Resumen: ${ficha.summary}` : null,
          ficha.intent ? `Intención: ${ficha.intent}` : null,
          ficha.urgency ? `Urgencia: ${ficha.urgency}` : null,
          ficha.sentiment ? `Ánimo: ${ficha.sentiment}` : null,
        ].filter(Boolean).join('\n')
      : '\n\nEste audio todavía no tiene transcripción guardada. Si tu modelo no escucha audio, pedila con whatspro_transcribe_media.';

    return mcpContent([
      {
        type: 'text',
        text: describeContext({
          type, fromMe: row.fromMe, timestamp: row.timestamp, caption,
          fileName, mimeType, sizeBytes,
          seconds: row.mediaSeconds ?? null, isVoiceNote: row.mediaIsPtt === true,
        }, target) + fichaTexto,
      },
      // mimeType ya viene limpio: WhatsApp manda "audio/ogg; codecs=opus" y
      // varios clientes MCP rechazan el bloque si trae parámetros.
      { type: 'audio', data: buffer.toString('base64'), mimeType },
      ...(signedDownload
        ? [{ type: 'text' as const, text: `Descarga directa sin cabeceras (vence ${signedDownload.expires_at}): ${signedDownload.url}` }]
        : []),
      ...(downloadUrl ? [{ type: 'resource_link' as const, name: fileName || `media-${row.id}`, uri: downloadUrl, mimeType, size: sizeBytes }] : []),
    ]);
  }

  if (isTextDocument(mimeType, fileName, resolved.absolutePath)) {
    const raw = await fs.readFile(resolved.absolutePath, 'utf8');
    const truncated = raw.length > TEXT_DOCUMENT_MAX_CHARS;
    await audit(context, 'GROK_CHAT_MEDIA_READ', row.id);
    return {
      ...available,
      private_download: privateDownload,
      ...(signedDownload ? { signed_download: signedDownload } : {}),
      content: truncated ? raw.slice(0, TEXT_DOCUMENT_MAX_CHARS) : raw,
      content_truncated: truncated,
      omitted_chars: truncated ? raw.length - TEXT_DOCUMENT_MAX_CHARS : 0,
      note: truncated
        ? `El documento tiene ${raw.length} caracteres y se devolvieron los primeros ${TEXT_DOCUMENT_MAX_CHARS}. Avisá que el resto quedó afuera en vez de dar por leído el archivo completo.`
        : 'Documento de texto devuelto completo.',
    };
  }

  // PDF y demás binarios: se devuelven como `resource.blob`, igual que hace
  // App Maker con sus adjuntos. Antes caían todos en el `note` de abajo, así
  // que un PDF adjunto en un chat era ilegible para el modelo aunque pesara
  // 40 KB. El tope inline sigue siendo el mismo que para audio e imagen.
  if (sizeBytes <= MEDIA_MAX_INLINE_BYTES) {
    const buffer = await fs.readFile(resolved.absolutePath);
    await audit(context, 'GROK_CHAT_MEDIA_READ', row.id);
    return mcpContent([
      { type: 'text', text: JSON.stringify({ ...available, private_download: privateDownload, ...(signedDownload ? { signed_download: signedDownload } : {}) }, null, 2) },
      {
        type: 'resource',
        resource: {
          uri: downloadUrl || `whatspro://chat-media/${row.id}`,
          mimeType,
          blob: buffer.toString('base64'),
        },
      },
    ]);
  }

  return {
    ...available,
    private_download: privateDownload,
    note: `El conector puede descargar de forma privada el archivo ${mimeType}${fileName ? ` (${fileName})` : ''} usando la misma autorización Bearer. El contenido binario no se incrusta en el contexto del modelo.`,
  };
}

async function summarizeChatMedia(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const data = parse(summarySchema, input);
  const target = await resolveChatTarget(context, data);

  const conditions: SQL[] = [
    eq(messages.chatId, target.chatId),
    isNotNull(messages.mediaUrl),
    anyMediaCondition,
  ];
  if (data.since) conditions.push(gte(messages.timestamp, data.since));
  if (data.until) conditions.push(lte(messages.timestamp, data.until));
  const where = and(...conditions)!;

  const rows = await db
    .select({
      type: mediaTypeExpression,
      fromMe: messages.fromMe,
      total: count(),
      seconds: sql<string | null>`sum(${messages.mediaSeconds})`,
      first: min(messages.timestamp),
      last: max(messages.timestamp),
    })
    .from(messages)
    .where(where)
    .groupBy(mediaTypeExpression, messages.fromMe);

  const byType = Object.fromEntries(MEDIA_TYPES.map((type) => [type, {
    total: 0,
    from_contact: 0,
    from_us: 0,
    seconds: 0,
    first_at: null as string | null,
    last_at: null as string | null,
  }])) as Record<MediaType, {
    total: number; from_contact: number; from_us: number; seconds: number;
    first_at: string | null; last_at: string | null;
  }>;

  for (const row of rows) {
    const bucket = byType[row.type as MediaType];
    if (!bucket) continue;
    const total = Number(row.total ?? 0);
    bucket.total += total;
    if (row.fromMe) bucket.from_us += total;
    else bucket.from_contact += total;
    bucket.seconds += Number(row.seconds ?? 0) || 0;
    const first = toIso(row.first);
    const last = toIso(row.last);
    if (first && (!bucket.first_at || first < bucket.first_at)) bucket.first_at = first;
    if (last && (!bucket.last_at || last > bucket.last_at)) bucket.last_at = last;
  }

  const totals = Object.values(byType).reduce((accumulator, bucket) => ({
    total: accumulator.total + bucket.total,
    from_contact: accumulator.from_contact + bucket.from_contact,
    from_us: accumulator.from_us + bucket.from_us,
  }), { total: 0, from_contact: 0, from_us: 0 });

  const allFirst = Object.values(byType).map((bucket) => bucket.first_at).filter(Boolean).sort();
  const allLast = Object.values(byType).map((bucket) => bucket.last_at).filter(Boolean).sort();
  const audioSeconds = byType.audio.seconds + byType.video.seconds;

  return {
    chat_id: target.chatId,
    contact_id: target.contactId,
    contact_name: target.contactName,
    chat_name: target.chatName,
    remote_jid: target.remoteJid,
    range: { since: data.since?.toISOString() ?? null, until: data.until?.toISOString() ?? null },
    totals: {
      files: totals.total,
      from_contact: totals.from_contact,
      from_us: totals.from_us,
      audio_seconds: byType.audio.seconds,
      audio_minutes: Math.round((byType.audio.seconds / 60) * 10) / 10,
      video_seconds: byType.video.seconds,
      media_seconds: audioSeconds,
      first_at: allFirst[0] ?? null,
      last_at: allLast[allLast.length - 1] ?? null,
    },
    by_type: byType,
    notes: [
      'Los conteos salen de lo registrado en la conversación; esta herramienta no verifica si los archivos siguen en el disco (para eso mirá available en whatspro_chat_media_list).',
      totals.total > 0
        ? 'Para ver los archivos uno por uno usá whatspro_chat_media_list, y para abrir uno whatspro_chat_media_get.'
        : 'Esta conversación no tiene archivos en el rango pedido.',
    ],
  };
}

/**
 * Resolves a connector-only download without ever accepting a filesystem path
 * from the caller. Team ownership, the member's chat visibility and the media
 * path containment check are all enforced before a local path is returned.
 */
export async function resolvePrivateChatMediaDownload(messageId: string, context: GrokActionContext) {
  await assertPermission(context, 'contacts');
  const parsed = getSchema.parse({ message_id: messageId });
  const [row] = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      messageType: messages.messageType,
      text: messages.text,
      mediaUrl: messages.mediaUrl,
      mediaMimetype: messages.mediaMimetype,
      mediaCaption: messages.mediaCaption,
      mediaFileLength: messages.mediaFileLength,
      fromMe: messages.fromMe,
      timestamp: messages.timestamp,
      remoteJid: chats.remoteJid,
      chatName: chats.name,
      chatPushName: chats.pushName,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(messages.id, parsed.message_id), eq(chats.teamId, context.teamId)))
    .limit(1);
  if (!row) throw new Error('Media message not found.');

  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.teamId, context.teamId), eq(contacts.chatId, row.chatId)),
    columns: { id: true, name: true, assignedUserId: true, assignedDepartmentId: true },
  });
  await assertChatVisible(context, {
    chatId: row.chatId,
    remoteJid: row.remoteJid,
    chatName: row.chatName || row.chatPushName || null,
    contactId: contact?.id ?? null,
    contactName: contact?.name ?? null,
    assignedUserId: contact?.assignedUserId ?? null,
    assignedDepartmentId: contact?.assignedDepartmentId ?? null,
  });

  const resolved = resolveMediaFilePath(row.mediaUrl);
  if (!resolved) throw new Error('Media file is not available.');
  const stats = await statMediaFile(resolved.absolutePath);
  if (!stats) throw new Error('Media file is not available.');
  const mimeType = cleanMimeType(row.mediaMimetype, resolved.absolutePath);
  const fileName = inferFileName(row) || `whatspro-${row.id}${path.extname(resolved.absolutePath)}`;
  await audit(context, 'GROK_CHAT_MEDIA_DOWNLOADED', row.id);
  return {
    absolutePath: resolved.absolutePath,
    fileName,
    mimeType,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime,
  };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export async function executeMediaTool(name: string, input: Record<string, unknown>, context: MediaToolContext) {
  if (name === 'whatspro_chat_media_list') return listChatMedia(input, context);
  if (name === 'whatspro_chat_media_get') return getChatMedia(input, context);
  if (name === 'whatspro_chat_media_summary') return summarizeChatMedia(input, context);
  if (name === 'whatspro_chat_media_link') return linkChatMedia(input, context);
  if (name === 'whatspro_files_list') return listOwnerFiles(input, context);
  if (name === 'whatspro_files_get') return getOwnerFile(input, context);
  throw new Error(`Unknown media tool: ${name}`);
}
