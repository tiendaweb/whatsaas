import 'server-only';

import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { teamPlugins } from '@/lib/db/schema';
import { teamGeminiKeyUsage, teamGeminiKeys } from '@/lib/db/schema';
import { resolveMediaFilePath, statMediaFile } from '@/lib/media-file-path';
// El códec vive en lib/payments pero no tiene nada de pagos: es AES-256-GCM
// con la misma clave del resto del sistema. Se reutiliza en vez de escribir
// una segunda implementación de cripto que después nadie mantiene.
import { decryptPaymentSecret, encryptPaymentSecret } from '@/lib/payments/secret-codec';
import { MODELO_GEMINI_POR_DEFECTO } from '@/lib/gemini/models';

/**
 * Banco de API keys de Gemini con rotación al azar.
 *
 * El free tier limita por key, no por cuenta: con una sola, la cola de
 * transcripción se frena a los pocos audios del día. Varias keys en rotación
 * multiplican el techo sin pagar nada.
 *
 * Al azar y no por turnos: el orden fijo concentra el gasto en la primera key
 * de la lista cuando el lote es corto, y así una key llega al límite mientras
 * las otras están intactas. El azar reparte parejo sin llevar estado.
 */

/** Formatos de audio que Gemini acepta como inlineData. */
const MIME_POR_EXTENSION: Record<string, string> = {
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.mp4': 'audio/mp4',
  '.wav': 'audio/wav', '.webm': 'audio/webm', '.flac': 'audio/flac', '.aac': 'audio/aac',
};

function extensionDe(ruta: string) {
  const punto = ruta.lastIndexOf('.');
  return punto === -1 ? '' : ruta.slice(punto).toLowerCase();
}

/**
 * El "día" del banco es el de Google, no el de UTC.
 *
 * Google resetea la cuota diaria a medianoche del Pacífico (07:00 UTC en
 * verano, 08:00 en invierno). Con el día en UTC pasaba esto: a las 00:00 UTC el
 * banco estrenaba día, el cron disparaba, Google contestaba 429 porque SU día
 * no había rotado, `marcarAgotada` llenaba el contador del día nuevo y el banco
 * se quedaba apagado hasta las 00:00 UTC siguiente. Google liberaba a las 07:00
 * y acá seguíamos sin keys 17 horas más. Con el día de Los Ángeles, el 429 de
 * las 00:05 UTC cae en el día que de verdad está agotado.
 */
function diaDeGoogle(fecha: Date = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha);
  const de = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${de('year')}-${de('month')}-${de('day')}`;
}

function minutoActual() {
  const ahora = new Date();
  ahora.setUTCSeconds(0, 0);
  return ahora;
}

/* ------------------------------------------------------------------ */
/* Lectura del banco                                                   */
/* ------------------------------------------------------------------ */

export type KeyConUso = {
  id: number;
  label: string;
  status: string;
  model: string;
  limitRpm: number;
  limitRpd: number;
  notes: string;
  lastUsedAt: Date | null;
  lastError: string;
  lastErrorAt: Date | null;
  /** Los últimos 4 caracteres, para reconocerla sin exponerla. */
  hint: string;
  usoHoy: number;
  erroresHoy: number;
  erroresDeCuotaHoy: number;
  segundosAudioHoy: number;
  usoMinuto: number;
  disponibleHoy: number;
  porcentajeUsado: number;
};

/** Estado del banco para la UI: una fila por key con su consumo del día. */
export async function listarKeys(teamId: number): Promise<KeyConUso[]> {
  const filas = await db
    .select({
      key: teamGeminiKeys,
      uso: teamGeminiKeyUsage,
    })
    .from(teamGeminiKeys)
    .leftJoin(
      teamGeminiKeyUsage,
      and(eq(teamGeminiKeyUsage.keyId, teamGeminiKeys.id), eq(teamGeminiKeyUsage.day, diaDeGoogle())),
    )
    .where(eq(teamGeminiKeys.teamId, teamId))
    .orderBy(asc(teamGeminiKeys.id));

  const ventana = minutoActual().getTime();

  return filas.map(({ key, uso }) => {
    const usoHoy = uso?.requests ?? 0;
    // La ventana del minuto sólo cuenta si es la actual: una guardada hace una
    // hora diría "9 de 10 usados" sobre un minuto que ya pasó.
    const usoMinuto = uso?.minuteWindow && uso.minuteWindow.getTime() === ventana ? uso.minuteRequests : 0;
    let apiKey = '';
    try {
      apiKey = decryptPaymentSecret(key.apiKey) ?? '';
    } catch {
      apiKey = '';
    }
    return {
      id: key.id,
      label: key.label,
      status: key.status,
      model: key.model,
      limitRpm: key.limitRpm,
      limitRpd: key.limitRpd,
      notes: key.notes,
      lastUsedAt: key.lastUsedAt,
      lastError: key.lastError,
      lastErrorAt: key.lastErrorAt,
      hint: apiKey ? `…${apiKey.slice(-4)}` : '(ilegible)',
      usoHoy,
      erroresHoy: uso?.errors ?? 0,
      erroresDeCuotaHoy: uso?.quotaErrors ?? 0,
      segundosAudioHoy: uso?.audioSeconds ?? 0,
      usoMinuto,
      disponibleHoy: Math.max(0, key.limitRpd - usoHoy),
      porcentajeUsado: key.limitRpd > 0 ? Math.min(100, Math.round((usoHoy / key.limitRpd) * 100)) : 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Alta y edición                                                      */
/* ------------------------------------------------------------------ */

export async function crearKey(input: {
  teamId: number;
  label: string;
  apiKey: string;
  model?: string;
  limitRpm?: number;
  limitRpd?: number;
  notes?: string;
  createdBy?: number;
}) {
  const [fila] = await db
    .insert(teamGeminiKeys)
    .values({
      teamId: input.teamId,
      label: input.label.trim().slice(0, 80),
      apiKey: encryptPaymentSecret(input.apiKey.trim()),
      model: input.model?.trim() || MODELO_GEMINI_POR_DEFECTO,
      limitRpm: input.limitRpm ?? 10,
      // Google es la autoridad, no este número: un 429 de verdad saca la key del
      // día solo (`marcarAgotada`, que además guarda el `limit: N` que Google
      // dice en el error). El 20 es lo que el free tier sirve HOY para
      // gemini-3.6-flash por proyecto y por día ("GenerateRequestsPerDayPerProjectPerModel-FreeTier,
      // limit: 20", 2026-09-06). Estuvo en 200 y el banco prometía 2.600 pedidos
      // que Google nunca dio: la reserva del 30 % (780) era más grande que la
      // cuota real entera (260), y lo automático no arrancaba nunca.
      limitRpd: input.limitRpd ?? 20,
      notes: input.notes?.trim().slice(0, 1000) ?? '',
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: teamGeminiKeys.id });
  return fila;
}

export async function actualizarKey(teamId: number, keyId: number, cambios: {
  label?: string;
  apiKey?: string;
  status?: 'active' | 'disabled';
  model?: string;
  limitRpm?: number;
  limitRpd?: number;
  notes?: string;
}) {
  const valores: Record<string, unknown> = { updatedAt: new Date() };
  if (cambios.label !== undefined) valores.label = cambios.label.trim().slice(0, 80);
  // Una key vacía en el formulario significa "no la cambies", no "borrala":
  // la UI nunca muestra la key entera, así que no puede reenviarla.
  if (cambios.apiKey) valores.apiKey = encryptPaymentSecret(cambios.apiKey.trim());
  if (cambios.status !== undefined) valores.status = cambios.status;
  if (cambios.model !== undefined) valores.model = cambios.model.trim() || MODELO_GEMINI_POR_DEFECTO;
  if (cambios.limitRpm !== undefined) valores.limitRpm = cambios.limitRpm;
  if (cambios.limitRpd !== undefined) valores.limitRpd = cambios.limitRpd;
  if (cambios.notes !== undefined) valores.notes = cambios.notes.trim().slice(0, 1000);

  await db.update(teamGeminiKeys).set(valores)
    .where(and(eq(teamGeminiKeys.id, keyId), eq(teamGeminiKeys.teamId, teamId)));
}

export async function borrarKey(teamId: number, keyId: number) {
  await db.delete(teamGeminiKeys)
    .where(and(eq(teamGeminiKeys.id, keyId), eq(teamGeminiKeys.teamId, teamId)));
}

/* ------------------------------------------------------------------ */
/* Selección                                                           */
/* ------------------------------------------------------------------ */

export type KeyElegida = { id: number; apiKey: string; model: string; label: string };

/**
 * Elige al azar una key con cuota disponible hoy y en el minuto en curso.
 *
 * `excluir` sirve para reintentar con otra cuando la elegida devolvió 429: sin
 * eso el reintento puede caer en la misma key y volver a fallar.
 */
export async function elegirKey(teamId: number, excluir: number[] = [], opts: { automatico?: boolean } = {}): Promise<KeyElegida | null> {
  const candidatas = await listarKeys(teamId);
  const ventana = minutoActual().getTime();

  // Un proceso automático no toca la reserva: si lo que queda del día es la
  // reserva, para él no hay keys. Lo pedido a mano sí llega hasta el final.
  if (opts.automatico) {
    const cuota = cuotaAutomaticaDe(candidatas, await reservaDelBanco(teamId));
    if (cuota.disponibleAutomatico <= 0) return null;
  }

  const elegibles = candidatas.filter((key) => (
    key.status === 'active'
    && !excluir.includes(key.id)
    && key.usoHoy < key.limitRpd
    && key.usoMinuto < key.limitRpm
  ));
  if (!elegibles.length) return null;

  const ganadora = elegibles[Math.floor(Math.random() * elegibles.length)];
  const fila = await db.query.teamGeminiKeys.findFirst({ where: eq(teamGeminiKeys.id, ganadora.id) });
  if (!fila) return null;

  const apiKey = decryptPaymentSecret(fila.apiKey);
  if (!apiKey) return null;
  void ventana;
  return { id: fila.id, apiKey, model: fila.model, label: fila.label };
}

/* ------------------------------------------------------------------ */
/* Reserva para lo manual                                              */
/* ------------------------------------------------------------------ */

const RESERVA_DEFAULT_PCT = 30;

/** Porcentaje reservado, leído de los settings del plugin Gemini del equipo. */
export async function reservaDelBanco(teamId: number): Promise<number> {
  const row = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, 'gemini')),
    columns: { settings: true },
  });
  const raw = (row?.settings as Record<string, unknown> | null)?.reservaDiariaPct;
  const pct = typeof raw === 'number' && Number.isFinite(raw) ? raw : RESERVA_DEFAULT_PCT;
  return Math.min(90, Math.max(0, Math.round(pct)));
}

/** Cambia la reserva. Va en los settings del plugin Gemini: es una propiedad del banco, no del Command Center. */
export async function setReservaDelBanco(teamId: number, pct: number): Promise<number> {
  const valor = Math.min(90, Math.max(0, Math.round(pct)));
  const existing = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, 'gemini')),
    columns: { id: true, settings: true },
  });
  if (!existing) throw new Error('El equipo no tiene la app Gemini activada.');
  await db.update(teamPlugins).set({ settings: { ...((existing.settings as Record<string, unknown> | null) ?? {}), reservaDiariaPct: valor }, updatedAt: new Date() }).where(eq(teamPlugins.id, existing.id));
  return valor;
}

/**
 * ¿El banco se usa para transcribir audios por cron? Setting del plugin Gemini
 * (`transcribirAudios`, default true). Sólo frena al worker automático: lo que
 * una persona pide a mano sigue saliendo aunque esté apagado.
 */
export async function transcripcionAutomaticaActiva(teamId: number): Promise<boolean> {
  const row = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, 'gemini')),
    columns: { settings: true },
  });
  const raw = (row?.settings as Record<string, unknown> | null)?.transcribirAudios;
  return typeof raw === 'boolean' ? raw : true;
}

export async function setTranscripcionAutomatica(teamId: number, activa: boolean): Promise<boolean> {
  const existing = await db.query.teamPlugins.findFirst({
    where: and(eq(teamPlugins.teamId, teamId), eq(teamPlugins.pluginId, 'gemini')),
    columns: { id: true, settings: true },
  });
  if (!existing) throw new Error('El equipo no tiene la app Gemini activada.');
  await db.update(teamPlugins).set({ settings: { ...((existing.settings as Record<string, unknown> | null) ?? {}), transcribirAudios: activa }, updatedAt: new Date() }).where(eq(teamPlugins.id, existing.id));
  return activa;
}

export type CuotaAutomatica = {
  totalDiario: number;
  restanteHoy: number;
  reservaPct: number;
  /** Pedidos que se guardan para lo manual. */
  reserva: number;
  /** Lo que los procesos automáticos pueden gastar todavía hoy. */
  disponibleAutomatico: number;
};

function cuotaAutomaticaDe(keys: KeyConUso[], reservaPct: number): CuotaAutomatica {
  const activas = keys.filter((key) => key.status === 'active');
  const totalDiario = activas.reduce((suma, key) => suma + key.limitRpd, 0);
  const restanteHoy = activas.reduce((suma, key) => suma + key.disponibleHoy, 0);
  const reserva = Math.floor((totalDiario * reservaPct) / 100);
  return { totalDiario, restanteHoy, reservaPct, reserva, disponibleAutomatico: Math.max(0, restanteHoy - reserva) };
}

/**
 * Cuánto pueden gastar hoy los procesos automáticos.
 *
 * La reserva es un porcentaje del total diario, no de lo que queda: así una
 * mañana de clasificación intensa no puede dejar la tarde sin cuota para lo
 * que una persona pide con el cliente delante.
 */
export async function cuotaAutomatica(teamId: number): Promise<CuotaAutomatica> {
  return cuotaAutomaticaDe(await listarKeys(teamId), await reservaDelBanco(teamId));
}

/** Cuánto se puede procesar hoy con todo el banco, para avisar antes de encolar de más. */
export async function capacidadDelBanco(teamId: number) {
  const keys = await listarKeys(teamId);
  const activas = keys.filter((key) => key.status === 'active');
  return {
    keys: keys.length,
    activas: activas.length,
    restanteHoy: activas.reduce((suma, key) => suma + key.disponibleHoy, 0),
    totalDiario: activas.reduce((suma, key) => suma + key.limitRpd, 0),
    porMinuto: activas.reduce((suma, key) => suma + key.limitRpm, 0),
  };
}

/**
 * Cuántas keys tienen cuota hoy. El worker de audios toma un audio por cada
 * una: así una corrida usa todas las keys una vez en vez de gastar la primera
 * y descubrir el 429 con la cola ya sacada.
 */
export async function keysConCuota(teamId: number, opts: { automatico?: boolean } = {}): Promise<number> {
  const keys = await listarKeys(teamId);
  const conCuota = keys.filter((key) => key.status === 'active' && key.disponibleHoy > 0).length;
  if (!opts.automatico) return conCuota;
  // Para el worker, además del conteo de keys, cuenta la reserva: cada audio
  // son dos pedidos (transcribir + analizar), así que el lote no puede pasar
  // de la mitad de lo que queda por encima de la reserva.
  const cuota = cuotaAutomaticaDe(keys, await reservaDelBanco(teamId));
  return Math.min(conCuota, Math.floor(cuota.disponibleAutomatico / 2));
}

/* ------------------------------------------------------------------ */
/* Registro de uso                                                     */
/* ------------------------------------------------------------------ */

async function registrarUso(keyId: number, datos: { audioSeconds?: number; error?: boolean; quotaError?: boolean }) {
  const dia = diaDeGoogle();
  const ventana = minutoActual();

  await db
    .insert(teamGeminiKeyUsage)
    .values({
      keyId,
      day: dia,
      requests: 1,
      errors: datos.error ? 1 : 0,
      quotaErrors: datos.quotaError ? 1 : 0,
      audioSeconds: datos.audioSeconds ?? 0,
      minuteWindow: ventana,
      minuteRequests: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [teamGeminiKeyUsage.keyId, teamGeminiKeyUsage.day],
      set: {
        requests: sql`${teamGeminiKeyUsage.requests} + 1`,
        errors: sql`${teamGeminiKeyUsage.errors} + ${datos.error ? 1 : 0}`,
        quotaErrors: sql`${teamGeminiKeyUsage.quotaErrors} + ${datos.quotaError ? 1 : 0}`,
        audioSeconds: sql`${teamGeminiKeyUsage.audioSeconds} + ${datos.audioSeconds ?? 0}`,
        // El contador del minuto se reinicia solo cuando cambió la ventana.
        // El Date va como ISO con cast explícito: interpolado tal cual dentro
        // de sql`` el driver lo rechaza en runtime (el typecheck lo deja pasar).
        minuteWindow: ventana,
        minuteRequests: sql`case when ${teamGeminiKeyUsage.minuteWindow} = ${ventana.toISOString()}::timestamptz then ${teamGeminiKeyUsage.minuteRequests} + 1 else 1 end`,
        updatedAt: new Date(),
      },
    });

  await db.update(teamGeminiKeys)
    .set({ lastUsedAt: new Date(), updatedAt: new Date() })
    .where(eq(teamGeminiKeys.id, keyId));
}

/**
 * Da la key por agotada hasta el próximo día.
 *
 * Google contesta 429 cuando el proyecto ya gastó su cuota diaria del free
 * tier, y eso no se ve en nuestro contador: la key figuraba con 8 de 20 usadas
 * y el banco la seguía eligiendo, cobrando un 429 tras otro (hoy: 57 de 74
 * llamadas del día fueron eso). Marcarla llena la saca de la rotación hasta que
 * el contador rote de día.
 *
 * El corte del contador es el día de Google (`diaDeGoogle`), así que la key
 * vuelve sola cuando Google la libera.
 *
 * Si el 429 trae "limit: N", ese N es la cuota real del proyecto para el
 * modelo y se guarda en `limit_rpd`: lo que dice Google manda sobre lo que
 * alguien cargó a mano (el 2026-09-06 las 13 keys decían 200 y Google 20).
 */
async function marcarAgotada(keyId: number, error?: unknown) {
  const dia = diaDeGoogle();
  const limiteReal = limiteDiarioDelError(error);
  try {
    if (limiteReal !== null) {
      const [antes] = await db.select({ limitRpd: teamGeminiKeys.limitRpd, label: teamGeminiKeys.label }).from(teamGeminiKeys).where(eq(teamGeminiKeys.id, keyId));
      if (antes && antes.limitRpd !== limiteReal) {
        await db.update(teamGeminiKeys).set({ limitRpd: limiteReal, updatedAt: new Date() }).where(eq(teamGeminiKeys.id, keyId));
        console.warn(`[gemini/key-bank] key "${antes.label}" (#${keyId}): Google dice limit_rpd ${limiteReal}, estaba en ${antes.limitRpd}. Corregido.`);
      }
    }
    await db.execute(sql`
      insert into team_gemini_key_usage (key_id, day, requests, updated_at)
      values (${keyId}, ${dia}::date, (select limit_rpd from team_gemini_keys where id = ${keyId}), now())
      on conflict (key_id, day) do update
        set requests = greatest(team_gemini_key_usage.requests, (select limit_rpd from team_gemini_keys where id = ${keyId})),
            updated_at = now()
    `);
  } catch (error) {
    console.error('[gemini/key-bank] marcarAgotada falló', error);
  }
}

/** El "limit: N" del 429 diario, si Google lo dice. Es la cuota real del proyecto. */
function limiteDiarioDelError(error: unknown): number | null {
  if (error === undefined || error === null) return null;
  const texto = error instanceof Error ? error.message : String(error);
  const match = /limit:\s*(\d+)/i.exec(texto);
  if (!match) return null;
  const valor = Number(match[1]);
  return Number.isInteger(valor) && valor > 0 && valor <= 100000 ? valor : null;
}

async function registrarError(keyId: number, mensaje: string) {
  await db.update(teamGeminiKeys)
    .set({ lastError: mensaje.slice(0, 1000), lastErrorAt: new Date(), updatedAt: new Date() })
    .where(eq(teamGeminiKeys.id, keyId));
}

/** Un 429 (o "quota"/"rate limit") significa que esta key tocó el techo, no que el audio esté mal. */
export function esErrorDeCuota(error: unknown) {
  const texto = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return texto.includes('429') || texto.includes('quota') || texto.includes('rate limit') || texto.includes('resource_exhausted');
}

/**
 * ¿Ese 429 es "se acabó el día" o "vas muy rápido"?
 *
 * Google usa el mismo código para las dos cosas y la diferencia es enorme: la
 * primera saca la key hasta mañana, la segunda hasta el minuto que viene. Al
 * tratarlas igual, un pico de clasificación que pasaba las 10 por minuto
 * mataba las trece keys del banco para todo el día, y el banco informaba "no
 * hay keys con cuota" mientras Google las seguía atendiendo perfectamente. Eso
 * es exactamente lo que estaba pasando el 2026-09-05: las 13 en 20/20 y la API
 * respondiendo OK a la primera prueba.
 *
 * Ante la duda se elige "minuto". Una key enfriada de más un minuto no cuesta
 * nada; una key apagada de más un día cuesta la cola entera.
 */
function alcanceDelLimite(error: unknown): 'dia' | 'minuto' {
  const texto = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const porDia = /perday|per day|per-day|\bdaily\b|requests per day|por d[ií]a/.test(texto);
  const porMinuto = /perminute|per minute|per-minute|requests per minute|\brpm\b/.test(texto);
  if (porDia && !porMinuto) return 'dia';
  return 'minuto';
}

/**
 * Saca la key de la rotación por lo que queda del minuto.
 *
 * Rellena el contador de la ventana en curso hasta el límite: `elegirKey` la
 * saltea sola y vuelve a estar disponible cuando el minuto rota, sin columnas
 * nuevas ni un reloj aparte.
 */
async function marcarSaturadaPorMinuto(keyId: number) {
  const dia = diaDeGoogle();
  const ventana = minutoActual();
  try {
    await db.execute(sql`
      insert into team_gemini_key_usage (key_id, day, requests, minute_window, minute_requests, updated_at)
      values (${keyId}, ${dia}::date, 0, ${ventana.toISOString()}::timestamptz,
              (select limit_rpm from team_gemini_keys where id = ${keyId}), now())
      on conflict (key_id, day) do update
        set minute_window = ${ventana.toISOString()}::timestamptz,
            minute_requests = (select limit_rpm from team_gemini_keys where id = ${keyId}),
            updated_at = now()
    `);
  } catch (error) {
    console.error('[gemini/key-bank] marcarSaturadaPorMinuto falló', error);
  }
}

/**
 * Modelo retirado: Google devuelve 404 "no longer available to new users".
 *
 * No es un problema de la key ni del audio, y por eso hay que distinguirlo: si
 * se lo trata como un error cualquiera, la rotación prueba las siete keys
 * contra un modelo que ya no existe, gasta siete intentos y deja en la ficha un
 * mensaje que no dice qué arreglar. Pasó de verdad —`gemini-2.5-flash` dejó de
 * estar disponible para los proyectos nuevos— y la cola se frenó con 920 audios
 * esperando sin que el error explicara nada.
 */
function esModeloRetirado(error: unknown) {
  const texto = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return texto.includes('no longer available') || (texto.includes('404') && texto.includes('not_found'));
}

/* ------------------------------------------------------------------ */
/* Transcripción                                                       */
/* ------------------------------------------------------------------ */

export type TranscripcionBanco =
  | { ok: true; texto: string; keyId: number; keyLabel: string; modelo: string }
  /** `reintentable`: el audio está bien, falló el servicio (cuota agotada o
   *  modelo saturado). Vuelve a la cola sin gastar un intento. */
  | { ok: false; error: string; reintentable: boolean };

/**
 * Transcribe un audio con el banco: elige key al azar, y si esa key está sin
 * cuota reintenta con otra hasta agotar las disponibles.
 *
 * El archivo se lee del disco: la ruta de /api/media exige sesión de usuario y
 * desde la cola no hay ninguna.
 */
export async function transcribirConBanco(input: {
  teamId: number;
  mediaUrl: string;
  audioSeconds?: number;
  prompt?: string;
  /** true = lo pide un proceso automático (worker): respeta la reserva del banco. */
  automatico?: boolean;
}): Promise<TranscripcionBanco> {
  const resuelto = resolveMediaFilePath(input.mediaUrl);
  if (!resuelto) return { ok: false, error: 'La ruta del audio no es válida.', reintentable: false };
  if (!(await statMediaFile(resuelto.absolutePath))) {
    return { ok: false, error: 'El archivo ya no está en el disco del servidor.', reintentable: false };
  }

  const buffer = await fs.readFile(resuelto.absolutePath);
  const mimeType = MIME_POR_EXTENSION[extensionDe(resuelto.absolutePath)] || 'audio/ogg';
  const base64 = buffer.toString('base64');
  const intentadas: number[] = [];
  let ultimoError = '';

  // Un intento por key disponible: si todas están sin cuota, el que llama
  // necesita saberlo para dejar el audio en la cola y no marcarlo fallido.
  for (let intento = 0; intento < 10; intento += 1) {
    const key = await elegirKey(input.teamId, intentadas, { automatico: input.automatico });
    if (!key) {
      // Se agotaron las keys: el audio vuelve a la cola sin gastar un intento.
      // Que no haya podido el banco no lo vuelve un audio malo — y a partir de
      // acá lo puede tomar un conector con whatspro_audio_queue_takeover.
      return {
        ok: false,
        reintentable: true,
        error: intentadas.length
          ? `${intentadas.length === 1 ? 'La única API key del banco no pudo' : `Ninguna de las ${intentadas.length} API keys del banco pudo`} con este audio.${ultimoError ? ` Último error: ${ultimoError}` : ''}`
          : input.automatico ? 'El banco de Gemini llegó a la reserva del día: lo que queda es para pedidos a mano.' : 'No hay ninguna API key de Gemini disponible con cuota libre.',
      };
    }
    intentadas.push(key.id);

    try {
      const cliente = new GoogleGenAI({ apiKey: key.apiKey });
      const respuesta = await cliente.models.generateContent({
        model: key.model,
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: input.prompt ?? 'Transcribe this audio faithfully. Return only the spoken words, without commentary or markdown.' },
          ],
        }],
        config: { temperature: 0, maxOutputTokens: 4000 },
      });

      const texto = respuesta.text?.trim();
      await registrarUso(key.id, { audioSeconds: input.audioSeconds, error: !texto });
      if (!texto) {
        await registrarError(key.id, 'Gemini devolvió una transcripción vacía.');
        return { ok: false, error: 'La transcripción vino vacía (audio sin voz o inaudible).', reintentable: false };
      }
      return { ok: true, texto, keyId: key.id, keyLabel: key.label, modelo: key.model };
    } catch (error) {
      const cuota = esErrorDeCuota(error);
      const mensaje = error instanceof Error ? error.message : String(error);
      await registrarUso(key.id, { error: true, quotaError: cuota });
      if (cuota) {
        if (alcanceDelLimite(error) === 'dia') await marcarAgotada(key.id, error);
        else await marcarSaturadaPorMinuto(key.id);
      }
      await registrarError(key.id, mensaje);
      ultimoError = mensaje;
      // El modelo retirado no se reintenta con otra key: le pasa a todas por
      // igual y probarlas sólo sirve para ensuciar siete fichas con el mismo
      // error. Se corta acá y el mensaje dice exactamente qué cambiar.
      if (esModeloRetirado(error)) {
        return {
          ok: false,
          reintentable: true,
          error: `El modelo "${key.model}" ya no está disponible para esta API key. Cambialo en Apps → Gemini por uno vigente (hoy, gemini-3.6-flash). Detalle: ${mensaje.slice(0, 300)}`,
        };
      }
      // Falle por lo que falle —cuota, sobrecarga, key inválida, red— se prueba
      // la siguiente key del banco. Sale un poco más caro en cuota cuando el
      // problema es de Google y no de la key, pero deja de frenar la cola por
      // un 503 pasajero.
    }
  }

  return { ok: false, error: `Se agotaron los intentos con el banco de keys.${ultimoError ? ` Último error: ${ultimoError}` : ''}`, reintentable: true };
}

/** Análisis sobre texto ya transcripto: mismo banco, sin mandar el audio otra vez. */
export async function analizarTextoConBanco(input: {
  teamId: number;
  prompt: string;
  automatico?: boolean;
  /** 0 (default) para análisis reproducible; subirla cuando se redacta y se
   *  espera una versión distinta en cada pedido ("cambiar otra vez"). */
  temperatura?: number;
  maxTokens?: number;
}): Promise<TranscripcionBanco> {
  const intentadas: number[] = [];
  let ultimoError = '';
  for (let intento = 0; intento < 10; intento += 1) {
    const key = await elegirKey(input.teamId, intentadas, { automatico: input.automatico });
    if (!key) {
      return {
        ok: false,
        reintentable: true,
        error: intentadas.length
          ? `${intentadas.length === 1 ? 'La única API key del banco no pudo' : `Ninguna de las ${intentadas.length} API keys del banco pudo`} con el análisis.${ultimoError ? ` Último error: ${ultimoError}` : ''}`
          : input.automatico ? 'El banco de Gemini llegó a la reserva del día: lo que queda es para pedidos a mano.' : 'No hay API keys de Gemini con cuota libre.',
      };
    }
    intentadas.push(key.id);
    try {
      const cliente = new GoogleGenAI({ apiKey: key.apiKey });
      const respuesta = await cliente.models.generateContent({
        model: key.model,
        contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
        config: { temperature: input.temperatura ?? 0, maxOutputTokens: input.maxTokens ?? 2000 },
      });
      const texto = respuesta.text?.trim();
      await registrarUso(key.id, { error: !texto });
      if (!texto) return { ok: false, error: 'Gemini devolvió una respuesta vacía.', reintentable: false };
      return { ok: true, texto, keyId: key.id, keyLabel: key.label, modelo: key.model };
    } catch (error) {
      const cuota = esErrorDeCuota(error);
      const mensaje = error instanceof Error ? error.message : String(error);
      await registrarUso(key.id, { error: true, quotaError: cuota });
      if (cuota) {
        if (alcanceDelLimite(error) === 'dia') await marcarAgotada(key.id, error);
        else await marcarSaturadaPorMinuto(key.id);
      }
      await registrarError(key.id, mensaje);
      ultimoError = mensaje;
    }
  }
  return { ok: false, error: `Se agotaron los intentos con el banco de keys.${ultimoError ? ` Último error: ${ultimoError}` : ''}`, reintentable: true };
}
