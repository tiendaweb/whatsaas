/**
 * Audios de los frentes comerciales: los que están en Dinero y Oportunidades.
 *
 * La cola de fichas de audio se llena por antigüedad y con una ventana de días
 * hacia atrás, así que los chats donde hay plata en juego —que suelen ser
 * viejos, ese es justamente el problema que el Command Center vino a resolver—
 * quedaban afuera: al 2026-08-31 había 1.846 audios de chats de Dinero y 147 de
 * Oportunidades sin siquiera entrar en la cola.
 *
 * Encolar no gasta cuota (eso lo hace el worker, que ya drena estos primero por
 * el orden de `proximosDeLaCola`): esto sólo arma la lista de pendientes.
 */
import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamCommercialAnalysis } from '@/lib/db/schema';
import { encolarAudios } from '@/lib/audio-insights';
import { MONEY_GATES } from './queries';
import { FRONT_OPPORTUNITY_GATES } from '../shared/taxonomy';

/** Ventana amplia a propósito: el audio que explica una venta trabada puede ser de hace un año. */
const MAX_AGE_DIAS = 3650;

export type EncoladoDeFrentes = { chats: number; encolados: number; yaEstaban: number };

/** Chats del equipo que hoy están en Dinero u Oportunidades. */
export async function chatsDeFrentes(teamId: number): Promise<number[]> {
  const filas = await db
    .select({ chatId: teamCommercialAnalysis.chatId })
    .from(teamCommercialAnalysis)
    .where(and(
      eq(teamCommercialAnalysis.teamId, teamId),
      or(
        and(inArray(teamCommercialAnalysis.currentGate, MONEY_GATES), ne(teamCommercialAnalysis.status, 'cliente')),
        inArray(teamCommercialAnalysis.currentGate, FRONT_OPPORTUNITY_GATES),
      ),
    ));
  return [...new Set(filas.map((f) => f.chatId))];
}

/**
 * Encola los audios pendientes de esos chats. `limit` es el tope por corrida
 * (`encolarAudios` corta en 2.000): el cron diario va sumando de a tandas en
 * vez de meter miles de filas de un saque.
 */
export async function encolarAudiosDeFrentes(teamId: number, opciones: { limit?: number } = {}): Promise<EncoladoDeFrentes> {
  const chatIds = await chatsDeFrentes(teamId);
  if (!chatIds.length) return { chats: 0, encolados: 0, yaEstaban: 0 };

  const resultado = await encolarAudios({
    teamId,
    chatIds,
    limit: opciones.limit ?? 1000,
    maxAgeDays: MAX_AGE_DIAS,
    // Prioridad 0: el orden lo pone el frente comercial en `proximosDeLaCola`.
    // Estampar prioridad acá los pondría por delante de lo que un humano pidió
    // a mano, que es el único caso que debería ganarle a todo.
    priority: 0,
    requestedBy: 'radar',
  });

  return { chats: chatIds.length, encolados: resultado.encolados, yaEstaban: resultado.yaEstaban };
}

// ── Vista Audios del Command Center ─────────────────────────────────────────

import { desc, isNotNull, like, sql as sqlTag } from 'drizzle-orm';
import { contacts, messageAudioInsights, messages, teamCommercialAnalysis as analisis, chats as chatsTable } from '@/lib/db/schema';
import { resolveMediaUrl } from '@/lib/media-url';
import { analizarAudio, guardarFichaExterna, transcribirAudio, type FichaExterna } from '@/lib/audio-insights';
import { launchRun } from './prompt-queue';
import { getSalesOpsSettings, patchSalesOpsSettings } from './settings';
import { notInArray as notIn } from 'drizzle-orm';

export type AudioEstado = 'pendientes' | 'en_cola' | 'transcriptos' | 'fallidos' | 'todos';

export type AudioFila = {
  messageId: string;
  chatId: number;
  nombre: string;
  gate: string | null;
  fromMe: boolean;
  timestamp: string;
  seconds: number | null;
  /** Reproducible desde el navegador con la sesión del usuario (`/api/media?path=`). */
  src: string | null;
  enCola: boolean;
  insight: {
    status: 'pending' | 'queued' | 'done' | 'failed' | null;
    transcript: string | null;
    summary: string | null;
    intent: string | null;
    urgency: string | null;
    sentiment: string | null;
    error: string | null;
    provider: string | null;
    analyzedAt: string | null;
  };
};

/**
 * Notas de voz de los chats, con su ficha si la tienen.
 *
 * "En cola" es la misma pregunta que en las listas: el chat tiene una acción
 * del Command Center sin ejecutar o un prompt esperando conector. Es lo que
 * conviene escuchar primero, porque algo le va a salir y el audio puede
 * cambiar el texto.
 */
export async function listAudios(
  teamId: number,
  opts: { estado?: AudioEstado; soloEnCola?: boolean; soloEntrantes?: boolean; chatId?: number; q?: string; limit?: number } = {},
): Promise<AudioFila[]> {
  const m = messages;
  const c = chatsTable;
  const i = messageAudioInsights;
  const conds = [
    eq(c.teamId, teamId),
    isNotNull(m.mediaUrl),
    or(eq(m.messageType, 'audioMessage'), like(m.mediaMimetype, 'audio/%')),
    sqlTag`${c.remoteJid} NOT LIKE '%@g.us'`,
  ];
  if (opts.soloEntrantes !== false) conds.push(eq(m.fromMe, false));
  const nunca = (await getSalesOpsSettings(teamId)).audioNeverChatIds;
  if (nunca.length) conds.push(notIn(m.chatId, nunca));
  if (opts.chatId) conds.push(eq(m.chatId, opts.chatId));
  const estado = opts.estado ?? 'pendientes';
  // "Sin transcribir" son los accionables: los que están en cola hace rato y no
  // se procesan (falta de cuota) tapaban la lista, así que tienen su pestaña.
  if (estado === 'pendientes') conds.push(sqlTag`${i.status} IS NULL OR ${i.status} = 'pending'`);
  else if (estado === 'en_cola') conds.push(eq(i.status, 'queued'));
  else if (estado === 'transcriptos') conds.push(eq(i.status, 'done'));
  else if (estado === 'fallidos') conds.push(eq(i.status, 'failed'));
  const enColaSql = sqlTag<boolean>`(
    exists (select 1 from team_commercial_actions ac where ac.team_id = ${teamId} and ac.chat_id = ${c.id} and ac.status in ('proposed','pending_approval','approved','executing'))
    or exists (select 1 from team_prompt_runs pr where pr.team_id = ${teamId} and pr.target_kind = 'chat' and pr.target_id = ${c.id}::text and pr.status in ('queued','in_progress'))
  )`;
  if (opts.soloEnCola) conds.push(enColaSql);
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    conds.push(or(like(c.name, q), like(contacts.name, q), like(i.transcript, q), like(c.remoteJid, q)));
  }

  const rows = await db
    .select({
      messageId: m.id,
      chatId: m.chatId,
      chatName: c.name,
      pushName: c.pushName,
      remoteJid: c.remoteJid,
      contactName: contacts.name,
      gate: analisis.currentGate,
      fromMe: m.fromMe,
      timestamp: m.timestamp,
      seconds: m.mediaSeconds,
      mediaUrl: m.mediaUrl,
      enCola: enColaSql,
      status: i.status,
      transcript: i.transcript,
      summary: i.summary,
      intent: i.intent,
      urgency: i.urgency,
      sentiment: i.sentiment,
      error: i.error,
      provider: i.provider,
      analyzedAt: i.analyzedAt,
    })
    .from(m)
    .innerJoin(c, eq(c.id, m.chatId))
    .leftJoin(i, eq(i.messageId, m.id))
    .leftJoin(contacts, and(eq(contacts.chatId, c.id), eq(contacts.teamId, teamId)))
    .leftJoin(analisis, and(eq(analisis.chatId, c.id), eq(analisis.teamId, teamId)))
    .where(and(...conds))
    .orderBy(desc(m.timestamp))
    .limit(Math.min(Math.max(opts.limit ?? 60, 1), 200));

  return rows.map((r) => ({
    messageId: r.messageId,
    chatId: r.chatId,
    nombre: r.contactName?.trim() || r.chatName?.trim() || r.pushName?.trim() || `…${(r.remoteJid || '').replace(/\D/g, '').slice(-4)}`,
    gate: r.gate ?? null,
    fromMe: Boolean(r.fromMe),
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
    seconds: r.seconds ?? null,
    src: resolveMediaUrl(r.mediaUrl),
    enCola: Boolean(r.enCola),
    insight: {
      status: (r.status as AudioFila['insight']['status']) ?? null,
      transcript: r.transcript ?? null,
      summary: r.summary ?? null,
      intent: r.intent ?? null,
      urgency: r.urgency ?? null,
      sentiment: r.sentiment ?? null,
      error: r.error ?? null,
      provider: r.provider ?? null,
      analyzedAt: r.analyzedAt ? r.analyzedAt.toISOString() : null,
    },
  }));
}

export type AudioAccion =
  | { action: 'transcribe' }
  | { action: 'analyze' }
  | { action: 'queue' }
  | { action: 'dequeue' }
  | { action: 'write'; ficha: FichaExterna }
  | { action: 'ask_connector'; nota?: string };

/** Comprueba que el audio sea del equipo y devuelve lo mínimo para actuar. */
async function audioDelEquipo(teamId: number, messageId: string) {
  const [row] = await db
    .select({ messageId: messages.id, chatId: messages.chatId, mediaUrl: messages.mediaUrl, seconds: messages.mediaSeconds, timestamp: messages.timestamp, chatName: chatsTable.name, pushName: chatsTable.pushName })
    .from(messages)
    .innerJoin(chatsTable, eq(chatsTable.id, messages.chatId))
    .where(and(eq(messages.id, messageId), eq(chatsTable.teamId, teamId)))
    .limit(1);
  return row ?? null;
}

/**
 * Acciones a mano sobre un audio: transcribir o analizar ya (con el banco de
 * keys), encolarlo con prioridad, guardar una ficha corregida por una
 * persona, o pedirle a un conector que lo escuche y dé contexto.
 */
export async function actOnAudio(teamId: number, userId: number, messageId: string, input: AudioAccion): Promise<Record<string, unknown>> {
  const audio = await audioDelEquipo(teamId, messageId);
  if (!audio) throw new Error('El audio no existe en este equipo.');
  if (input.action === 'transcribe') {
    const r = await transcribirAudio(messageId, { force: true, requestedBy: 'ui' });
    if (!r.ok) throw new Error(r.error);
    return { ok: true, transcript: r.transcript, cached: r.cached };
  }
  if (input.action === 'analyze') {
    const r = await analizarAudio(messageId, { force: true });
    if (!r.ok) throw new Error(r.error);
    return { ok: true, summary: r.summary, intent: r.intent, urgency: r.urgency };
  }
  if (input.action === 'queue') {
    const r = await encolarAudios({ teamId, messageIds: [messageId], priority: 9, requestedBy: 'ui', maxAgeDays: 3650 });
    return { ok: true, ...r };
  }
  if (input.action === 'dequeue') {
    // Sacar de la cola = borrar la ficha si todavía no se procesó. Lo transcripto se conserva.
    const borradas = await db
      .delete(messageAudioInsights)
      .where(and(eq(messageAudioInsights.teamId, teamId), eq(messageAudioInsights.messageId, messageId), sqlTag`${messageAudioInsights.status} in ('queued', 'pending', 'failed')`))
      .returning({ id: messageAudioInsights.id });
    return { ok: true, quitados: borradas.length };
  }
  if (input.action === 'write') {
    const r = await guardarFichaExterna({ teamId, messageId, ficha: input.ficha, origen: 'ui', fuente: 'manual', overwrite: true });
    if (!r.ok) throw new Error(r.error);
    return { ok: true, creada: r.creada };
  }
  const nombre = audio.chatName?.trim() || audio.pushName?.trim() || `chat ${audio.chatId}`;
  const texto = [
    `Dar contexto del audio ${messageId} del chat de ${nombre} (chat_id ${audio.chatId}${audio.seconds ? `, ${audio.seconds} s` : ''}).`,
    input.nota?.trim() ? `INDICACIÓN: ${input.nota.trim()}` : null,
    'PASOS: 1) whatspro_audio_queue_takeover (o whatspro_transcribe_media si el banco tiene cuota) para escuchar/transcribir el audio; 2) leé el chat con whatspro_sales_dossier para entender de qué habla; 3) guardá transcript, summary, intent, urgency y action_items con whatspro_audio_insight_write; 4) cerrá con whatspro_sales_prompt_result contando en 3 líneas qué dijo la persona y qué conviene hacer.',
    'No envíes mensajes ni toques el CRM: sólo contexto.',
  ]
    .filter(Boolean)
    .join('\n\n');
  const { run } = await launchRun(teamId, userId, { text: texto, title: `Contexto de audio · ${nombre}`.slice(0, 160), targetKind: 'chat', targetId: audio.chatId, mode: 'queue', approved: true });
  await encolarAudios({ teamId, messageIds: [messageId], priority: 9, requestedBy: 'ui', maxAgeDays: 3650 }).catch(() => null);
  return { ok: true, runId: run.id };
}

export type NuncaTranscribir = { chatId: number; nombre: string };

/** La lista "nunca transcribir" con nombres, para mostrarla y poder revertir. */
export async function listNuncaTranscribir(teamId: number): Promise<NuncaTranscribir[]> {
  const ids = (await getSalesOpsSettings(teamId)).audioNeverChatIds;
  if (!ids.length) return [];
  const rows = await db
    .select({ chatId: chatsTable.id, chatName: chatsTable.name, pushName: chatsTable.pushName, remoteJid: chatsTable.remoteJid, contactName: contacts.name })
    .from(chatsTable)
    .leftJoin(contacts, and(eq(contacts.chatId, chatsTable.id), eq(contacts.teamId, teamId)))
    .where(and(eq(chatsTable.teamId, teamId), inArray(chatsTable.id, ids)));
  return rows.map((r) => ({ chatId: r.chatId, nombre: r.contactName?.trim() || r.chatName?.trim() || r.pushName?.trim() || `…${(r.remoteJid || '').replace(/\D/g, '').slice(-4)}` }));
}

/**
 * Marca o desmarca un chat como "nunca transcribir". Al marcarlo se borran
 * sus audios que esperaban en la cola (lo ya transcripto queda).
 */
export async function setNuncaTranscribir(teamId: number, userId: number, chatId: number, nunca: boolean): Promise<{ audioNeverChatIds: number[]; quitados: number }> {
  const actual = (await getSalesOpsSettings(teamId)).audioNeverChatIds;
  const next = nunca ? Array.from(new Set([...actual, chatId])) : actual.filter((id) => id !== chatId);
  const settings = await patchSalesOpsSettings(teamId, userId, { audioNeverChatIds: next });
  let quitados = 0;
  if (nunca) {
    const borradas = await db
      .delete(messageAudioInsights)
      .where(and(eq(messageAudioInsights.teamId, teamId), eq(messageAudioInsights.chatId, chatId), sqlTag`${messageAudioInsights.status} in ('queued', 'pending', 'failed')`))
      .returning({ id: messageAudioInsights.id });
    quitados = borradas.length;
  }
  return { audioNeverChatIds: settings.audioNeverChatIds, quitados };
}
