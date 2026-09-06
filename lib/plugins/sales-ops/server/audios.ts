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

import { asc, desc, isNotNull, like, sql as sqlTag } from 'drizzle-orm';
import { activityLogs, contacts, messageAudioInsights, messages, teamAudioBlocks, teamCommercialAnalysis as analisis, chats as chatsTable, teamMembers, teamTaskItems, users } from '@/lib/db/schema';
import { resolveMediaUrl } from '@/lib/media-url';
import { AUDIO_INSIGHTS_CONFIG, ORDEN_DE_LA_COLA, analizarAudio, condicionDeBloqueActivo, estadoDeLaCola, guardarFichaExterna, transcribirAudio, type FichaExterna } from '@/lib/audio-insights';
import { cuotaAutomatica, setReservaDelBanco, setTranscripcionAutomatica, transcripcionAutomaticaActiva } from '@/lib/gemini/key-bank';
import { notify } from '@/lib/notifications/service';
import { createContactTask } from '@/lib/plugins/tasks/server/contact-tasks';
import { launchRun } from './prompt-queue';
import { getSalesOpsSettings, patchSalesOpsSettings } from './settings';
import { notInArray as notIn } from 'drizzle-orm';

/**
 * Qué se está mirando. `en_cola` es EXACTAMENTE lo que el worker de Gemini va a
 * tomar (`proximosDeLaCola`): queued, más los failed que todavía tienen
 * intentos; los de un bloque en pausa o programado también se listan, al
 * final y marcados, para que se vea qué está frenado y por qué.
 * `sin_encolar` son los audios que no tienen ficha (nunca entraron a la cola).
 * `quitados` son los que alguien sacó a mano: quedan con estado `skipped`
 * para que el cron no los vuelva a encolar.
 */
export type AudioEstado = 'en_cola' | 'sin_encolar' | 'pendientes' | 'transcriptos' | 'fallidos' | 'quitados' | 'todos';
export const AUDIO_ESTADOS: AudioEstado[] = ['en_cola', 'sin_encolar', 'pendientes', 'transcriptos', 'fallidos', 'quitados', 'todos'];

/** Estado de una ficha que una persona sacó de la cola a mano. */
export const AUDIO_SKIPPED = 'skipped';

/** Prioridades con nombre: lo que se elige desde la pantalla. */
export const AUDIO_PRIORIDADES = { primero: 10, adelante: 5, normal: 0, alFinal: -1 } as const;

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
  /** true si el worker de Gemini lo va a tomar tal como está (estado + bloque). */
  enColaGemini: boolean;
  bloque: { id: number; name: string; status: string; activoHoy: boolean } | null;
  insight: {
    status: 'pending' | 'queued' | 'done' | 'failed' | 'skipped' | null;
    transcript: string | null;
    summary: string | null;
    intent: string | null;
    urgency: string | null;
    sentiment: string | null;
    error: string | null;
    provider: string | null;
    analyzedAt: string | null;
    attempts: number;
    priority: number;
    requestedBy: string | null;
    queuedAt: string | null;
  };
};

/**
 * Resumen de la cola de Gemini para la cabecera de la vista: cuántos esperan,
 * cuántos minutos de audio son, cuánta cuota queda hoy en el banco (y cuánta
 * se guarda para lo manual) y los conteos por pestaña.
 */
export type AudioResumen = {
  /** Los que el worker va a tomar tal como está la cola hoy. */
  enCola: number;
  minutosEnCola: number;
  /** Encolados pero frenados por su bloque (pausa, día futuro, tope). */
  frenados: number;
  sinEncolar: number;
  transcriptos: number;
  fallidos: number;
  quitados: number;
  banco: { keys: number; activas: number; restanteHoy: number; totalDiario: number; reservaPct: number; reserva: number; disponibleAutomatico: number };
  /** Check "usar Gemini para transcribir audios": apagado, el worker por cron no toma nada. */
  transcripcionActiva: boolean;
  /** Cuántos audios se transcribieron por día en las últimas dos semanas, para calibrar topes. */
  porDia: Array<{ dia: string; n: number }>;
};

/** El mismo CASE que ordena la cola del worker, sobre el JOIN de esta consulta. */
const RANGO = sqlTag<number>`case
  when ${analisis.currentGate} in ('G8','G9','G10') and ${analisis.status} <> 'cliente' then 0
  when ${analisis.currentGate} in ('G4','G5','G6','G7') then 1
  else 2 end`;

/** Condición SQL de "el estado permite drenarlo": queued, o failed con intentos disponibles. */
function condicionEstadoEnCola() {
  const i = messageAudioInsights;
  return sqlTag`(${i.status} = 'queued' or (${i.status} = 'failed' and ${i.attempts} < ${AUDIO_INSIGHTS_CONFIG.maxAttempts}))`;
}

/** "El worker lo va a tomar": estado + bloque activo. Exige el JOIN a `team_audio_blocks`. */
function condicionEnColaGemini() {
  return sqlTag`(${condicionEstadoEnCola()} and ${condicionDeBloqueActivo()})`;
}

export async function resumenAudios(teamId: number): Promise<AudioResumen> {
  const i = messageAudioInsights;
  const nunca = (await getSalesOpsSettings(teamId)).audioNeverChatIds;
  const conds = [eq(i.teamId, teamId)];
  if (nunca.length) conds.push(notIn(i.chatId, nunca));
  const [fichas] = await db
    .select({
      enCola: sqlTag<number>`count(*) filter (where ${condicionEnColaGemini()})::int`,
      frenados: sqlTag<number>`count(*) filter (where ${condicionEstadoEnCola()} and not ${condicionDeBloqueActivo()})::int`,
      segundos: sqlTag<number>`coalesce(sum(${i.durationSeconds}) filter (where ${condicionEnColaGemini()}), 0)::int`,
      transcriptos: sqlTag<number>`count(*) filter (where ${i.status} = 'done')::int`,
      fallidos: sqlTag<number>`count(*) filter (where ${i.status} = 'failed' and ${i.attempts} >= ${AUDIO_INSIGHTS_CONFIG.maxAttempts})::int`,
      quitados: sqlTag<number>`count(*) filter (where ${i.status} = ${AUDIO_SKIPPED})::int`,
    })
    .from(i)
    .leftJoin(teamAudioBlocks, eq(teamAudioBlocks.id, i.blockId))
    .where(and(...conds));
  // Sin ficha: entrantes, individuales, con archivo. Es la misma base que la lista.
  const sinConds = [eq(chatsTable.teamId, teamId), isNotNull(messages.mediaUrl), or(eq(messages.messageType, 'audioMessage'), like(messages.mediaMimetype, 'audio/%')), eq(messages.fromMe, false), sqlTag`${chatsTable.remoteJid} NOT LIKE '%@g.us'`, sqlTag`${i.id} is null`];
  if (nunca.length) sinConds.push(notIn(messages.chatId, nunca));
  const [sin] = await db
    .select({ n: sqlTag<number>`count(*)::int` })
    .from(messages)
    .innerJoin(chatsTable, eq(chatsTable.id, messages.chatId))
    .leftJoin(i, eq(i.messageId, messages.id))
    .where(and(...sinConds));
  const porDia = await db
    .select({ dia: sqlTag<string>`to_char(${i.generatedAt}, 'YYYY-MM-DD')`, n: sqlTag<number>`count(*)::int` })
    .from(i)
    .where(and(eq(i.teamId, teamId), eq(i.status, 'done'), sqlTag`${i.generatedAt} >= current_date - 14`))
    .groupBy(sqlTag`to_char(${i.generatedAt}, 'YYYY-MM-DD')`)
    .orderBy(sqlTag`to_char(${i.generatedAt}, 'YYYY-MM-DD')`);
  const [cola, cuota, transcripcionActiva] = await Promise.all([estadoDeLaCola(teamId), cuotaAutomatica(teamId), transcripcionAutomaticaActiva(teamId)]);
  return {
    enCola: fichas?.enCola ?? 0,
    minutosEnCola: Math.round(((fichas?.segundos ?? 0) / 60) * 10) / 10,
    frenados: fichas?.frenados ?? 0,
    sinEncolar: sin?.n ?? 0,
    transcriptos: fichas?.transcriptos ?? 0,
    fallidos: fichas?.fallidos ?? 0,
    quitados: fichas?.quitados ?? 0,
    banco: { keys: cola.banco.keys, activas: cola.banco.activas, restanteHoy: cola.banco.restanteHoy, totalDiario: cola.banco.totalDiario, reservaPct: cuota.reservaPct, reserva: cuota.reserva, disponibleAutomatico: cuota.disponibleAutomatico },
    transcripcionActiva,
    porDia: porDia.map((d) => ({ dia: d.dia, n: d.n })),
  };
}

/**
 * Notas de voz de los chats, con su ficha si la tienen.
 *
 * Con `estado = 'en_cola'` la lista viene en el MISMO orden en que el worker
 * la va a drenar (prioridad → bloque → frente comercial → antigüedad): la
 * posición en pantalla es la posición real en la cola de Gemini. Lo frenado
 * por su bloque va al final, marcado.
 *
 * "En cola" (del Command Center) es la misma pregunta que en las listas: el
 * chat tiene una acción sin ejecutar o un prompt esperando conector. Es lo que
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
  const b = teamAudioBlocks;
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
  const estado = opts.estado ?? 'en_cola';
  const geminiSql = condicionEnColaGemini();
  if (estado === 'en_cola') conds.push(condicionEstadoEnCola());
  else if (estado === 'sin_encolar' || estado === 'pendientes') conds.push(sqlTag`${i.status} IS NULL OR ${i.status} = 'pending'`);
  else if (estado === 'transcriptos') conds.push(eq(i.status, 'done'));
  else if (estado === 'fallidos') conds.push(sqlTag`${i.status} = 'failed' and ${i.attempts} >= ${AUDIO_INSIGHTS_CONFIG.maxAttempts}`);
  else if (estado === 'quitados') conds.push(eq(i.status, AUDIO_SKIPPED));
  const enColaSql = sqlTag<boolean>`(
    exists (select 1 from team_commercial_actions ac where ac.team_id = ${teamId} and ac.chat_id = ${c.id} and ac.status in ('proposed','pending_approval','approved','executing'))
    or exists (select 1 from team_prompt_runs pr where pr.team_id = ${teamId} and pr.target_kind = 'chat' and pr.target_id = ${c.id}::text and pr.status in ('queued','in_progress'))
  )`;
  if (opts.soloEnCola) conds.push(enColaSql);
  if (opts.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    conds.push(or(like(c.name, q), like(contacts.name, q), like(i.transcript, q), like(c.remoteJid, q)));
  }
  const bloqueActivoSql = sqlTag<boolean>`coalesce(${condicionDeBloqueActivo()}, false)`;

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
      enColaGemini: sqlTag<boolean>`coalesce(${geminiSql}, false)`,
      bloqueId: b.id,
      bloqueName: b.name,
      bloqueStatus: b.status,
      bloqueActivo: bloqueActivoSql,
      status: i.status,
      transcript: i.transcript,
      summary: i.summary,
      intent: i.intent,
      urgency: i.urgency,
      sentiment: i.sentiment,
      error: i.error,
      provider: i.provider,
      analyzedAt: i.analyzedAt,
      attempts: i.attempts,
      priority: i.priority,
      requestedBy: i.requestedBy,
      queuedAt: i.queuedAt,
    })
    .from(m)
    .innerJoin(c, eq(c.id, m.chatId))
    .leftJoin(i, eq(i.messageId, m.id))
    .leftJoin(b, eq(b.id, i.blockId))
    .leftJoin(contacts, and(eq(contacts.chatId, c.id), eq(contacts.teamId, teamId)))
    .leftJoin(analisis, and(eq(analisis.chatId, c.id), eq(analisis.teamId, teamId)))
    .where(and(...conds))
    // En cola: lo que el worker toma hoy primero, en su orden; lo frenado al final. En el resto, lo más nuevo arriba.
    .orderBy(...(estado === 'en_cola' ? [sqlTag`${bloqueActivoSql} desc`, ...ORDEN_DE_LA_COLA] : [desc(m.timestamp)]))
    .limit(Math.min(Math.max(opts.limit ?? 60, 1), 500));

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
    enColaGemini: Boolean(r.enColaGemini),
    bloque: r.bloqueId ? { id: r.bloqueId, name: r.bloqueName ?? '', status: r.bloqueStatus ?? 'active', activoHoy: Boolean(r.bloqueActivo) } : null,
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
      attempts: r.attempts ?? 0,
      priority: r.priority ?? 0,
      requestedBy: r.requestedBy ?? null,
      queuedAt: r.queuedAt ? r.queuedAt.toISOString() : null,
    },
  }));
}

export type AudioAccion =
  | { action: 'transcribe' }
  | { action: 'analyze' }
  | { action: 'queue' }
  | { action: 'dequeue' }
  | { action: 'priority'; priority: number }
  | { action: 'block'; blockId: number | null }
  | { action: 'write'; ficha: FichaExterna }
  | { action: 'ask_connector'; nota?: string }
  | { action: 'ask_human'; nota?: string };

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
 * Saca de la cola de Gemini lo que todavía no se procesó.
 *
 * NO borra la ficha: la deja en `skipped`. Con la fila borrada, el cron de la
 * noche (`encolarNuevos`) y el encolado diario de los frentes comerciales la
 * volvían a meter, y "quitar" duraba hasta la próxima corrida. Lo transcripto
 * no se toca.
 */
async function quitarDeLaCola(teamId: number, filtro: { messageId?: string; messageIds?: string[]; chatId?: number }, motivo = 'Quitado de la cola a mano'): Promise<number> {
  const conds = [eq(messageAudioInsights.teamId, teamId), sqlTag`${messageAudioInsights.status} in ('queued', 'pending', 'failed')`];
  if (filtro.messageId) conds.push(eq(messageAudioInsights.messageId, filtro.messageId));
  else if (filtro.messageIds?.length) conds.push(inArray(messageAudioInsights.messageId, filtro.messageIds));
  else if (filtro.chatId) conds.push(eq(messageAudioInsights.chatId, filtro.chatId));
  else return 0;
  const filas = await db
    .update(messageAudioInsights)
    .set({ status: AUDIO_SKIPPED, error: motivo.slice(0, 300), updatedAt: new Date() })
    .where(and(...conds))
    .returning({ id: messageAudioInsights.id });
  return filas.length;
}

/**
 * Encola con prioridad. Si la ficha ya existe (quitada o fallida sin
 * intentos) se reabre en vez de saltearla: `encolarAudios` no toca filas
 * existentes, y "Encolar" sobre un audio quitado tiene que volver a encolarlo.
 */
async function reencolar(teamId: number, filtro: { messageId?: string; chatId?: number }, priority: number): Promise<{ encolados: number; yaEstaban: number }> {
  const conds = [eq(messageAudioInsights.teamId, teamId), sqlTag`${messageAudioInsights.status} in (${AUDIO_SKIPPED}, 'failed', 'pending')`];
  if (filtro.messageId) conds.push(eq(messageAudioInsights.messageId, filtro.messageId));
  if (filtro.chatId) conds.push(eq(messageAudioInsights.chatId, filtro.chatId));
  const reabiertas = await db
    .update(messageAudioInsights)
    .set({ status: 'queued', attempts: 0, error: '', priority, requestedBy: 'ui', queuedAt: new Date(), updatedAt: new Date() })
    .where(and(...conds))
    .returning({ id: messageAudioInsights.id });
  const nuevas = await encolarAudios({ teamId, messageIds: filtro.messageId ? [filtro.messageId] : undefined, chatId: filtro.chatId, priority, requestedBy: 'ui', maxAgeDays: 3650, limit: 500 });
  return { encolados: reabiertas.length + nuevas.encolados, yaEstaban: nuevas.yaEstaban };
}

/** Cambia la prioridad de lo que todavía no se procesó. -1 = al final, 0 = normal, 5 = adelante, 10 = primero. */
async function cambiarPrioridad(teamId: number, filtro: { messageId?: string; chatId?: number }, priority: number): Promise<number> {
  const valor = Math.max(-1, Math.min(10, Math.round(priority)));
  const conds = [eq(messageAudioInsights.teamId, teamId), sqlTag`${messageAudioInsights.status} in ('queued', 'pending', 'failed')`];
  if (filtro.messageId) conds.push(eq(messageAudioInsights.messageId, filtro.messageId));
  else if (filtro.chatId) conds.push(eq(messageAudioInsights.chatId, filtro.chatId));
  else return 0;
  const filas = await db.update(messageAudioInsights).set({ priority: valor, requestedBy: 'ui', updatedAt: new Date() }).where(and(...conds)).returning({ id: messageAudioInsights.id });
  return filas.length;
}

async function asignarBloque(teamId: number, filtro: { messageId?: string; chatId?: number }, blockId: number | null): Promise<number> {
  if (blockId !== null) {
    const bloque = await db.query.teamAudioBlocks.findFirst({ where: and(eq(teamAudioBlocks.teamId, teamId), eq(teamAudioBlocks.id, blockId)), columns: { id: true } });
    if (!bloque) throw new Error('El bloque no existe en este equipo.');
  }
  const conds = [eq(messageAudioInsights.teamId, teamId), sqlTag`${messageAudioInsights.status} in ('queued', 'pending', 'failed', ${AUDIO_SKIPPED})`];
  if (filtro.messageId) conds.push(eq(messageAudioInsights.messageId, filtro.messageId));
  else if (filtro.chatId) conds.push(eq(messageAudioInsights.chatId, filtro.chatId));
  else return 0;
  const filas = await db.update(messageAudioInsights).set({ blockId, updatedAt: new Date() }).where(and(...conds)).returning({ id: messageAudioInsights.id });
  return filas.length;
}

// ── Pedir la transcripción a una persona ─────────────────────────────────────

export type HumanoDeAudios = { userId: number; name: string; email: string };

/**
 * Quién escucha los audios cuando no los escucha Gemini.
 *
 * `settings.audioHumanoUserId` manda; si no está, se busca a Noelia por nombre
 * o mail entre los miembros del equipo (es quien atiende los chats), y si no,
 * el primer owner. Existe para que el botón diga un nombre y no "una persona".
 */
export async function humanoDeAudios(teamId: number): Promise<HumanoDeAudios | null> {
  const settings = await getSalesOpsSettings(teamId);
  const miembros = await listarMiembros(teamId);
  if (!miembros.length) return null;
  const elegido = (settings.audioHumanoUserId ? miembros.find((m) => m.userId === settings.audioHumanoUserId) : undefined)
    ?? miembros.find((m) => /noelia/i.test(m.name) || /noelia/i.test(m.email))
    ?? miembros.find((m) => m.role === 'owner')
    ?? miembros[0];
  return { userId: elegido.userId, name: elegido.name, email: elegido.email };
}

export async function listarMiembros(teamId: number): Promise<Array<HumanoDeAudios & { role: string }>> {
  const rows = await db
    .select({ userId: users.id, name: users.name, email: users.email, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
  return rows.map((r) => ({ userId: r.userId, name: r.name?.trim() || r.email, email: r.email, role: r.role }));
}

const baseUrl = () => (process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

/**
 * Le pide a una persona que escuche los audios y deje el contexto.
 *
 * Es la alternativa a gastar cuota: los audios salen de la cola de Gemini
 * (quedan "quitados" con el nombre de quien los va a escuchar), se crea una
 * tarea vinculada al contacto y asignada a esa persona, con los enlaces para
 * escuchar y el atajo a la vista Audios filtrada por el contacto —donde la
 * ficha se escribe a mano y se guarda—, y le llega un aviso.
 */
export async function pedirAHumano(
  teamId: number,
  userId: number,
  input: { chatId: number; messageIds?: string[]; nota?: string },
): Promise<{ ok: true; humano: HumanoDeAudios; taskId: number | null; quitados: number; avisos: number }> {
  const humano = await humanoDeAudios(teamId);
  if (!humano) throw new Error('El equipo no tiene miembros a quien pedirle.');
  const chat = await db.query.chats.findFirst({ where: and(eq(chatsTable.teamId, teamId), eq(chatsTable.id, input.chatId)), columns: { id: true, name: true, pushName: true, remoteJid: true } });
  if (!chat) throw new Error('El chat no es de este equipo.');
  const nombre = chat.name?.trim() || chat.pushName?.trim() || `…${(chat.remoteJid || '').replace(/\D/g, '').slice(-4)}`;

  // Qué audios: los indicados, o todos los pendientes del contacto.
  const conds = [eq(messages.chatId, input.chatId), isNotNull(messages.mediaUrl), or(eq(messages.messageType, 'audioMessage'), like(messages.mediaMimetype, 'audio/%'))];
  if (input.messageIds?.length) conds.push(inArray(messages.id, input.messageIds));
  else conds.push(sqlTag`(${messageAudioInsights.status} is null or ${messageAudioInsights.status} in ('queued','pending','failed'))`);
  const audios = await db
    .select({ id: messages.id, mediaUrl: messages.mediaUrl, seconds: messages.mediaSeconds, timestamp: messages.timestamp })
    .from(messages)
    .leftJoin(messageAudioInsights, eq(messageAudioInsights.messageId, messages.id))
    .where(and(...conds))
    .orderBy(asc(messages.timestamp))
    .limit(50);
  if (!audios.length) throw new Error('El contacto no tiene audios pendientes.');

  const quitados = await quitarDeLaCola(teamId, { messageIds: audios.map((a) => a.id) }, `Pedido a ${humano.name}: transcripción manual`);
  const base = baseUrl();
  const enlace = `${base}/plugins/sales-ops?vista=audios&estado=quitados&contacto=${input.chatId}`;
  const lista = audios.map((a, k) => `${k + 1}. ${a.timestamp instanceof Date ? a.timestamp.toISOString().slice(0, 16).replace('T', ' ') : ''}${a.seconds ? ` · ${a.seconds} s` : ''} → ${base}${resolveMediaUrl(a.mediaUrl) ?? ''}`).join('\n');
  const notas = [
    `Escuchá ${audios.length === 1 ? 'el audio' : `los ${audios.length} audios`} de ${nombre} y dejá el contexto: qué dijo y qué conviene hacer.`,
    input.nota?.trim() ? `Qué hace falta saber: ${input.nota.trim()}` : null,
    `Dónde escribirlo: ${enlace} (pestaña Quitados, contacto ${nombre}: en cada audio, "Ficha" → transcripción y resumen → Guardar). Eso es lo que después leen el radar y los conectores.`,
    `Audios:\n${lista}`,
    `Chat #${input.chatId}`,
  ].filter(Boolean).join('\n\n');

  let taskId: number | null = null;
  const contacto = await db.query.contacts.findFirst({ where: and(eq(contacts.teamId, teamId), eq(contacts.chatId, input.chatId)), columns: { id: true } });
  if (contacto) {
    const creada = await createContactTask({ teamId, userId, contactId: contacto.id, title: `Escuchar audios de ${nombre} y dejar el contexto`.slice(0, 200), notes: notas.slice(0, 20000), dueDate: new Date().toISOString().slice(0, 10) });
    if (!('error' in creada)) {
      taskId = creada.task.id;
      await db.update(teamTaskItems).set({ assigneeId: humano.userId }).where(and(eq(teamTaskItems.teamId, teamId), eq(teamTaskItems.id, creada.task.id)));
    }
  }

  const aviso = await notify({
    teamId,
    userId: humano.userId,
    kind: 'task.assigned',
    title: `Audios de ${nombre} para escuchar`.slice(0, 180),
    body: `${audios.length === 1 ? 'Un audio' : `${audios.length} audios`} salieron de la cola de Gemini para que los escuches vos y dejes el contexto.${input.nota?.trim() ? ` ${input.nota.trim()}` : ''}`.slice(0, 4000),
    url: `/plugins/sales-ops?vista=audios&estado=quitados&contacto=${input.chatId}`,
    channels: ['inapp', 'push'],
    entityType: taskId ? 'task' : 'chat',
    entityId: taskId ?? input.chatId,
    source: 'ui',
    createdBy: userId,
    dedupeKey: `audios-humano:${input.chatId}:${new Date().toISOString().slice(0, 10)}`,
    metadata: { chatId: input.chatId, audios: audios.map((a) => a.id) },
  });

  try {
    await db.insert(activityLogs).values({ teamId, userId, action: 'SALES_OPS_AUDIO_ASKED_HUMAN', metadata: { chatId: input.chatId, humano: humano.userId, audios: audios.length, taskId }, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/audios] audit', error);
  }
  return { ok: true, humano, taskId, quitados, avisos: aviso.enviados };
}

/**
 * Acciones a mano sobre un audio: transcribir o analizar ya (con el banco de
 * keys), encolarlo con prioridad, sacarlo de la cola, cambiarle la prioridad
 * o el bloque, guardar una ficha corregida por una persona, pedirle a un
 * conector que lo escuche o pedírselo a una persona.
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
    const r = await reencolar(teamId, { messageId }, AUDIO_PRIORIDADES.adelante);
    return { ok: true, ...r };
  }
  if (input.action === 'dequeue') {
    const quitados = await quitarDeLaCola(teamId, { messageId });
    return { ok: true, quitados };
  }
  if (input.action === 'priority') return { ok: true, cambiados: await cambiarPrioridad(teamId, { messageId }, input.priority) };
  if (input.action === 'block') return { ok: true, movidos: await asignarBloque(teamId, { messageId }, input.blockId) };
  if (input.action === 'write') {
    const r = await guardarFichaExterna({ teamId, messageId, ficha: input.ficha, origen: 'ui', fuente: 'manual', overwrite: true });
    if (!r.ok) throw new Error(r.error);
    return { ok: true, creada: r.creada };
  }
  if (input.action === 'ask_human') return pedirAHumano(teamId, userId, { chatId: audio.chatId, messageIds: [messageId], nota: input.nota });
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
  await reencolar(teamId, { messageId }, AUDIO_PRIORIDADES.adelante).catch(() => null);
  return { ok: true, runId: run.id };
}

export type AudioAccionChat =
  | { action: 'dequeue_chat' }
  | { action: 'queue_chat' }
  | { action: 'priority_chat'; priority: number }
  | { action: 'block_chat'; blockId: number | null }
  | { action: 'ask_human_chat'; nota?: string };

/** Acciones sobre TODOS los audios pendientes de un contacto. */
export async function actOnChatAudios(teamId: number, userId: number, chatId: number, input: AudioAccionChat): Promise<Record<string, unknown>> {
  const chat = await db.query.chats.findFirst({ where: and(eq(chatsTable.teamId, teamId), eq(chatsTable.id, chatId)), columns: { id: true } });
  if (!chat) throw new Error('El chat no es de este equipo.');
  if (input.action === 'dequeue_chat') return { ok: true, cantidad: await quitarDeLaCola(teamId, { chatId }) };
  if (input.action === 'queue_chat') return { ok: true, cantidad: (await reencolar(teamId, { chatId }, AUDIO_PRIORIDADES.adelante)).encolados };
  if (input.action === 'priority_chat') return { ok: true, cantidad: await cambiarPrioridad(teamId, { chatId }, input.priority) };
  if (input.action === 'block_chat') return { ok: true, cantidad: await asignarBloque(teamId, { chatId }, input.blockId) };
  return pedirAHumano(teamId, userId, { chatId, nota: input.nota });
}

/** Cambia la reserva del banco (settings del plugin Gemini). */
export async function cambiarReserva(teamId: number, userId: number, pct: number): Promise<{ reservaPct: number }> {
  const valor = await setReservaDelBanco(teamId, pct);
  try {
    await db.insert(activityLogs).values({ teamId, userId, action: 'SALES_OPS_AUDIO_RESERVA', metadata: { reservaPct: valor }, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/audios] audit', error);
  }
  return { reservaPct: valor };
}

/** Prende o apaga la transcripción automática por cron (settings del plugin Gemini). */
export async function cambiarTranscripcionAutomatica(teamId: number, userId: number, activa: boolean): Promise<{ transcripcionActiva: boolean }> {
  const valor = await setTranscripcionAutomatica(teamId, activa);
  try {
    await db.insert(activityLogs).values({ teamId, userId, action: 'SALES_OPS_AUDIO_TRANSCRIPCION', metadata: { transcripcionActiva: valor }, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/audios] audit', error);
  }
  return { transcripcionActiva: valor };
}

/** Elige quién recibe los pedidos de transcripción manual. */
export async function elegirHumano(teamId: number, userId: number, humanoUserId: number | null): Promise<HumanoDeAudios | null> {
  if (humanoUserId !== null) {
    const miembros = await listarMiembros(teamId);
    if (!miembros.some((m) => m.userId === humanoUserId)) throw new Error('Esa persona no es miembro del equipo.');
  }
  await patchSalesOpsSettings(teamId, userId, { audioHumanoUserId: humanoUserId });
  return humanoDeAudios(teamId);
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
 * Marca o desmarca un chat como "nunca transcribir". Al marcarlo, sus audios
 * que esperaban en la cola quedan quitados (lo ya transcripto queda).
 */
export async function setNuncaTranscribir(teamId: number, userId: number, chatId: number, nunca: boolean): Promise<{ audioNeverChatIds: number[]; quitados: number }> {
  const actual = (await getSalesOpsSettings(teamId)).audioNeverChatIds;
  const next = nunca ? Array.from(new Set([...actual, chatId])) : actual.filter((id) => id !== chatId);
  const settings = await patchSalesOpsSettings(teamId, userId, { audioNeverChatIds: next });
  const quitados = nunca ? await quitarDeLaCola(teamId, { chatId }, 'Nunca transcribir') : 0;
  return { audioNeverChatIds: settings.audioNeverChatIds, quitados };
}
