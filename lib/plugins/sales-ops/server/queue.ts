import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  chats,
  contacts,
  teamCommercialActions,
  teamCommercialAnalysis,
  teamCommercialExperimentMembers,
  teamCommercialExperiments,
  teamCommercialSignals,
  teamMembers,
  users,
} from '@/lib/db/schema';
import type { ActionRow, BatchSummary, QueueBatchPayload } from '../shared/api-types';
import {
  ACTION_KINDS,
  ACTION_ROLES,
  ACTION_STATUSES,
  GATES,
  PROPOSAL_TTL_DAYS,
  SALES_OPS_ACTIVITY_PREFIX,
  type ActionKind,
  type ActionRole,
  type ActionStatus,
  type AnalysisStatus,
  type Gate,
  type Need,
  type Owner,
} from '../shared/taxonomy';
import { getSalesOpsSettings } from './settings';

/**
 * Cola de ejecución del Command Center Comercial (doc 03 §5, doc 05 §5).
 *
 * Acá NO se envía nada: se proponen filas `proposed`, se aprueban con rol y se
 * registra el resultado que reporta un humano o un conector. La ejecución real
 * queda para la Fase 6 (adaptador al Centro de Comandos).
 *
 * Invariantes que cuestan dinero:
 * - Un solo `send_message` `approved`/`executing` por chat (índice parcial único
 *   `team_commercial_actions_one_send_idx`): la aprobación lo respeta y, si
 *   igual choca, devuelve qué chat lo bloqueó en vez de aprobar a medias.
 * - Ningún chat entra a un lote de envío si tiene automatización viva, es
 *   cliente, está en GX, tiene auto-reply (en lotes) o recibió un envío nuestro
 *   dentro de `sendCooldownHours`.
 * - Nada escribe en el CRM: sólo team_commercial_* y activity_logs.
 */

const HOUR = 3600000;
const DAY = 86400000;

export class QueueError extends Error {
  code: 'not_found' | 'forbidden' | 'invalid' | 'conflict';
  details?: Record<string, unknown>;
  constructor(code: QueueError['code'], message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'QueueError';
    this.code = code;
    this.details = details;
  }
}

export type ProposeFilters = {
  status?: AnalysisStatus[];
  owner?: Owner;
  maxFollowups?: number;
  minDaysSilent?: number;
  limit?: number;
};

export type PayloadTemplate = {
  /** Texto (variante A). Variables: {{nombre}}, {{plan}}, {{precio}}. */
  text?: string;
  /** Texto de la variante B cuando `variantSplit`. */
  textB?: string;
  taskTitle?: string;
  dueInDays?: number;
  /** schedule_message: fecha y hora de salida en ISO 8601 (hora local del negocio o con zona). */
  sendAt?: string;
  /** Datos libres que acompañan la acción (assign_owner: { owner }, etc.). */
  extra?: Record<string, unknown>;
};

export type ProposeInput = {
  label: string;
  kind: ActionKind;
  requiresRole: ActionRole;
  gates?: Gate[];
  chatIds?: number[];
  filters?: ProposeFilters;
  payloadTemplate?: PayloadTemplate;
  experimentId?: number | null;
  variantSplit?: boolean;
  /** `'ia'` o el id del usuario. */
  proposedBy: string | number;
  /** Cuando es true no escribe nada: devuelve quiénes entrarían y quiénes no. */
  dryRun?: boolean;
};

export type ExcludedChat = { chatId: number; name: string; reason: string };
export type ProposedCandidate = {
  chatId: number;
  contactId: number | null;
  name: string;
  gate: Gate | null;
  variant: 'A' | 'B' | null;
  text: string | null;
  warnings: string[];
};

export type ProposeResult = {
  batchId: string | null;
  label: string;
  kind: ActionKind;
  experimentId: number | null;
  included: ProposedCandidate[];
  excluded: ExcludedChat[];
  dryRun: boolean;
};

export type ApproveResult = {
  batchId: string;
  kind: ActionKind;
  approved: number;
  rejected: number;
  approvedBy: number;
  /** Ids de las filas que quedaron `approved` en esta llamada. */
  approvedIds: number[];
};

export type MarkResultInput = {
  status: 'executed' | 'failed' | 'resulted';
  resultMessageId?: string | null;
  result?: Record<string, unknown> | null;
  executedVia?: 'connector' | 'manual' | 'command-center';
  userId?: number | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const NEED_LABELS: Record<Need, string> = {
  sitio_web: 'sitio web',
  tienda_online: 'tienda online',
  combo_full: 'combo full',
  tienda_profesional: 'tienda profesional',
  sitio_profesional: 'sitio profesional',
  publicidad: 'publicidad',
  contenido: 'contenido',
  desarrollo_medida: 'desarrollo a medida',
  automatizacion: 'automatización',
  otro: 'proyecto',
  indefinida: 'proyecto',
};

export function newBatchId(now = new Date()): string {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `cc-${ymd}-${random}`;
}

function firstName(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N} .'-]/gu, '').trim();
  const first = clean.split(/\s+/)[0] ?? '';
  return first.length >= 2 ? first : clean || '';
}

function formatPrice(amount: number | null, currency: string | null): string {
  if (amount == null || !currency) return '';
  const units = amount / 100;
  try {
    return `${currency} ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(units)}`;
  } catch {
    return `${currency} ${Math.round(units)}`;
  }
}

/** Resuelve {{nombre}}, {{plan}} y {{precio}} por contacto. Deja vacío lo que no sabe. */
export function resolveTemplate(
  template: string,
  vars: { name: string; need: Need | null; quotedPrice: number | null; quotedCurrency: string | null },
): string {
  const values: Record<string, string> = {
    nombre: firstName(vars.name),
    plan: vars.need ? NEED_LABELS[vars.need] ?? vars.need : NEED_LABELS.indefinida,
    precio: formatPrice(vars.quotedPrice, vars.quotedCurrency),
  };
  return template
    .replace(/\{\{\s*(nombre|plan|precio)\s*\}\}/gi, (_m, key: string) => values[key.toLowerCase()] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function displayName(row: { contactName: string | null; chatName: string | null; pushName: string | null; jid: string }): string {
  return row.contactName?.trim() || row.chatName?.trim() || row.pushName?.trim() || `…${row.jid.replace(/\D/g, '').slice(-4)}`;
}

function daysBetween(from: Date | null, to: Date): number | null {
  if (!from) return null;
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

async function audit(teamId: number, verb: string, metadata: Record<string, unknown>, userId?: number | null) {
  try {
    await db.insert(activityLogs).values({
      teamId,
      userId: userId ?? null,
      action: `${SALES_OPS_ACTIVITY_PREFIX}QUEUE_${verb}`,
      metadata,
    });
  } catch (error) {
    console.error('[sales-ops/queue] audit failed', error);
  }
}

type ActionRecord = typeof teamCommercialActions.$inferSelect;

/** Nombre visible de cada chat. Nunca devuelve el teléfono completo. */
async function namesForChats(teamId: number, chatIds: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (!chatIds.length) return map;
  const rows = await db
    .select({
      chatId: chats.id,
      chatName: chats.name,
      pushName: chats.pushName,
      jid: chats.remoteJid,
      contactName: contacts.name,
    })
    .from(chats)
    .leftJoin(contacts, eq(contacts.chatId, chats.id))
    .where(and(eq(chats.teamId, teamId), inArray(chats.id, chatIds)));
  for (const row of rows) map.set(row.chatId, displayName(row));
  return map;
}

function toActionRow(action: ActionRecord, name: string, warnings: string[]): ActionRow {
  return {
    id: action.id,
    chatId: action.chatId,
    contactId: action.contactId,
    name,
    batchId: action.batchId,
    batchLabel: action.batchLabel,
    experimentId: action.experimentId,
    variant: action.variant,
    kind: action.kind as ActionKind,
    payload: action.payload ?? {},
    gateAtCreation: (action.gateAtCreation as Gate | null) ?? null,
    status: action.status as ActionStatus,
    requiresRole: action.requiresRole as ActionRole,
    proposedBy: action.proposedBy,
    approvedBy: action.approvedBy,
    approvedAt: action.approvedAt?.toISOString() ?? null,
    executedAt: action.executedAt?.toISOString() ?? null,
    executedVia: action.executedVia,
    resultMessageId: action.resultMessageId,
    result: action.result ?? null,
    scheduledFor: action.scheduledFor?.toISOString() ?? null,
    expiresAt: action.expiresAt?.toISOString() ?? null,
    createdAt: action.createdAt.toISOString(),
    warnings,
  };
}

/**
 * Advertencias por fila para la pantalla "Revisar lote": se calculan al leer,
 * contra el estado vivo del chat, no contra el que había al proponer.
 */
async function warningsFor(teamId: number, actions: ActionRecord[], cooldownHours: number): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!actions.length) return out;
  const chatIds = [...new Set(actions.map((a) => a.chatId))];
  const [analyses, liveChats, sends] = await Promise.all([
    db
      .select({
        chatId: teamCommercialAnalysis.chatId,
        automationActive: teamCommercialAnalysis.automationActive,
        autoReplyDetected: teamCommercialAnalysis.autoReplyDetected,
        isExistingCustomer: teamCommercialAnalysis.isExistingCustomer,
        customerEvidence: teamCommercialAnalysis.customerEvidence,
        status: teamCommercialAnalysis.status,
        currentGate: teamCommercialAnalysis.currentGate,
        stale: teamCommercialAnalysis.stale,
      })
      .from(teamCommercialAnalysis)
      .where(and(eq(teamCommercialAnalysis.teamId, teamId), inArray(teamCommercialAnalysis.chatId, chatIds))),
    db
      .select({ id: chats.id, lastCustomerInteraction: chats.lastCustomerInteraction })
      .from(chats)
      .where(and(eq(chats.teamId, teamId), inArray(chats.id, chatIds))),
    db
      .select({
        id: teamCommercialActions.id,
        chatId: teamCommercialActions.chatId,
        status: teamCommercialActions.status,
        executedAt: teamCommercialActions.executedAt,
        batchId: teamCommercialActions.batchId,
      })
      .from(teamCommercialActions)
      .where(
        and(
          eq(teamCommercialActions.teamId, teamId),
          inArray(teamCommercialActions.chatId, chatIds),
          eq(teamCommercialActions.kind, 'send_message'),
          inArray(teamCommercialActions.status, ['approved', 'executing', 'executed', 'resulted']),
        ),
      ),
  ]);
  const analysisByChat = new Map(analyses.map((a) => [a.chatId, a]));
  const lastReplyByChat = new Map(liveChats.map((c) => [c.id, c.lastCustomerInteraction]));
  const now = Date.now();
  const cooldownMs = Math.max(1, cooldownHours) * HOUR;

  for (const action of actions) {
    const warnings: string[] = [];
    const a = analysisByChat.get(action.chatId);
    if (!a) warnings.push('Sin análisis: no se pudo verificar automatización ni cliente.');
    else {
      if (a.automationActive) warnings.push('Automatización activa: cortá el flujo a mano antes de enviar.');
      if (a.autoReplyDetected) warnings.push('El contacto tiene respuestas automáticas.');
      if (a.isExistingCustomer || a.status === 'cliente') warnings.push(`Ya es cliente (evidencia: ${a.customerEvidence}).`);
      if (a.currentGate === 'GX') warnings.push('Está en GX (perdido).');
      if (a.status === 'descarte_definitivo') warnings.push('Está en descarte definitivo.');
      if (a.stale) warnings.push('El análisis está desactualizado: el chat cambió después.');
    }
    const lastReply = lastReplyByChat.get(action.chatId);
    if (lastReply && lastReply.getTime() > action.createdAt.getTime()) {
      warnings.push('Respondió después de propuesto: re-clasificar antes de enviar.');
    }
    for (const send of sends) {
      if (send.chatId !== action.chatId || send.id === action.id) continue;
      if ((send.status === 'executed' || send.status === 'resulted') && send.executedAt && now - send.executedAt.getTime() < cooldownMs) {
        warnings.push(`Recibió un envío nuestro hace menos de ${cooldownHours} h.`);
      }
      if ((send.status === 'approved' || send.status === 'executing') && send.batchId !== action.batchId) {
        warnings.push(`Ya tiene un envío aprobado en el lote ${send.batchId}.`);
      }
    }
    out.set(action.id, [...new Set(warnings)]);
  }
  return out;
}

// ── Proponer ─────────────────────────────────────────────────────────────────

/** Lotes que le llegan al cliente por WhatsApp: pasan por las mismas exclusiones y exigen texto. */
const SEND_KINDS: ActionKind[] = ['send_message', 'schedule_message'];

export async function proposeBatch(teamId: number, input: ProposeInput): Promise<ProposeResult> {
  if (!input.label?.trim()) throw new QueueError('invalid', 'El lote necesita un nombre.');
  if (!ACTION_KINDS.includes(input.kind)) throw new QueueError('invalid', `Tipo de acción desconocido: ${input.kind}`);
  if (!ACTION_ROLES.includes(input.requiresRole)) throw new QueueError('invalid', `Rol desconocido: ${input.requiresRole}`);
  const gates = (input.gates ?? []).filter((g): g is Gate => GATES.includes(g));
  const explicitChats = (input.chatIds ?? []).filter((id) => Number.isInteger(id) && id > 0);
  if (!gates.length && !explicitChats.length && !input.filters) {
    throw new QueueError('invalid', 'Indicá gates, chatIds o filtros para armar el lote.');
  }
  const isSend = SEND_KINDS.includes(input.kind);
  if (isSend && !input.payloadTemplate?.text?.trim()) {
    throw new QueueError('invalid', 'Un lote de envío necesita el texto del mensaje.');
  }
  if (input.variantSplit && isSend && !input.payloadTemplate?.textB?.trim()) {
    throw new QueueError('invalid', 'Un lote A/B necesita los dos textos (text y textB).');
  }
  let sendAt: Date | null = null;
  if (input.kind === 'schedule_message') {
    sendAt = input.payloadTemplate?.sendAt ? new Date(input.payloadTemplate.sendAt) : null;
    if (!sendAt || Number.isNaN(sendAt.getTime())) throw new QueueError('invalid', 'Un lote de mensajes programados necesita sendAt (fecha y hora de salida).');
    if (sendAt.getTime() < Date.now() + 5 * 60_000) throw new QueueError('invalid', 'sendAt tiene que ser al menos 5 minutos en el futuro.');
  }

  const settings = await getSalesOpsSettings(teamId);
  const cooldownMs = Math.max(1, settings.sendCooldownHours) * HOUR;
  const limit = Math.min(Math.max(input.filters?.limit ?? 500, 1), 2000);

  // Candidatos: siempre desde el análisis vigente. Un chat sin análisis no entra
  // (no se puede verificar automatización ni cliente).
  const conditions = [eq(teamCommercialAnalysis.teamId, teamId)];
  if (explicitChats.length) conditions.push(inArray(teamCommercialAnalysis.chatId, explicitChats));
  if (gates.length) conditions.push(inArray(teamCommercialAnalysis.currentGate, gates));
  if (input.filters?.status?.length) conditions.push(inArray(teamCommercialAnalysis.status, input.filters.status));
  if (input.filters?.owner) conditions.push(eq(teamCommercialAnalysis.recommendedOwner, input.filters.owner));

  const rows = await db
    .select({
      chatId: teamCommercialAnalysis.chatId,
      contactId: teamCommercialAnalysis.contactId,
      currentGate: teamCommercialAnalysis.currentGate,
      status: teamCommercialAnalysis.status,
      need: teamCommercialAnalysis.need,
      quotedPrice: teamCommercialAnalysis.quotedPrice,
      quotedCurrency: teamCommercialAnalysis.quotedCurrency,
      followupsTotal: teamCommercialAnalysis.followupsTotal,
      lastCustomerMessageAt: teamCommercialAnalysis.lastCustomerMessageAt,
      automationActive: teamCommercialAnalysis.automationActive,
      isExistingCustomer: teamCommercialAnalysis.isExistingCustomer,
      autoReplyDetected: teamCommercialAnalysis.autoReplyDetected,
      priorityScore: teamCommercialAnalysis.priorityScore,
      stale: teamCommercialAnalysis.stale,
      chatName: chats.name,
      pushName: chats.pushName,
      jid: chats.remoteJid,
      contactName: contacts.name,
    })
    .from(teamCommercialAnalysis)
    .innerJoin(chats, eq(chats.id, teamCommercialAnalysis.chatId))
    .leftJoin(contacts, eq(contacts.chatId, chats.id))
    .where(and(...conditions))
    .orderBy(desc(teamCommercialAnalysis.priorityScore), teamCommercialAnalysis.id)
    .limit(limit);

  const excluded: ExcludedChat[] = [];
  const found = new Set(rows.map((r) => r.chatId));
  if (explicitChats.length) {
    const missing = explicitChats.filter((id) => !found.has(id));
    if (missing.length) {
      const names = await namesForChats(teamId, missing);
      for (const id of missing) {
        excluded.push({ chatId: id, name: names.get(id) ?? `chat ${id}`, reason: names.has(id) ? 'sin_analisis' : 'chat_ajeno_o_inexistente' });
      }
    }
  }

  // Envíos previos: se traen por chat y se filtran en JS (nada de Date en SQL).
  const candidateIds = rows.map((r) => r.chatId);
  const priorSends = candidateIds.length
    ? await db
        .select({
          chatId: teamCommercialActions.chatId,
          status: teamCommercialActions.status,
          executedAt: teamCommercialActions.executedAt,
        })
        .from(teamCommercialActions)
        .where(
          and(
            eq(teamCommercialActions.teamId, teamId),
            inArray(teamCommercialActions.chatId, candidateIds),
            eq(teamCommercialActions.kind, 'send_message'),
            inArray(teamCommercialActions.status, ['approved', 'executing', 'executed', 'resulted']),
          ),
        )
    : [];
  const recentSend = new Set<number>();
  const openSend = new Set<number>();
  const now = new Date();
  for (const s of priorSends) {
    if (s.status === 'approved' || s.status === 'executing') openSend.add(s.chatId);
    else if (s.executedAt && now.getTime() - s.executedAt.getTime() < cooldownMs) recentSend.add(s.chatId);
  }

  const isBatch = rows.length > 1;
  const included: ProposedCandidate[] = [];
  for (const row of rows) {
    const name = displayName(row);
    const gate = (row.currentGate as Gate | null) ?? null;
    const reason = (() => {
      if (row.isExistingCustomer || row.status === 'cliente') return 'cliente';
      if (row.status === 'descarte_definitivo') return 'descarte_definitivo';
      if (input.kind !== 'mark_descarte' && gate === 'GX') return 'gate_gx';
      if (isSend) {
        if (row.automationActive) return 'automatizacion_activa';
        if (isBatch && row.autoReplyDetected) return 'auto_reply';
        if (recentSend.has(row.chatId)) return 'envio_reciente';
        if (openSend.has(row.chatId)) return 'envio_aprobado_pendiente';
      }
      const f = input.filters;
      if (f?.maxFollowups != null && row.followupsTotal > f.maxFollowups) return 'demasiados_impactos';
      if (f?.minDaysSilent != null) {
        const silent = daysBetween(row.lastCustomerMessageAt, now);
        if (silent != null && silent < f.minDaysSilent) return 'respondio_hace_poco';
      }
      return null;
    })();
    if (reason) {
      excluded.push({ chatId: row.chatId, name, reason });
      continue;
    }
    const warnings: string[] = [];
    if (row.stale) warnings.push('Análisis desactualizado.');
    if (!isSend && row.automationActive) warnings.push('Automatización activa.');
    if (!isSend && row.autoReplyDetected) warnings.push('Respuestas automáticas.');
    included.push({ chatId: row.chatId, contactId: row.contactId, name, gate, variant: null, text: null, warnings });
  }

  // Variante y texto final por contacto.
  const template = input.payloadTemplate ?? {};
  const rowByChat = new Map(rows.map((r) => [r.chatId, r]));
  included.forEach((candidate, index) => {
    const row = rowByChat.get(candidate.chatId)!;
    const variant: 'A' | 'B' | null = input.variantSplit ? (index % 2 === 0 ? 'A' : 'B') : input.experimentId ? 'A' : null;
    candidate.variant = variant;
    const raw = variant === 'B' ? template.textB : template.text;
    candidate.text = raw
      ? resolveTemplate(raw, { name: candidate.name, need: (row.need as Need) ?? null, quotedPrice: row.quotedPrice, quotedCurrency: row.quotedCurrency })
      : null;
    // Una variable que resuelve vacía deja un hueco en el mensaje: se avisa en la revisión.
    if (raw && /\{\{\s*precio\s*\}\}/i.test(raw) && row.quotedPrice == null) candidate.warnings.push('El texto usa {{precio}} y no hay precio conocido.');
    if (raw && /\{\{\s*plan\s*\}\}/i.test(raw) && (!row.need || row.need === 'indefinida')) candidate.warnings.push('El texto usa {{plan}} y la necesidad es indefinida.');
  });

  if (input.dryRun) {
    return { batchId: null, label: input.label.trim(), kind: input.kind, experimentId: input.experimentId ?? null, included, excluded, dryRun: true };
  }
  if (!included.length) {
    return { batchId: null, label: input.label.trim(), kind: input.kind, experimentId: input.experimentId ?? null, included, excluded, dryRun: false };
  }

  // Experimento: si se pidió A/B sin uno existente, se crea con los dos textos.
  let experimentId = input.experimentId ?? null;
  if (experimentId) {
    const exists = await db.query.teamCommercialExperiments.findFirst({
      where: and(eq(teamCommercialExperiments.id, experimentId), eq(teamCommercialExperiments.teamId, teamId)),
      columns: { id: true },
    });
    if (!exists) throw new QueueError('not_found', `El experimento ${experimentId} no existe en este equipo.`);
  } else if (input.variantSplit) {
    const [created] = await db
      .insert(teamCommercialExperiments)
      .values({
        teamId,
        name: input.label.trim().slice(0, 160),
        hypothesis: null,
        segmentGates: gates,
        messageA: template.text ?? null,
        messageB: template.textB ?? null,
        status: 'running',
        startedAt: now,
        createdBy: typeof input.proposedBy === 'number' ? input.proposedBy : null,
      })
      .returning({ id: teamCommercialExperiments.id });
    experimentId = created.id;
  }

  const batchId = newBatchId(now);
  const expiresAt = new Date(now.getTime() + PROPOSAL_TTL_DAYS * DAY);
  const proposedBy = String(input.proposedBy).slice(0, 24);
  const dueAt = template.dueInDays != null ? new Date(now.getTime() + template.dueInDays * DAY).toISOString().slice(0, 10) : null;

  await db.insert(teamCommercialActions).values(
    included.map((candidate) => ({
      teamId,
      chatId: candidate.chatId,
      contactId: candidate.contactId,
      batchId,
      batchLabel: input.label.trim().slice(0, 120),
      experimentId,
      variant: candidate.variant,
      kind: input.kind,
      payload: {
        // `extra` va aplanado (así lo leían las listas) Y anidado: el ejecutor
        // lee `payload.extra.owner|at|amount…` y hasta acá nunca existía.
        ...(template.extra ?? {}),
        ...(template.extra && Object.keys(template.extra).length ? { extra: template.extra } : {}),
        ...(candidate.text != null ? { text: candidate.text } : {}),
        ...(template.taskTitle ? { taskTitle: resolveTemplate(template.taskTitle, { name: candidate.name, need: null, quotedPrice: null, quotedCurrency: null }) } : {}),
        ...(dueAt ? { dueAt } : {}),
        ...(sendAt ? { sendAt: sendAt.toISOString() } : {}),
        ...(candidate.warnings.length ? { warningsAtProposal: candidate.warnings } : {}),
      },
      scheduledFor: sendAt,
      gateAtCreation: candidate.gate,
      status: 'proposed' as const,
      requiresRole: input.requiresRole,
      proposedBy,
      expiresAt,
    })),
  );

  if (experimentId) {
    await db
      .insert(teamCommercialExperimentMembers)
      .values(
        included.map((candidate) => ({
          teamId,
          experimentId: experimentId!,
          chatId: candidate.chatId,
          variant: candidate.variant ?? 'A',
          eligibleAt: now,
        })),
      )
      .onConflictDoNothing();
  }

  await audit(
    teamId,
    'PROPOSED',
    { batchId, count: included.length, excluded: excluded.length, kind: input.kind, experimentId, userId: typeof input.proposedBy === 'number' ? input.proposedBy : null },
    typeof input.proposedBy === 'number' ? input.proposedBy : null,
  );

  return { batchId, label: input.label.trim(), kind: input.kind, experimentId, included, excluded, dryRun: false };
}

// ── Listar ───────────────────────────────────────────────────────────────────

function summarize(actions: ActionRecord[], responded: number, recovered: number): BatchSummary {
  const first = actions[0];
  const byStatus: Partial<Record<ActionStatus, number>> = {};
  let createdAt = first.createdAt;
  let lastActivityAt = first.createdAt;
  let approvedBy: number | null = null;
  for (const a of actions) {
    byStatus[a.status as ActionStatus] = (byStatus[a.status as ActionStatus] ?? 0) + 1;
    if (a.createdAt < createdAt) createdAt = a.createdAt;
    for (const t of [a.updatedAt, a.executedAt, a.approvedAt]) if (t && t > lastActivityAt) lastActivityAt = t;
    if (a.approvedBy != null) approvedBy = a.approvedBy;
  }
  return {
    batchId: first.batchId,
    batchLabel: first.batchLabel,
    kind: first.kind as ActionKind,
    requiresRole: first.requiresRole as ActionRole,
    experimentId: first.experimentId,
    total: actions.length,
    byStatus,
    createdAt: createdAt.toISOString(),
    lastActivityAt: lastActivityAt.toISOString(),
    approvedBy,
    responded,
    recovered,
  };
}

/** Respondieron (señales atadas a acciones del lote) y recuperados (status del análisis) por lote. */
async function outcomesFor(teamId: number, actions: ActionRecord[]): Promise<{ responded: Map<string, number>; recovered: Map<string, number> }> {
  const responded = new Map<string, number>();
  const recovered = new Map<string, number>();
  if (!actions.length) return { responded, recovered };
  const batchByAction = new Map(actions.map((a) => [a.id, a.batchId]));
  const actionIds = actions.map((a) => a.id);
  const chatIds = [...new Set(actions.map((a) => a.chatId))];
  const [signals, analyses] = await Promise.all([
    db
      .select({ actionId: teamCommercialSignals.triggeredByActionId, chatId: teamCommercialSignals.chatId, kind: teamCommercialSignals.kind })
      .from(teamCommercialSignals)
      .where(and(eq(teamCommercialSignals.teamId, teamId), inArray(teamCommercialSignals.triggeredByActionId, actionIds))),
    db
      .select({ chatId: teamCommercialAnalysis.chatId, status: teamCommercialAnalysis.status })
      .from(teamCommercialAnalysis)
      .where(and(eq(teamCommercialAnalysis.teamId, teamId), inArray(teamCommercialAnalysis.chatId, chatIds))),
  ]);
  const seen = new Set<string>();
  for (const s of signals) {
    if (s.actionId == null || s.kind === 'respuesta_automatica' || s.kind === 'irrelevante') continue;
    const batchId = batchByAction.get(s.actionId);
    if (!batchId) continue;
    const key = `${batchId}:${s.chatId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    responded.set(batchId, (responded.get(batchId) ?? 0) + 1);
  }
  const statusByChat = new Map(analyses.map((a) => [a.chatId, a.status]));
  const seenRecovered = new Set<string>();
  for (const a of actions) {
    if (a.status !== 'executed' && a.status !== 'resulted') continue;
    const status = statusByChat.get(a.chatId);
    if (status !== 'recuperado' && status !== 'cobro' && status !== 'cliente') continue;
    const key = `${a.batchId}:${a.chatId}`;
    if (seenRecovered.has(key)) continue;
    seenRecovered.add(key);
    recovered.set(a.batchId, (recovered.get(a.batchId) ?? 0) + 1);
  }
  return { responded, recovered };
}

export async function listBatches(teamId: number, options: { status?: ActionStatus; limit?: number } = {}): Promise<BatchSummary[]> {
  const actions = await db
    .select()
    .from(teamCommercialActions)
    .where(eq(teamCommercialActions.teamId, teamId))
    .orderBy(desc(teamCommercialActions.createdAt), desc(teamCommercialActions.id));
  const groups = new Map<string, ActionRecord[]>();
  for (const a of actions) {
    const list = groups.get(a.batchId);
    if (list) list.push(a);
    else groups.set(a.batchId, [a]);
  }
  const { responded, recovered } = await outcomesFor(teamId, actions);
  const summaries: BatchSummary[] = [];
  for (const [batchId, list] of groups) {
    const summary = summarize(list, responded.get(batchId) ?? 0, recovered.get(batchId) ?? 0);
    if (options.status && !(summary.byStatus[options.status] ?? 0)) continue;
    summaries.push(summary);
  }
  summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return summaries.slice(0, Math.min(Math.max(options.limit ?? 200, 1), 1000));
}

async function batchActions(teamId: number, batchId: string): Promise<ActionRecord[]> {
  return db
    .select()
    .from(teamCommercialActions)
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.batchId, batchId)))
    .orderBy(teamCommercialActions.id);
}

export async function getBatch(teamId: number, batchId: string): Promise<QueueBatchPayload> {
  const actions = await batchActions(teamId, batchId);
  if (!actions.length) throw new QueueError('not_found', `El lote ${batchId} no existe en este equipo.`);
  const settings = await getSalesOpsSettings(teamId);
  const [names, warnings, outcomes] = await Promise.all([
    namesForChats(teamId, [...new Set(actions.map((a) => a.chatId))]),
    warningsFor(teamId, actions, settings.sendCooldownHours),
    outcomesFor(teamId, actions),
  ]);
  return {
    batch: summarize(actions, outcomes.responded.get(batchId) ?? 0, outcomes.recovered.get(batchId) ?? 0),
    actions: actions.map((a) => toActionRow(a, names.get(a.chatId) ?? `chat ${a.chatId}`, warnings.get(a.id) ?? [])),
  };
}

export async function actionsForChat(teamId: number, chatId: number): Promise<ActionRow[]> {
  const actions = await db
    .select()
    .from(teamCommercialActions)
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.chatId, chatId)))
    .orderBy(desc(teamCommercialActions.createdAt), desc(teamCommercialActions.id));
  if (!actions.length) return [];
  const settings = await getSalesOpsSettings(teamId);
  const [names, warnings] = await Promise.all([namesForChats(teamId, [chatId]), warningsFor(teamId, actions, settings.sendCooldownHours)]);
  const name = names.get(chatId) ?? `chat ${chatId}`;
  return actions.map((a) => toActionRow(a, name, warnings.get(a.id) ?? []));
}

// ── Aprobar / rechazar ───────────────────────────────────────────────────────

/**
 * Rol de aprobación. No hay tabla de roles Noelia/Carlos: se resuelve por el
 * nombre del usuario; owner/admin del equipo aprueban cualquier lote.
 */
async function assertRole(teamId: number, userId: number, requiresRole: ActionRole): Promise<void> {
  const [member] = await db
    .select({ role: teamMembers.role, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  if (!member) throw new QueueError('forbidden', 'El usuario no pertenece a este equipo.');
  if (member.role === 'owner' || member.role === 'admin') return;
  if (requiresRole === 'any') return;
  const name = (member.name ?? '').toLowerCase();
  if (!name.includes(requiresRole)) {
    throw new QueueError('forbidden', `Este lote requiere aprobación de ${requiresRole === 'noelia' ? 'Noelia' : 'Carlos'}.`, { requiresRole });
  }
}

function isUniqueSendViolation(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string; message?: string; cause?: { code?: string; constraint?: string; message?: string } };
  const source = e?.cause ?? e;
  return source?.code === '23505' || String(source?.message ?? e?.message ?? '').includes('team_commercial_actions_one_send_idx');
}

/** Chats del lote que ya tienen otro envío approved/executing (en otro lote). */
async function conflictingSends(teamId: number, batchId: string, chatIds: number[]) {
  if (!chatIds.length) return [];
  const rows = await db
    .select({ id: teamCommercialActions.id, chatId: teamCommercialActions.chatId, batchId: teamCommercialActions.batchId, batchLabel: teamCommercialActions.batchLabel })
    .from(teamCommercialActions)
    .where(
      and(
        eq(teamCommercialActions.teamId, teamId),
        inArray(teamCommercialActions.chatId, chatIds),
        eq(teamCommercialActions.kind, 'send_message'),
        inArray(teamCommercialActions.status, ['approved', 'executing']),
      ),
    );
  return rows.filter((r) => r.batchId !== batchId);
}

export async function approveBatch(
  teamId: number,
  userId: number,
  batchId: string,
  options: { excludeActionIds?: number[] } = {},
): Promise<ApproveResult> {
  const actions = await batchActions(teamId, batchId);
  if (!actions.length) throw new QueueError('not_found', `El lote ${batchId} no existe en este equipo.`);
  await assertRole(teamId, userId, actions[0].requiresRole as ActionRole);

  const exclude = new Set(options.excludeActionIds ?? []);
  const pending = actions.filter((a) => a.status === 'proposed' || a.status === 'pending_approval');
  if (!pending.length) throw new QueueError('invalid', 'El lote no tiene filas pendientes de aprobación.');
  const toApprove = pending.filter((a) => !exclude.has(a.id));
  const toReject = pending.filter((a) => exclude.has(a.id));
  const now = new Date();

  // Pre-chequeo con mensaje claro; el índice parcial es la red de seguridad.
  if (actions[0].kind === 'send_message' && toApprove.length) {
    const conflicts = await conflictingSends(teamId, batchId, toApprove.map((a) => a.chatId));
    if (conflicts.length) {
      const names = await namesForChats(teamId, conflicts.map((c) => c.chatId));
      const blocked = conflicts.map((c) => ({ chatId: c.chatId, name: names.get(c.chatId) ?? `chat ${c.chatId}`, actionId: c.id, batchId: c.batchId, batchLabel: c.batchLabel }));
      throw new QueueError(
        'conflict',
        `No se aprobó nada: ${blocked.map((b) => `${b.name} (chat ${b.chatId}) ya tiene un envío aprobado en "${b.batchLabel}"`).join('; ')}. Sacalos del lote o rechazá el otro.`,
        { blockedChats: blocked },
      );
    }
  }

  try {
    await db.transaction(async (tx) => {
      if (toApprove.length) {
        await tx
          .update(teamCommercialActions)
          .set({ status: 'approved', approvedBy: userId, approvedAt: now, updatedAt: now })
          .where(and(eq(teamCommercialActions.teamId, teamId), inArray(teamCommercialActions.id, toApprove.map((a) => a.id))));
      }
      if (toReject.length) {
        await tx
          .update(teamCommercialActions)
          .set({ status: 'rejected', result: { reason: 'excluded_at_approval', by: userId }, updatedAt: now })
          .where(and(eq(teamCommercialActions.teamId, teamId), inArray(teamCommercialActions.id, toReject.map((a) => a.id))));
      }
    });
  } catch (error) {
    if (!isUniqueSendViolation(error)) throw error;
    // Carrera: alguien aprobó otro lote con el mismo chat entre el pre-chequeo y el UPDATE.
    const conflicts = await conflictingSends(teamId, batchId, toApprove.map((a) => a.chatId));
    const names = await namesForChats(teamId, conflicts.map((c) => c.chatId));
    const blocked = conflicts.map((c) => ({ chatId: c.chatId, name: names.get(c.chatId) ?? `chat ${c.chatId}`, actionId: c.id, batchId: c.batchId, batchLabel: c.batchLabel }));
    throw new QueueError(
      'conflict',
      blocked.length
        ? `No se aprobó nada: ${blocked.map((b) => `${b.name} (chat ${b.chatId}) ya tiene un envío aprobado en "${b.batchLabel}"`).join('; ')}.`
        : 'No se aprobó nada: un chat del lote ya tiene otro envío aprobado (índice único).',
      { blockedChats: blocked },
    );
  }

  await audit(teamId, 'APPROVED', { batchId, count: toApprove.length, rejected: toReject.length, userId }, userId);
  return { batchId, kind: actions[0].kind as ActionKind, approved: toApprove.length, rejected: toReject.length, approvedBy: userId, approvedIds: toApprove.map((a) => a.id) };
}

export async function rejectBatch(teamId: number, userId: number, batchId: string, reason?: string): Promise<{ batchId: string; rejected: number }> {
  const actions = await batchActions(teamId, batchId);
  if (!actions.length) throw new QueueError('not_found', `El lote ${batchId} no existe en este equipo.`);
  const targets = actions.filter((a) => a.status === 'proposed' || a.status === 'pending_approval' || a.status === 'approved');
  if (!targets.length) return { batchId, rejected: 0 };
  const now = new Date();
  await db
    .update(teamCommercialActions)
    .set({ status: 'rejected', result: { reason: reason?.slice(0, 300) || 'rejected', by: userId }, updatedAt: now })
    .where(and(eq(teamCommercialActions.teamId, teamId), inArray(teamCommercialActions.id, targets.map((a) => a.id))));
  await audit(teamId, 'REJECTED', { batchId, count: targets.length, userId, reason: reason ?? null }, userId);
  return { batchId, rejected: targets.length };
}

/** Sólo se edita antes de aprobar: aprobar es firmar un texto concreto. */
const EDITABLE_STATUSES = ['proposed', 'pending_approval'];

/**
 * Corrige el texto (o el título de tarea) de una fila propuesta.
 *
 * Revisar un lote era todo o nada: si un mensaje de veinte tenía una palabra
 * mal, había que excluir ese contacto y armar otro lote para él. Se corta en
 * `approved` a propósito: si después de aprobar se pudiera editar, la firma no
 * querría decir nada.
 */
export async function editAction(
  teamId: number,
  userId: number,
  actionId: number,
  patch: { text?: string; taskTitle?: string },
): Promise<{ actionId: number; batchId: string; chatId: number; payload: Record<string, unknown> }> {
  const [existing] = await db
    .select()
    .from(teamCommercialActions)
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.id, actionId)))
    .limit(1);
  if (!existing) throw new QueueError('not_found', 'La acción no existe en este equipo.');
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    throw new QueueError('invalid', `Ya está ${existing.status}: sólo se edita antes de aprobar.`);
  }
  if (patch.text === undefined && patch.taskTitle === undefined) throw new QueueError('invalid', 'No hay nada que cambiar: pasá text o task_title.');
  const payload = { ...((existing.payload ?? {}) as Record<string, unknown>) };
  if (patch.text !== undefined) payload.text = patch.text;
  if (patch.taskTitle !== undefined) payload.taskTitle = patch.taskTitle;
  await db
    .update(teamCommercialActions)
    .set({ payload, updatedAt: new Date() })
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.id, actionId)));
  await audit(teamId, 'EDITED', { actionId, chatId: existing.chatId, batchId: existing.batchId, fields: Object.keys(patch) }, userId);
  return { actionId, batchId: existing.batchId, chatId: existing.chatId, payload };
}

/**
 * Saca un contacto del lote: la fila pasa a `rejected` en el momento, sin
 * esperar a la aprobación.
 *
 * Antes la única forma era destildarlo y aprobar el resto: hasta ese clic el
 * contacto seguía contando como parte del lote, y en un lote ya aprobado no
 * había manera de sacar a uno solo sin rechazar todo. Se puede quitar mientras
 * no haya salido nada (`proposed`, `pending_approval` o `approved`); lo
 * ejecutado no se toca porque ya le llegó al cliente.
 */
export async function removeFromBatch(teamId: number, userId: number, actionId: number): Promise<{ actionId: number; batchId: string; chatId: number }> {
  const [action] = await db
    .select()
    .from(teamCommercialActions)
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.id, actionId)))
    .limit(1);
  if (!action) throw new QueueError('not_found', 'La acción no existe en este equipo.');
  if (!['proposed', 'pending_approval', 'approved'].includes(action.status)) {
    throw new QueueError('invalid', `Ya está ${action.status}: sólo se puede quitar antes de ejecutar.`);
  }
  if (action.status === 'approved') await assertRole(teamId, userId, action.requiresRole as ActionRole);
  const now = new Date();
  await db
    .update(teamCommercialActions)
    .set({ status: 'rejected', result: { reason: 'removed_from_batch', by: userId }, updatedAt: now })
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.id, actionId)));
  await audit(teamId, 'REMOVED', { batchId: action.batchId, actionId, chatId: action.chatId, previousStatus: action.status, userId }, userId);
  return { actionId, batchId: action.batchId, chatId: action.chatId };
}

/**
 * Elimina un lote por completo. Sólo si ya no tiene nada vivo ni nada que haya
 * salido: un lote con filas ejecutadas es historial de lo que le llegó al
 * cliente y no se borra. Es la salida de "Descartados" cuando el rastro ya no
 * sirve para nada.
 */
export async function deleteBatch(teamId: number, userId: number, batchId: string): Promise<{ batchId: string; deleted: number }> {
  const actions = await batchActions(teamId, batchId);
  if (!actions.length) throw new QueueError('not_found', `El lote ${batchId} no existe en este equipo.`);
  const vivo = actions.find((a) => ['proposed', 'pending_approval', 'approved', 'executing'].includes(a.status));
  if (vivo) throw new QueueError('invalid', 'El lote todavía tiene filas vivas: descartalo primero.');
  const salido = actions.find((a) => ['executed', 'resulted'].includes(a.status));
  if (salido) throw new QueueError('invalid', 'El lote tiene envíos que ya salieron: se conserva como historial.');
  const rows = await db
    .delete(teamCommercialActions)
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.batchId, batchId)))
    .returning({ id: teamCommercialActions.id });
  await audit(teamId, 'DELETED', { batchId, count: rows.length, label: actions[0].batchLabel, userId }, userId);
  return { batchId, deleted: rows.length };
}

// ── Expirar / cancelar ───────────────────────────────────────────────────────

/** Propuestas vencidas (expires_at pasado) → expired. La comparación la hace Postgres con now(). */
export async function expireStale(teamId: number): Promise<{ expired: number; batches: string[] }> {
  const rows = await db
    .update(teamCommercialActions)
    .set({ status: 'expired', result: { reason: 'ttl' }, updatedAt: new Date() })
    .where(
      and(
        eq(teamCommercialActions.teamId, teamId),
        inArray(teamCommercialActions.status, ['proposed', 'pending_approval']),
        sql`${teamCommercialActions.expiresAt} IS NOT NULL AND ${teamCommercialActions.expiresAt} < now()`,
      ),
    )
    .returning({ batchId: teamCommercialActions.batchId });
  const batches = [...new Set(rows.map((r) => r.batchId))];
  if (rows.length) await audit(teamId, 'EXPIRED', { count: rows.length, batches });
  return { expired: rows.length, batches };
}

/**
 * Cancela lo propuesto/pendiente de un chat (p. ej. porque respondió). El radar
 * hace su propio UPDATE; esta función queda para la cola y los conectores.
 */
export async function cancelProposedForChat(teamId: number, chatId: number, reason: string): Promise<{ cancelled: number }> {
  const rows = await db
    .update(teamCommercialActions)
    .set({ status: 'expired', result: { reason: reason.slice(0, 120) }, updatedAt: new Date() })
    .where(
      and(
        eq(teamCommercialActions.teamId, teamId),
        eq(teamCommercialActions.chatId, chatId),
        inArray(teamCommercialActions.status, ['proposed', 'pending_approval']),
      ),
    )
    .returning({ id: teamCommercialActions.id, batchId: teamCommercialActions.batchId });
  if (rows.length) await audit(teamId, 'CANCELLED', { chatId, count: rows.length, reason, batches: [...new Set(rows.map((r) => r.batchId))] });
  return { cancelled: rows.length };
}

// ── Resultado ────────────────────────────────────────────────────────────────

/**
 * Lo reporta un humano (`manual`) o un conector (`connector`) después de ejecutar.
 * `executed`: salió; `failed`: no salió; `resulted`: ya hay desenlace (respuesta,
 * venta, tarea). Alimenta el experimento si la acción pertenece a uno.
 */
export async function markResult(teamId: number, actionId: number, input: MarkResultInput): Promise<ActionRow> {
  const [action] = await db
    .select()
    .from(teamCommercialActions)
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.id, actionId)))
    .limit(1);
  if (!action) throw new QueueError('not_found', `La acción ${actionId} no existe en este equipo.`);

  const allowedFrom: Record<MarkResultInput['status'], ActionStatus[]> = {
    executed: ['approved', 'executing', 'executed'],
    failed: ['approved', 'executing'],
    resulted: ['executed', 'resulted', 'approved', 'executing'],
  };
  if (!allowedFrom[input.status].includes(action.status as ActionStatus)) {
    throw new QueueError('invalid', `No se puede pasar de ${action.status} a ${input.status}. Aprobá el lote primero.`);
  }
  const now = new Date();
  const mergedResult = { ...(action.result ?? {}), ...(input.result ?? {}) };
  const patch: Partial<typeof teamCommercialActions.$inferInsert> = {
    status: input.status,
    result: mergedResult,
    updatedAt: now,
  };
  if (input.status === 'executed' || (input.status === 'resulted' && !action.executedAt)) {
    patch.executedAt = action.executedAt ?? now;
    patch.executedVia = input.executedVia ?? action.executedVia ?? 'manual';
  }
  if (input.resultMessageId) patch.resultMessageId = input.resultMessageId;
  if (input.status === 'failed') patch.executedVia = input.executedVia ?? action.executedVia ?? 'manual';

  const [updated] = await db
    .update(teamCommercialActions)
    .set(patch)
    .where(and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.id, actionId)))
    .returning();

  // Le salió algo: el análisis vigente ya no describe el chat (ahora tiene
  // nuestro mensaje encima). Se marca viejo para que el próximo pase del
  // clasificador lo vuelva a auditar y, si vuelve a merecer una acción, entre
  // solo en las listas y en un lote nuevo, pasado el enfriamiento.
  if (input.status === 'executed' || input.status === 'resulted') {
    await db
      .update(teamCommercialAnalysis)
      .set({ stale: true, updatedAt: now })
      .where(and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, action.chatId)));
  }

  if (action.experimentId && input.status !== 'failed') {
    const memberPatch: Partial<typeof teamCommercialExperimentMembers.$inferInsert> = {};
    const [member] = await db
      .select()
      .from(teamCommercialExperimentMembers)
      .where(and(eq(teamCommercialExperimentMembers.experimentId, action.experimentId), eq(teamCommercialExperimentMembers.chatId, action.chatId)))
      .limit(1);
    if (member) {
      if (!member.sentAt && updated.executedAt) memberPatch.sentAt = updated.executedAt;
      if (input.status === 'resulted') {
        if (mergedResult.respondedAt && !member.respondedAt) memberPatch.respondedAt = new Date(String(mergedResult.respondedAt));
        if (mergedResult.recoveredAt && !member.recoveredAt) memberPatch.recoveredAt = new Date(String(mergedResult.recoveredAt));
        if (mergedResult.saleId && !member.paidAt) memberPatch.paidAt = now;
      }
      if (Object.keys(memberPatch).length) {
        await db.update(teamCommercialExperimentMembers).set(memberPatch).where(eq(teamCommercialExperimentMembers.id, member.id));
      }
    }
  }

  await audit(
    teamId,
    'RESULT',
    { batchId: action.batchId, actionId, chatId: action.chatId, count: 1, status: input.status, executedVia: patch.executedVia ?? null, resultMessageId: input.resultMessageId ?? null, userId: input.userId ?? null },
    input.userId ?? null,
  );

  const names = await namesForChats(teamId, [action.chatId]);
  return toActionRow(updated, names.get(action.chatId) ?? `chat ${action.chatId}`, []);
}

export { ACTION_STATUSES };
