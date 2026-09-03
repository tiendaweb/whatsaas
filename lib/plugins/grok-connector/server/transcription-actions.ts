import 'server-only';

import { and, asc, eq, ilike, isNull, lt, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { chats, messageAudioInsights, messages } from '@/lib/db/schema';
import { MEDIA_LINK_MAX_TTL_SECONDS, crearEnlaceFirmado } from '@/lib/plugins/grok-connector/server/media-link';
import {
  AUDIO_INSIGHTS_CONFIG,
  analizarAudio,
  audiosBloqueados,
  encolarAudios,
  estadoDeLaCola,
  guardarFichaExterna,
  teamHabilitado,
  transcribirAudio,
} from '@/lib/audio-insights';
import {
  assertPermission,
  audit,
  parse,
  type GrokActionContext,
  type GrokActionTool,
} from '@/lib/plugins/grok-connector/server/actions';

/** Igual que en media-actions: sin esta base no se pueden firmar descargas. */
type TranscriptionContext = GrokActionContext & { privateMediaBaseUrl?: string };

/**
 * Escuchar los audios del chat, desde cualquier conector.
 *
 * `whatspro_chat_media_get` entrega el audio como bloque MCP, pero eso sólo
 * sirve si el modelo del otro lado escucha audio, y ninguno de Claude lo hace.
 * El que escucha es el servidor, con el banco de API keys de Gemini.
 *
 * Dos caminos a propósito:
 *  - `whatspro_transcribe_media` gasta una request YA, para un audio puntual.
 *  - `whatspro_audio_queue_add` encola sin gastar, y el worker drena al ritmo
 *    que el free tier aguante. Es el camino para "escuchá todo lo de este
 *    cliente": mil audios de una no entran en la cuota de ningún minuto.
 */

export const transcriptionActionTools: GrokActionTool[] = [
  {
    name: 'whatspro_transcribe_media',
    description:
      'Transcribe AHORA un audio o nota de voz y devuelve el texto. Pasá el message_id (lo devuelve whatspro_chat_media_list con type "audio"). '
      + 'Si ya estaba transcripto responde al instante y sin consumir cuota. '
      + 'Gasta requests del banco de API keys de Gemini: para muchos audios de una vez usá whatspro_audio_queue_add, que no gasta al encolar. '
      + 'Junto con el texto deja hecho el análisis (resumen, intención, urgencia), salvo que el equipo lo haya desactivado.',
    inputSchema: {
      type: 'object',
      required: ['message_id'],
      properties: {
        message_id: { type: 'string', minLength: 1, maxLength: 255 },
        refresh: { type: 'boolean', description: 'Rehace la transcripción aunque ya haya una guardada.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_audio_analyze',
    description:
      'Sobre un audio YA transcripto, saca resumen, intención (consulta, pedido, reclamo, pago, coordinación…), urgencia, ánimo, los montos y fechas que se mencionan y qué tendría que hacer el negocio. '
      + 'Normalmente ya está hecho: el análisis corre solo apenas se transcribe el audio. Esta herramienta sirve para rehacerlo (refresh: true) o para completarlo cuando quedó pendiente. '
      + 'Si el audio todavía no está transcripto, primero pasalo por whatspro_transcribe_media. Repetir la llamada devuelve lo guardado sin gastar.',
    inputSchema: {
      type: 'object',
      required: ['message_id'],
      properties: {
        message_id: { type: 'string', minLength: 1, maxLength: 255 },
        refresh: { type: 'boolean', description: 'Rehace el análisis aunque ya haya uno guardado.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_audio_queue_add',
    description:
      'Manda audios a la cola de transcripción SIN gastar cuota en el momento: el worker los va procesando de a poco, respetando el límite por minuto y por día de cada API key del banco. '
      + 'Es la forma correcta de pedir "transcribí todos los audios de este cliente" o "poné al día los audios de la semana". '
      + 'Podés acotar por chat_id, por una lista de message_ids, o dejar que tome los audios entrantes sin transcribir más recientes. '
      + 'Devuelve cuántos entraron a la cola y cuánta capacidad le queda hoy al banco de keys. Encolar algo que ya está en cola o transcripto no lo duplica.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'integer', minimum: 1, description: 'Acotar a una conversación.' },
        message_ids: {
          type: 'array',
          items: { type: 'string', minLength: 1, maxLength: 255 },
          maxItems: 200,
          description: 'Audios puntuales a encolar.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Tope de audios a encolar. Por defecto 100.' },
        days: { type: 'integer', minimum: 1, maximum: 3650, description: 'Cuántos días hacia atrás mirar. Por defecto 30.' },
        priority: { type: 'integer', minimum: 0, maximum: 10, description: 'Más alto se procesa antes. Por defecto 5 para lo pedido a mano.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_audio_queue_takeover',
    description:
      'Devuelve los audios que el banco de API keys NO pudo transcribir (se quedó sin cuota gratuita, el modelo estaba saturado, o el error se repite), cada uno con un enlace de descarga temporal listo para usar. '
      + 'Es el plan B: si vos podés escuchar audio, bajalos con download_url, transcribilos y devolvé el resultado con whatspro_audio_insight_write. Eso usa TU cuota y no la del banco. '
      + 'Si no podés escuchar audio, no llames a esta herramienta: los audios van a salir solos cuando el banco recupere cuota. '
      + 'Los enlaces vencen (por defecto a los 15 minutos) y sirven una sola cosa: descargar ese archivo.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Cuántos traer. Por defecto 5: son archivos, no texto.' },
        ttl_seconds: { type: 'integer', minimum: 60, maximum: MEDIA_LINK_MAX_TTL_SECONDS, description: 'Cuánto vale el enlace de descarga. Por defecto 900 (15 minutos).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_audio_insight_write',
    description:
      'Guarda en WhatsPro lo que VOS entendiste de un audio, sin usar la cuota del banco de API keys. '
      + 'Para cuando escuchaste el audio por tu cuenta (bajándolo con whatspro_chat_media_get o whatspro_chat_media_link) o cuando corregís una transcripción que salió mal. '
      + 'Mandá el message_id y el transcript; opcionalmente summary, intent, urgency, sentiment, language, entities y action_items. '
      + 'Lo guardado queda disponible para todos: aparece en whatspro_chat_media_list, en el chat y en los informes, igual que si lo hubiera transcripto el servidor. '
      + 'OJO: si el audio ya tiene transcripción no la pisa, salvo que mandes overwrite: true. Queda registrado que la ficha vino de un conector y no del banco.',
    inputSchema: {
      type: 'object',
      required: ['message_id'],
      properties: {
        message_id: { type: 'string', minLength: 1, maxLength: 255 },
        transcript: { type: 'string', maxLength: 20000, description: 'Lo que dice el audio, palabra por palabra. Obligatorio si el audio no tiene ninguna transcripción guardada.' },
        summary: { type: 'string', maxLength: 1000 },
        intent: { type: 'string', enum: ['consulta', 'pedido', 'reclamo', 'pago', 'coordinacion', 'seguimiento', 'saludo', 'otro'] },
        urgency: { type: 'string', enum: ['baja', 'media', 'alta'] },
        sentiment: { type: 'string', enum: ['positivo', 'neutral', 'negativo'] },
        language: { type: 'string', maxLength: 16, description: 'Código ISO de dos letras.' },
        entities: {
          type: 'object',
          description: 'Montos, fechas, lugares, productos y personas que se nombran.',
          additionalProperties: true,
        },
        action_items: { type: 'array', items: { type: 'string', maxLength: 300 }, maxItems: 20 },
        source: { type: 'string', maxLength: 24, description: 'Quién lo produjo: "claude", "chatgpt", "grok", "humano". Queda registrado.' },
        overwrite: { type: 'boolean', description: 'Reemplaza una transcripción ya guardada.' },
      },
      additionalProperties: false,
    },
  },
];

export const transcriptionReadTools: GrokActionTool[] = [
  {
    name: 'whatspro_pending_audios',
    description:
      'Lista los audios que todavía NO fueron transcriptos, del más viejo al más nuevo, con el message_id de cada uno. '
      + 'Responde "¿qué audios quedaron sin escuchar?". Los que están en cola ya van a ser procesados solos por el worker: no hace falta pedirlos de nuevo. '
      + 'Trae failed_reason cuando un audio se intentó y falló.',
    inputSchema: {
      type: 'object',
      properties: {
        chat_id: { type: 'integer', minimum: 1, description: 'Acotar a una conversación.' },
        only_incoming: { type: 'boolean', description: 'Sólo los que mandó el cliente. Por defecto true.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Por defecto 25.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'whatspro_audio_queue_status',
    description:
      'Estado de la cola de transcripción y del banco de API keys de Gemini: cuántos audios esperan y cuántos minutos son, cuántos ya están transcriptos, cuántos fallaron, y cuánta cuota gratuita le queda hoy al banco (requests disponibles y por minuto). '
      + 'Sirve para saber si vale la pena encolar más o si el banco ya está al tope. Si "restanteHoy" es 0, encolar igual está bien: se procesa mañana.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

const messageIdSchema = z.object({
  message_id: z.string().trim().min(1).max(255),
  refresh: z.boolean().optional(),
});

const encolarSchema = z.object({
  chat_id: z.number().int().positive().optional(),
  message_ids: z.array(z.string().trim().min(1).max(255)).max(200).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  days: z.number().int().min(1).max(3650).optional(),
  priority: z.number().int().min(0).max(10).default(5),
});

const fichaExternaSchema = z.object({
  message_id: z.string().trim().min(1).max(255),
  transcript: z.string().trim().max(20000).optional(),
  summary: z.string().trim().max(1000).optional(),
  intent: z.string().trim().max(48).optional(),
  urgency: z.string().trim().max(16).optional(),
  sentiment: z.string().trim().max(16).optional(),
  language: z.string().trim().max(16).optional(),
  entities: z.record(z.string(), z.unknown()).optional(),
  action_items: z.array(z.string().trim().max(300)).max(20).optional(),
  source: z.string().trim().max(24).optional(),
  overwrite: z.boolean().optional(),
});

const takeoverSchema = z.object({
  limit: z.number().int().min(1).max(25).default(5),
  ttl_seconds: z.number().int().min(60).max(MEDIA_LINK_MAX_TTL_SECONDS).optional(),
});

const pendingSchema = z.object({
  chat_id: z.number().int().positive().optional(),
  only_incoming: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(25),
});

/** El teamId del contexto es lo que impide tocar el audio de otro equipo con un id adivinado. */
async function cargarAudioDelEquipo(messageId: string, teamId: number) {
  const fila = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      mediaUrl: messages.mediaUrl,
      mediaMimetype: messages.mediaMimetype,
      mediaSeconds: messages.mediaSeconds,
      fromMe: messages.fromMe,
      timestamp: messages.timestamp,
      remoteJid: chats.remoteJid,
      chatName: chats.name,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(messages.id, messageId), eq(chats.teamId, teamId)))
    .limit(1)
    .then((filas) => filas[0]);

  if (!fila) throw new Error('El mensaje no existe o no pertenece a este equipo.');
  if (!fila.mediaUrl) throw new Error('Ese mensaje no tiene audio adjunto.');
  return fila;
}

async function transcribir(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'messagesRead');
  const data = parse(messageIdSchema, input);
  const fila = await cargarAudioDelEquipo(data.message_id, context.teamId);

  const resultado = await transcribirAudio(fila.id, { force: data.refresh === true, requestedBy: 'connector' });
  if (!resultado.ok) {
    // Cuota agotada o modelo saturado no son errores del audio: se avisa que
    // quedó en cola en vez de dar por perdido el pedido.
    if (resultado.reintentable) {
      return {
        success: false,
        en_cola: true,
        message_id: fila.id,
        error: resultado.error,
        sugerencia: 'El audio quedó en la cola y se va a transcribir cuando haya cuota disponible. Consultá whatspro_audio_queue_status, o transcribilo vos y guardalo con whatspro_audio_insight_write.',
      };
    }
    throw new Error(resultado.error);
  }

  await audit(context, 'GROK_MEDIA_TRANSCRIBED', fila.id);

  // El análisis corre encadenado a la transcripción, así que a esta altura ya
  // está guardado: devolverlo evita una segunda llamada para leer lo mismo.
  const ficha = await db.query.messageAudioInsights.findFirst({
    where: eq(messageAudioInsights.messageId, fila.id),
  });

  return {
    success: true,
    cached: resultado.cached,
    api_key: resultado.keyLabel ?? null,
    message_id: fila.id,
    chat_id: fila.chatId,
    contacto: fila.chatName ?? fila.remoteJid.replace(/@.*$/, ''),
    del_cliente: !fila.fromMe,
    duracion_segundos: fila.mediaSeconds,
    fecha: fila.timestamp.toISOString(),
    transcripcion: resultado.transcript,
    resumen: ficha?.summary || null,
    intencion: ficha?.intent || null,
    urgencia: ficha?.urgency || null,
    animo: ficha?.sentiment || null,
    menciones: ficha?.entities ?? {},
    a_hacer: ficha?.actionItems ?? [],
  };
}

async function analizar(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'messagesRead');
  const data = parse(messageIdSchema, input);
  const fila = await cargarAudioDelEquipo(data.message_id, context.teamId);

  const resultado = await analizarAudio(fila.id, { force: data.refresh === true });
  if (!resultado.ok) throw new Error(resultado.error);

  const ficha = await db.query.messageAudioInsights.findFirst({
    where: eq(messageAudioInsights.messageId, fila.id),
  });

  return {
    success: true,
    cached: resultado.cached,
    message_id: fila.id,
    chat_id: fila.chatId,
    contacto: fila.chatName ?? fila.remoteJid.replace(/@.*$/, ''),
    transcripcion: ficha?.transcript ?? '',
    resumen: ficha?.summary || null,
    intencion: ficha?.intent || null,
    urgencia: ficha?.urgency || null,
    animo: ficha?.sentiment || null,
    idioma: ficha?.language || null,
    menciones: ficha?.entities ?? {},
    a_hacer: ficha?.actionItems ?? [],
  };
}

async function encolar(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'messagesRead');
  const data = parse(encolarSchema, input);

  // El chat_id se valida contra el equipo antes de encolar: sin esto se podría
  // llenar la cola con audios ajenos, aunque después no se pudieran leer.
  if (data.chat_id) {
    const chat = await db.query.chats.findFirst({
      where: and(eq(chats.id, data.chat_id), eq(chats.teamId, context.teamId)),
      columns: { id: true },
    });
    if (!chat) throw new Error('Esa conversación no existe o no pertenece a este equipo.');
  }

  const resultado = await encolarAudios({
    teamId: context.teamId,
    chatId: data.chat_id,
    messageIds: data.message_ids,
    limit: data.limit,
    maxAgeDays: data.days,
    priority: data.priority,
    requestedBy: 'connector',
  });

  const estado = await estadoDeLaCola(context.teamId);
  return {
    success: !resultado.motivo,
    encolados: resultado.encolados,
    ya_estaban: resultado.yaEstaban,
    motivo: resultado.motivo ?? null,
    cola: estado,
    nota: resultado.encolados > 0
      ? 'Se procesan solos, de a poco, respetando la cuota gratuita. Mirá el avance con whatspro_audio_queue_status.'
      : 'No había audios nuevos para encolar con esos filtros.',
  };
}

async function takeover(input: Record<string, unknown>, context: TranscriptionContext) {
  await assertPermission(context, 'messagesRead');
  const data = parse(takeoverSchema, input);

  const bloqueados = await audiosBloqueados(context.teamId, data.limit);
  const items = bloqueados.map((fila) => {
    // Sin base de descarga (conector viejo) se devuelve igual el message_id:
    // el audio se puede bajar con whatspro_chat_media_get.
    const enlace = context.privateMediaBaseUrl
      ? crearEnlaceFirmado({
        baseUrl: `${context.privateMediaBaseUrl}/${encodeURIComponent(fila.messageId)}`,
        teamId: context.teamId,
        messageId: fila.messageId,
        ttlSeconds: data.ttl_seconds,
      })
      : null;

    return {
      message_id: fila.messageId,
      chat_id: fila.chatId,
      contacto: fila.chatName ?? fila.remoteJid.replace(/@.*$/, ''),
      del_cliente: !fila.fromMe,
      duracion_segundos: fila.durationSeconds,
      mime_type: (fila.mediaMimetype ?? '').split(';')[0]?.trim() || null,
      fecha: fila.timestamp.toISOString(),
      intentos: fila.attempts,
      motivo: fila.error || null,
      download_url: enlace?.url ?? null,
      download_expires_at: enlace?.expiresAt ?? null,
    };
  });

  if (items.length) await audit(context, 'GROK_AUDIO_TAKEOVER', String(items.length));

  return {
    object: 'audio_takeover',
    count: items.length,
    data: items,
    como_seguir: items.length
      ? 'Bajá cada download_url, escuchá el audio y devolvé lo que dice con whatspro_audio_insight_write (message_id + transcript, y si podés summary, intent y urgency). Si no podés escuchar audio, dejalos: el banco los va a tomar cuando recupere cuota.'
      : 'No hay audios trabados: el banco de API keys está dando abasto.',
  };
}

async function guardarFicha(input: Record<string, unknown>, context: GrokActionContext) {
  // Escribe contenido que después leen otras personas del equipo: pide el
  // permiso de escritura, no el de lectura.
  await assertPermission(context, 'messagesSend');
  const data = parse(fichaExternaSchema, input);

  const resultado = await guardarFichaExterna({
    teamId: context.teamId,
    messageId: data.message_id,
    origen: 'connector',
    fuente: data.source || 'connector',
    overwrite: data.overwrite,
    ficha: {
      transcript: data.transcript,
      summary: data.summary,
      intent: data.intent,
      urgency: data.urgency,
      sentiment: data.sentiment,
      language: data.language,
      entities: data.entities,
      actionItems: data.action_items,
    },
  });
  if (!resultado.ok) throw new Error(resultado.error);

  await audit(context, 'GROK_AUDIO_INSIGHT_WRITTEN', data.message_id);

  return {
    success: true,
    creada: resultado.creada,
    message_id: data.message_id,
    nota: 'Guardado. No consumió cuota del banco de API keys y ya está visible en el resto del sistema.',
  };
}

async function estadoCola(_input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'messagesRead');
  const estado = await estadoDeLaCola(context.teamId);
  return {
    object: 'audio_queue_status',
    habilitado: teamHabilitado(context.teamId),
    ...estado,
    nota: estado.banco.activas === 0
      ? 'No hay ninguna API key de Gemini cargada en el banco: la cola no puede avanzar. Se cargan en la app Gemini.'
      : null,
  };
}

async function audiosPendientes(input: Record<string, unknown>, context: GrokActionContext) {
  await assertPermission(context, 'messagesRead');
  const data = parse(pendingSchema, input);

  const condiciones = [
    eq(chats.teamId, context.teamId),
    or(eq(messages.messageType, 'audioMessage'), ilike(messages.mediaMimetype, 'audio/%'))!,
    sql`${messages.mediaUrl} is not null`,
    // Sin ficha, o con una que no llegó a transcribirse y todavía tiene
    // reintentos. Los que agotaron los intentos no son "pendientes": son
    // fallidos, y contarlos como cola hace que la lista nunca baje.
    or(
      isNull(messageAudioInsights.id),
      eq(messageAudioInsights.status, 'queued'),
      and(
        eq(messageAudioInsights.status, 'failed'),
        lt(messageAudioInsights.attempts, AUDIO_INSIGHTS_CONFIG.maxAttempts),
      ),
    )!,
  ];
  if (data.chat_id) condiciones.push(eq(messages.chatId, data.chat_id));
  if (data.only_incoming) condiciones.push(eq(messages.fromMe, false));

  const pendientes = await db
    .select({
      id: messages.id,
      mediaSeconds: messages.mediaSeconds,
      fromMe: messages.fromMe,
      timestamp: messages.timestamp,
      chatId: messages.chatId,
      remoteJid: chats.remoteJid,
      chatName: chats.name,
      estado: messageAudioInsights.status,
      error: messageAudioInsights.error,
      attempts: messageAudioInsights.attempts,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .leftJoin(messageAudioInsights, eq(messageAudioInsights.messageId, messages.id))
    .where(and(...condiciones))
    .orderBy(asc(messages.timestamp))
    .limit(data.limit);

  const totalSegundos = pendientes.reduce((suma, fila) => suma + (fila.mediaSeconds ?? 0), 0);

  return {
    object: 'pending_audios',
    count: pendientes.length,
    minutos_sin_escuchar: Math.round((totalSegundos / 60) * 10) / 10,
    nota: teamHabilitado(context.teamId)
      ? null
      : 'Este equipo no tiene habilitadas las fichas de audio: estos audios no los va a procesar nadie.',
    data: pendientes.map((fila) => ({
      message_id: fila.id,
      chat_id: fila.chatId,
      contacto: fila.chatName ?? fila.remoteJid.replace(/@.*$/, ''),
      del_cliente: !fila.fromMe,
      duracion_segundos: fila.mediaSeconds,
      fecha: fila.timestamp.toISOString(),
      en_cola: fila.estado === 'queued',
      failed_reason: fila.error || null,
      intentos: fila.attempts ?? 0,
    })),
  };
}

export async function executeTranscriptionTool(
  name: string,
  input: Record<string, unknown>,
  context: TranscriptionContext,
) {
  if (name === 'whatspro_transcribe_media') return transcribir(input, context);
  if (name === 'whatspro_audio_analyze') return analizar(input, context);
  if (name === 'whatspro_audio_queue_add') return encolar(input, context);
  if (name === 'whatspro_audio_insight_write') return guardarFicha(input, context);
  if (name === 'whatspro_audio_queue_takeover') return takeover(input, context);
  if (name === 'whatspro_audio_queue_status') return estadoCola(input, context);
  if (name === 'whatspro_pending_audios') return audiosPendientes(input, context);
  throw new Error(`Unknown transcription tool: ${name}`);
}
