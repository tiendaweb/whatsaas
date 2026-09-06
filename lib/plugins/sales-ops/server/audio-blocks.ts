import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, messageAudioInsights, teamAudioBlocks, teamCommercialAnalysis } from '@/lib/db/schema';

/**
 * Bloques de trabajo de la cola de audios.
 *
 * La cola de Gemini se drenaba de corrido y sin freno: 660 audios, 273 de
 * clientes ya cerrados, compitiendo por la misma cuota que el clasificador y
 * que lo que una persona pide a mano. Un bloque agrupa audios y decide si se
 * transcriben ahora, a partir de un día, con un tope diario, o quedan en pausa
 * hasta que alguien lo reactive. La regla de "este bloque se drena hoy" vive en
 * `condicionDeBloqueActivo()` (lib/audio-insights.ts), compartida con el worker.
 *
 * Los audios sin bloque siguen entrando con el orden de siempre, y van
 * primero: son los recién encolados por el cron, la conversación de hoy.
 */

export type AudioBlockStatus = 'active' | 'paused';

export type AudioBlock = {
  id: number;
  name: string;
  description: string;
  status: AudioBlockStatus;
  position: number;
  notBefore: string | null;
  dailyCap: number | null;
  /** true si el worker lo drena hoy (activo, día llegado, tope no alcanzado). */
  activoHoy: boolean;
  /** Por qué no se drena hoy, si no se drena. */
  motivo: 'pausado' | 'programado' | 'tope' | null;
  enCola: number;
  minutosEnCola: number;
  hechos: number;
  hechosHoy: number;
  quitados: number;
  contactos: number;
};

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/audio-blocks] audit', error);
  }
}

const hoy = () => new Date().toISOString().slice(0, 10);

export async function listAudioBlocks(teamId: number): Promise<AudioBlock[]> {
  const bloques = await db.select().from(teamAudioBlocks).where(eq(teamAudioBlocks.teamId, teamId)).orderBy(asc(teamAudioBlocks.position), asc(teamAudioBlocks.id));
  if (!bloques.length) return [];
  const i = messageAudioInsights;
  const conteos = await db
    .select({
      blockId: i.blockId,
      enCola: sql<number>`count(*) filter (where ${i.status} = 'queued' or (${i.status} = 'failed' and ${i.attempts} < 3))::int`,
      segundos: sql<number>`coalesce(sum(${i.durationSeconds}) filter (where ${i.status} = 'queued'), 0)::int`,
      hechos: sql<number>`count(*) filter (where ${i.status} = 'done')::int`,
      hechosHoy: sql<number>`count(*) filter (where ${i.status} = 'done' and ${i.generatedAt} >= current_date)::int`,
      quitados: sql<number>`count(*) filter (where ${i.status} = 'skipped')::int`,
      contactos: sql<number>`count(distinct ${i.chatId}) filter (where ${i.status} = 'queued')::int`,
    })
    .from(i)
    .where(and(eq(i.teamId, teamId), inArray(i.blockId, bloques.map((b) => b.id))))
    .groupBy(i.blockId);
  const porBloque = new Map(conteos.map((c) => [c.blockId, c]));
  const fecha = hoy();
  return bloques.map((b) => {
    const c = porBloque.get(b.id);
    const hechosHoy = c?.hechosHoy ?? 0;
    let motivo: AudioBlock['motivo'] = null;
    if (b.status !== 'active') motivo = 'pausado';
    else if (b.notBefore && String(b.notBefore) > fecha) motivo = 'programado';
    else if (b.dailyCap != null && hechosHoy >= b.dailyCap) motivo = 'tope';
    return {
      id: b.id,
      name: b.name,
      description: b.description,
      status: (b.status as AudioBlockStatus) ?? 'active',
      position: b.position,
      notBefore: b.notBefore ? String(b.notBefore) : null,
      dailyCap: b.dailyCap ?? null,
      activoHoy: motivo === null,
      motivo,
      enCola: c?.enCola ?? 0,
      minutosEnCola: Math.round(((c?.segundos ?? 0) / 60) * 10) / 10,
      hechos: c?.hechos ?? 0,
      hechosHoy,
      quitados: c?.quitados ?? 0,
      contactos: c?.contactos ?? 0,
    };
  });
}

export type AudioBlockInput = {
  name?: string;
  description?: string;
  status?: AudioBlockStatus;
  notBefore?: string | null;
  dailyCap?: number | null;
};

function limpiar(input: AudioBlockInput) {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim().slice(0, 120);
    if (name.length < 2) throw new Error('El nombre del bloque necesita al menos 2 caracteres.');
    out.name = name;
  }
  if (input.description !== undefined) out.description = input.description.trim().slice(0, 2000);
  if (input.status !== undefined) {
    if (input.status !== 'active' && input.status !== 'paused') throw new Error('Estado inválido.');
    out.status = input.status;
  }
  if (input.notBefore !== undefined) {
    if (input.notBefore === null || input.notBefore === '') out.notBefore = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(input.notBefore)) out.notBefore = input.notBefore;
    else throw new Error('La fecha tiene que ser YYYY-MM-DD.');
  }
  if (input.dailyCap !== undefined) {
    if (input.dailyCap === null) out.dailyCap = null;
    else if (Number.isInteger(input.dailyCap) && input.dailyCap > 0 && input.dailyCap <= 5000) out.dailyCap = input.dailyCap;
    else throw new Error('El tope diario tiene que ser un entero entre 1 y 5000 (o vacío).');
  }
  return out;
}

export async function createAudioBlock(teamId: number, userId: number, input: AudioBlockInput & { name: string }): Promise<AudioBlock> {
  const valores = limpiar(input);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${teamAudioBlocks.position}), 0)` }).from(teamAudioBlocks).where(eq(teamAudioBlocks.teamId, teamId));
  const [row] = await db
    .insert(teamAudioBlocks)
    .values({ teamId, name: String(valores.name), description: String(valores.description ?? ''), status: (valores.status as string) ?? 'active', notBefore: (valores.notBefore as string | null) ?? null, dailyCap: (valores.dailyCap as number | null) ?? null, position: (max ?? 0) + 1, createdBy: userId })
    .returning({ id: teamAudioBlocks.id });
  await audit(teamId, userId, 'SALES_OPS_AUDIO_BLOCK_CREATED', { blockId: row.id, ...valores });
  const lista = await listAudioBlocks(teamId);
  return lista.find((b) => b.id === row.id)!;
}

export async function updateAudioBlock(teamId: number, userId: number, blockId: number, input: AudioBlockInput): Promise<AudioBlock> {
  const valores = limpiar(input);
  if (!Object.keys(valores).length) throw new Error('No hay nada que cambiar.');
  const [row] = await db
    .update(teamAudioBlocks)
    .set({ ...valores, updatedAt: new Date() })
    .where(and(eq(teamAudioBlocks.teamId, teamId), eq(teamAudioBlocks.id, blockId)))
    .returning({ id: teamAudioBlocks.id });
  if (!row) throw new Error('El bloque no existe en este equipo.');
  await audit(teamId, userId, 'SALES_OPS_AUDIO_BLOCK_UPDATED', { blockId, ...valores });
  const lista = await listAudioBlocks(teamId);
  return lista.find((b) => b.id === blockId)!;
}

/** Borra el bloque. Sus audios quedan sin bloque (vuelven al orden normal), no se borran. */
export async function deleteAudioBlock(teamId: number, userId: number, blockId: number): Promise<{ liberados: number }> {
  const liberados = await db
    .update(messageAudioInsights)
    .set({ blockId: null, updatedAt: new Date() })
    .where(and(eq(messageAudioInsights.teamId, teamId), eq(messageAudioInsights.blockId, blockId)))
    .returning({ id: messageAudioInsights.id });
  const [row] = await db.delete(teamAudioBlocks).where(and(eq(teamAudioBlocks.teamId, teamId), eq(teamAudioBlocks.id, blockId))).returning({ id: teamAudioBlocks.id });
  if (!row) throw new Error('El bloque no existe en este equipo.');
  await audit(teamId, userId, 'SALES_OPS_AUDIO_BLOCK_DELETED', { blockId, liberados: liberados.length });
  return { liberados: liberados.length };
}

/** Nuevo orden de los bloques: los ids en el orden deseado. Los que no vengan quedan al final. */
export async function reorderAudioBlocks(teamId: number, userId: number, ids: number[]): Promise<AudioBlock[]> {
  const propios = await db.select({ id: teamAudioBlocks.id }).from(teamAudioBlocks).where(eq(teamAudioBlocks.teamId, teamId)).orderBy(asc(teamAudioBlocks.position));
  const conocidos = new Set(propios.map((b) => b.id));
  const orden = [...ids.filter((id) => conocidos.has(id)), ...propios.map((b) => b.id).filter((id) => !ids.includes(id))];
  for (let i = 0; i < orden.length; i += 1) {
    await db.update(teamAudioBlocks).set({ position: i + 1, updatedAt: new Date() }).where(and(eq(teamAudioBlocks.teamId, teamId), eq(teamAudioBlocks.id, orden[i])));
  }
  await audit(teamId, userId, 'SALES_OPS_AUDIO_BLOCKS_REORDERED', { orden });
  return listAudioBlocks(teamId);
}

/**
 * Mete audios en un bloque (o los saca, con `blockId: null`). Por contacto o
 * por audio. Sólo lo que todavía no se transcribió: lo hecho no vuelve a la cola.
 */
export async function assignAudioBlock(teamId: number, userId: number, input: { chatId?: number; messageIds?: string[]; blockId: number | null }): Promise<{ movidos: number }> {
  if (input.blockId !== null) {
    const bloque = await db.query.teamAudioBlocks.findFirst({ where: and(eq(teamAudioBlocks.teamId, teamId), eq(teamAudioBlocks.id, input.blockId)), columns: { id: true } });
    if (!bloque) throw new Error('El bloque no existe en este equipo.');
  }
  const conds = [eq(messageAudioInsights.teamId, teamId), inArray(messageAudioInsights.status, ['queued', 'failed', 'pending', 'skipped'])];
  if (input.chatId) conds.push(eq(messageAudioInsights.chatId, input.chatId));
  else if (input.messageIds?.length) conds.push(inArray(messageAudioInsights.messageId, input.messageIds));
  else throw new Error('Indicá chatId o messageIds.');
  const filas = await db.update(messageAudioInsights).set({ blockId: input.blockId, updatedAt: new Date() }).where(and(...conds)).returning({ id: messageAudioInsights.id });
  await audit(teamId, userId, 'SALES_OPS_AUDIO_BLOCK_ASSIGNED', { blockId: input.blockId, chatId: input.chatId ?? null, messageIds: input.messageIds?.length ?? 0, movidos: filas.length });
  return { movidos: filas.length };
}

/**
 * Bloques sugeridos a partir de lo que hay en la cola y de cómo se fue
 * drenando estos días.
 *
 * Con ~50 audios por día de rendimiento real (el banco lo comparten el
 * clasificador y los pedidos a mano), la cola entera son dos semanas. Repartir
 * por frente comercial hace que la cuota vaya primero a donde hay plata:
 *
 *  1. Dinero abierto (G8–G10, no cliente): activo, sin tope. Son pocos y son
 *     los que pueden cambiar un texto que está por salir.
 *  2. Oportunidades (G1–G7): activo, con tope diario.
 *  3. Sin clasificar: activo, con tope. El clasificador los necesita para
 *     cerrar la brecha de evidencia, pero no todos a la vez.
 *  4. Clientes (G11 / status cliente): EN PAUSA. Ya compraron; sus audios
 *     sirven de contexto de soporte, no de recuperación. Se activa a mano,
 *     con tope, cuando lo demás esté hecho.
 *  5. Perdidos y descartados (GX / pre_descarte / descarte): EN PAUSA.
 *
 * Sólo reparte los audios en cola que NO tienen bloque: lo que alguien ya
 * acomodó a mano no se toca. Se puede correr de nuevo para acomodar lo nuevo.
 */
export async function sugerirBloques(teamId: number, userId: number): Promise<{ bloques: AudioBlock[]; asignados: Record<string, number>; creados: number }> {
  const existentes = await db.select().from(teamAudioBlocks).where(eq(teamAudioBlocks.teamId, teamId));
  const porClave = new Map(existentes.map((b) => [b.name, b]));
  const definiciones: Array<{ name: string; description: string; status: AudioBlockStatus; dailyCap: number | null }> = [
    { name: 'Dinero abierto (G8–G10)', description: 'Chats con plata en juego que todavía no cerraron. Va primero y sin tope: un audio acá puede cambiar un mensaje que está por salir.', status: 'active', dailyCap: null },
    { name: 'Oportunidades (G1–G7)', description: 'Conversaciones abiertas que todavía no llegaron a precio o cierre. Con tope diario para que no se coman la cuota de Dinero.', status: 'active', dailyCap: 40 },
    { name: 'Sin clasificar', description: 'Chats que el clasificador todavía no auditó o que dejó con brecha de evidencia. Con tope: alcanza para que el clasificador avance sin vaciar el banco.', status: 'active', dailyCap: 30 },
    { name: 'Clientes (G11)', description: 'Ya compraron. Sus audios son contexto de soporte, no recuperación de ventas: en pausa hasta que lo demás esté hecho. Activar con tope (20/día) cuando convenga.', status: 'paused', dailyCap: 20 },
    { name: 'Perdidos y descartados', description: 'GX, pre-descarte y descarte definitivo. En pausa: transcribirlos no cambia nada hoy. Si se reactiva, con tope.', status: 'paused', dailyCap: 10 },
  ];
  let creados = 0;
  const ids: Record<string, number> = {};
  let position = existentes.length;
  for (const def of definiciones) {
    const previo = porClave.get(def.name);
    if (previo) {
      ids[def.name] = previo.id;
      continue;
    }
    position += 1;
    const [row] = await db.insert(teamAudioBlocks).values({ teamId, name: def.name, description: def.description, status: def.status, dailyCap: def.dailyCap, position, createdBy: userId }).returning({ id: teamAudioBlocks.id });
    ids[def.name] = row.id;
    creados += 1;
  }

  // Reparto por frente comercial, sólo de lo que no tiene bloque.
  const a = teamCommercialAnalysis;
  const i = messageAudioInsights;
  const filas = await db
    .select({ id: i.id, gate: a.currentGate, status: a.status })
    .from(i)
    .leftJoin(a, and(eq(a.chatId, i.chatId), eq(a.teamId, teamId)))
    .where(and(eq(i.teamId, teamId), isNull(i.blockId), inArray(i.status, ['queued', 'failed'])));
  const destino = new Map<string, number[]>();
  const meter = (nombre: string, id: number) => destino.set(nombre, [...(destino.get(nombre) ?? []), id]);
  for (const f of filas) {
    const gate = f.gate ?? null;
    const st = f.status ?? null;
    if (st === 'cliente' || gate === 'G11') meter('Clientes (G11)', f.id);
    else if (gate === 'GX' || st === 'pre_descarte' || st === 'descarte_definitivo') meter('Perdidos y descartados', f.id);
    else if (gate && ['G8', 'G9', 'G10'].includes(gate)) meter('Dinero abierto (G8–G10)', f.id);
    else if (gate && /^G[1-7]$/.test(gate)) meter('Oportunidades (G1–G7)', f.id);
    else meter('Sin clasificar', f.id);
  }
  const asignados: Record<string, number> = {};
  for (const [nombre, lista] of destino) {
    for (let k = 0; k < lista.length; k += 500) {
      await db.update(i).set({ blockId: ids[nombre], updatedAt: new Date() }).where(inArray(i.id, lista.slice(k, k + 500)));
    }
    asignados[nombre] = lista.length;
  }
  await audit(teamId, userId, 'SALES_OPS_AUDIO_BLOCKS_SUGGESTED', { creados, asignados });
  return { bloques: await listAudioBlocks(teamId), asignados, creados };
}
