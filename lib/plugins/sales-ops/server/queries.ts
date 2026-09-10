/**
 * Lecturas del Command Center: lista de análisis y ficha de un chat.
 *
 * Sólo SELECT. Nada de fechas como parámetro en SQL: los buckets de antigüedad
 * van como `now() - interval` literal y `daysSilent` se calcula en JS.
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lt, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  chats,
  contacts,
  messageAudioInsights,
  messages,
  teamCommercialActions,
  teamCommercialAnalysis,
  teamCommercialAnalysisVersions,
  teamCommercialSignals,
  teamPromptRuns,
  teamScheduledMessages,
} from '@/lib/db/schema';
import { condicionDeChatMarcado } from '@/lib/chats/internos';
import { resolverClientes } from '@/lib/customers/es-cliente';
import { getSalesOpsSettings } from './settings';
import { maskJid } from '@/lib/desktop/command-center/types';
import type {
  ActionRow,
  AnalysisDetail,
  AnalysisRow,
  AnalysisVersionRow,
  DetailPayload,
  ListPayload,
  ListQuery,
  SignalRow,
  TimelineGap,
  TimelineHit,
} from '../shared/api-types';
import type { DossierEntry } from '../shared/contract';
import { SITUACIONES, esSituacion, type Situacion } from '../shared/situacion';
import {
  FRONT_OPPORTUNITY_GATES,
  FRONT_SWEEP_GATES,
  SEND_COOLDOWN_HOURS,
  URGENT_SIGNALS,
  type Gate,
  type SignalKind,
} from '../shared/taxonomy';

export const MONEY_GATES: Gate[] = ['G8', 'G9', 'G10'];
export const DISCARD_STATUSES = ['pre_descarte', 'descarte_definitivo'] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DAY_MS = 86_400_000;
const SILENCE_GAP_DAYS = 7;
/** Tope de mensajes que se leen para el timeline (los chats internos superan 10k). */
const TIMELINE_MESSAGE_CAP = 4000;
/** Si hay más hitos que esto, se comprimen: primeros, marcados, evidencia y últimos. */
const TIMELINE_HIT_CAP = 300;

// ── Diccionarios de flags (doc 04 §1) ────────────────────────────────────────

export const FLAG_PATTERNS: Array<{ flag: DossierEntry['flags'][number]; re: RegExp }> = [
  { flag: 'precio', re: /precio|cu[aá]nto|cuanto sale|\bvale\b|costo|\bplan\b|\$|\busd\b|\bgs\.?|\bmil\b|\dk\b|%/i },
  { flag: 'pago', re: /\balias\b|\bcbu\b|\bcvu\b|transferencia|comprobante|se[ñn]a\b|anticipo|pagar|pagu[eé]\b|deposit|mercado pago|\bcuenta\b/i },
  { flag: 'objecion', re: /\bcaro\b|no tengo|presupuesto|\bsocio\b|\bpareja\b|m[aá]s adelante|despu[eé]s\b|lo pienso|comparar|otra empresa|no conf[ií]o|desconf/i },
  { flag: 'compromiso', re: /lo hago|avanzo|arranquemos|\bdale\b|cuando cobre|la semana que viene|el mes que viene|te confirmo|quiero hacerlo|me interesa/i },
  { flag: 'rechazo', re: /no me interesa|no gracias|no molest|equivocado|bloque|\bbaja\b|dej[aá] de/i },
];

export function flagsFor(text: string): DossierEntry['flags'] {
  if (!text) return [];
  const out: DossierEntry['flags'] = [];
  for (const { flag, re } of FLAG_PATTERNS) if (re.test(text)) out.push(flag);
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

export function daysSince(value: Date | string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const t = typeof value === 'string' ? Date.parse(value) : value.getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

export function numeroDeJid(jid: string): string {
  return (jid || '').split('@')[0].split(':')[0];
}

function displayName(contactName: string | null, chatName: string | null, pushName: string | null, remoteJid: string): string {
  const name = (contactName || chatName || pushName || '').trim();
  return name || maskJid(remoteJid);
}

function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): Record<string, unknown> | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type JoinedRow = {
  a: typeof teamCommercialAnalysis.$inferSelect;
  chat: { remoteJid: string; name: string | null; pushName: string | null; profilePicUrl: string | null; instanceId: number | null };
  contactName: string | null;
  /** Sólo lo trae el listado; el detalle no la pide. */
  situacion?: Situacion | null;
};

function toRow(r: JoinedRow, now: number): AnalysisRow {
  const a = r.a;
  return {
    id: a.id,
    chatId: a.chatId,
    contactId: a.contactId,
    name: displayName(r.contactName, r.chat.name, r.chat.pushName, r.chat.remoteJid),
    phoneMasked: maskJid(r.chat.remoteJid),
    avatarUrl: r.chat.profilePicUrl,
    currentGate: (a.currentGate ?? 'G0') as Gate,
    maxGate: (a.maxGate ?? a.currentGate ?? 'G0') as Gate,
    dropGate: (a.dropGate ?? a.currentGate ?? 'G0') as Gate,
    dropReason: (a.dropReason ?? 'desconocido') as AnalysisRow['dropReason'],
    confidence: a.confidence,
    priorityScore: a.priorityScore,
    recoveryProbability: a.recoveryProbability,
    potentialValueUsd: a.potentialValueUsd,
    collectionSpeed: a.collectionSpeed as AnalysisRow['collectionSpeed'],
    need: a.need as AnalysisRow['need'],
    objectionType: a.objectionType as AnalysisRow['objectionType'],
    intent: a.intent as AnalysisRow['intent'],
    temperature: a.temperature as AnalysisRow['temperature'],
    status: a.status as AnalysisRow['status'],
    recommendedAction: a.recommendedAction ?? '',
    recommendedOwner: a.recommendedOwner as AnalysisRow['recommendedOwner'],
    nextActionAt: a.nextActionAt ? String(a.nextActionAt) : null,
    lastCustomerMessageAt: iso(a.lastCustomerMessageAt),
    lastTeamMessageAt: iso(a.lastTeamMessageAt),
    daysSilent: daysSince(a.lastCustomerMessageAt, now),
    followupsTotal: a.followupsTotal,
    automationActive: a.automationActive,
    isExistingCustomer: a.isExistingCustomer,
    customerEvidence: a.customerEvidence as AnalysisRow['customerEvidence'],
    paymentPending: a.paymentPending,
    autoReplyDetected: a.autoReplyDetected,
    evidenceGap: a.evidenceGap,
    stale: a.stale,
    analyzedAt: iso(a.analyzedAt),
    analyzedBy: (a.analyzedBy ?? null) as AnalysisRow['analyzedBy'],
    version: a.version,
    source: a.source as AnalysisRow['source'],
    ...(r.situacion ? { situacion: r.situacion } : {}),
  };
}

function toDetail(r: JoinedRow, now: number): AnalysisDetail {
  const a = r.a;
  const ev = (a.evidence ?? {}) as Record<string, string[]>;
  return {
    ...toRow(r, now),
    needDetail: a.needDetail,
    businessType: a.businessType,
    quotedPrice: a.quotedPrice != null && a.quotedCurrency ? { amount: a.quotedPrice, currency: a.quotedCurrency } : null,
    proposalSummary: a.proposalSummary,
    objectionDetail: a.objectionDetail,
    intentScore: a.intentScore,
    lastProspectAction: a.lastProspectAction,
    lastTeamAction: a.lastTeamAction,
    statusReason: a.statusReason,
    notesForHuman: a.notesForHuman,
    crmToFix: a.crmToFix,
    crmFix: a.crmFix ?? null,
    evidence: {
      gate: ev.gate ?? [],
      price: ev.price,
      objection: ev.objection,
      intent: ev.intent,
      payment: ev.payment,
    },
    priorRadar: a.priorRadar ?? null,
    sourceDetail: a.sourceDetail,
    firstContactAt: iso(a.firstContactAt),
    followupsAutomated: a.followupsAutomated,
    followupsManual: a.followupsManual,
    lastFollowupAt: iso(a.lastFollowupAt),
    provider: a.provider,
    model: a.model,
  };
}

const chatCols = {
  remoteJid: chats.remoteJid,
  name: chats.name,
  pushName: chats.pushName,
  profilePicUrl: chats.profilePicUrl,
  instanceId: chats.instanceId,
};

// ── Filtros ─────────────────────────────────────────────────────────────────

/** Condiciones de una vista (sin cursor). Exportado para que overview/metrics cuenten igual. */
export function vistaWhere(vista: ListQuery['vista']): SQL | undefined {
  const a = teamCommercialAnalysis;
  switch (vista) {
    case 'dinero':
      return and(inArray(a.currentGate, MONEY_GATES), ne(a.status, 'cliente'));
    case 'oportunidades':
      return inArray(a.currentGate, FRONT_OPPORTUNITY_GATES);
    case 'barrido':
      return and(inArray(a.currentGate, FRONT_SWEEP_GATES), notInArray(a.status, [...DISCARD_STATUSES]));
    case 'limpieza':
      return or(inArray(a.status, [...DISCARD_STATUSES]), eq(a.currentGate, 'GX'));
    case 'revisar':
      // Cola de calidad de dato de Modo Noelia. `evidenceGap` lo calcula
      // RuleFacts cuando hay audio pendiente dentro de la evidencia reciente.
      return or(eq(a.stale, true), and(isNotNull(a.analyzedAt), lt(a.confidence, 55)), eq(a.evidenceGap, true));
    default:
      return undefined;
  }
}

const AGE_INTERVALS: Record<NonNullable<ListQuery['ageBucket']>, SQL> = {
  lt7: sql`${teamCommercialAnalysis.lastCustomerMessageAt} >= now() - interval '7 days'`,
  '7to30': sql`${teamCommercialAnalysis.lastCustomerMessageAt} < now() - interval '7 days' and ${teamCommercialAnalysis.lastCustomerMessageAt} >= now() - interval '30 days'`,
  '30to90': sql`${teamCommercialAnalysis.lastCustomerMessageAt} < now() - interval '30 days' and ${teamCommercialAnalysis.lastCustomerMessageAt} >= now() - interval '90 days'`,
  '90to180': sql`${teamCommercialAnalysis.lastCustomerMessageAt} < now() - interval '90 days' and ${teamCommercialAnalysis.lastCustomerMessageAt} >= now() - interval '180 days'`,
  gt180: sql`${teamCommercialAnalysis.lastCustomerMessageAt} < now() - interval '180 days'`,
};

/**
 * "¿Alguna vez salió algo de nuestro lado?": un mensaje nuestro en el chat,
 * seguimientos contados, una acción del Command Center ejecutada o una corrida
 * de prompt cerrada. **En toda la historia del chat, no desde el último
 * análisis.**
 *
 * Antes se miraba sólo lo POSTERIOR al análisis vigente, y como el análisis se
 * rehace cada vez que el cliente escribe, el historial se borraba solo: de 394
 * contactos marcados "auditado, sin tocar", 387 tenían mensajes nuestros y
 * seguimientos, y 69 tenían acciones del Command Center ya ejecutadas. Con eso
 * se armaron lotes de "nunca tocados" para gente a la que ya le habíamos
 * escrito —y a algunos hasta mandado una demo—. "Sin tocar" tiene que querer
 * decir sin tocar.
 *
 * Comparaciones de columna contra columna dentro del SQL: nada de `Date` en el
 * filtro, que revienta en runtime y el build lo deja pasar.
 */
function sqlTuvoSeguimiento(teamId: number): SQL {
  const a = teamCommercialAnalysis;
  return sql`(
    ${a.lastTeamMessageAt} is not null
    or coalesce(${a.followupsTotal}, 0) > 0
    or exists (
      select 1 from team_commercial_actions ac
       where ac.team_id = ${teamId} and ac.chat_id = ${a.chatId}
         and ac.status in ('executed', 'resulted')
    )
    or exists (
      select 1 from team_prompt_runs pr
       where pr.team_id = ${teamId} and pr.target_kind = 'chat' and pr.target_id = ${a.chatId}::text
         and pr.status = 'completed'
    )
  )`;
}

/**
 * "Le mandamos trabajo hecho": tiene un pedido de producción vinculado — una
 * demo, un sitio, una tienda, un cambio — en cualquier estado.
 *
 * Es más fuerte que haberle escrito y por eso va antes en la precedencia: a
 * alguien que recibió una demo no se le manda un primer contacto.
 */
function sqlTieneProduccion(teamId: number): SQL {
  const a = teamCommercialAnalysis;
  return sql`(${a.contactId} is not null and exists (
    select 1 from team_task_relations r
      join team_task_items t on t.id = r.source_id and t.team_id = ${teamId}
     where r.team_id = ${teamId} and r.source_type = 'task' and r.target_type = 'contact'
       and r.target_id = ${a.contactId} and t.work_kind is not null
  ))`;
}

/**
 * "Ya tiene algo esperando salir": una sola pregunta con tres orígenes —una
 * acción del Command Center sin ejecutar, un prompt esperando conector, o un
 * mensaje programado vivo—. Si se mira sólo uno de los tres, el contacto
 * aparece como libre y alguien le escribe encima de algo que ya iba a salir.
 */
function sqlAlgoEnCola(teamId: number): SQL {
  const a = teamCommercialAnalysis;
  return sql`(
    exists (
      select 1 from team_commercial_actions ac
       where ac.team_id = ${teamId} and ac.chat_id = ${a.chatId}
         and ac.status in ('proposed', 'pending_approval', 'approved', 'executing')
    )
    or exists (
      select 1 from team_prompt_runs pr
       where pr.team_id = ${teamId} and pr.target_kind = 'chat' and pr.target_id = ${a.chatId}::text
         and pr.status in ('queued', 'in_progress')
    )
    or exists (
      select 1 from team_scheduled_messages sm
       where sm.team_id = ${teamId}
         and sm.status = 'active'
         and exists (
           select 1 from jsonb_array_elements_text(sm.target_numbers) as n(numero)
            where regexp_replace(n.numero, '[^0-9]', '', 'g') = regexp_replace(split_part(${chats.remoteJid}, '@', 1), '[^0-9]', '', 'g')
         )
    )
  )`;
}

/**
 * Está dormido hasta una fecha. Los pospuestos no son una tabla: viven en los
 * settings del equipo y llegan ya resueltos a lista de chatIds.
 *
 * `inArray` y no `= any(${ids})`: interpolar un array JS dentro de un template
 * de drizzle lo expande como lista de parámetros —`= any(($1,$2,$3))`— y
 * Postgres rechaza eso con 42809 ("requires array on right side"). Pasa el
 * chequeo de tipos y el build, y revienta al abrir la lista con un solo
 * contacto pospuesto.
 */
function sqlPospuesto(snoozeIds: number[]): SQL {
  const a = teamCommercialAnalysis;
  if (!snoozeIds.length) return sql`false`;
  return sql`${inArray(a.chatId, snoozeIds)}`;
}

/**
 * La situación del contacto, como un CASE de SQL.
 *
 * **Esta es la única definición que existe.** Sale en cada fila (para el icono)
 * y se repite tal cual en el WHERE (para el filtro), así que el icono y el
 * filtro no pueden discrepar: son la misma expresión. El orden de los WHEN es
 * la precedencia documentada en `shared/situacion.ts` — cambiarlo acá sin
 * cambiarlo allá deja el comentario mintiendo, que es peor que no tenerlo.
 */
export function situacionExpr(teamId: number, snoozeIds: number[] = []): SQL<Situacion> {
  const a = teamCommercialAnalysis;
  return sql<Situacion>`(case
    when ${a.status} in ('pre_descarte', 'descarte_definitivo') or ${a.currentGate} = 'GX' then 'descartado'
    when ${sqlPospuesto(snoozeIds)} then 'pospuesto'
    when ${a.lastTeamMessageAt} is not null and ${a.lastCustomerMessageAt} is not null
         and ${a.lastCustomerMessageAt} > ${a.lastTeamMessageAt} then 'contesto'
    when ${a.automationActive} then 'automatizacion'
    when ${sqlAlgoEnCola(teamId)} then 'en_cola'
    when ${a.analyzedAt} is null or ${a.status} = 'sin_analizar' then 'sin_analizar'
    when ${a.paymentPending} then 'cobro'
    when ${sqlTieneProduccion(teamId)} then 'con_demo'
    when ${sqlTuvoSeguimiento(teamId)} then 'escrito'
    when ${a.isExistingCustomer} then 'cliente'
    else 'sin_tocar'
  end)`;
}

function buildWhere(teamId: number, q: ListQuery, snoozeIds: number[] = []): SQL {
  const a = teamCommercialAnalysis;
  // Los chats marcados en Limpieza (personal / equipo / otros) no aparecen en
  // ninguna lista comercial: se ven sólo en su grupo de Limpieza. El análisis
  // que tuvieran sigue guardado, así que desmarcarlos los devuelve a su lista.
  const parts: Array<SQL | undefined> = [eq(a.teamId, teamId), condicionDeChatMarcado(), vistaWhere(q.vista)];
  if (q.gates?.length) parts.push(inArray(a.currentGate, q.gates));
  if (q.status?.length) parts.push(inArray(a.status, q.status));
  if (q.owner) parts.push(eq(a.recommendedOwner, q.owner));
  if (q.objection) parts.push(eq(a.objectionType, q.objection));
  if (q.need) parts.push(eq(a.need, q.need));
  if (q.source) parts.push(eq(a.source, q.source));
  if (q.ageBucket && AGE_INTERVALS[q.ageBucket]) parts.push(AGE_INTERVALS[q.ageBucket]);
  if (q.followups === '0') parts.push(eq(a.followupsTotal, 0));
  else if (q.followups === '1') parts.push(eq(a.followupsTotal, 1));
  else if (q.followups === '2') parts.push(eq(a.followupsTotal, 2));
  else if (q.followups === '3plus') parts.push(gte(a.followupsTotal, 3));
  if (typeof q.evidenceGap === 'boolean') parts.push(eq(a.evidenceGap, q.evidenceGap));
  if (typeof q.automationActive === 'boolean') parts.push(eq(a.automationActive, q.automationActive));
  if (typeof q.stale === 'boolean') parts.push(eq(a.stale, q.stale));
  if (q.toReview) parts.push(and(isNotNull(a.analyzedAt), lt(a.confidence, 55)));
  if (q.followUp) {
    const tuvoSeguimiento = sqlTuvoSeguimiento(teamId);
    parts.push(q.followUp === 'con' ? tuvoSeguimiento : sql`${a.analyzedAt} is not null and not ${tuvoSeguimiento}`);
  }
  if (snoozeIds.length) parts.push(q.snoozed === 'con' ? inArray(a.chatId, snoozeIds) : notInArray(a.chatId, snoozeIds));
  else if (q.snoozed === 'con') parts.push(sql`false`);
  if (q.executed) {
    const leSalioAlgo = sql`exists (
      select 1 from team_commercial_actions ac
       where ac.team_id = ${teamId} and ac.chat_id = ${a.chatId}
         and ac.status in ('executed', 'resulted') and ac.executed_at is not null
    )`;
    parts.push(q.executed === 'con' ? leSalioAlgo : sql`not ${leSalioAlgo}`);
  }
  if (q.queued) {
    const tieneAlgoEnCola = sqlAlgoEnCola(teamId);
    if (q.queued === 'con') parts.push(tieneAlgoEnCola);
    else if (q.queued === 'sin') parts.push(sql`not ${tieneAlgoEnCola}`);
    else {
      // Modo Noelia sí debe ver propuestas para aprobar, pero nunca un caso
      // que ya tiene algo aprobado, ejecutándose o programado para salir.
      parts.push(sql`not (
        exists (
          select 1 from team_commercial_actions ac
           where ac.team_id = ${teamId} and ac.chat_id = ${a.chatId}
             and ac.status in ('approved', 'executing')
        )
        or exists (
          select 1 from team_prompt_runs pr
           where pr.team_id = ${teamId} and pr.target_kind = 'chat' and pr.target_id = ${a.chatId}::text
             and pr.status in ('queued', 'in_progress')
        )
        or exists (
          select 1 from team_scheduled_messages sm
           where sm.team_id = ${teamId} and sm.status = 'active'
             and exists (
               select 1 from jsonb_array_elements_text(sm.target_numbers) as n(numero)
                where regexp_replace(n.numero, '[^0-9]', '', 'g') = regexp_replace(split_part(${chats.remoteJid}, '@', 1), '[^0-9]', '', 'g')
             )
        )
      )`);
    }
  }
  if (q.scheduled) {
    // Los programados guardan teléfonos sueltos, no chatId: se cruzan por
    // dígitos contra el JID, igual que el enriquecido de la fila.
    const tieneProgramado = sql`exists (
      select 1 from team_scheduled_messages sm
       where sm.team_id = ${teamId}
         and sm.status in ('active', 'paused')
         and exists (
           select 1 from jsonb_array_elements_text(sm.target_numbers) as n(numero)
            where regexp_replace(n.numero, '[^0-9]', '', 'g') = regexp_replace(split_part(${chats.remoteJid}, '@', 1), '[^0-9]', '', 'g')
         )
    )`;
    parts.push(q.scheduled === 'con' ? tieneProgramado : sql`not ${tieneProgramado}`);
  }

  /**
   * Situación: la misma expresión que viaja en la fila, así que filtrar por
   * "Contestó, sin atender" devuelve exactamente las filas que muestran ese
   * icono. Sin esto habría dos definiciones y el día que una cambie la lista
   * mostraría un icono y el filtro otra cosa.
   */
  if (q.situaciones?.length) parts.push(inArray(situacionExpr(teamId, snoozeIds), q.situaciones));
  // Cliente o no cliente. `isExistingCustomer` es la misma marca que usa el
  // motor, no una coincidencia de teléfono suelta.
  if (q.cliente) parts.push(eq(a.isExistingCustomer, q.cliente === 'con'));

  const term = (q.q ?? '').trim();
  if (term) {
    const like = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const digits = term.replace(/\D/g, '');
    const ors: SQL[] = [ilike(contacts.name, like), ilike(chats.name, like), ilike(chats.pushName, like)];
    if (digits.length >= 3) ors.push(ilike(chats.remoteJid, `%${digits}%`));
    parts.push(or(...ors));
  }
  return and(...parts.filter((p): p is SQL => Boolean(p))) as SQL;
}

const nameExpr = sql<string>`coalesce(nullif(${contacts.name}, ''), nullif(${chats.name}, ''), nullif(${chats.pushName}, ''), ${chats.remoteJid})`;

function orderFor(sort: ListQuery['sort']): SQL[] {
  const a = teamCommercialAnalysis;
  switch (sort) {
    case 'age':
      return [sql`${a.lastCustomerMessageAt} desc nulls last`, desc(a.id)];
    case 'oldest':
      // El que hace más que no escribe primero. Los que nunca escribieron van al
      // final: "sin fecha" no es "muy viejo", es que no hay dato.
      return [sql`${a.lastCustomerMessageAt} asc nulls last`, desc(a.id)];
    case 'gate':
      // Por grado del embudo: G11 arriba, GX abajo. El gate es texto ('G7',
      // 'GX'), así que se ordena por el número y GX queda fuera de la escala.
      return [
        sql`(case when ${a.currentGate} = 'GX' then -1 else coalesce(nullif(regexp_replace(${a.currentGate}, '[^0-9]', '', 'g'), '')::int, -1) end) desc`,
        desc(a.priorityScore),
        desc(a.id),
      ];
    case 'lastFollowup':
      return [sql`${a.lastFollowupAt} desc nulls last`, desc(a.id)];
    case 'name':
      return [asc(nameExpr), asc(a.id)];
    default:
      return [desc(a.priorityScore), desc(a.id)];
  }
}

// ── Lista ───────────────────────────────────────────────────────────────────

/**
 * Cuántos hay en cada situación, con los filtros puestos menos el de situación.
 *
 * "Menos el de situación" es la parte que importa: los números tienen que
 * decir a dónde iría la persona si tocara otro chip, no cuántos quedan del que
 * ya tocó. Sin esto, dos de los diez chips muestran cero para siempre —hoy no
 * hay pospuestos ni contactos sin analizar— y no hay forma de saber si es que
 * no hay o es que el filtro está roto.
 */
export async function contarPorSituacion(teamId: number, query: ListQuery): Promise<Record<Situacion, number>> {
  const a = teamCommercialAnalysis;
  const snoozes = await vigentesSnoozes(teamId);
  const ids = snoozes.map((x) => x.chatId);
  const expr = situacionExpr(teamId, ids);
  const rows = await db
    .select({ situacion: expr, n: sql<number>`count(*)::int` })
    .from(a)
    .innerJoin(chats, eq(chats.id, a.chatId))
    .leftJoin(contacts, eq(contacts.chatId, a.chatId))
    .where(buildWhere(teamId, { ...query, situaciones: undefined }, ids))
    // `group by 1` (posición) y no la expresión de nuevo: el CASE lleva
    // parámetros, drizzle los vuelve a numerar en el GROUP BY y Postgres deja
    // de reconocerlo como la misma expresión ("status must appear in the GROUP
    // BY clause"). Es la misma trampa del date_trunc parametrizado.
    .groupBy(sql`1`);

  const counts = Object.fromEntries(SITUACIONES.map((s) => [s, 0])) as Record<Situacion, number>;
  for (const row of rows) if (esSituacion(row.situacion)) counts[row.situacion] = row.n;
  return counts;
}

export async function listAnalyses(teamId: number, query: ListQuery): Promise<ListPayload> {
  const a = teamCommercialAnalysis;
  const sort = query.sort ?? 'priority';
  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const snoozes = await vigentesSnoozes(teamId);
  const where = buildWhere(teamId, query, snoozes.map((x) => x.chatId));
  const cursor = decodeCursor(query.cursor);

  let pageWhere: SQL = where;
  let offset = 0;
  if (cursor && cursor.sort === sort) {
    if (sort === 'priority' && typeof cursor.score === 'number' && typeof cursor.id === 'number') {
      // Keyset sobre (priority_score, id): estable aunque cambien filas entre páginas.
      pageWhere = and(
        where,
        or(lt(a.priorityScore, cursor.score), and(eq(a.priorityScore, cursor.score), lt(a.id, cursor.id))),
      ) as SQL;
    } else if (typeof cursor.offset === 'number' && cursor.offset > 0) {
      offset = cursor.offset;
    }
  }

  const base = db
    .select({ a, chat: chatCols, contactName: contacts.name, situacion: situacionExpr(teamId, snoozes.map((x) => x.chatId)) })
    .from(a)
    .innerJoin(chats, eq(chats.id, a.chatId))
    .leftJoin(contacts, eq(contacts.chatId, a.chatId));

  const [rowsRaw, totalRow] = await Promise.all([
    base
      .where(pageWhere)
      .orderBy(...orderFor(sort))
      .limit(limit + 1)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(a)
      .innerJoin(chats, eq(chats.id, a.chatId))
      .leftJoin(contacts, eq(contacts.chatId, a.chatId))
      .where(where),
  ]);

  const hasMore = rowsRaw.length > limit;
  const page = rowsRaw.slice(0, limit);
  const now = Date.now();
  const rows = page.map((r) => toRow(r as JoinedRow, now));
  await anotarProgramados(teamId, page as JoinedRow[], rows);
  await anotarSeguimiento(teamId, rows);
  await anotarClientes(teamId, rows);
  await anotarRadar(teamId, rows);
  for (const r of rows) r.snoozedUntil = snoozes.find((x) => x.chatId === r.chatId)?.until ?? null;
  const last = page[page.length - 1];

  let nextCursor: string | null = null;
  if (hasMore && last) {
    nextCursor =
      sort === 'priority'
        ? encodeCursor({ sort, score: last.a.priorityScore, id: last.a.id })
        : encodeCursor({ sort, offset: offset + page.length });
  }

  // Los conteos son una consulta más: sólo salen si la pantalla los pide.
  const situaciones = query.conConteos ? await contarPorSituacion(teamId, query) : undefined;

  return { rows, total: totalRow[0]?.n ?? 0, nextCursor, ...(situaciones ? { situaciones } : {}) };
}

/**
 * Marca qué contactos ya tuvieron seguimiento **después** del análisis.
 *
 * Sin esto, "auditado" y "auditado y ya le escribimos" se veían igual en la
 * lista, así que los recién auditados quedaban mezclados con los que ya están
 * en curso y alguien los volvía a trabajar. El corte es la fecha del análisis:
 * un envío de marzo no es seguimiento de una auditoría de agosto.
 *
 * Cuenta como seguimiento un envío ejecutado o una corrida de prompt cerrada.
 * Las fechas se comparan en JS, nunca dentro del SQL (un `Date` en un FILTER
 * revienta en runtime y el build lo deja pasar).
 */
/** Pospuestos vigentes (los vencidos se ignoran; se limpian al escribir). */
export async function vigentesSnoozes(teamId: number): Promise<Array<{ chatId: number; until: string; note?: string }>> {
  const ahora = new Date().toISOString();
  return (await getSalesOpsSettings(teamId)).leadSnoozes.filter((x) => x.until > ahora);
}

/**
 * Señales del radar sin atender por chat.
 *
 * En la lista importa lo mismo que en Respuestas —quién contestó y qué dijo—
 * pero sin salir de la lista de trabajo: una fila con "💰 Pago" es la que hay
 * que abrir primero, y hasta ahora eso sólo se veía en otra vista.
 */
async function anotarRadar(teamId: number, rows: AnalysisRow[]): Promise<void> {
  if (!rows.length) return;
  try {
    const chatIds = rows.map((r) => r.chatId);
    const filas = await db
      .select({ chatId: teamCommercialSignals.chatId, kind: teamCommercialSignals.kind, createdAt: teamCommercialSignals.createdAt })
      .from(teamCommercialSignals)
      .where(and(eq(teamCommercialSignals.teamId, teamId), inArray(teamCommercialSignals.chatId, chatIds), inArray(teamCommercialSignals.status, ['new', 'seen'])));
    const porChat = new Map<number, { kinds: Set<string>; count: number; lastAt: string }>();
    for (const f of filas) {
      const iso = f.createdAt.toISOString();
      const actual = porChat.get(f.chatId) ?? { kinds: new Set<string>(), count: 0, lastAt: iso };
      actual.kinds.add(f.kind);
      actual.count += 1;
      if (iso > actual.lastAt) actual.lastAt = iso;
      porChat.set(f.chatId, actual);
    }
    for (const row of rows) {
      const hit = porChat.get(row.chatId);
      row.radar = hit
        ? { kinds: [...hit.kinds] as SignalKind[], count: hit.count, urgent: [...hit.kinds].some((k) => URGENT_SIGNALS.includes(k as SignalKind)), lastAt: hit.lastAt }
        : null;
    }
  } catch (error) {
    console.error('[sales-ops/queries] radar de la lista', error);
  }
}

/**
 * Estado de cliente de cada contacto, con la MISMA regla que usa el motor.
 *
 * Antes acá se miraba sólo `team_customer_contacts`, así que la lista decía
 * "no es cliente" de gente con membresía activa o con la ficha ya cargada por
 * teléfono: el ícono no aparecía y el vendedor abría el chat creyendo que era
 * un lead frío. `resolverClientes` es la única definición y además dice por qué
 * lo es, que es lo que se muestra en el tooltip.
 */
async function anotarClientes(teamId: number, rows: AnalysisRow[]): Promise<void> {
  const contactIds = rows.map((r) => r.contactId).filter((id): id is number => typeof id === 'number');
  if (!contactIds.length) return;
  try {
    const estados = await resolverClientes(teamId, contactIds);
    for (const r of rows) {
      const estado = r.contactId ? estados.get(r.contactId) : undefined;
      // `customerId` se mantiene tal cual porque ya lo consumen la lista y la
      // ficha para abrir /plugins/customers/<id>.
      r.customerId = estado?.customerId ?? null;
      r.cliente = estado ? { fuente: estado.fuente, customerId: estado.customerId } : { fuente: null, customerId: null };
    }
  } catch (error) {
    console.error('[sales-ops/queries] clientes de la lista', error);
  }
}

async function anotarSeguimiento(teamId: number, rows: AnalysisRow[]): Promise<void> {
  const conAnalisis = rows.filter((r) => r.analyzedAt);
  if (!conAnalisis.length) return;
  const chatIds = conAnalisis.map((r) => r.chatId);

  try {
    const [acciones, corridas] = await Promise.all([
      db
        .select({ chatId: teamCommercialActions.chatId, at: teamCommercialActions.executedAt, kind: teamCommercialActions.kind })
        .from(teamCommercialActions)
        .where(and(
          eq(teamCommercialActions.teamId, teamId),
          inArray(teamCommercialActions.chatId, chatIds),
          inArray(teamCommercialActions.status, ['executed', 'resulted']),
        )),
      db
        .select({ targetId: teamPromptRuns.targetId, at: teamPromptRuns.completedAt })
        .from(teamPromptRuns)
        .where(and(
          eq(teamPromptRuns.teamId, teamId),
          eq(teamPromptRuns.targetKind, 'chat'),
          inArray(teamPromptRuns.targetId, chatIds.map(String)),
          eq(teamPromptRuns.status, 'completed'),
        )),
    ]);

    const ultimo = new Map<number, { at: string; kind: string }>();
    const ultimaAccion = new Map<number, { at: string; kind: string }>();
    const guardar = (mapa: Map<number, { at: string; kind: string }>, chatId: number, at: Date | null, kind: string) => {
      if (!at) return;
      const iso = at.toISOString();
      const actual = mapa.get(chatId);
      if (!actual || actual.at < iso) mapa.set(chatId, { at: iso, kind });
    };
    for (const fila of acciones) {
      guardar(ultimo, fila.chatId, fila.at, fila.kind);
      guardar(ultimaAccion, fila.chatId, fila.at, fila.kind);
    }
    for (const fila of corridas) guardar(ultimo, Number(fila.targetId), fila.at, 'prompt');

    for (const row of conAnalisis) {
      const hit = ultimo.get(row.chatId);
      row.followUp = hit && row.analyzedAt && hit.at > row.analyzedAt ? { at: hit.at, kind: hit.kind } : null;
      row.lastExecution = ultimaAccion.get(row.chatId) ?? null;
    }
  } catch (error) {
    console.error('[sales-ops/queries] seguimiento de la lista', error);
  }
}

/** Sólo dígitos: el programado guarda teléfonos sueltos y el chat tiene un JID. */
function digitosDeJid(remoteJid: string): string {
  return (remoteJid.split('@')[0] ?? '').replace(/\D/g, '');
}

/**
 * Marca en cada fila si al contacto le va a salir un mensaje programado.
 *
 * Se trae los programados vivos del equipo (son decenas, no miles) y cruza por
 * teléfono en memoria: `target_numbers` es un jsonb de strings sin normalizar,
 * así que un join en SQL habría que escribirlo con `jsonb_array_elements` y una
 * normalización por fila que no vale la pena para este volumen.
 *
 * Si falla, la lista sale igual sin el dato: un icono de más o de menos no
 * puede tumbar la pantalla principal del Command Center.
 */
async function anotarProgramados(teamId: number, page: JoinedRow[], rows: AnalysisRow[]): Promise<void> {
  if (!rows.length) return;
  try {
    const programados = await db
      .select({
        targetNumbers: teamScheduledMessages.targetNumbers,
        nextRunAt: teamScheduledMessages.nextRunAt,
        status: teamScheduledMessages.status,
      })
      .from(teamScheduledMessages)
      .where(and(
        eq(teamScheduledMessages.teamId, teamId),
        inArray(teamScheduledMessages.status, ['active', 'paused']),
      ));
    if (!programados.length) return;

    const porTelefono = new Map<string, { count: number; nextRunAt: string | null }>();
    for (const programado of programados) {
      const numeros = Array.isArray(programado.targetNumbers) ? programado.targetNumbers : [];
      const proximo = programado.status === 'active' ? iso(programado.nextRunAt) : null;
      // Un programado con varios destinatarios cuenta para cada uno.
      for (const numero of new Set(numeros.map((n) => String(n).replace(/\D/g, '')).filter(Boolean))) {
        const actual = porTelefono.get(numero);
        if (!actual) {
          porTelefono.set(numero, { count: 1, nextRunAt: proximo });
          continue;
        }
        actual.count += 1;
        if (proximo && (!actual.nextRunAt || proximo < actual.nextRunAt)) actual.nextRunAt = proximo;
      }
    }

    rows.forEach((row, index) => {
      const jid = page[index]?.chat.remoteJid;
      if (!jid) return;
      const encontrado = porTelefono.get(digitosDeJid(jid));
      if (encontrado) row.scheduled = { count: encontrado.count, nextRunAt: encontrado.nextRunAt };
    });
  } catch (error) {
    console.error('[sales-ops/queries] programados de la lista', error);
  }
}

// ── Ficha ───────────────────────────────────────────────────────────────────

type Msg = {
  id: string;
  fromMe: boolean;
  messageType: string | null;
  text: string | null;
  mediaCaption: string | null;
  mediaSeconds: number | null;
  mediaIsPtt: boolean | null;
  isAi: boolean | null;
  isAutomation: boolean | null;
  isInternal: boolean | null;
  timestamp: Date;
};

function whoOf(m: Msg): DossierEntry['who'] {
  if (!m.fromMe) return 'cliente';
  if (m.isInternal) return 'nota';
  if (m.isAi) return 'ia';
  if (m.isAutomation) return 'bot';
  return 'humano';
}

function textOf(m: Msg, transcript: string | undefined): string {
  const t = (m.text ?? '').trim();
  if (t) return t;
  const caption = (m.mediaCaption ?? '').trim();
  const type = (m.messageType ?? '').toLowerCase();
  if (type.includes('audio') || m.mediaIsPtt) {
    if (transcript) return transcript;
    return `[audio ${m.mediaSeconds ?? 0}s sin transcribir]`;
  }
  if (type.includes('image')) return caption ? `[imagen] ${caption}` : '[imagen]';
  if (type.includes('video')) return caption ? `[video] ${caption}` : '[video]';
  if (type.includes('document')) return caption ? `[documento] ${caption}` : '[documento]';
  if (type.includes('sticker')) return '[sticker]';
  if (type.includes('location')) return '[ubicación]';
  if (type.includes('contact')) return '[contacto]';
  return caption || (type ? `[${type}]` : '');
}

/**
 * Hitos del timeline (doc 05 §4): cambios de `who`, flags, evidencia del análisis
 * y notas internas. Los tramos sin hitos se colapsan en gaps de silencio u omitidos.
 */
export function buildTimeline(
  msgs: Msg[],
  transcripts: Map<string, string>,
  evidence: Record<string, string[]> | null,
): Array<TimelineHit | TimelineGap> {
  const evidenceOf = new Map<string, string[]>();
  for (const [key, ids] of Object.entries(evidence ?? {})) {
    for (const id of ids ?? []) {
      const list = evidenceOf.get(id) ?? [];
      list.push(key);
      evidenceOf.set(id, list);
    }
  }

  const entries: Array<TimelineHit & { idx: number }> = [];
  let prevWho: DossierEntry['who'] | null = null;
  msgs.forEach((m, idx) => {
    const who = whoOf(m);
    const text = textOf(m, transcripts.get(m.id));
    const flags = who === 'nota' ? [] : flagsFor(text);
    const ev = evidenceOf.get(m.id) ?? [];
    const isHit = idx === 0 || who !== prevWho || flags.length > 0 || ev.length > 0 || who === 'nota' || idx === msgs.length - 1;
    if (isHit) {
      entries.push({
        id: m.id,
        at: m.timestamp.toISOString(),
        who,
        type: m.messageType ?? 'text',
        text: text.length > 300 ? `${text.slice(0, 297)}…` : text,
        flags,
        evidenceOf: ev,
        idx,
      });
    }
    prevWho = who;
  });

  let hits = entries;
  if (hits.length > TIMELINE_HIT_CAP) {
    const keep = new Set<number>();
    hits.slice(0, 40).forEach((h) => keep.add(h.idx));
    hits.slice(-150).forEach((h) => keep.add(h.idx));
    hits.forEach((h) => {
      if (h.flags.length || h.evidenceOf.length || h.who === 'nota') keep.add(h.idx);
    });
    hits = hits.filter((h) => keep.has(h.idx));
  }

  const out: Array<TimelineHit | TimelineGap> = [];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    if (i > 0) {
      const prev = hits[i - 1];
      const omitted = hit.idx - prev.idx - 1;
      const days = (Date.parse(hit.at) - Date.parse(prev.at)) / DAY_MS;
      if (days > SILENCE_GAP_DAYS) out.push({ from: prev.at, to: hit.at, count: omitted, kind: 'silence' });
      else if (omitted > 0) out.push({ from: prev.at, to: hit.at, count: omitted, kind: 'omitted' });
    }
    const { idx: _idx, ...rest } = hit;
    out.push(rest);
  }
  return out;
}

/** DetailPayload más una cabecera mínima: los chats sin análisis también se abren. */
export type DetailWithHeader = DetailPayload & { header: ChatHeader };

export async function getAnalysisDetail(teamId: number, chatId: number): Promise<DetailWithHeader | null> {
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.teamId, teamId)),
    columns: { id: true, remoteJid: true, name: true, pushName: true, profilePicUrl: true, instanceId: true },
  });
  if (!chat) return null;

  const now = Date.now();
  const [contact, analysisRows, msgsDesc, audioRows, versionRows, actionRows, signalRows, dossierBuilt] = await Promise.all([
    db.query.contacts.findFirst({ where: eq(contacts.chatId, chatId), columns: { id: true, name: true, notes: true, customData: true, funnelStageId: true }, with: { contactTags: { with: { tag: { columns: { id: true, name: true, color: true } } } } } }),
    db.select().from(teamCommercialAnalysis).where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId))).limit(1),
    db
      .select({
        id: messages.id,
        fromMe: messages.fromMe,
        messageType: messages.messageType,
        text: messages.text,
        mediaCaption: messages.mediaCaption,
        mediaSeconds: messages.mediaSeconds,
        mediaIsPtt: messages.mediaIsPtt,
        isAi: messages.isAi,
        isAutomation: messages.isAutomation,
        isInternal: messages.isInternal,
        timestamp: messages.timestamp,
      })
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(desc(messages.timestamp), desc(messages.id))
      .limit(TIMELINE_MESSAGE_CAP),
    db
      .select({ messageId: messageAudioInsights.messageId, transcript: messageAudioInsights.transcript })
      .from(messageAudioInsights)
      .where(and(eq(messageAudioInsights.chatId, chatId), eq(messageAudioInsights.status, 'done'))),
    db
      .select()
      .from(teamCommercialAnalysisVersions)
      .where(and(eq(teamCommercialAnalysisVersions.teamId, teamId), eq(teamCommercialAnalysisVersions.chatId, chatId)))
      .orderBy(desc(teamCommercialAnalysisVersions.version)),
    db
      .select()
      .from(teamCommercialActions)
      .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.chatId, chatId)))
      .orderBy(desc(teamCommercialActions.createdAt)),
    db
      .select()
      .from(teamCommercialSignals)
      .where(and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.chatId, chatId)))
      .orderBy(desc(teamCommercialSignals.createdAt)),
    import('./dossier').then(({ buildChatDossierFull }) => buildChatDossierFull(teamId, chatId)).catch(() => null),
  ]);

  const joined: JoinedRow | null = analysisRows[0]
    ? { a: analysisRows[0], chat, contactName: contact?.name ?? null }
    : null;
  const analysis = joined ? toDetail(joined, now) : null;
  // La ficha y el Focus dibujan "cliente" con la misma regla que la lista, así
  // que el estado se resuelve acá y no se saca del análisis, que se queda viejo.
  // Si el análisis no guardó el contacto, se usa el del chat.
  if (analysis) {
    if (analysis.contactId == null) analysis.contactId = contact?.id ?? null;
    await anotarClientes(teamId, [analysis]);
  }
  const name = displayName(contact?.name ?? null, chat.name, chat.pushName, chat.remoteJid);

  const transcripts = new Map<string, string>();
  for (const r of audioRows) if (r.transcript) transcripts.set(r.messageId, r.transcript);
  const msgs = [...msgsDesc].reverse();
  const timeline = buildTimeline(msgs, transcripts, (analysisRows[0]?.evidence as Record<string, string[]>) ?? null);

  const versions: AnalysisVersionRow[] = versionRows.map((v) => {
    const snap = (v.snapshot ?? {}) as Record<string, unknown>;
    const gate = (snap.current_gate ?? snap.currentGate ?? 'G0') as Gate;
    const conf = Number(snap.confidence ?? 0);
    return {
      id: v.id,
      version: v.version,
      reason: v.reason,
      analyzedBy: (v.analyzedBy ?? null) as AnalysisVersionRow['analyzedBy'],
      currentGate: gate,
      confidence: Number.isFinite(conf) ? conf : 0,
      createdAt: v.createdAt.toISOString(),
      createdBy: v.createdBy,
      diff: v.diff ?? null,
    };
  });

  const cooldownMs = SEND_COOLDOWN_HOURS * 3_600_000;
  const lastExecutedAt = actionRows
    .filter((x) => x.executedAt && (x.status === 'executed' || x.status === 'resulted'))
    .map((x) => x.executedAt!.getTime())
    .sort((x, y) => y - x)[0];
  const baseWarnings: string[] = [];
  if (analysis?.automationActive) baseWarnings.push('automation_active');
  if (analysis?.autoReplyDetected) baseWarnings.push('auto_reply');
  if (analysis?.isExistingCustomer) baseWarnings.push('cliente');
  if (lastExecutedAt && now - lastExecutedAt < cooldownMs) baseWarnings.push('envio_reciente');

  const actions: ActionRow[] = actionRows.map((x) => ({
    id: x.id,
    chatId: x.chatId,
    contactId: x.contactId,
    name,
    batchId: x.batchId,
    batchLabel: x.batchLabel,
    experimentId: x.experimentId,
    variant: x.variant,
    kind: x.kind as ActionRow['kind'],
    payload: x.payload ?? {},
    gateAtCreation: (x.gateAtCreation ?? null) as ActionRow['gateAtCreation'],
    status: x.status as ActionRow['status'],
    requiresRole: x.requiresRole as ActionRow['requiresRole'],
    proposedBy: x.proposedBy,
    approvedBy: x.approvedBy,
    approvedAt: iso(x.approvedAt),
    executedAt: iso(x.executedAt),
    executedVia: x.executedVia,
    resultMessageId: x.resultMessageId,
    result: x.result ?? null,
    scheduledFor: iso(x.scheduledFor),
    expiresAt: iso(x.expiresAt),
    createdAt: x.createdAt.toISOString(),
    warnings: x.status === 'proposed' || x.status === 'pending_approval' || x.status === 'approved' ? baseWarnings : [],
  }));

  const signals: SignalRow[] = signalRows.map((s) => ({
    id: s.id,
    chatId: s.chatId,
    contactId: s.contactId,
    name,
    messageId: s.messageId,
    kind: s.kind as SignalRow['kind'],
    confidence: s.confidence,
    excerpt: s.excerpt,
    triggeredByActionId: s.triggeredByActionId,
    gateBefore: (s.gateBefore ?? null) as SignalRow['gateBefore'],
    gateAfter: (s.gateAfter ?? null) as SignalRow['gateAfter'],
    status: s.status as SignalRow['status'],
    handledBy: s.handledBy,
    handledAt: iso(s.handledAt),
    createdAt: s.createdAt.toISOString(),
  }));

  const chatHref = `/dashboard/chat/${numeroDeJid(chat.remoteJid)}?instanceId=${chat.instanceId ?? ''}`;

  const header: ChatHeader = {
    chatId: chat.id,
    contactId: contact?.id ?? null,
    name,
    phoneMasked: maskJid(chat.remoteJid),
    avatarUrl: chat.profilePicUrl,
    remoteJid: chat.remoteJid,
    instanceId: chat.instanceId ?? null,
    customData: (contact?.customData as Record<string, unknown> | null) ?? {},
    contactNotes: contact?.notes ?? null,
    tags: (contact?.contactTags ?? []).map((ct) => ct.tag).filter(Boolean) as Array<{ id: number; name: string; color: string | null }>,
  };

  return {
    analysis,
    facts: dossierBuilt?.dossier.facts ?? null,
    commercial: dossierBuilt?.dossier.commercial ?? null,
    timeline,
    versions,
    actions,
    signals,
    chatHref,
    header,
  };
}

/** Cabecera mínima de un chat sin análisis (para la ficha). */
export type ChatHeader = {
  chatId: number;
  contactId: number | null;
  name: string;
  phoneMasked: string;
  avatarUrl: string | null;
  /** JID técnico para el chat embebido (`/api/messages?jid=`). No se muestra: para la UI está `phoneMasked`. */
  remoteJid: string;
  instanceId: number | null;
  /** Campos personalizados del contacto (contacts.customData) tal cual, sin secretos. */
  customData: Record<string, unknown>;
  /** Nota libre de la ficha del contacto (contacts.notes). */
  contactNotes: string | null;
  tags: Array<{ id: number; name: string; color: string | null }>;
};
