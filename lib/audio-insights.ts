import 'server-only';

import { and, asc, eq, gte, inArray, isNull, lte, not, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { chats, messageAudioInsights, messages, teamCommercialAnalysis } from '@/lib/db/schema';
import { analizarTextoConBanco, capacidadDelBanco, keysConCuota, transcribirConBanco } from '@/lib/gemini/key-bank';
import { condicionesDeChatIgnorado } from '@/lib/chats/internos';

/**
 * Fichas de audio: qué dice cada nota de voz, resuelto una sola vez.
 *
 * El problema que resuelve: ningún modelo de Claude ni los conectores de
 * ChatGPT reciben audio; el bloque `type: "audio"` de whatspro_chat_media_get
 * sólo lo aprovecha Gemini. Así que el que escucha es el servidor, una vez, y
 * lo que viaja a cualquier IA es texto.
 *
 * Cada audio se transcribe y después se analiza (resumen, intención, urgencia):
 * son dos llamadas, y la segunda va sobre el texto ya transcripto, no sobre el
 * audio. `AUDIO_INSIGHTS_ANALYZE=false` deja el análisis a pedido.
 *
 * Las llamadas salen del banco de keys de Gemini (lib/gemini/key-bank), que es
 * independiente de Ajustes → Agente IA: esa configuración es para el chat.
 */

/* ------------------------------------------------------------------ */
/* Configuración                                                       */
/* ------------------------------------------------------------------ */

function envInt(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

/** Lista separada por comas, en minúsculas y sin vacíos. */
function envList(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map((valor) => valor.trim().toLowerCase())
    .filter(Boolean);
}

export const AUDIO_INSIGHTS_CONFIG = {
  /** Poner en "false" apaga el cron sin tocar código ni desregistrarlo. */
  get enabled() {
    return process.env.AUDIO_INSIGHTS_ENABLED !== 'false';
  },
  /** Cuántos audios saca de la cola cada corrida del cron. */
  get batchSize() {
    return envInt('AUDIO_INSIGHTS_BATCH', 10);
  },
  /**
   * Los de menos de 3 segundos son "dale", "ok" y ruido: ninguno aporta nada,
   * pero cuestan una request del free tier igual que uno largo.
   */
  get minSeconds() {
    return envInt('AUDIO_INSIGHTS_MIN_SECONDS', 3);
  },
  /** Un audio de más de 10 minutos casi siempre es un reenvío o un error. */
  get maxSeconds() {
    return envInt('AUDIO_INSIGHTS_MAX_SECONDS', 600);
  },
  /**
   * Los grupos no se transcriben.
   *
   * En un grupo hablan varios y casi nunca es trabajo: cada audio gasta una
   * request del free tier igual que el de un cliente, y el techo del banco son
   * ~140 por día entre todas las keys. Con 18.000 audios esperando, lo que
   * entra a la cola tiene que ser lo que le sirve al negocio.
   */
  get excludeGroups() {
    return process.env.AUDIO_INSIGHTS_EXCLUDE_GROUPS !== 'false';
  },
  /** JIDs completos que nunca se transcriben (chat personal, del equipo, etc.). */
  get excludedJids() {
    return envList('AUDIO_INSIGHTS_EXCLUDED_JIDS');
  },
  /**
   * Nombres (o pedazos de nombre) que nunca se transcriben. Va por nombre y no
   * sólo por JID porque los chats personales se reconocen por cómo se llaman
   * —"casa", "familia", el nombre de un compañero— y pedirle al usuario que
   * averigüe el número de cada uno sería inútil.
   */
  get excludedNames() {
    return envList('AUDIO_INSIGHTS_EXCLUDED_NAMES');
  },
  /** El histórico viejo se encola a mano; el automático mira sólo lo reciente. */
  get maxAgeDays() {
    return envInt('AUDIO_INSIGHTS_MAX_AGE_DAYS', 30);
  },
  /**
   * Analizar cada audio apenas se transcribe.
   *
   * Son dos llamadas por audio en vez de una, pero deja la ficha completa sin
   * que nadie tenga que pedirla. Poner "false" vuelve al análisis a pedido con
   * whatspro_audio_analyze.
   */
  get analyzeByDefault() {
    return process.env.AUDIO_INSIGHTS_ANALYZE !== 'false';
  },
  /** Después de 3 intentos fallidos el audio se deja quieto. */
  get maxAttempts() {
    return envInt('AUDIO_INSIGHTS_MAX_ATTEMPTS', 3);
  },
  /**
   * Equipos habilitados, separados por coma. Vacío = todos.
   *
   * El costo es por request del free tier, y un equipo que trabaja 100% por
   * voz vacía el banco de keys solo.
   */
  get teamIds(): number[] {
    return (process.env.AUDIO_INSIGHTS_TEAM_IDS ?? '')
      .split(',')
      .map((valor) => Number(valor.trim()))
      .filter((valor) => Number.isInteger(valor) && valor > 0);
  },
};

/** Si hay allowlist configurada, sólo esos equipos procesan audio. */
export function teamHabilitado(teamId: number) {
  const habilitados = AUDIO_INSIGHTS_CONFIG.teamIds;
  return habilitados.length === 0 || habilitados.includes(teamId);
}

/** Recorte del transcript que se manda a analizar; 12k caracteres son ~40 minutos hablados. */
const TRANSCRIPT_MAX_CHARS = 12000;

/** Quién pidió el trabajo. Se guarda para saber a quién le sirvió gastar la cuota. */
export const ORIGENES = ['auto', 'connector', 'radar', 'ui'] as const;
export type Origen = (typeof ORIGENES)[number];

/**
 * Saca de la cola los audios de chats que no se transcriben.
 *
 * Las reglas de exclusión se aplicaban al encolar y al tomar trabajo, pero lo
 * que ya estaba en la cola se quedaba ahí: inerte, nunca procesado y contando
 * como pendiente. Al 2026-08-31 eran 877 audios —el 45% de la cola— de cinco
 * chats internos del equipo (AAPP.SPACE, Martin Dev, carlos, Nono y un chat de
 * experimentos), que hacían leer "1.946 pendientes" cuando el trabajo real era
 * la mitad.
 *
 * Usa `condicionesDeChatExcluido()` en negativo: una sola fuente de verdad, así
 * agregar un nombre o un JID a la config limpia la cola sola en la próxima
 * corrida. Sólo borra `queued`: lo ya transcripto se conserva.
 */
async function depurarExcluidosDeLaCola(): Promise<number> {
  const excluidos = await db
    .select({ id: messageAudioInsights.id })
    .from(messageAudioInsights)
    .innerJoin(chats, eq(chats.id, messageAudioInsights.chatId))
    .where(and(
      eq(messageAudioInsights.status, 'queued'),
      not(and(...condicionesDeChatExcluido())!),
    ));
  if (!excluidos.length) return 0;

  const ids = excluidos.map((fila) => fila.id);
  // De a 500 por si la primera limpieza arrastra miles.
  for (let i = 0; i < ids.length; i += 500) {
    await db.delete(messageAudioInsights).where(inArray(messageAudioInsights.id, ids.slice(i, i + 500)));
  }
  return ids.length;
}

/* ------------------------------------------------------------------ */
/* Cola                                                                */
/* ------------------------------------------------------------------ */

/** Condición "esto es un audio que vale la pena procesar". */
/**
 * Chats que quedan afuera de la transcripción: grupos, y los que el equipo
 * marcó como personales. Se aplica al ENCOLAR y también al sacar de la cola,
 * para que cambiar la lista tenga efecto sobre lo que ya estaba esperando sin
 * tener que limpiar la tabla a mano.
 */
function condicionesDeChatExcluido() {
  const condiciones = [];
  if (AUDIO_INSIGHTS_CONFIG.excludeGroups) {
    condiciones.push(sql`${chats.remoteJid} not like '%@g.us'`);
  }
  // Difusiones y canales: nunca son una conversación con un cliente.
  condiciones.push(sql`${chats.remoteJid} not like '%@broadcast'`);
  condiciones.push(sql`${chats.remoteJid} not like '%@newsletter'`);

  // Internos del equipo, personales y pruebas: la lista la comparte con el
  // radar y el clasificador comercial (`lib/chats/internos.ts`).
  condiciones.push(...condicionesDeChatIgnorado());

  // "Nunca transcribir" del Command Center: chats que el equipo sacó de los
  // audios a propósito (settings del plugin sales-ops, `audioNeverChatIds`).
  // Va acá y no en la vista para que tampoco entren a la cola del worker.
  condiciones.push(sql`not exists (
    select 1 from team_plugins tp
     where tp.team_id = ${chats.teamId} and tp.plugin_id = 'sales-ops'
       and coalesce(tp.settings -> 'audioNeverChatIds', '[]'::jsonb) @> to_jsonb(${chats.id})
  )`);

  /**
   * Los números del propio equipo. Un chat con otra instancia nuestra es una
   * conversación interna, y se reconoce sin que nadie tenga que enumerarla:
   * `evolution_instances.instance_number` ya guarda cada número conectado.
   */
  condiciones.push(sql`regexp_replace(split_part(${chats.remoteJid}, '@', 1), '[^0-9]', '', 'g') not in (
    select regexp_replace(instance_number, '[^0-9]', '', 'g')
      from evolution_instances
     where instance_number is not null and instance_number <> ''
  )`);

  return condiciones;
}

function condicionesDeAudio() {
  return [
    or(eq(messages.messageType, 'audioMessage'), sql`lower(${messages.mediaMimetype}) like 'audio/%'`)!,
    eq(messages.fromMe, false),
    sql`${messages.mediaUrl} is not null`,
    gte(messages.mediaSeconds, AUDIO_INSIGHTS_CONFIG.minSeconds),
    lte(messages.mediaSeconds, AUDIO_INSIGHTS_CONFIG.maxSeconds),
  ];
}

export type EncolarOpciones = {
  teamId: number;
  chatId?: number;
  /** Varios chats de una: lo usa el Command Center para sus frentes. */
  chatIds?: number[];
  messageIds?: string[];
  /** Cuántos encolar como máximo. */
  limit?: number;
  /** Ventana hacia atrás; por defecto la del cron. */
  maxAgeDays?: number;
  priority?: number;
  requestedBy?: Origen;
};

/**
 * Mete audios en la cola sin procesarlos.
 *
 * Encolar es barato y no consume cuota: es el paso que separa "quiero esto"
 * de "esto se está gastando ahora". El worker después drena al ritmo que el
 * banco de keys aguante.
 */
export async function encolarAudios(opciones: EncolarOpciones) {
  if (!teamHabilitado(opciones.teamId)) {
    return { encolados: 0, yaEstaban: 0, motivo: 'El equipo no tiene habilitadas las fichas de audio.' };
  }

  const condiciones = [...condicionesDeAudio(), ...condicionesDeChatExcluido(), eq(chats.teamId, opciones.teamId)];
  if (opciones.chatId) condiciones.push(eq(messages.chatId, opciones.chatId));
  if (opciones.chatIds?.length) condiciones.push(inArray(messages.chatId, opciones.chatIds));
  if (opciones.messageIds?.length) condiciones.push(inArray(messages.id, opciones.messageIds));
  if (!opciones.messageIds?.length) {
    const dias = opciones.maxAgeDays ?? AUDIO_INSIGHTS_CONFIG.maxAgeDays;
    condiciones.push(gte(messages.timestamp, new Date(Date.now() - dias * 24 * 60 * 60 * 1000)));
  }
  // Sin ficha todavía: los que ya están en cola o procesados no se re-encolan.
  condiciones.push(isNull(messageAudioInsights.id));

  const candidatos = await db
    .select({
      messageId: messages.id,
      chatId: messages.chatId,
      teamId: chats.teamId,
      mediaSeconds: messages.mediaSeconds,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .leftJoin(messageAudioInsights, eq(messageAudioInsights.messageId, messages.id))
    .where(and(...condiciones))
    .orderBy(asc(messages.timestamp))
    // El tope alto es para los backfills (los frentes del Command Center piden
    // de a 1.000): encolar no gasta cuota, sólo arma la lista de pendientes.
    .limit(Math.min(opciones.limit ?? 100, 2000));

  if (!candidatos.length) return { encolados: 0, yaEstaban: 0 };

  const insertados = await db
    .insert(messageAudioInsights)
    .values(candidatos.map((fila) => ({
      teamId: fila.teamId,
      chatId: fila.chatId,
      messageId: fila.messageId,
      status: 'queued' as const,
      durationSeconds: fila.mediaSeconds ?? 0,
      queuedAt: new Date(),
      priority: opciones.priority ?? 0,
      requestedBy: opciones.requestedBy ?? 'auto',
    })))
    // Una carrera entre el cron y un pedido del conector no debe explotar:
    // el que llega segundo simplemente no encola de nuevo.
    .onConflictDoNothing({ target: messageAudioInsights.messageId })
    .returning({ id: messageAudioInsights.id });

  return { encolados: insertados.length, yaEstaban: candidatos.length - insertados.length };
}

export type ItemDeCola = {
  messageId: string;
  chatId: number;
  teamId: number;
  mediaUrl: string | null;
  mediaSeconds: number | null;
  attempts: number;
};

/**
 * Rango del chat según el Command Center: 0 = Dinero, 1 = Oportunidades, 2 = el
 * resto (incluye los chats sin análisis, que es lo que pasa si el plugin no
 * está encendido — ahí el orden queda como estaba).
 *
 * Va en el ORDER BY y no en la columna `priority` a propósito: el gate cambia
 * con cada clasificación y una prioridad estampada envejece mal; calculado al
 * momento de tomar trabajo, la cola se reordena sola cuando un chat sube a
 * Dinero.
 */
const RANGO_COMERCIAL = sql<number>`case
  when ${teamCommercialAnalysis.currentGate} in ('G8','G9','G10') and ${teamCommercialAnalysis.status} <> 'cliente' then 0
  when ${teamCommercialAnalysis.currentGate} in ('G4','G5','G6','G7') then 1
  else 2 end`;

/**
 * Lo próximo a procesar: primero lo pedido a mano (`priority`), después los
 * chats donde hay plata en juego, y recién ahí lo más viejo.
 *
 * El pedido explícito sigue ganando: si alguien pidió ESE audio, lo quiere
 * ahora, no cuando le toque a su frente.
 */
export async function proximosDeLaCola(limit: number, teamId?: number): Promise<ItemDeCola[]> {
  const condiciones = [
    or(eq(messageAudioInsights.status, 'queued'), and(
      eq(messageAudioInsights.status, 'failed'),
      sql`${messageAudioInsights.attempts} < ${AUDIO_INSIGHTS_CONFIG.maxAttempts}`,
    ))!,
  ];
  if (teamId) condiciones.push(eq(messageAudioInsights.teamId, teamId));
  const habilitados = AUDIO_INSIGHTS_CONFIG.teamIds;
  if (habilitados.length) condiciones.push(inArray(messageAudioInsights.teamId, habilitados));

  condiciones.push(...condicionesDeChatExcluido());

  const filas = await db
    .select({
      messageId: messageAudioInsights.messageId,
      chatId: messageAudioInsights.chatId,
      teamId: messageAudioInsights.teamId,
      mediaUrl: messages.mediaUrl,
      mediaSeconds: messages.mediaSeconds,
      attempts: messageAudioInsights.attempts,
    })
    .from(messageAudioInsights)
    .innerJoin(messages, eq(messages.id, messageAudioInsights.messageId))
    .innerJoin(chats, eq(chats.id, messageAudioInsights.chatId))
    .leftJoin(
      teamCommercialAnalysis,
      and(
        eq(teamCommercialAnalysis.chatId, messageAudioInsights.chatId),
        eq(teamCommercialAnalysis.teamId, messageAudioInsights.teamId),
      ),
    )
    .where(and(...condiciones))
    .orderBy(sql`${messageAudioInsights.priority} desc`, RANGO_COMERCIAL, asc(messageAudioInsights.queuedAt))
    .limit(limit);

  return filas as ItemDeCola[];
}

/** Cuántos audios esperan, para mostrarlo sin traerlos. */
export async function estadoDeLaCola(teamId: number) {
  const filas = await db
    .select({ status: messageAudioInsights.status, total: sql<number>`count(*)`, segundos: sql<number>`coalesce(sum(${messageAudioInsights.durationSeconds}), 0)` })
    .from(messageAudioInsights)
    .where(eq(messageAudioInsights.teamId, teamId))
    .groupBy(messageAudioInsights.status);

  const porEstado = Object.fromEntries(filas.map((fila) => [fila.status, {
    total: Number(fila.total),
    minutos: Math.round((Number(fila.segundos) / 60) * 10) / 10,
  }]));

  return {
    en_cola: porEstado.queued?.total ?? 0,
    minutos_en_cola: porEstado.queued?.minutos ?? 0,
    transcriptos: porEstado.done?.total ?? 0,
    fallidos: porEstado.failed?.total ?? 0,
    banco: await capacidadDelBanco(teamId),
  };
}

/* ------------------------------------------------------------------ */
/* Transcripción                                                       */
/* ------------------------------------------------------------------ */

export type InsightResult =
  | { ok: true; messageId: string; transcript: string; cached: boolean; keyLabel?: string }
  /** `reintentable`: falló el servicio (cuota o sobrecarga), no el audio. */
  | { ok: false; messageId: string; error: string; reintentable: boolean };

/**
 * Transcribe UN audio con el banco de keys y guarda el texto.
 *
 * No analiza: eso es `analizarAudio`, aparte y a pedido.
 */
export async function transcribirAudio(messageId: string, options: { force?: boolean; requestedBy?: Origen } = {}): Promise<InsightResult> {
  const fila = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      teamId: chats.teamId,
      mediaUrl: messages.mediaUrl,
      mediaMimetype: messages.mediaMimetype,
      mediaSeconds: messages.mediaSeconds,
    })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(eq(messages.id, messageId))
    .limit(1)
    .then((filas) => filas[0]);

  if (!fila) return { ok: false, messageId, error: 'El mensaje no existe.', reintentable: false };
  if (!teamHabilitado(fila.teamId)) {
    return { ok: false, messageId, error: 'Las fichas de audio están habilitadas sólo para equipos autorizados.', reintentable: false };
  }
  if (!fila.mediaUrl) return { ok: false, messageId, error: 'Ese mensaje no tiene audio adjunto.', reintentable: false };

  const existente = await db.query.messageAudioInsights.findFirst({
    where: eq(messageAudioInsights.messageId, messageId),
  });
  if (existente?.status === 'done' && !options.force) {
    return { ok: true, messageId, transcript: existente.transcript, cached: true };
  }

  const base = {
    teamId: fila.teamId,
    chatId: fila.chatId,
    messageId,
    durationSeconds: fila.mediaSeconds ?? 0,
    requestedBy: options.requestedBy ?? existente?.requestedBy ?? 'auto',
  };

  const resultado = await transcribirConBanco({
    teamId: fila.teamId,
    mediaUrl: fila.mediaUrl,
    audioSeconds: fila.mediaSeconds ?? 0,
  });

  if (!resultado.ok) {
    // Cuota agotada o modelo saturado NO son culpa del audio: vuelve a la cola
    // sin gastar un intento. Con tres 503 seguidos —que pasan— un audio
    // perfecto quedaría marcado como fallido para siempre.
    const estado = resultado.reintentable ? 'queued' : 'failed';
    const intentos = resultado.reintentable ? (existente?.attempts ?? 0) : (existente?.attempts ?? 0) + 1;
    await db
      .insert(messageAudioInsights)
      .values({ ...base, status: estado, attempts: intentos, error: resultado.error.slice(0, 1000), queuedAt: existente?.queuedAt ?? new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: messageAudioInsights.messageId,
        set: { status: estado, attempts: intentos, error: resultado.error.slice(0, 1000), updatedAt: new Date() },
      });
    return { ok: false, messageId, error: resultado.error, reintentable: resultado.reintentable };
  }

  const valores = {
    ...base,
    status: 'done' as const,
    transcript: resultado.texto.slice(0, 20000),
    provider: 'gemini',
    model: resultado.modelo,
    keyId: resultado.keyId,
    attempts: (existente?.attempts ?? 0) + 1,
    error: '',
    generatedAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insert(messageAudioInsights).values(valores)
    .onConflictDoUpdate({ target: messageAudioInsights.messageId, set: valores });

  // El análisis va después y aparte: si falla, la transcripción igual quedó
  // guardada. Perder lo que ya se pagó por no poder resumirlo sería el peor
  // canje posible.
  if (AUDIO_INSIGHTS_CONFIG.analyzeByDefault) {
    try {
      await analizarAudio(messageId);
    } catch (error) {
      console.error('[audio-insights] análisis automático fallido', messageId, error);
    }
  }

  return { ok: true, messageId, transcript: valores.transcript, cached: false, keyLabel: resultado.keyLabel };
}

/* ------------------------------------------------------------------ */
/* Análisis (opcional, a pedido)                                       */
/* ------------------------------------------------------------------ */

const PROMPT_FICHA = `Sos un asistente que lee la transcripción de una nota de voz que un cliente le mandó a un negocio por WhatsApp.

Devolvé SOLO un objeto JSON válido, sin markdown y sin explicaciones, con esta forma exacta:
{
  "summary": "una o dos frases con lo que pide o dice la persona",
  "intent": "una de: consulta, pedido, reclamo, pago, coordinacion, seguimiento, saludo, otro",
  "urgency": "una de: baja, media, alta",
  "sentiment": "una de: positivo, neutral, negativo",
  "language": "codigo ISO de dos letras del idioma hablado",
  "entities": { "montos": [], "fechas": [], "lugares": [], "productos": [], "personas": [] },
  "action_items": ["cosas concretas que el negocio tiene que hacer"]
}

Reglas:
- No inventes datos que no estén en la transcripción: si algo no se menciona, dejá la lista vacía.
- "urgency" alta sólo si la persona expresa apuro, molestia o un plazo que vence.
- Copiá montos y fechas tal como los dice, sin convertir.

Transcripción:
`;

const INTENTS = new Set(['consulta', 'pedido', 'reclamo', 'pago', 'coordinacion', 'seguimiento', 'saludo', 'otro']);
const URGENCIES = new Set(['baja', 'media', 'alta']);
const SENTIMENTS = new Set(['positivo', 'neutral', 'negativo']);

/**
 * El modelo devuelve JSON "casi siempre": a veces lo envuelve en ```json, a
 * veces le antepone una línea. Recortamos al primer objeto balanceado en vez
 * de confiar en el formato — un parseo que falla acá tira a la basura una
 * request de cuota que ya se gastó.
 */
function parseFicha(raw: string | null) {
  if (!raw) return null;
  const limpio = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio === -1 || fin <= inicio) return null;
  try {
    const objeto = JSON.parse(limpio.slice(inicio, fin + 1));
    return typeof objeto === 'object' && objeto ? (objeto as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function texto(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function enumerado(value: unknown, permitidos: Set<string>) {
  const limpio = texto(value, 48).toLowerCase();
  return permitidos.has(limpio) ? limpio : '';
}

function lista(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => (item as string).trim().slice(0, 300))
    .slice(0, 20);
}

export type AnalisisResult =
  | { ok: true; messageId: string; cached: boolean; summary: string; intent: string; urgency: string }
  | { ok: false; messageId: string; error: string; reintentable: boolean };

/**
 * Análisis de un audio YA transcripto: segunda llamada, sobre texto.
 *
 * Va sobre el transcript y no sobre el audio porque el mismo contenido cuesta
 * mucho menos como texto, y porque una transcripción ya pagada no se vuelve a
 * pagar para releerla.
 */
export async function analizarAudio(messageId: string, options: { force?: boolean } = {}): Promise<AnalisisResult> {
  const ficha = await db.query.messageAudioInsights.findFirst({
    where: eq(messageAudioInsights.messageId, messageId),
  });
  if (!ficha) return { ok: false, messageId, error: 'Ese audio todavía no fue transcripto.', reintentable: false };
  if (ficha.status !== 'done' || !ficha.transcript) {
    return { ok: false, messageId, error: `Ese audio está en estado "${ficha.status}": primero hay que transcribirlo.`, reintentable: false };
  }
  if (ficha.analyzedAt && !options.force) {
    return { ok: true, messageId, cached: true, summary: ficha.summary, intent: ficha.intent, urgency: ficha.urgency };
  }

  const resultado = await analizarTextoConBanco({
    teamId: ficha.teamId,
    prompt: `${PROMPT_FICHA}${ficha.transcript.slice(0, TRANSCRIPT_MAX_CHARS)}`,
  });
  if (!resultado.ok) return { ok: false, messageId, error: resultado.error, reintentable: resultado.reintentable };

  const datos = parseFicha(resultado.texto);
  if (!datos) return { ok: false, messageId, error: 'El modelo no devolvió un JSON legible.', reintentable: false };

  const valores = {
    language: texto(datos.language, 16).toLowerCase(),
    summary: texto(datos.summary, 1000),
    intent: enumerado(datos.intent, INTENTS),
    urgency: enumerado(datos.urgency, URGENCIES),
    sentiment: enumerado(datos.sentiment, SENTIMENTS),
    entities: (datos.entities && typeof datos.entities === 'object' ? datos.entities : {}) as Record<string, unknown>,
    actionItems: lista(datos.action_items),
    analyzedAt: new Date(),
    updatedAt: new Date(),
  };
  await db.update(messageAudioInsights).set(valores).where(eq(messageAudioInsights.messageId, messageId));

  return { ok: true, messageId, cached: false, summary: valores.summary, intent: valores.intent, urgency: valores.urgency };
}

/**
 * Audios que el banco de keys NO pudo procesar.
 *
 * Son los que ya se intentaron al menos una vez y siguen sin transcripción:
 * cuota agotada en todas las keys, modelo saturado, o un error que se repite.
 * Los de la cola que todavía no se intentaron no entran acá — esos van a salir
 * solos en la próxima corrida.
 *
 * Existe para que un conector se haga cargo: baja el audio, lo escucha con su
 * propia cuota y devuelve el resultado con `guardarFichaExterna`.
 */
export async function audiosBloqueados(teamId: number, limit: number) {
  const filas = await db
    .select({
      messageId: messageAudioInsights.messageId,
      chatId: messageAudioInsights.chatId,
      status: messageAudioInsights.status,
      attempts: messageAudioInsights.attempts,
      error: messageAudioInsights.error,
      durationSeconds: messageAudioInsights.durationSeconds,
      queuedAt: messageAudioInsights.queuedAt,
      mediaMimetype: messages.mediaMimetype,
      timestamp: messages.timestamp,
      fromMe: messages.fromMe,
      remoteJid: chats.remoteJid,
      chatName: chats.name,
    })
    .from(messageAudioInsights)
    .innerJoin(messages, eq(messages.id, messageAudioInsights.messageId))
    .innerJoin(chats, eq(chats.id, messageAudioInsights.chatId))
    .where(and(
      eq(messageAudioInsights.teamId, teamId),
      or(eq(messageAudioInsights.status, 'queued'), eq(messageAudioInsights.status, 'failed'))!,
      // Se intentó y no salió: sin esto la lista traería toda la cola normal.
      sql`${messageAudioInsights.attempts} > 0 or ${messageAudioInsights.error} <> ''`,
      sql`${messageAudioInsights.transcript} = ''`,
    ))
    .orderBy(asc(messageAudioInsights.queuedAt))
    .limit(limit);

  return filas;
}

/* ------------------------------------------------------------------ */
/* Escritura desde afuera                                              */
/* ------------------------------------------------------------------ */

export type FichaExterna = {
  transcript?: string;
  summary?: string;
  intent?: string;
  urgency?: string;
  sentiment?: string;
  language?: string;
  entities?: Record<string, unknown>;
  actionItems?: string[];
};

/**
 * Guarda una ficha que produjo otro: un modelo que sí escucha audio (Gemini,
 * Grok), una corrección a mano, o un análisis que hizo el propio conector
 * leyendo la transcripción.
 *
 * Por qué existe: el banco de keys tiene un techo diario, y el modelo del otro
 * lado del conector a veces puede hacer el trabajo con SU cuota. Esta tool
 * convierte eso en algo aprovechable en vez de una respuesta que se pierde
 * cuando termina la conversación.
 *
 * No pisa una transcripción existente sin `overwrite`: lo caro es el audio ya
 * escuchado, y sobrescribirlo por accidente obliga a gastarlo de nuevo.
 */
export async function guardarFichaExterna(input: {
  teamId: number;
  messageId: string;
  ficha: FichaExterna;
  origen: Origen;
  fuente: string;
  overwrite?: boolean;
}): Promise<{ ok: true; creada: boolean } | { ok: false; error: string }> {
  const fila = await db
    .select({ id: messages.id, chatId: messages.chatId, teamId: chats.teamId, mediaSeconds: messages.mediaSeconds })
    .from(messages)
    .innerJoin(chats, eq(messages.chatId, chats.id))
    .where(and(eq(messages.id, input.messageId), eq(chats.teamId, input.teamId)))
    .limit(1)
    .then((filas) => filas[0]);

  if (!fila) return { ok: false, error: 'El mensaje no existe o no pertenece a este equipo.' };

  const existente = await db.query.messageAudioInsights.findFirst({
    where: eq(messageAudioInsights.messageId, input.messageId),
  });

  const transcript = input.ficha.transcript?.trim();
  if (existente?.transcript && transcript && !input.overwrite) {
    return { ok: false, error: 'Ese audio ya tiene transcripción guardada. Mandá overwrite: true si querés reemplazarla.' };
  }
  if (!transcript && !existente?.transcript) {
    return { ok: false, error: 'Hace falta el transcript: no hay ninguno guardado para este audio.' };
  }

  const analisis = input.ficha.summary || input.ficha.intent || input.ficha.urgency || input.ficha.sentiment;

  const valores = {
    teamId: fila.teamId,
    chatId: fila.chatId,
    messageId: input.messageId,
    status: 'done' as const,
    transcript: transcript ? transcript.slice(0, 20000) : (existente?.transcript ?? ''),
    durationSeconds: fila.mediaSeconds ?? 0,
    // Queda registrado que esto NO salió del banco de keys: si mañana la
    // transcripción es mala, importa saber quién la escribió.
    provider: `external:${input.fuente}`.slice(0, 40),
    model: '',
    requestedBy: input.origen,
    language: texto(input.ficha.language, 16).toLowerCase() || (existente?.language ?? ''),
    summary: texto(input.ficha.summary, 1000) || (existente?.summary ?? ''),
    intent: enumerado(input.ficha.intent, INTENTS) || (existente?.intent ?? ''),
    urgency: enumerado(input.ficha.urgency, URGENCIES) || (existente?.urgency ?? ''),
    sentiment: enumerado(input.ficha.sentiment, SENTIMENTS) || (existente?.sentiment ?? ''),
    entities: (input.ficha.entities && typeof input.ficha.entities === 'object'
      ? input.ficha.entities
      : (existente?.entities ?? {})) as Record<string, unknown>,
    actionItems: input.ficha.actionItems?.length ? lista(input.ficha.actionItems) : (existente?.actionItems ?? []),
    error: '',
    generatedAt: existente?.generatedAt ?? new Date(),
    analyzedAt: analisis ? new Date() : existente?.analyzedAt ?? null,
    updatedAt: new Date(),
  };

  await db.insert(messageAudioInsights).values(valores)
    .onConflictDoUpdate({ target: messageAudioInsights.messageId, set: valores });

  return { ok: true, creada: !existente };
}

/* ------------------------------------------------------------------ */
/* Worker                                                              */
/* ------------------------------------------------------------------ */

export type BatchReport = {
  encolados: number;
  /** Audios sacados de la cola por pertenecer a un chat excluido. */
  depurados: number;
  procesados: number;
  transcriptos: number;
  fallidos: number;
  /** Cortes por cuota agotada o modelo saturado: la cola queda intacta. */
  reintentables: number;
  /** Ninguna key tenía cuota: no se sacó nada de la cola. */
  sinCuota: boolean;
  detalle: Array<{ messageId: string; ok: boolean; error?: string }>;
};

/**
 * Una corrida del worker: encola lo nuevo y drena la cola.
 *
 * Secuencial a propósito. El límite del free tier es por minuto, así que
 * disparar en paralelo sólo adelanta el 429; y el servidor tiene 2 vCPU con
 * carga alta, donde paralelizar pedidos de red tampoco sale gratis.
 */
export async function runAudioInsightsBatch(options: { limit?: number; teamId?: number; encolarNuevos?: boolean } = {}): Promise<BatchReport> {
  const reporte: BatchReport = { encolados: 0, depurados: 0, procesados: 0, transcriptos: 0, fallidos: 0, reintentables: 0, sinCuota: false, detalle: [] };

  /**
   * El lote es "un audio por key con cuota", no un número fijo.
   *
   * Con un tope fijo mayor que las keys disponibles, la corrida saca trabajo de
   * la cola que el banco no puede servir: gasta la primera key, choca el 429 y
   * corta a la mitad. Atado a las keys, cada corrida las usa una vez cada una y
   * el día se consume parejo. Un `limit` explícito (backfill a mano) manda.
   */
  const equipoDeCuota = options.teamId ?? AUDIO_INSIGHTS_CONFIG.teamIds[0] ?? null;
  let limit = options.limit ?? AUDIO_INSIGHTS_CONFIG.batchSize;
  if (options.limit === undefined && equipoDeCuota) {
    const disponibles = await keysConCuota(equipoDeCuota);
    if (disponibles === 0) reporte.sinCuota = true;
    else limit = Math.min(limit, disponibles);
  }

  // Paso 0: sacar lo que no corresponde transcribir. Va antes de encolar para
  // que el conteo de pendientes sea el trabajo real.
  try {
    reporte.depurados = await depurarExcluidosDeLaCola();
  } catch (error) {
    console.error('[audio-insights] depurar excluidos falló', error);
  }

  // Paso 1: encolar los audios nuevos de los equipos habilitados.
  if (options.encolarNuevos !== false) {
    const equipos = options.teamId ? [options.teamId] : AUDIO_INSIGHTS_CONFIG.teamIds;
    for (const teamId of equipos) {
      const { encolados } = await encolarAudios({ teamId, limit: 200, requestedBy: 'auto' });
      reporte.encolados += encolados;
    }
  }

  // Paso 2: drenar lo que el banco de keys permita.
  if (reporte.sinCuota) return reporte;
  const pendientes = await proximosDeLaCola(limit, options.teamId);
  for (const item of pendientes) {
    const resultado = await transcribirAudio(item.messageId);
    reporte.procesados += 1;
    if (resultado.ok) {
      reporte.transcriptos += 1;
      reporte.detalle.push({ messageId: item.messageId, ok: true });
    } else if (resultado.reintentable) {
      // Cuota agotada o modelo saturado: seguir sería gastar llamadas que ya
      // sabemos que van a fallar. Se corta la corrida y la cola queda intacta.
      reporte.reintentables += 1;
      reporte.detalle.push({ messageId: item.messageId, ok: false, error: resultado.error });
      break;
    } else {
      reporte.fallidos += 1;
      reporte.detalle.push({ messageId: item.messageId, ok: false, error: resultado.error });
    }
  }

  return reporte;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                             */
/* ------------------------------------------------------------------ */

export type AudioInsightView = {
  status: string;
  transcript: string;
  summary: string;
  intent: string;
  urgency: string;
  sentiment: string;
  language: string;
  entities: Record<string, unknown>;
  action_items: unknown;
  analyzed: boolean;
  generated_at: string | null;
};

/** Fichas de varios mensajes de una, para no hacer una consulta por audio. */
export async function getAudioInsightsByMessageIds(messageIds: string[]) {
  const mapa = new Map<string, AudioInsightView>();
  if (!messageIds.length) return mapa;

  const filas = await db
    .select()
    .from(messageAudioInsights)
    .where(inArray(messageAudioInsights.messageId, messageIds));

  for (const fila of filas) {
    if (fila.status !== 'done') continue;
    mapa.set(fila.messageId, {
      status: fila.status,
      transcript: fila.transcript,
      summary: fila.summary,
      intent: fila.intent,
      urgency: fila.urgency,
      sentiment: fila.sentiment,
      language: fila.language,
      entities: (fila.entities ?? {}) as Record<string, unknown>,
      action_items: fila.actionItems ?? [],
      analyzed: Boolean(fila.analyzedAt),
      generated_at: fila.generatedAt ? fila.generatedAt.toISOString() : null,
    });
  }
  return mapa;
}
