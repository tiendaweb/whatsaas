/**
 * Historial de cambios de un contacto.
 *
 * Todo lo que el Command Center hace queda auditado en `activity_logs` con el
 * prefijo `SALES_OPS_` y el `chatId` en el metadata; hasta ahora sólo se podía
 * leer con SQL. Acá se arma la lectura para la ficha: qué pasó, cuándo y quién
 * lo hizo, con la clasificación, los overrides a mano, las señales atendidas,
 * los prompts encolados y lo que devolvió el conector en una sola línea de
 * tiempo.
 *
 * No inventa eventos: si algo no se auditó, no aparece. La clasificación por
 * cron figura sin persona porque efectivamente no la hizo nadie.
 */
import { and, desc, eq, inArray, like, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, contacts, users } from '@/lib/db/schema';
import type { HistoryEntry, WallEntry, WallPayload } from '../shared/api-types';
import { GATE_LABELS, type Gate } from '../shared/taxonomy';

/**
 * Etiqueta y familia de cada acción auditada.
 *
 * La familia (`kind`) es lo que la ficha usa para elegir ícono y color: sin
 * ella, veinte eventos distintos se dibujaban todos con el mismo relojito y la
 * línea de tiempo no se podía barrer con la vista.
 *
 * Lo que no esté acá cae en un castellano derivado del nombre de la acción, no
 * en la constante cruda en inglés: `SALES_OPS_CHATS_EXCLUDED` se leía
 * "chats_excluded" y parecía un error del sistema.
 */
export const HISTORY_KINDS = ['analisis', 'manual', 'radar', 'prompt', 'cola', 'envio', 'crm', 'skill', 'limpieza', 'otro'] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

const ACCIONES: Record<string, { label: string; kind: HistoryKind }> = {
  SALES_OPS_CLASSIFY: { label: 'Clasificación', kind: 'analisis' },
  SALES_OPS_OVERRIDE: { label: 'Cambio manual', kind: 'manual' },
  SALES_OPS_SIGNAL: { label: 'Señal del radar', kind: 'radar' },
  SALES_OPS_SIGNAL_MARK: { label: 'Señal atendida', kind: 'radar' },
  SALES_OPS_PROMPT_QUEUED: { label: 'Prompt lanzado', kind: 'prompt' },
  SALES_OPS_PROMPT_RESULT: { label: 'Resultado del prompt', kind: 'prompt' },
  SALES_OPS_QUEUE_PROPOSED: { label: 'Acción propuesta', kind: 'cola' },
  SALES_OPS_QUEUE_APPROVED: { label: 'Lote aprobado', kind: 'cola' },
  SALES_OPS_QUEUE_REJECTED: { label: 'Lote rechazado', kind: 'cola' },
  SALES_OPS_QUEUE_RESULT: { label: 'Resultado del envío', kind: 'envio' },
  SALES_OPS_BATCH_EXECUTED: { label: 'Lote ejecutado', kind: 'envio' },
  SALES_OPS_VISIBILITY: { label: 'Visibilidad cambiada', kind: 'manual' },
  SALES_OPS_CRM_UPDATED: { label: 'CRM editado', kind: 'crm' },
  SALES_OPS_SKILL_SAVED: { label: 'Skill guardada', kind: 'skill' },
  SALES_OPS_SKILL_RETIRED: { label: 'Skill retirada', kind: 'skill' },
  SALES_OPS_SKILL_PINNED: { label: 'Skill fijada', kind: 'skill' },
  SALES_OPS_CHATS_EXCLUDED: { label: 'Chat marcado como no comercial', kind: 'limpieza' },
  SALES_OPS_CHATS_INCLUDED: { label: 'Chat devuelto al circuito', kind: 'limpieza' },
};

/** `SALES_OPS_ALGO_RARO` → `Algo raro`. Último recurso, pero legible. */
function labelDerivada(action: string): string {
  const limpio = action.replace(/^SALES_OPS_/, '').replace(/_/g, ' ').toLowerCase().trim();
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : action;
}

/** Nombres de campo en castellano para el detalle genérico. */
const CLAVES: Record<string, string> = {
  kind: 'tipo',
  status: 'estado',
  connector: 'conector',
  engine: 'motor',
  reason: 'motivo',
  version: 'versión',
  confidence: 'confianza',
  gate: 'gate',
  runId: 'corrida',
  promptKey: 'skill',
  batchId: 'lote',
  actionId: 'acción',
  executed: 'ejecutadas',
  skipped: 'salteadas',
  failed: 'fallidas',
  campos: 'campos',
  etiquetas: 'etiquetas',
  count: 'cantidad',
  audios: 'audios',
  signals: 'señales',
  pinned: 'fijada',
  key: 'skill',
};

/** Valores de listas cerradas que si no se traducen quedan en inglés a la vista. */
const VALORES: Record<string, string> = {
  completed: 'completada',
  failed: 'falló',
  blocked: 'bloqueada',
  cancelled: 'cancelada',
  queued: 'en cola',
  in_progress: 'en curso',
  executed: 'enviada',
  skipped: 'salteada',
  approved: 'aprobada',
  rejected: 'rechazada',
  proposed: 'propuesta',
  new: 'nueva',
  seen: 'vista',
  handled: 'atendida',
  dismissed: 'descartada',
  server: 'servidor',
  connector: 'conector',
  manual: 'a mano',
  personal: 'personal',
  equipo: 'equipo',
  otros: 'otros',
  true: 'sí',
  false: 'no',
};

const traducir = (valor: string): string => VALORES[valor] ?? valor.replace(/_/g, ' ');

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return null;
}

function gateLabel(valor: unknown): string | null {
  const gate = texto(valor);
  if (!gate) return null;
  const etiqueta = GATE_LABELS[gate as Gate];
  return etiqueta ? `${gate} · ${etiqueta}` : gate;
}

/** Una línea corta que explique el evento sin obligar a abrir el JSON. */
function detalle(action: string, meta: Record<string, unknown>): string {
  const partes: string[] = [];
  switch (action) {
    case 'SALES_OPS_CLASSIFY':
    case 'SALES_OPS_OVERRIDE': {
      const gate = gateLabel(meta.gate);
      if (gate) partes.push(gate);
      if (meta.status) partes.push(`destino ${texto(meta.status)}`);
      if (meta.confidence !== undefined) partes.push(`confianza ${texto(meta.confidence)}`);
      if (meta.version !== undefined) partes.push(`v${texto(meta.version)}`);
      if (meta.engine) partes.push(String(meta.engine) === 'connector' ? `conector ${texto(meta.connector) ?? ''}`.trim() : `motor ${texto(meta.engine)}`);
      if (meta.reason) partes.push(String(meta.reason));
      break;
    }
    case 'SALES_OPS_SIGNAL':
    case 'SALES_OPS_SIGNAL_MARK': {
      if (meta.kind) partes.push(traducir(String(meta.kind)));
      if (meta.status) partes.push(traducir(String(meta.status)));
      if (Array.isArray(meta.signalIds) && meta.signalIds.length > 1) partes.push(`${meta.signalIds.length} señales`);
      break;
    }
    case 'SALES_OPS_PROMPT_QUEUED': {
      if (meta.promptKey && meta.promptKey !== 'manual') partes.push(String(meta.promptKey));
      else partes.push('prompt escrito a mano');
      if (meta.mode) partes.push(String(meta.mode) === 'api' ? 'con la IA del equipo' : 'a la cola de conectores');
      break;
    }
    case 'SALES_OPS_PROMPT_RESULT': {
      if (meta.status) partes.push(traducir(String(meta.status)));
      if (meta.connector) partes.push(traducir(String(meta.connector)));
      break;
    }
    case 'SALES_OPS_BATCH_EXECUTED': {
      if (meta.executed !== undefined) partes.push(`${texto(meta.executed)} enviadas`);
      if (meta.skipped) partes.push(`${texto(meta.skipped)} salteadas`);
      if (meta.failed) partes.push(`${texto(meta.failed)} fallidas`);
      break;
    }
    case 'SALES_OPS_CRM_UPDATED': {
      const campos = Array.isArray(meta.campos) ? (meta.campos as unknown[]).map((c) => CLAVES[String(c)] ?? String(c)) : [];
      if (campos.length) partes.push(campos.join(', '));
      if (meta.etiquetas !== undefined) partes.push(`${texto(meta.etiquetas)} etiquetas`);
      break;
    }
    case 'SALES_OPS_CHATS_EXCLUDED': {
      if (meta.kind) partes.push(traducir(String(meta.kind)));
      if (meta.audios) partes.push(`${texto(meta.audios)} audios sacados de la cola`);
      if (meta.signals) partes.push(`${texto(meta.signals)} señales descartadas`);
      break;
    }
    default: {
      for (const [clave, valor] of Object.entries(meta)) {
        // Ids internos: no le dicen nada a quien lee el muro y desplazan al
        // dato que sí importa, porque el detalle corta a los cuatro campos.
        if (clave === 'chatId' || clave === 'analysisId' || clave === 'chatIds' || clave === 'userId' || clave === 'teamId') continue;
        const v = texto(valor);
        if (v) partes.push(`${CLAVES[clave] ?? clave.replace(/_/g, ' ')}: ${traducir(v)}`);
        if (partes.length >= 4) break;
      }
    }
  }
  return partes.join(' · ');
}

/**
 * `metadata->>'chatId'` cubre casi todo; los prompts guardan el chat en
 * `targetKind`/`targetId` (string), que es otra forma de decir lo mismo.
 */
export async function listContactHistory(teamId: number, chatId: number, limit = 100): Promise<HistoryEntry[]> {
  const filas = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      metadata: activityLogs.metadata,
      timestamp: activityLogs.timestamp,
      userId: activityLogs.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.userId))
    .where(and(
      eq(activityLogs.teamId, teamId),
      like(activityLogs.action, 'SALES_OPS%'),
      or(
        sql`${activityLogs.metadata}->>'chatId' = ${String(chatId)}`,
        and(
          sql`${activityLogs.metadata}->>'targetKind' = 'chat'`,
          sql`${activityLogs.metadata}->>'targetId' = ${String(chatId)}`,
        ),
      ),
    ))
    .orderBy(desc(activityLogs.timestamp), desc(activityLogs.id))
    .limit(Math.max(1, Math.min(limit, 300)));

  return filas.map((fila) => {
    const meta = (fila.metadata && typeof fila.metadata === 'object' ? fila.metadata : {}) as Record<string, unknown>;
    return {
      id: fila.id,
      action: fila.action,
      label: ACCIONES[fila.action]?.label ?? labelDerivada(fila.action),
      kind: ACCIONES[fila.action]?.kind ?? 'otro',
      detail: detalle(fila.action, meta),
      at: fila.timestamp ? new Date(fila.timestamp).toISOString() : new Date().toISOString(),
      // Sin usuario = lo hizo el cron o un conector, no una persona.
      by: fila.userName || fila.userEmail || null,
    };
  });
}

// ── Muro del equipo ────────────────────────────────────────────────────────

/** Los tipos viven en `shared/api-types` porque los lee también el cliente. */
export type { WallEntry, WallPayload } from '../shared/api-types';

/** El `chatId` de un evento puede estar en dos formas según quién lo auditó. */
function chatIdDeMeta(meta: Record<string, unknown>): number | null {
  const directo = Number(meta.chatId);
  if (Number.isInteger(directo) && directo > 0) return directo;
  if (meta.targetKind === 'chat') {
    const target = Number(meta.targetId);
    if (Number.isInteger(target) && target > 0) return target;
  }
  return null;
}

/**
 * Muro: todo lo que se hizo en el Command Center, de lo más nuevo a lo más
 * viejo, con quién lo hizo y sobre quién.
 *
 * El historial por contacto ya existía, pero para saber "qué se hizo hoy" había
 * que abrir las fichas de a una. Esto es la misma auditoría leída al revés: por
 * momento en vez de por contacto.
 *
 * Paginado por `timestamp` (cursor ISO) y no por offset: la tabla crece por
 * arriba mientras uno scrollea, y con offset se repiten filas.
 */
export async function listTeamWall(teamId: number, opts: { limit?: number; cursor?: string | null; kinds?: HistoryKind[] } = {}): Promise<WallPayload> {
  const limit = Math.max(1, Math.min(opts.limit ?? 40, 100));
  const conditions = [eq(activityLogs.teamId, teamId), like(activityLogs.action, 'SALES_OPS%')];

  if (opts.cursor) {
    const desde = new Date(opts.cursor);
    // Una fecha inválida traería la tabla entera: se ignora el cursor roto.
    if (Number.isFinite(desde.getTime())) conditions.push(lt(activityLogs.timestamp, desde));
  }
  if (opts.kinds?.length) {
    const acciones = Object.entries(ACCIONES)
      .filter(([, v]) => opts.kinds!.includes(v.kind))
      .map(([k]) => k);
    if (!acciones.length) return { entries: [], nextCursor: null };
    conditions.push(inArray(activityLogs.action, acciones));
  }

  const filas = await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      metadata: activityLogs.metadata,
      timestamp: activityLogs.timestamp,
      userName: users.name,
      userEmail: users.email,
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.userId))
    .where(and(...conditions))
    .orderBy(desc(activityLogs.timestamp), desc(activityLogs.id))
    .limit(limit + 1);

  const hayMas = filas.length > limit;
  const pagina = hayMas ? filas.slice(0, limit) : filas;

  const chatIds = Array.from(
    new Set(pagina.map((f) => chatIdDeMeta((f.metadata ?? {}) as Record<string, unknown>)).filter((id): id is number => id !== null)),
  );
  const nombres = new Map<number, string>();
  if (chatIds.length) {
    const rows = await db
      .select({ id: chats.id, chatName: chats.name, pushName: chats.pushName, contactName: contacts.name })
      .from(chats)
      .leftJoin(contacts, and(eq(contacts.chatId, chats.id), eq(contacts.teamId, teamId)))
      .where(and(eq(chats.teamId, teamId), inArray(chats.id, chatIds)));
    for (const r of rows) nombres.set(r.id, r.contactName || r.chatName || r.pushName || `chat ${r.id}`);
  }

  const entries: WallEntry[] = pagina.map((fila) => {
    const meta = (fila.metadata && typeof fila.metadata === 'object' ? fila.metadata : {}) as Record<string, unknown>;
    const chatId = chatIdDeMeta(meta);
    const conector = texto(meta.connector);
    const persona = fila.userName || fila.userEmail;

    // El orden importa: una acción puede tener usuario Y conector (la persona
    // encoló, el conector ejecutó). Lo que se muestra es quién la ejecutó.
    const actor: WallEntry['actor'] =
      conector && conector !== 'pending'
        ? conector === 'server'
          ? { kind: 'servidor', name: 'Servidor' }
          : { kind: 'conector', name: conector }
        : persona
          ? { kind: 'persona', name: persona }
          : { kind: 'servidor', name: 'Automático' };

    const provider = texto(meta.provider);
    const model = texto(meta.model);

    return {
      id: fila.id,
      action: fila.action,
      label: ACCIONES[fila.action]?.label ?? labelDerivada(fila.action),
      kind: ACCIONES[fila.action]?.kind ?? 'otro',
      detail: detalle(fila.action, meta),
      at: fila.timestamp ? new Date(fila.timestamp).toISOString() : new Date().toISOString(),
      by: persona,
      chatId,
      contactName: chatId ? (nombres.get(chatId) ?? null) : null,
      actor,
      ai: provider || model ? { provider, model } : null,
    };
  });

  return { entries, nextCursor: hayMas ? entries[entries.length - 1]?.at ?? null : null };
}
