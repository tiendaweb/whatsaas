import 'server-only';

import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import {
  teamAappRenewalCandidates,
  teamAappRenewalConfigs,
  teamDocumentFolders,
  teamDocuments,
  teamNotes,
} from '@/lib/db/schema';
import { getDocument, listBacklinks, moveDocument } from '@/lib/plugins/documents/server/documents';
import { DocumentMediaError, uploadDocumentMedia } from '@/lib/plugins/documents/server/media';
import { attachCommitmentTaskStatus, syncNoteCommitmentsToTasks } from '@/lib/plugins/notes/server/meeting-notes';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';
import {
  AAPP_RENEWAL_RULES,
  applyAappRenewalAction,
  listAappRenewalCandidates,
  materializeAappRenewalCandidates,
} from '@/lib/plugins/scheduled-messages/aapp-renewals';

const DOCUMENTS_PLUGIN = 'documents';
const SCHEDULED_MESSAGES_PLUGIN = 'scheduled-messages';

/** Estados por los que pasa un aviso de renovación, en orden de vida. */
const RENEWAL_STATUSES = ['pending', 'approved', 'sending', 'sent', 'rejected', 'failed', 'cancelled'] as const;
const RENEWAL_RULE_KEYS = AAPP_RENEWAL_RULES.map((rule) => rule.key);
const RENEWAL_OPERATIONS = ['approve', 'reject', 'revoke', 'reopen', 'retry'] as const;

/* ------------------------------------------------------------------ */
/* Herramientas de lectura                                             */
/* ------------------------------------------------------------------ */

export const knowledgeReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_documents_search',
    description:
      'Busca texto dentro de los documentos del equipo (app Documentos): coincide tanto en el TÍTULO como en el CONTENIDO completo, y devuelve para cada resultado el id, el título, el emoji, el formato (markdown = editor Tiptap; html = informe pegado tal cual), la carpeta con su ruta completa, la fecha de última edición y un EXTRACTO con el texto que rodea la coincidencia, para que se vea en qué contexto aparece el término. Es la herramienta para responder "¿dónde anoté X?", "¿en qué documento hablamos de Y?", "¿existe ya un informe de este cliente?" antes de escribir uno nuevo. Devuelve solo el extracto, nunca el documento entero: cuando ya identificaste cuál es el documento que buscabas, leelo completo con whatspro_get_record usando resource="documents" e id igual al id devuelto acá (y whatspro_manage_document si después hay que editarlo). La búsqueda es por subcadena literal, sin stemming ni sinónimos: "factura" no encuentra "facturación" al revés, así que probá con la raíz de la palabra ("factur") si el término largo no trae nada. Los resultados vienen del más editado recientemente al más viejo, y la respuesta siempre dice cuántas coincidencias hubo en total y cuántas quedaron fuera del límite pedido.',
    inputSchema: {
      type: 'object',
      required: ['q'],
      properties: {
        q: {
          type: 'string',
          minLength: 2,
          maxLength: 200,
          description: 'Texto a buscar en el título y en el contenido. Subcadena literal, sin distinguir mayúsculas ni acentos escritos distinto. Ej.: "Almamia", "embudo", "ARCA".',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 20,
          description: 'Cuántos documentos devolver como máximo. Por defecto 20, tope 50. Si hay más coincidencias, la respuesta lo informa en total_matches/omitted en vez de recortar en silencio.',
        },
        folder_id: {
          type: ['integer', 'null'],
          minimum: 1,
          description: 'Acota la búsqueda a una carpeta concreta de Documentos (solo esa carpeta, no sus subcarpetas). Pasá null para buscar únicamente en documentos sueltos, sin carpeta. Omitilo para buscar en todo el equipo.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_documents_read',
    description:
      'Lee un documento COMPLETO de la app Documentos: título, emoji, formato, autor de la última edición, carpeta con migas de pan, versión (para editar después con control optimista) y el contenido. Con format="text" devuelve el texto plano (lo más barato en contexto y suficiente para leer un informe); con format="html" el HTML crudo de un informe; con format="json" el ProseMirror del editor. El contenido se corta en max_bytes (200 KB por defecto) informando truncated=true: un informe HTML puede pesar 400 KB. El id sale de whatspro_documents_search o de whatspro_list_records(resource="documents").',
    inputSchema: {
      type: 'object',
      required: ['document_id'],
      properties: {
        document_id: { type: 'integer', minimum: 1 },
        format: { type: 'string', enum: ['text', 'html', 'json'], default: 'text', description: 'text = texto plano (recomendado para leer); html = HTML crudo; json = ProseMirror del editor.' },
        max_bytes: { type: 'integer', minimum: 1000, maximum: 500000, default: 200000, description: 'Tope de bytes del contenido devuelto.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_documents_backlinks',
    description:
      'Qué documentos ENLAZAN a este documento (backlinks): id, título y emoji de cada uno. Sirve para saber desde dónde se referencia un informe antes de moverlo o borrarlo, o para navegar la red de documentos como en Notion. Los enlaces salientes de un documento están en su propio contenido (leelo con whatspro_documents_read).',
    inputSchema: {
      type: 'object',
      required: ['document_id'],
      properties: {
        document_id: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
];

/**
 * `whatspro_memberships_renewal_queue` lee Y escribe según su parámetro
 * `action`, así que vive en la lista de acciones: publicarla también entre las
 * de lectura duplicaría el nombre en `tools/list`. Su rama `list` solo exige
 * los permisos de lectura.
 */
export const knowledgeActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_documents_attach_media',
    description:
      'Sube una imagen y la adjunta a un documento de la app Documentos. Cierra el único hueco que impedía armar un informe entero desde un conector: el texto se escribía por MCP y las capturas había que subirlas a mano desde el navegador. Formatos: PNG, JPG, WEBP, GIF o AVIF, hasta 8 MB (el contenido viaja en base64, así que el límite práctico es más bajo). Devuelve la URL pública: para que la imagen SE VEA en el documento hay que insertarla después en el cuerpo con whatspro_manage_document, por ejemplo ![alt](url) en markdown. Sin document_id la imagen queda subida y disponible pero sin colgar de ningún documento.',
    inputSchema: {
      type: 'object',
      required: ['file_name', 'mime_type', 'content_base64'],
      properties: {
        file_name: { type: 'string', minLength: 1, maxLength: 255, description: 'Nombre original, con extensión.' },
        mime_type: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'] },
        content_base64: { type: 'string', minLength: 4, maxLength: 12000000, description: 'Contenido del archivo en base64, sin el prefijo data:.' },
        document_id: { type: ['integer', 'null'], minimum: 1, description: 'Documento al que se adjunta. Tiene que ser de este equipo.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_documents_move',
    description:
      'Mueve un documento a otra carpeta de la app Documentos (o lo saca de toda carpeta con folder_id=null) y lo ubica en una posición concreta de la lista. Reordena el resto de la carpeta de origen y destino de forma consistente. Las carpetas se listan con whatspro_list_records(resource="document-folders") y se crean con whatspro_manage_document_folder.',
    inputSchema: {
      type: 'object',
      required: ['document_id', 'folder_id'],
      properties: {
        document_id: { type: 'integer', minimum: 1 },
        folder_id: { type: ['integer', 'null'], minimum: 1, description: 'Carpeta destino. null = raíz (sin carpeta).' },
        position: { type: 'integer', minimum: 0, default: 0, description: 'Posición dentro de la carpeta destino (0 = primero).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_notes_sync_commitments',
    description:
      'Regenera las TAREAS de los compromisos de una nota de reunión que todavía no tienen tarea creada. Complementa whatspro_generate_tasks_from_note: sirve cuando a una nota ligada a un evento se le agregaron compromisos después de la primera generación. Es idempotente por diseño (los compromisos que ya tienen taskItemId no se duplican). Devuelve los compromisos con el estado real de su tarea (hecha / pendiente).',
    inputSchema: {
      type: 'object',
      required: ['note_id'],
      properties: {
        note_id: { type: 'integer', minimum: 1, description: 'ID de la nota (resource="notes"). Tiene que estar ligada a un evento y tener compromisos.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_memberships_renewal_queue',
    description:
      'Ve y opera la COLA DE AVISOS DE RENOVACIÓN de AAPP Space: los mensajes de WhatsApp que el sistema prepara para cada suscripción de aapp.space cuando se acerca (o ya pasó) su vencimiento. Cada candidato es un aviso concreto: cliente, plan, fecha de vencimiento, regla que lo generó (before_30 = 30 días antes, before_14 = 14 días antes, before_3 = 3 días antes, expired = ya vencido), número de WhatsApp resuelto, texto exacto del mensaje y cuándo se enviaría. Con action="list" mirás y filtrás la cola sin tocar nada; con action="apply" cambiás el estado de uno o varios candidatos en lote. ATENCIÓN, ESTO TERMINA EN MENSAJES A CLIENTES REALES: apply NO envía nada en el momento, pero "approve" (y "retry") dejan el aviso en estado approved, y un cron independiente toma todo lo aprobado cuyo send_at ya pasó y le manda el WhatsApp al cliente por la instancia configurada. Aprobar es autorizar el envío. Se puede deshacer con "revoke" (approved -> pending) SOLO mientras el cron no lo haya tomado todavía. Por eso action="apply" exige confirm=true, y conviene listar primero, mostrarle al usuario a quiénes se le va a escribir y recién ahí aprobar. Hoy la cola se alimenta de más de 200 suscripciones (activas y vencidas), así que se usa en lote: filtrá por status y por rule_key, revisá, y aprobá el bloque.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'apply'],
          description: 'list = solo lectura de la cola con filtros. apply = cambia el estado de los candidatos indicados en ids (requiere confirm=true).',
        },
        status: {
          type: 'array',
          maxItems: 7,
          items: { type: 'string', enum: [...RENEWAL_STATUSES] },
          description: 'Solo para list. Estados a incluir: pending = preparado, esperando revisión; approved = autorizado, el cron lo va a enviar; sending = el cron lo está mandando ahora; sent = ya se le escribió al cliente; rejected = descartado a mano; failed = falló el envío (se reintenta con retry); cancelled = quedó obsoleto porque cambió la fecha de vencimiento. Omitilo para ver todos.',
        },
        rule_key: {
          type: 'array',
          maxItems: 4,
          items: { type: 'string', enum: [...RENEWAL_RULE_KEYS] },
          description: 'Solo para list. Regla que generó el aviso: before_30, before_14, before_3 (avisos previos al vencimiento) o expired (el servicio ya venció).',
        },
        expires_within_days: {
          type: 'integer',
          minimum: 0,
          maximum: 365,
          description: 'Solo para list. Deja únicamente los avisos de suscripciones que vencen dentro de estos días contados desde hoy (los ya vencidos entran siempre, porque su fecha es anterior a hoy). Ej.: 15 para "lo que se vence en las próximas dos semanas".',
        },
        only_expired: {
          type: 'boolean',
          description: 'Solo para list. true deja únicamente los avisos de suscripciones cuya fecha de vencimiento ya pasó.',
        },
        customer_id: {
          type: 'integer',
          minimum: 1,
          description: 'Solo para list. Acota a los avisos de un cliente puntual (id de teamCustomers, el mismo que devuelve whatspro_list_records con resource="customers").',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          default: 50,
          description: 'Solo para list. Máximo de candidatos a devolver, por defecto 50 y tope 200. El resumen por estado y por regla se calcula SIEMPRE sobre la cola completa, no sobre lo recortado, y la respuesta informa cuántos quedaron afuera.',
        },
        refresh: {
          type: 'boolean',
          default: true,
          description: 'Solo para list. true (por defecto) regenera los candidatos pendientes antes de listar, exactamente igual que hace la pantalla de Mensajes programados al abrirse: crea los avisos que falten para las suscripciones nuevas y cancela los que quedaron viejos porque cambió la fecha de vencimiento. NO envía ni aprueba nada. Poné false si querés ver la cola tal cual está guardada, sin recalcularla.',
        },
        operation: {
          type: 'string',
          enum: [...RENEWAL_OPERATIONS],
          description: 'Solo para apply, y obligatorio ahí. approve: pending -> approved, AUTORIZA que el cron le mande el WhatsApp al cliente. reject: pending -> rejected, descarta el aviso. revoke: approved -> pending, cancela una aprobación que todavía no se envió. reopen: rejected -> pending, vuelve a poner en revisión algo descartado. retry: failed -> approved, REINTENTA un envío que falló (también termina en un mensaje al cliente). Los candidatos que no estén en el estado de origen correcto se ignoran.',
        },
        ids: {
          type: 'array',
          minItems: 1,
          maxItems: 500,
          items: { type: 'integer', minimum: 1 },
          description: 'Solo para apply, y obligatorio ahí. Ids de candidatos de la cola (el campo id que devuelve action="list"), no ids de suscripción ni de cliente. Hasta 500 por llamada.',
        },
        confirm: {
          type: 'boolean',
          description: 'Solo para apply, y obligatorio ahí en true. Es el recordatorio explícito de que approve y retry terminan en mensajes de WhatsApp a clientes reales. Sin confirm=true la operación se rechaza sin tocar nada.',
        },
      },
      additionalProperties: false,
    },
  },
];

/* ------------------------------------------------------------------ */
/* Búsqueda en documentos                                              */
/* ------------------------------------------------------------------ */

const documentsSearchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.number().int().min(1).max(50).default(20),
  folder_id: z.number().int().positive().nullable().optional(),
});

/** `%` y `_` son comodines de LIKE: sin escaparlos, buscar "50%" trae cualquier cosa. */
function likePattern(term: string) {
  return `%${term.replace(/([\\%_])/g, '\\$1')}%`;
}

type FolderRow = { id: number; name: string; parentId: number | null };

/** Ruta completa de la carpeta ("Clientes / Almamia / Informes"), hasta 5 niveles. */
function folderPath(folderId: number, byId: Map<number, FolderRow>) {
  const parts: string[] = [];
  let current = byId.get(folderId);
  for (let depth = 0; current && depth < 8; depth++) {
    parts.unshift(current.name);
    current = current.parentId == null ? undefined : byId.get(current.parentId);
  }
  return parts.join(' / ');
}

async function documentsSearch(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsRead', DOCUMENTS_PLUGIN);
  const data = parse(documentsSearchSchema, input);
  const term = data.q;
  const pattern = likePattern(term);

  const conditions = [
    eq(teamDocuments.teamId, context.teamId),
    or(ilike(teamDocuments.title, pattern), ilike(teamDocuments.contentText, pattern))!,
  ];
  if (data.folder_id !== undefined) {
    conditions.push(data.folder_id === null ? sql`${teamDocuments.folderId} is null` : eq(teamDocuments.folderId, data.folder_id));
  }
  const where = and(...conditions);

  // El extracto se recorta en SQL a propósito: un informe HTML del equipo puede
  // pesar cientos de KB en `content_text` y no hay razón para traerlo entero
  // solo para mostrar la línea donde cayó la coincidencia.
  const matchPosition = sql<number>`strpos(lower(${teamDocuments.contentText}), lower(${term}))`;
  const excerptSql = sql<string>`
    case when strpos(lower(${teamDocuments.contentText}), lower(${term})) > 0
      then substring(${teamDocuments.contentText} from greatest(1, strpos(lower(${teamDocuments.contentText}), lower(${term})) - 90) for 320)
      else left(${teamDocuments.contentText}, 220)
    end`;

  const [rows, [totals]] = await Promise.all([
    db.select({
      id: teamDocuments.id,
      title: teamDocuments.title,
      emoji: teamDocuments.emoji,
      format: teamDocuments.format,
      folderId: teamDocuments.folderId,
      updatedAt: teamDocuments.updatedAt,
      contentLength: sql<number>`length(${teamDocuments.contentText})`,
      matchPosition,
      excerpt: excerptSql,
    })
      .from(teamDocuments)
      .where(where)
      .orderBy(desc(teamDocuments.updatedAt))
      .limit(data.limit),
    db.select({ value: count() }).from(teamDocuments).where(where),
  ]);

  const folderIds = [...new Set(rows.map((row) => row.folderId).filter((id): id is number => id != null))];
  const folders = folderIds.length
    ? await db.select({ id: teamDocumentFolders.id, name: teamDocumentFolders.name, parentId: teamDocumentFolders.parentId })
      .from(teamDocumentFolders)
      .where(eq(teamDocumentFolders.teamId, context.teamId))
    : [];
  const foldersById = new Map<number, FolderRow>(folders.map((folder) => [folder.id, folder]));

  const lowerTerm = term.toLowerCase();
  const results = rows.map((row) => {
    const position = Number(row.matchPosition ?? 0);
    const start = position > 0 ? Math.max(1, position - 90) : 1;
    const raw = (row.excerpt ?? '').replace(/\s+/g, ' ').trim();
    const excerpt = `${start > 1 ? '…' : ''}${raw}${start - 1 + (row.excerpt?.length ?? 0) < Number(row.contentLength ?? 0) ? '…' : ''}`;
    const inTitle = row.title.toLowerCase().includes(lowerTerm);
    return {
      id: row.id,
      title: row.title,
      emoji: row.emoji,
      format: row.format,
      folder: row.folderId == null
        ? null
        : { id: row.folderId, name: foldersById.get(row.folderId)?.name ?? null, path: folderPath(row.folderId, foldersById) },
      updatedAt: row.updatedAt,
      matchedIn: inTitle ? (position > 0 ? 'title+content' : 'title') : 'content',
      excerpt,
    };
  });

  const totalMatches = Number(totals?.value ?? results.length);
  return {
    query: term,
    totalMatches,
    returned: results.length,
    omitted: Math.max(0, totalMatches - results.length),
    note: results.length < totalMatches
      ? `Hay ${totalMatches} documentos que coinciden y se devuelven ${results.length}. Subí limit (tope 50) o afiná el término para ver el resto.`
      : 'Se devuelven todas las coincidencias.',
    readFullDocument: 'Para leer un documento completo: whatspro_get_record con resource="documents" e id del resultado.',
    results,
  };
}

/* ------------------------------------------------------------------ */
/* Lectura y organización de documentos                                */
/* ------------------------------------------------------------------ */

const documentsReadSchema = z.object({
  document_id: z.number().int().positive(),
  format: z.enum(['text', 'html', 'json']).default('text'),
  max_bytes: z.number().int().min(1000).max(500000).default(200000),
});

const documentsBacklinksSchema = z.object({
  document_id: z.number().int().positive(),
});

const documentsMoveSchema = z.object({
  document_id: z.number().int().positive(),
  folder_id: z.number().int().positive().nullable(),
  position: z.number().int().min(0).default(0),
});

const notesSyncSchema = z.object({
  note_id: z.number().int().positive(),
});

function capBytes(value: string, maxBytes: number) {
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= maxBytes) return { content: value, truncated: false, bytes: buffer.length };
  return {
    content: buffer.subarray(0, maxBytes).toString('utf8'),
    truncated: true,
    bytes: buffer.length,
  };
}

async function documentsRead(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsRead', DOCUMENTS_PLUGIN);
  const data = parse(documentsReadSchema, input);
  const document = await getDocument(context.teamId, data.document_id);
  if (!document) throw new Error(`El documento ${data.document_id} no existe. Buscalo con whatspro_documents_search.`);

  let raw: string;
  if (data.format === 'html') {
    raw = document.htmlContent ?? '';
    if (!raw && document.format === 'markdown') {
      throw new Error('Este documento es markdown (editor), no tiene HTML crudo: pedilo con format="text" o format="json".');
    }
  } else if (data.format === 'json') {
    raw = JSON.stringify(document.content ?? null);
  } else {
    const [row] = await db.select({ contentText: teamDocuments.contentText })
      .from(teamDocuments)
      .where(and(eq(teamDocuments.id, data.document_id), eq(teamDocuments.teamId, context.teamId)))
      .limit(1);
    raw = row?.contentText ?? '';
  }

  const { content, truncated, bytes } = capBytes(raw, data.max_bytes);
  return {
    object: 'document',
    id: document.id,
    title: document.title,
    emoji: document.emoji,
    format: document.format,
    version: document.version,
    updatedAt: document.updatedAt,
    updatedByName: document.updatedByName,
    folderId: document.folderId,
    breadcrumbs: document.breadcrumbs,
    requestedFormat: data.format,
    totalBytes: bytes,
    truncated,
    content,
    ...(truncated ? { note: `El contenido pesa ${bytes} bytes y se devolvieron ${data.max_bytes}. Subí max_bytes (tope 500000) para leer más.` } : {}),
  };
}

async function documentsBacklinks(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsRead', DOCUMENTS_PLUGIN);
  const data = parse(documentsBacklinksSchema, input);
  const backlinks = await listBacklinks(context.teamId, data.document_id);
  return { object: 'document_backlinks', document_id: data.document_id, count: backlinks.length, backlinks };
}

async function documentsMove(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsWrite', DOCUMENTS_PLUGIN);
  const data = parse(documentsMoveSchema, input);
  const result = await moveDocument({
    teamId: context.teamId,
    id: data.document_id,
    folderId: data.folder_id,
    position: data.position,
  });
  await audit(context, 'GROK_DOCUMENT_MOVED', data.document_id);
  return { success: true, ...result };
}

async function notesSyncCommitments(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'notesWrite', 'notes');
  await assertPermission(context, 'tasksWrite');
  const data = parse(notesSyncSchema, input);
  const note = await db.query.teamNotes.findFirst({
    where: and(eq(teamNotes.id, data.note_id), eq(teamNotes.teamId, context.teamId)),
  });
  if (!note) throw new Error(`La nota ${data.note_id} no existe en este equipo (resource="notes").`);
  if (!note.eventId) {
    throw new Error('Esta nota no está ligada a ningún evento: los compromisos se generan sólo para notas de reunión. Usá whatspro_generate_tasks_from_note para una nota suelta.');
  }
  const synced = await syncNoteCommitmentsToTasks(note, { teamId: context.teamId, userId: context.userId });
  const enriched = await attachCommitmentTaskStatus(synced);
  await audit(context, 'GROK_NOTE_COMMITMENTS_SYNCED', data.note_id);
  const commitments = (enriched?.commitments ?? []) as Array<Record<string, unknown>>;
  return {
    success: true,
    note_id: data.note_id,
    commitments,
    with_task: commitments.filter((c) => c.taskItemId).length,
    without_task: commitments.filter((c) => !c.taskItemId).length,
  };
}

/* ------------------------------------------------------------------ */
/* Cola de renovaciones de AAPP Space                                  */
/* ------------------------------------------------------------------ */

const renewalQueueSchema = z.object({
  action: z.enum(['list', 'apply']),
  status: z.array(z.enum(RENEWAL_STATUSES)).max(7).optional(),
  rule_key: z.array(z.enum(['before_30', 'before_14', 'before_3', 'expired'])).max(4).optional(),
  expires_within_days: z.number().int().min(0).max(365).optional(),
  only_expired: z.boolean().optional(),
  customer_id: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  refresh: z.boolean().default(true),
  operation: z.enum(RENEWAL_OPERATIONS).optional(),
  ids: z.array(z.number().int().positive()).min(1).max(500).optional(),
  confirm: z.boolean().optional(),
});

/** Mismo par de permisos que exige `getAappRenewalRequestContext` en las rutas HTTP. */
async function assertRenewalPermission(context: GrokActionContext, mode: 'read' | 'write') {
  await assertPermission(context, mode === 'read' ? 'scheduledMessagesRead' : 'scheduledMessagesWrite', SCHEDULED_MESSAGES_PLUGIN);
  await assertPermission(context, mode === 'read' ? 'aappSpaceRead' : 'aappSpaceWrite');
}

function addDaysToToday(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function tally<T extends string>(rows: Array<{ value: T }>) {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.value] = (counts[row.value] ?? 0) + 1;
  return counts;
}

async function renewalQueueList(data: z.infer<typeof renewalQueueSchema>, context: GrokActionContext) {
  await assertRenewalPermission(context, 'read');

  let refreshed: { created: number; updated: number; subscriptions: number } | null = null;
  if (data.refresh) {
    // Prepara los avisos igual que el GET de la pantalla: crea pendientes y
    // cancela los obsoletos. No aprueba ni envía nada.
    refreshed = await materializeAappRenewalCandidates(context.teamId, context.userId);
    if (refreshed.created || refreshed.updated) await audit(context, 'GROK_AAPP_RENEWAL_MATERIALIZED', refreshed.created);
  }

  const [candidates, config] = await Promise.all([
    listAappRenewalCandidates(context.teamId),
    db.query.teamAappRenewalConfigs.findFirst({
      where: eq(teamAappRenewalConfigs.teamId, context.teamId),
      columns: { enabled: true, instanceId: true, recipientSource: true, sendHour: true, sendMinute: true, timezone: true, enabledRuleKeys: true },
    }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const horizon = data.expires_within_days === undefined ? null : addDaysToToday(data.expires_within_days);
  const filtered = candidates.filter((candidate) => {
    if (data.status && !data.status.includes(candidate.status as (typeof RENEWAL_STATUSES)[number])) return false;
    if (data.rule_key && !data.rule_key.includes(candidate.ruleKey)) return false;
    if (data.customer_id && candidate.customerId !== data.customer_id) return false;
    if (data.only_expired && candidate.expirationDate >= today) return false;
    if (horizon && candidate.expirationDate > horizon) return false;
    return true;
  });

  const page = filtered.slice(0, data.limit).map((candidate) => ({
    id: candidate.id,
    status: candidate.status,
    ruleKey: candidate.ruleKey,
    subscriptionId: candidate.subscriptionId,
    customerId: candidate.customerId,
    customerName: candidate.customerName,
    planName: candidate.planName,
    expirationDate: candidate.expirationDate,
    dueDate: candidate.dueDate,
    sendAt: candidate.sendAt,
    recipientPhone: candidate.recipientPhone,
    resolvedRecipientSource: candidate.resolvedRecipientSource,
    usedAccountFallback: candidate.usedAccountFallback,
    instanceId: candidate.instanceId,
    // Sin destinatario o sin instancia, `approve` lo saltea en silencio.
    approvable: candidate.status === 'pending' && Boolean(candidate.recipientPhone) && Boolean(candidate.instanceId),
    message: candidate.message,
    sentAt: candidate.sentAt,
    error: candidate.error,
  }));

  return {
    action: 'list' as const,
    sequenceEnabled: config?.enabled ?? false,
    sequenceNote: config?.enabled
      ? 'La secuencia está activa: todo lo que apruebes se le va a enviar al cliente cuando llegue su send_at.'
      : 'La secuencia está DESACTIVADA en la configuración del equipo: mientras siga así, approve y retry no cambian nada (devuelven changed=0) y no se envía ningún mensaje.',
    config: config
      ? {
        instanceId: config.instanceId,
        recipientSource: config.recipientSource,
        sendTime: `${String(config.sendHour).padStart(2, '0')}:${String(config.sendMinute).padStart(2, '0')}`,
        timezone: config.timezone,
        enabledRuleKeys: config.enabledRuleKeys,
      }
      : null,
    refreshed,
    totalInQueue: candidates.length,
    matchingFilters: filtered.length,
    returned: page.length,
    omitted: Math.max(0, filtered.length - page.length),
    note: page.length < filtered.length
      ? `${filtered.length} candidatos cumplen los filtros y se devuelven ${page.length}. Subí limit (tope 200) o afiná status/rule_key para ver el resto.`
      : 'Se devuelven todos los candidatos que cumplen los filtros.',
    byStatus: tally(candidates.map((candidate) => ({ value: candidate.status }))),
    byRuleKey: tally(candidates.map((candidate) => ({ value: candidate.ruleKey }))),
    candidates: page,
  };
}

async function renewalQueueApply(data: z.infer<typeof renewalQueueSchema>, context: GrokActionContext) {
  await assertRenewalPermission(context, 'write');
  if (!data.operation) throw new Error('operation is required when action="apply".');
  if (!data.ids?.length) throw new Error('ids is required when action="apply".');
  if (data.confirm !== true) {
    throw new Error('confirm must be true: approve y retry autorizan el envío de mensajes de WhatsApp a clientes reales.');
  }

  const result = await applyAappRenewalAction({
    teamId: context.teamId,
    userId: context.userId,
    ids: data.ids,
    action: data.operation,
  });
  await audit(context, `GROK_AAPP_RENEWAL_${data.operation.toUpperCase()}`, `${data.ids.length}:${data.ids[0]}`);

  const after = await db.select({
    id: teamAappRenewalCandidates.id,
    status: teamAappRenewalCandidates.status,
    customerId: teamAappRenewalCandidates.customerId,
    recipientPhone: teamAappRenewalCandidates.recipientPhone,
    sendAt: teamAappRenewalCandidates.sendAt,
    error: teamAappRenewalCandidates.error,
  }).from(teamAappRenewalCandidates)
    .where(and(eq(teamAappRenewalCandidates.teamId, context.teamId), inArray(teamAappRenewalCandidates.id, data.ids)))
    .orderBy(asc(teamAappRenewalCandidates.id))
    .limit(200);

  const approving = data.operation === 'approve' || data.operation === 'retry';
  return {
    action: 'apply' as const,
    operation: data.operation,
    requested: data.ids.length,
    changed: result.changed,
    // Se saltean los que no estaban en el estado de origen, y en approve/retry
    // también los que no tienen teléfono o instancia resueltos.
    skipped: result.skipped,
    notFoundOrUnchanged: Math.max(0, data.ids.length - result.changed - result.skipped),
    effect: approving
      ? 'Los candidatos que quedaron en approved los va a tomar el cron de renovaciones y le va a enviar el WhatsApp al cliente cuando llegue su send_at. Todavía se pueden dar de baja con operation="revoke" si el cron no los tomó.'
      : 'Solo se cambió el estado interno de la cola; no se envió ni se canceló ningún mensaje ya enviado.',
    returned: after.length,
    omitted: Math.max(0, data.ids.length - after.length),
    candidates: after,
  };
}

/* ------------------------------------------------------------------ */
/* Despacho                                                            */
/* ------------------------------------------------------------------ */

const attachMediaSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(3).max(180),
  content_base64: z.string().min(4),
  document_id: z.number().int().positive().nullable().optional(),
});

async function documentsAttachMedia(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'documentsWrite', 'documents');
  const data = parse(attachMediaSchema, input);
  // Un base64 con el prefijo `data:image/png;base64,` es el error más frecuente
  // desde un modelo, y sin recortarlo el archivo queda corrupto en silencio.
  const raw = data.content_base64.replace(/^data:[^;]+;base64,/, '');
  const bytes = Buffer.from(raw, 'base64');
  if (!bytes.length) throw new Error('content_base64 no es base64 válido.');
  try {
    const media = await uploadDocumentMedia({
      teamId: context.teamId,
      userId: context.userId,
      fileName: data.file_name,
      mimeType: data.mime_type,
      bytes,
      documentId: data.document_id ?? null,
    });
    await audit(context, 'CONNECTOR_DOCUMENT_MEDIA_UPLOADED', media.id);
    return {
      success: true,
      media,
      next_step: data.document_id
        ? 'La imagen quedó adjunta. Para que se vea, insertala en el cuerpo con whatspro_manage_document usando la url devuelta.'
        : 'La imagen quedó subida sin documento. Volvé a llamar con document_id, o insertá la url en el cuerpo de un documento.',
    };
  } catch (error) {
    if (error instanceof DocumentMediaError) throw new Error(error.message);
    throw error;
  }
}

export async function executeKnowledgeTool(name: string, input: Record<string, unknown>, context: GrokActionContext) {
  if (name === 'whatspro_documents_attach_media') return documentsAttachMedia(input, context);
  if (name === 'whatspro_documents_search') return documentsSearch(input, context);
  if (name === 'whatspro_documents_read') return documentsRead(input, context);
  if (name === 'whatspro_documents_backlinks') return documentsBacklinks(input, context);
  if (name === 'whatspro_documents_move') return documentsMove(input, context);
  if (name === 'whatspro_notes_sync_commitments') return notesSyncCommitments(input, context);
  if (name === 'whatspro_memberships_renewal_queue') {
    const data = parse(renewalQueueSchema, input);
    return data.action === 'apply' ? renewalQueueApply(data, context) : renewalQueueList(data, context);
  }
  throw new Error(`Unknown knowledge tool: ${name}`);
}
