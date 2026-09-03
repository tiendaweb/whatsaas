import 'server-only';
import { condicionDeChatMarcado, jidsInternos } from '@/lib/chats/internos';

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  activityLogs,
  teamCommercialAnalysis,
  teamCommercialAnalysisVersions,
  type NewTeamCommercialAnalysis,
} from '@/lib/db/schema';
import { GoogleGenAI } from '@google/genai';
import { getAIProviderForConfig } from '@/lib/plugins/ai-chat/service';
import { aiConfigs } from '@/lib/db/schema';
import { analizarTextoConBanco } from '@/lib/gemini/key-bank';
import { encolarAudios } from '@/lib/audio-insights';
import { classificationSchema, type Classification, type Dossier, type RuleFacts } from '../shared/contract';
import {
  DEFAULT_SPEED_BY_GATE,
  NEED_VALUE_USD,
  gateRank,
  type AnalysisStatus,
  type AnalyzedBy,
  type CollectionSpeed,
  type CustomerEvidence,
  type DropReason,
  type Gate,
  type Objection,
  type Temperature,
  type VersionReason,
} from '../shared/taxonomy';
import { buildChatDossierFull, isExcludedChat, type DossierBuildResult } from './dossier';
import { computeFingerprint } from './fingerprint';
import { maskJid } from '@/lib/desktop/command-center/types';
import { computePriority, type PriorityFactors } from './priority';
import { SALES_OPS_PROMPT_KEYS, getActivePrompt, recordPromptRun, renderTemplate, type ActivePrompt } from './prompts';
import { getSalesOpsSettings } from './settings';

/**
 * Clasificador (doc 04 §7 post-proceso + doc 03 versionado).
 *
 * Tres motores, un solo post-proceso:
 *  - `server`: Gemini vía `generateStructuredObjectForTeam`; si falla, el banco
 *    de keys (`analizarTextoConBanco`); si tampoco, se guarda sólo lo
 *    determinístico con status `en_proceso`.
 *  - `connector`: el JSON lo trae Claude/ChatGPT/Grok por MCP. Se valida con
 *    el MISMO contrato Zod y pasa por la MISMA reconciliación: un conector no
 *    puede pisar R1 fuerte ni bajar de G9 con pago pendiente.
 *  - `rules`: sin IA, para el import y para crear la fila base de un override.
 *
 * Invariantes que no se aflojan:
 *  1. Nunca se escribe en el CRM. Sólo team_commercial_* y team_prompt_runs
 *     (y la cola de audios, que no es CRM).
 *  2. Cada clasificación deja una versión inmutable con snapshot + diff.
 *  3. Un override humano vigente (misma huella) conserva el gate.
 *  4. `descarte_definitivo` nunca se pone solo: queda `pre_descarte`.
 */

export type ClassifyEngine = 'server' | 'connector' | 'rules';

export type ClassifyOptions =
  | { engine: 'server'; userId?: number | null; dryRun?: boolean }
  | { engine: 'rules'; userId?: number | null; dryRun?: boolean; reason?: VersionReason }
  | {
      engine: 'connector';
      classification: unknown;
      connector: 'claude' | 'chatgpt' | 'grok';
      userId?: number | null;
      dryRun?: boolean;
      promptVersion?: number | null;
    };

export type ClassifyResult = {
  chatId: number;
  analysisId: number | null;
  version: number;
  reason: VersionReason;
  engine: ClassifyEngine;
  analyzedBy: AnalyzedBy;
  provider: string | null;
  model: string | null;
  promptRunId: number | null;
  gate: Gate | null;
  maxGate: Gate | null;
  status: AnalysisStatus;
  confidence: number;
  recoveryProbability: number;
  priorityScore: number;
  potentialValueUsd: number;
  humanOverrideKept: boolean;
  aiUsed: boolean;
  aiError: string | null;
  warnings: string[];
  diff: Record<string, { from: unknown; to: unknown }> | null;
  dryRun: boolean;
  facts: RuleFacts;
  row: Record<string, unknown>;
};

export class ClassificationInputError extends Error {}

// ── IA del servidor ───────────────────────────────────────────────────────

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const a = candidate.indexOf('{');
  const b = candidate.lastIndexOf('}');
  if (a === -1 || b <= a) throw new Error('La respuesta no contiene un objeto JSON.');
  return JSON.parse(candidate.slice(a, b + 1));
}

type AiOutcome = { classification: Classification | null; provider: string | null; model: string | null; error: string | null; raw: string | null };

/**
 * IA del servidor. No usa `generateStructuredObjectForTeam` a propósito: ese
 * helper instancia el proveedor con la config del bot de atención, y en Gemini
 * eso significa (a) los mensajes role=system se descartan y el modelo hereda la
 * persona del bot, y (b) maxOutputTokens=1000, que gemini-2.5-flash agota con
 * su propio razonamiento (7.000+ tokens de "thoughts" medidos) y devuelve el
 * JSON cortado. Acá se usa la MISMA key/modelo del equipo, pero con el prompt
 * del clasificador como systemInstruction, salida JSON, temperatura 0 y el
 * presupuesto de razonamiento acotado. Si eso falla, el banco de keys; si
 * tampoco, sin IA.
 */
const GEMINI_THINKING_BUDGET = 1024;
const GEMINI_MAX_OUTPUT = 6000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function callGeminiJson(apiKey: string, model: string, systemPrompt: string, userPrompt: string, attempt = 0): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  let response: Awaited<ReturnType<typeof client.models.generateContent>>;
  try {
    response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: { parts: [{ text: systemPrompt }], role: 'system' },
      temperature: 0,
      maxOutputTokens: GEMINI_MAX_OUTPUT,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET },
    },
  });
  } catch (error) {
    // 503 "high demand" y 429 son transitorios: un reintento con espera y después se cede al banco (el SDK ya reintenta por su cuenta y cada intento tarda ~1 min).
    const message = error instanceof Error ? error.message : String(error);
    if (attempt < 1 && /"code":(503|429)|UNAVAILABLE|RESOURCE_EXHAUSTED/.test(message)) {
      await sleep(3000);
      return callGeminiJson(apiKey, model, systemPrompt, userPrompt, attempt + 1);
    }
    throw error;
  }
  const finish = response.candidates?.[0]?.finishReason;
  const text = response.text ?? '';
  if (!text.trim()) throw new Error(`Gemini devolvió vacío (finishReason ${finish ?? '?'}).`);
  if (finish === 'MAX_TOKENS') throw new Error('Gemini cortó la salida por MAX_TOKENS.');
  return text;
}

async function runServerAi(teamId: number, systemPrompt: string, userPrompt: string): Promise<AiOutcome> {
  const errors: string[] = [];
  const jsonOnly = 'Respondé EXCLUSIVAMENTE con un objeto JSON válido, sin markdown ni texto alrededor.';
  try {
    const config = await db.query.aiConfigs.findFirst({ where: eq(aiConfigs.teamId, teamId) });
    if (!config) throw new Error('El equipo no tiene proveedor IA configurado.');
    let raw: string;
    if (config.provider === 'gemini') {
      raw = await callGeminiJson(config.apiKey, config.model, `${systemPrompt}\n\n${jsonOnly}`, userPrompt);
    } else {
      const provider = await getAIProviderForConfig({ ...config, systemPrompt: `${systemPrompt}\n\n${jsonOnly}`, temperature: '0', maxOutputTokens: GEMINI_MAX_OUTPUT, attachments: [] });
      const response = await provider.generateResponse([{ role: 'user', content: `${userPrompt}\n\n${jsonOnly}` }]);
      raw = response.content ?? '';
    }
    const parsed = classificationSchema.safeParse(extractJson(raw));
    if (parsed.success) return { classification: parsed.data, provider: config.provider, model: config.model, error: null, raw };
    errors.push(`proveedor del equipo: la salida no cumple el contrato (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message})`);
  } catch (error) {
    errors.push(`proveedor del equipo: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const banco = await analizarTextoConBanco({ teamId, prompt: `${systemPrompt}\n\n${jsonOnly}\n\n${userPrompt}` });
    if (!banco.ok) {
      errors.push(`banco de keys: ${banco.error}`);
    } else {
      const parsed = classificationSchema.safeParse(extractJson(banco.texto));
      if (parsed.success) return { classification: parsed.data, provider: 'gemini-bank', model: banco.modelo, error: null, raw: banco.texto };
      errors.push(`banco de keys: la salida no cumple el contrato (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message})`);
    }
  } catch (error) {
    errors.push(`banco de keys: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { classification: null, provider: null, model: null, error: errors.join(' · '), raw: null };
}

// ── Reconciliación ────────────────────────────────────────────────────────

const maxGate = (a: Gate, b: Gate): Gate => (gateRank(a) >= gateRank(b) ? a : b);

function temperatureFor(daysSilent: number | null): Temperature {
  if (daysSilent == null) return 'cold';
  if (daysSilent < 3) return 'hot';
  if (daysSilent < 21) return 'warm';
  return 'cold';
}

function statusByGate(gate: Gate | null, nextActionAt: string | null): AnalysisStatus {
  if (gate === 'G11') return 'cliente';
  if (gate === 'G9' || gate === 'G10') return 'cobro';
  if (gate === 'GX') return 'pre_descarte';
  if (nextActionAt) return 'pendiente_con_fecha';
  return 'en_proceso';
}

function usdFromQuoted(quoted: Classification['quoted_price'], fx: { ARS: number; PYG: number }): number | null {
  if (!quoted || !quoted.amount) return null;
  const rate = quoted.currency === 'USD' ? 1 : quoted.currency === 'ARS' ? fx.ARS : fx.PYG;
  if (!rate || rate <= 0) return null;
  return Math.round(quoted.amount / rate);
}

const toDate = (iso: string | null | undefined) => (iso ? new Date(iso) : null);

type ReconcileInput = {
  built: DossierBuildResult;
  classification: Classification | null;
  fx: { ARS: number; PYG: number };
  existing: ExistingRow | null;
  now: Date;
};

type Reconciled = {
  values: Omit<NewTeamCommercialAnalysis, 'teamId' | 'chatId' | 'version' | 'analyzedAt' | 'analyzedBy' | 'provider' | 'model' | 'priorRadar' | 'createdAt' | 'updatedAt'>;
  factors: PriorityFactors;
  warnings: string[];
  humanOverrideKept: boolean;
};

function reconcile(input: ReconcileInput): Reconciled {
  const { built, classification: c, fx, existing, now } = input;
  const facts = built.dossier.facts;
  const warnings: string[] = [];
  const humanOverrideKept = !!existing && existing.analyzedBy === 'human' && existing.fingerprint === built.dossier.fingerprint;

  // Gate.
  let gate: Gate | null = c?.current_gate ?? null;
  let dropReason: DropReason | null = c?.drop_reason ?? null;
  let statusReason: string | null = null;
  let customerEvidence: CustomerEvidence = facts.customer_evidence;
  let isExistingCustomer = facts.is_existing_customer;

  if (facts.forced_gate) {
    if (gate && gate !== facts.forced_gate) warnings.push(`La IA dijo ${gate}; ${facts.forced_reason} fuerza ${facts.forced_gate}.`);
    gate = facts.forced_gate;
    statusReason = facts.forced_reason;
    if (facts.forced_gate === 'G11') dropReason = 'ganado';
    else if (facts.forced_gate === 'G0') dropReason = 'sin_respuesta';
    else if (facts.forced_gate === 'GX') {
      dropReason = /n[uú]mero/i.test(facts.forced_reason ?? '') ? 'numero_incorrecto' : /no contactar/i.test(facts.forced_reason ?? '') ? 'no_contactar' : 'rechazo_explicito';
    }
  } else if (c && !facts.is_existing_customer && c.is_existing_customer_by_chat) {
    // Evidencia débil (o ninguna) + el chat confirma: manda el chat.
    isExistingCustomer = true;
    if (customerEvidence === 'none') customerEvidence = 'chat';
    gate = 'G11';
    dropReason = 'ganado';
    statusReason = `Cliente según el chat (evidencia CRM: ${facts.customer_evidence}).`;
  } else if (c && facts.customer_evidence !== 'none' && !facts.is_existing_customer && !c.is_existing_customer_by_chat) {
    warnings.push(`El CRM sugiere cliente (${facts.customer_evidence}) pero el chat no lo confirma.`);
  }

  if (!facts.forced_gate && facts.min_gate && gate && gate !== 'GX' && gate !== 'G11' && gateRank(gate) < gateRank(facts.min_gate)) {
    warnings.push(`Pago pendiente (R5): gate ${gate} sube a ${facts.min_gate}.`);
    gate = facts.min_gate;
    dropReason = 'pago_no_concretado';
  }
  if (!c && !gate) gate = facts.min_gate ?? (existing?.currentGate as Gate | null) ?? null;

  // R11: override humano vigente conserva el gate.
  if (humanOverrideKept && existing?.currentGate) {
    if (gate !== existing.currentGate) warnings.push(`Override humano vigente: se conserva ${existing.currentGate} (la IA dijo ${gate ?? '—'}).`);
    gate = existing.currentGate as Gate;
    dropReason = (existing.dropReason as DropReason | null) ?? dropReason;
  }

  const currentMax: Gate | null = gate ? (c ? maxGate(c.max_gate, gate) : gate) : null;
  const dropGate: Gate | null = gate === 'G11' ? c?.drop_gate ?? (existing?.dropGate as Gate | null) ?? gate : gate;

  // Revisión: confianza baja o sin evidencia (salvo gate forzado por reglas).
  const confidence = c ? c.confidence : facts.forced_gate ? 60 : 0;
  const needsReview = !c || confidence < 55 || (!facts.forced_gate && (c.evidence.gate?.length ?? 0) === 0);
  if (c && needsReview) warnings.push(confidence < 55 ? 'Confianza < 55: a revisar.' : 'La IA no citó evidencia del gate: a revisar.');

  // Estado.
  const nextActionAt = c?.next_action_at ?? null;
  let status: AnalysisStatus = c?.suggested_status ?? statusByGate(gate, nextActionAt);
  if (status === 'descarte_definitivo') {
    status = 'pre_descarte';
    warnings.push('El descarte definitivo lo aprueba una persona: queda pre_descarte.');
  }
  if (gate === 'G11' && (facts.is_existing_customer || isExistingCustomer)) status = 'cliente';
  if (gate === 'GX') status = 'pre_descarte';
  if (needsReview && status !== 'cliente') status = 'en_proceso';
  if (humanOverrideKept && existing?.status) status = existing.status as AnalysisStatus;
  if (!statusReason) statusReason = needsReview ? (c ? 'Revisar: confianza baja o sin evidencia citada' : 'Sin IA disponible: sólo reglas') : null;

  // Valor, velocidad, prioridad.
  const need = c?.need ?? 'indefinida';
  const quotedUsd = usdFromQuoted(c?.quoted_price ?? null, fx);
  const potentialValueUsd = quotedUsd ?? NEED_VALUE_USD[need] ?? 45;
  const collectionSpeed: CollectionSpeed = c?.collection_speed ?? (gate ? DEFAULT_SPEED_BY_GATE[gate] : 'indefinida');
  const objection = c?.objection_type ?? 'ninguna';
  const daysSilent = facts.days_silent ?? (facts.first_contact_at ? Math.floor((now.getTime() - new Date(facts.first_contact_at).getTime()) / 86_400_000) : null);
  const priority = computePriority({
    gate: gate ?? 'G0',
    daysSilent,
    followupsTotal: facts.followups_total,
    objection,
    collectionSpeed,
    potentialValueUsd,
    evidenceGap: facts.evidence_gap,
    autoReply: facts.auto_reply_detected,
    confidence,
  });

  const source = facts.source !== 'desconocido' ? facts.source : c?.source ?? facts.source;

  const values: Reconciled['values'] = {
    contactId: built.dossier.chat.contactId,
    fingerprint: built.dossier.fingerprint,
    stale: false,
    firstContactAt: toDate(facts.first_contact_at),
    lastCustomerMessageAt: toDate(facts.last_customer_message_at),
    lastTeamMessageAt: toDate(facts.last_team_message_at),
    lastHumanMessageAt: toDate(facts.last_human_message_at),
    source,
    sourceDetail: facts.source_detail?.slice(0, 120) ?? null,
    currentGate: gate,
    maxGate: currentMax,
    dropGate,
    dropReason,
    confidence,
    evidence: c ? Object.fromEntries(Object.entries(c.evidence).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v as string[]])) : {},
    businessType: c?.business_type?.slice(0, 120) ?? null,
    need,
    needDetail: c?.need_detail?.slice(0, 300) ?? null,
    quotedPrice: c?.quoted_price?.amount ?? null,
    quotedCurrency: c?.quoted_price?.currency ?? null,
    proposalSummary: c?.proposal_summary?.slice(0, 600) ?? null,
    objectionType: objection,
    objectionDetail: c?.objection_detail?.slice(0, 300) ?? null,
    intent: c?.intent ?? 'ninguna',
    intentScore: c?.intent_score ?? 0,
    temperature: c?.temperature ?? temperatureFor(facts.days_silent),
    recoveryProbability: priority.recoveryProbability,
    potentialValueUsd,
    collectionSpeed,
    priorityScore: priority.priorityScore,
    followupsTotal: facts.followups_total,
    followupsAutomated: facts.followups_automated,
    followupsManual: facts.followups_manual,
    lastFollowupAt: toDate(facts.last_followup_at),
    automationActive: facts.automation_active,
    isExistingCustomer,
    customerEvidence,
    paymentPending: facts.payment_pending || !!c?.payment_pending_by_chat,
    autoReplyDetected: facts.auto_reply_detected,
    evidenceGap: facts.evidence_gap,
    lastProspectAction: c?.last_prospect_action?.slice(0, 300) ?? null,
    lastTeamAction: c?.last_team_action?.slice(0, 300) ?? null,
    recommendedAction: c?.recommended_action?.slice(0, 400) ?? (facts.never_answered_by_us ? 'Responder — nunca se le contestó' : null),
    recommendedOwner: c?.recommended_owner ?? (facts.never_answered_by_us ? 'noelia' : 'nadie'),
    status,
    statusReason: statusReason?.slice(0, 300) ?? null,
    nextActionAt,
    notesForHuman: c?.notes_for_human ?? null,
    crmToFix: c?.crm_to_fix ?? null,
  };

  return { values, factors: priority.factors, warnings, humanOverrideKept };
}

// ── Versionado ────────────────────────────────────────────────────────────

type ExistingRow = typeof teamCommercialAnalysis.$inferSelect;

const SNAPSHOT_SKIP = new Set(['id', 'teamId', 'chatId', 'version', 'createdAt', 'updatedAt', 'analyzedAt', 'fingerprint', 'stale']);
const DIFF_SKIP = new Set([...SNAPSHOT_SKIP, 'priorityScore', 'recoveryProbability', 'provider', 'model', 'priorRadar']);

function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

export function snapshotOf(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SNAPSHOT_SKIP.has(k)) continue;
    out[k] = serialize(v);
  }
  return out;
}

export function diffRows(before: Record<string, unknown> | null, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> | null {
  if (!before) return null;
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (DIFF_SKIP.has(k)) continue;
    const a = JSON.stringify(serialize(before[k]));
    const b = JSON.stringify(serialize(v));
    if (a !== b) diff[k] = { from: serialize(before[k]), to: serialize(v) };
  }
  return diff;
}

async function loadExisting(teamId: number, chatId: number): Promise<ExistingRow | null> {
  const row = await db.query.teamCommercialAnalysis.findFirst({
    where: and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)),
  });
  return row ?? null;
}

type PersistInput = {
  teamId: number;
  chatId: number;
  existing: ExistingRow | null;
  values: Record<string, unknown>;
  reason: VersionReason;
  analyzedBy: AnalyzedBy;
  provider: string | null;
  model: string | null;
  promptRunId: number | null;
  createdBy: number | null;
  meta: Record<string, unknown>;
  now: Date;
};

async function persistVersion(input: PersistInput): Promise<{ analysisId: number; version: number; diff: Record<string, { from: unknown; to: unknown }> | null }> {
  const version = (input.existing?.version ?? 0) + 1;
  const rowValues = {
    ...input.values,
    teamId: input.teamId,
    chatId: input.chatId,
    version,
    analyzedAt: input.now,
    analyzedBy: input.analyzedBy,
    provider: input.provider,
    model: input.model,
    priorRadar: input.existing?.priorRadar ?? null,
    updatedAt: input.now,
  } as NewTeamCommercialAnalysis;

  return db.transaction(async (tx) => {
    let analysisId: number;
    if (input.existing) {
      analysisId = input.existing.id;
      await tx.update(teamCommercialAnalysis).set(rowValues).where(eq(teamCommercialAnalysis.id, analysisId));
    } else {
      const [inserted] = await tx.insert(teamCommercialAnalysis).values(rowValues).returning({ id: teamCommercialAnalysis.id });
      analysisId = inserted.id;
    }
    const snapshot = { ...snapshotOf(rowValues as Record<string, unknown>), version, fingerprint: input.values.fingerprint ?? null, _meta: input.meta };
    const diff = diffRows(input.existing ? snapshotOf(input.existing as unknown as Record<string, unknown>) : null, snapshotOf(rowValues as Record<string, unknown>));
    await tx.insert(teamCommercialAnalysisVersions).values({
      teamId: input.teamId,
      analysisId,
      chatId: input.chatId,
      version,
      reason: input.reason,
      promptRunId: input.promptRunId,
      snapshot,
      evidence: (input.values.evidence as Record<string, string[]>) ?? {},
      diff,
      analyzedBy: input.analyzedBy,
      createdBy: input.createdBy,
      createdAt: input.now,
    });
    return { analysisId, version, diff };
  });
}

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata });
  } catch (error) {
    console.error('[sales-ops] audit failed', error);
  }
}

// ── API ───────────────────────────────────────────────────────────────────

export async function classifyChat(teamId: number, chatId: number, opts: ClassifyOptions): Promise<ClassifyResult> {
  const now = new Date();
  const dryRun = !!opts.dryRun;
  const userId = opts.userId ?? null;

  // Conector: validar ANTES de leer nada, con mensaje claro.
  let connectorClassification: Classification | null = null;
  if (opts.engine === 'connector') {
    const parsed = classificationSchema.safeParse(opts.classification);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || 'raíz'}: ${i.message}`).join('; ');
      throw new ClassificationInputError(`La clasificación no cumple el contrato classificationSchema (${issues}).`);
    }
    connectorClassification = parsed.data;
  }

  const [built, settings, existing, prompt] = await Promise.all([
    buildChatDossierFull(teamId, chatId, { now }),
    getSalesOpsSettings(teamId),
    loadExisting(teamId, chatId),
    getActivePrompt(teamId, SALES_OPS_PROMPT_KEYS.classify),
  ]);
  const dossier = built.dossier;
  const facts = dossier.facts;

  const userPrompt = renderTemplate(prompt.userTemplate, {
    facts_json: JSON.stringify(facts),
    dossier_json: JSON.stringify({ chat: dossier.chat, contact: dossier.contact, commercial: dossier.commercial, counts: dossier.counts, omitted: dossier.omitted, timeline: dossier.timeline }),
  });

  let classification: Classification | null = connectorClassification;
  let ai: AiOutcome = { classification: null, provider: null, model: null, error: null, raw: null };
  let analyzedBy: AnalyzedBy = 'server';
  let connectorName: 'server' | 'claude' | 'chatgpt' | 'grok' = 'server';

  if (opts.engine === 'server') {
    // Con gate forzado por R1 fuerte / R2 / R3 igual se consulta la IA (rellena
    // necesidad y acción), pero si no hay IA el resultado sigue siendo útil.
    ai = await runServerAi(teamId, prompt.systemPrompt, userPrompt);
    classification = ai.classification;
  } else if (opts.engine === 'connector') {
    analyzedBy = opts.connector;
    connectorName = opts.connector;
  } else {
    analyzedBy = 'server';
  }

  const reconciled = reconcile({ built, classification, fx: settings.fx, existing, now });
  if (reconciled.humanOverrideKept) analyzedBy = 'human';
  if (ai.error) reconciled.warnings.push(`Sin IA: ${ai.error}`);

  let reason: VersionReason;
  if (opts.engine === 'rules' && opts.reason) reason = opts.reason;
  else if (!existing || existing.version === 0) reason = 'initial';
  else if (existing.fingerprint !== dossier.fingerprint) reason = 'chat_changed';
  else reason = 'prompt_changed';

  const meta = {
    engine: opts.engine,
    connector: connectorName,
    promptKey: prompt.key,
    promptVersion: opts.engine === 'connector' ? opts.promptVersion ?? prompt.version : prompt.version,
    promptSource: prompt.source,
    factors: reconciled.factors,
    warnings: reconciled.warnings,
    aiError: ai.error,
    forcedGate: facts.forced_gate,
    minGate: facts.min_gate,
  };

  let promptRunId: number | null = null;
  let analysisId: number | null = existing?.id ?? null;
  let version = existing?.version ?? 0;
  let diff: Record<string, { from: unknown; to: unknown }> | null = null;

  if (!dryRun) {
    if (opts.engine !== 'rules') {
      try {
        promptRunId = await recordPromptRun({
          teamId,
          prompt,
          targetKind: 'chat',
          targetId: chatId,
          connector: connectorName,
          status: classification ? 'completed' : 'failed',
          systemPrompt: prompt.systemPrompt,
          userPrompt,
          summary: classification ? `${reconciled.values.currentGate ?? '—'} · ${reconciled.values.recommendedAction ?? ''}`.slice(0, 500) : ai.error,
          metadata: { engine: opts.engine, provider: ai.provider, model: ai.model, gate: reconciled.values.currentGate, confidence: reconciled.values.confidence },
          createdBy: userId,
        });
      } catch (error) {
        console.error('[sales-ops] recordPromptRun failed', error);
      }
    }

    const persisted = await persistVersion({
      teamId,
      chatId,
      existing,
      values: reconciled.values as Record<string, unknown>,
      reason,
      analyzedBy,
      provider: ai.provider ?? (opts.engine === 'connector' ? opts.connector : null),
      model: ai.model,
      promptRunId,
      createdBy: userId,
      meta: { ...meta, promptRunId },
      now,
    });
    analysisId = persisted.analysisId;
    version = persisted.version;
    diff = persisted.diff;

    // R10: encolar audios sin ficha, con prioridad, sin romper si el equipo no tiene fichas.
    if (facts.evidence_gap && facts.pending_audio_message_ids.length) {
      try {
        await encolarAudios({ teamId, chatId, messageIds: facts.pending_audio_message_ids.slice(0, 50), priority: 10, requestedBy: 'auto', limit: 50 });
      } catch (error) {
        console.error('[sales-ops] encolarAudios failed', error);
      }
    }

    await audit(teamId, userId, 'SALES_OPS_CLASSIFY', {
      chatId,
      analysisId,
      version,
      reason,
      engine: opts.engine,
      connector: connectorName,
      gate: reconciled.values.currentGate,
      status: reconciled.values.status,
      confidence: reconciled.values.confidence,
      priorityScore: reconciled.values.priorityScore,
      humanOverrideKept: reconciled.humanOverrideKept,
      aiUsed: !!classification,
    });
  } else {
    diff = diffRows(existing ? snapshotOf(existing as unknown as Record<string, unknown>) : null, snapshotOf(reconciled.values as Record<string, unknown>));
    version = (existing?.version ?? 0) + 1;
  }

  return {
    chatId,
    analysisId,
    version,
    reason,
    engine: opts.engine,
    analyzedBy,
    provider: ai.provider,
    model: ai.model,
    promptRunId,
    gate: reconciled.values.currentGate as Gate | null,
    maxGate: reconciled.values.maxGate as Gate | null,
    status: reconciled.values.status as AnalysisStatus,
    confidence: reconciled.values.confidence ?? 0,
    recoveryProbability: reconciled.values.recoveryProbability ?? 0,
    priorityScore: reconciled.values.priorityScore ?? 0,
    potentialValueUsd: reconciled.values.potentialValueUsd ?? 0,
    humanOverrideKept: reconciled.humanOverrideKept,
    aiUsed: !!classification,
    aiError: ai.error,
    warnings: reconciled.warnings,
    diff,
    dryRun,
    facts,
    row: snapshotOf(reconciled.values as Record<string, unknown>),
  };
}

export type ManualOverrideInput = { gate: Gate; status: AnalysisStatus; reason: string };

/** Una persona fija gate y estado. Crea versión `manual_override` con analyzedBy='human'. */
export async function setManualOverride(teamId: number, chatId: number, userId: number, input: ManualOverrideInput) {
  const now = new Date();
  let existing = await loadExisting(teamId, chatId);
  if (!existing || existing.version === 0) {
    // Fila base determinística para tener sobre qué versionar.
    await classifyChat(teamId, chatId, { engine: 'rules', userId });
    existing = await loadExisting(teamId, chatId);
    if (!existing) throw new Error('No se pudo crear el análisis base.');
  }
  const fingerprint = await currentFingerprint(teamId, chatId);
  const priority = computePriority({
    gate: input.gate,
    daysSilent: existing.lastCustomerMessageAt ? Math.floor((now.getTime() - existing.lastCustomerMessageAt.getTime()) / 86_400_000) : null,
    followupsTotal: existing.followupsTotal,
    objection: existing.objectionType as Objection,
    collectionSpeed: (existing.collectionSpeed as CollectionSpeed) ?? DEFAULT_SPEED_BY_GATE[input.gate],
    potentialValueUsd: existing.potentialValueUsd,
    evidenceGap: existing.evidenceGap,
    autoReply: existing.autoReplyDetected,
    confidence: 100,
  });
  const values: Record<string, unknown> = {
    ...snapshotOf(existing as unknown as Record<string, unknown>),
    fingerprint,
    stale: false,
    currentGate: input.gate,
    maxGate: existing.maxGate && gateRank(existing.maxGate as Gate) > gateRank(input.gate) ? existing.maxGate : input.gate,
    dropGate: input.gate === 'G11' ? existing.dropGate : input.gate,
    status: input.status,
    statusReason: `Override humano: ${input.reason}`.slice(0, 300),
    confidence: 100,
    recoveryProbability: priority.recoveryProbability,
    priorityScore: priority.priorityScore,
    collectionSpeed: existing.collectionSpeed ?? DEFAULT_SPEED_BY_GATE[input.gate],
  };
  // Las fechas vuelven a Date para la fila.
  for (const key of ['firstContactAt', 'lastCustomerMessageAt', 'lastTeamMessageAt', 'lastHumanMessageAt', 'lastFollowupAt'] as const) {
    values[key] = existing[key];
  }
  const persisted = await persistVersion({
    teamId,
    chatId,
    existing,
    values,
    reason: 'manual_override',
    analyzedBy: 'human',
    provider: existing.provider,
    model: existing.model,
    promptRunId: null,
    createdBy: userId,
    meta: { engine: 'human', overrideReason: input.reason, factors: priority.factors },
    now,
  });
  await audit(teamId, userId, 'SALES_OPS_OVERRIDE', { chatId, analysisId: persisted.analysisId, version: persisted.version, gate: input.gate, status: input.status, reason: input.reason });
  return { chatId, analysisId: persisted.analysisId, version: persisted.version, gate: input.gate, status: input.status, diff: persisted.diff };
}

async function currentFingerprint(teamId: number, chatId: number): Promise<string> {
  const rows = (await db.execute(sql`
    select
      (select m.id from messages m where m.chat_id = ${chatId} order by m.timestamp desc, m.id desc limit 1) as last_id,
      (select m.timestamp from messages m where m.chat_id = ${chatId} order by m.timestamp desc, m.id desc limit 1) as last_ts,
      (select count(*)::int from message_audio_insights i where i.chat_id = ${chatId} and i.status = 'done') as done
    from chats c where c.id = ${chatId} and c.team_id = ${teamId}
  `)) as unknown as Array<{ last_id: string | null; last_ts: Date | string | null; done: number }>;
  const r = rows[0];
  if (!r) throw new Error('Chat no encontrado.');
  return computeFingerprint({ chatId, lastMessageId: r.last_id, lastMessageTimestamp: r.last_ts ? new Date(r.last_ts).toISOString() : null, audioInsightsDone: Number(r.done ?? 0) });
}

// ── Pendientes (doc 07 P1) ────────────────────────────────────────────────

export type PendingSource = 'prefiltro' | 'stale' | 'all';
export type PendingSignal = 'pago_nuestro' | 'radar_P1' | 'deal' | 'cliente_custom' | 'tag_producto';

export type PendingChat = {
  chatId: number;
  contactId: number | null;
  name: string;
  phoneMasked: string;
  signals: PendingSignal[];
  lastCustomerAt: string | null;
  whoSpokeLast: 'cliente' | 'nosotros' | 'nadie';
  automationActive: boolean;
  pendingAudios: number;
  analysis: { version: number; stale: boolean; gate: string | null; analyzedAt: string | null; fingerprintMatches: boolean } | null;
  pendingReason: 'sin_analisis' | 'import' | 'stale' | 'chat_changed';
};

const SIGNAL_ORDER: PendingSignal[] = ['pago_nuestro', 'radar_P1', 'deal', 'tag_producto', 'cliente_custom'];

type PendingRow = {
  chat_id: number;
  contact_id: number | null;
  name: string | null;
  push_name: string | null;
  remote_jid: string;
  last_customer_interaction: Date | string | null;
  last_message_from_me: boolean | null;
  pago_nuestro: boolean;
  radar_p1: boolean;
  deal: boolean;
  cliente_custom: boolean;
  tag_producto: boolean;
  automation_active: boolean;
  pending_audios: number;
  last_id: string | null;
  last_ts: Date | string | null;
  audios_done: number;
  a_version: number | null;
  a_stale: boolean | null;
  a_gate: string | null;
  a_fingerprint: string | null;
  a_analyzed_at: Date | string | null;
};

export async function listPendingChats(teamId: number, opts: { source?: PendingSource; limit?: number } = {}): Promise<PendingChat[]> {
  const source = opts.source ?? 'prefiltro';
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 500);

  // Internos del equipo y pruebas: la misma lista que usan el radar y la cola de
  // audios. Sin esto el prefiltro proponía clasificar el chat interno del
  // equipo y gastaba una llamada de IA en él.
  const jidsInternosLista = jidsInternos();
  const excluirInternos = jidsInternosLista.length
    ? sql` and lower(c.remote_jid) not in (${sql.join(jidsInternosLista.map((jid) => sql`${jid}`), sql`, `)})`
    : sql``;
  // Y los que el equipo marcó a mano en Limpieza (personal / equipo / otros).
  const excluirMarcados = sql` and ${condicionDeChatMarcado(sql`c.id`)}`;

  const rows = (await db.execute(sql`
    with team_chats as (
      select c.id, c.remote_jid, c.name, c.push_name, c.last_customer_interaction, c.last_message_from_me
      from chats c where c.team_id = ${teamId} and c.remote_jid not like '%@g.us'${excluirInternos}${excluirMarcados}
    ),
    ct as (select id as contact_id, chat_id, custom_data from contacts where team_id = ${teamId}),
    linked as (select distinct contact_id from team_customer_contacts where team_id = ${teamId}),
    pago_nuestro as (
      select distinct m.chat_id from messages m inner join team_chats c on c.id = m.chat_id
      where m.from_me = true and coalesce(m.is_internal, false) = false
        and m.text ~* '(alias|\\mcbu\\M|\\mcvu\\M|transferencia|comprobante|se[ñn]a\\M|anticipo)'
    ),
    radar_p1 as (select chat_id from ct where custom_data->>'radar_prioridad' = 'P1'),
    deal as (
      select distinct ct.chat_id from team_deals d inner join ct on ct.contact_id = d.contact_id
      where d.team_id = ${teamId} and d.stage in ('qualified','proposal','negotiation')
    ),
    cliente_custom as (
      select chat_id from ct where lower(coalesce(custom_data->>'cliente','')) in ('true','si','sí')
        and contact_id not in (select contact_id from linked)
    ),
    tag_producto as (
      select distinct ct.chat_id from contact_tags x inner join tags t on t.id = x.tag_id inner join ct on ct.contact_id = x.contact_id
      where t.team_id = ${teamId} and (t.name ilike '%membres_a anual%' or t.name ilike '%a medida%')
        and ct.contact_id not in (select contact_id from linked)
    ),
    active_sessions as (select distinct chat_id from automation_sessions where team_id = ${teamId} and status = 'active'),
    pending_audios as (
      select m.chat_id, count(*)::int as n from messages m inner join team_chats c on c.id = m.chat_id
      left join message_audio_insights i on i.message_id = m.id
      where (m.message_type = 'audioMessage' or m.media_is_ptt = true) and coalesce(i.status, '') <> 'done'
      group by m.chat_id
    ),
    audios_done as (select chat_id, count(*)::int as n from message_audio_insights where team_id = ${teamId} and status = 'done' group by chat_id)
    select
      c.id as chat_id, ct.contact_id, c.name, c.push_name, c.remote_jid, c.last_customer_interaction, c.last_message_from_me,
      (c.id in (select chat_id from pago_nuestro)) as pago_nuestro,
      (c.id in (select chat_id from radar_p1)) as radar_p1,
      (c.id in (select chat_id from deal)) as deal,
      (c.id in (select chat_id from cliente_custom)) as cliente_custom,
      (c.id in (select chat_id from tag_producto)) as tag_producto,
      (c.id in (select chat_id from active_sessions)) as automation_active,
      coalesce(pa.n, 0) as pending_audios,
      lm.id as last_id, lm.timestamp as last_ts,
      coalesce(ad.n, 0) as audios_done,
      a.version as a_version, a.stale as a_stale, a.current_gate as a_gate, a.fingerprint as a_fingerprint, a.analyzed_at as a_analyzed_at
    from team_chats c
    left join ct on ct.chat_id = c.id
    left join pending_audios pa on pa.chat_id = c.id
    left join audios_done ad on ad.chat_id = c.id
    left join team_commercial_analysis a on a.team_id = ${teamId} and a.chat_id = c.id
    left join lateral (select m.id, m.timestamp from messages m where m.chat_id = c.id order by m.timestamp desc, m.id desc limit 1) lm on true
    ${source === 'prefiltro'
      ? sql`where c.id in (select chat_id from pago_nuestro union select chat_id from radar_p1 union select chat_id from deal union select chat_id from cliente_custom union select chat_id from tag_producto)`
      : source === 'stale'
        ? sql`where a.id is not null`
        : sql`where (a.id is null or a.version = 0)`}
  `)) as unknown as PendingRow[];

  const out: PendingChat[] = [];
  for (const r of rows) {
    if (isExcludedChat(teamId, r.chat_id)) continue;
    const fingerprint = computeFingerprint({
      chatId: r.chat_id,
      lastMessageId: r.last_id,
      lastMessageTimestamp: r.last_ts ? new Date(r.last_ts).toISOString() : null,
      audioInsightsDone: Number(r.audios_done ?? 0),
    });
    const hasAnalysis = r.a_version != null;
    const matches = hasAnalysis && r.a_fingerprint === fingerprint;
    let pendingReason: PendingChat['pendingReason'] | null = null;
    if (!hasAnalysis) pendingReason = 'sin_analisis';
    else if ((r.a_version ?? 0) === 0) pendingReason = 'import';
    else if (r.a_stale) pendingReason = 'stale';
    else if (!matches) pendingReason = 'chat_changed';
    if (!pendingReason) continue;

    const signals = SIGNAL_ORDER.filter((s) => (s === 'pago_nuestro' && r.pago_nuestro) || (s === 'radar_P1' && r.radar_p1) || (s === 'deal' && r.deal) || (s === 'cliente_custom' && r.cliente_custom) || (s === 'tag_producto' && r.tag_producto));
    const lastCustomerAt = r.last_customer_interaction ? new Date(r.last_customer_interaction).toISOString() : null;
    out.push({
      chatId: r.chat_id,
      contactId: r.contact_id,
      name: r.name ?? r.push_name ?? '',
      phoneMasked: maskJid(r.remote_jid),
      signals,
      lastCustomerAt,
      whoSpokeLast: r.last_message_from_me == null ? (lastCustomerAt ? 'cliente' : 'nadie') : r.last_message_from_me ? 'nosotros' : 'cliente',
      automationActive: !!r.automation_active,
      pendingAudios: Number(r.pending_audios ?? 0),
      analysis: hasAnalysis
        ? { version: r.a_version ?? 0, stale: !!r.a_stale, gate: r.a_gate, analyzedAt: r.a_analyzed_at ? new Date(r.a_analyzed_at).toISOString() : null, fingerprintMatches: matches }
        : null,
      pendingReason,
    });
  }

  // Orden del doc 07 P1: pago_nuestro primero, después último mensaje del cliente desc.
  const rank = (p: PendingChat) => {
    const idx = SIGNAL_ORDER.findIndex((s) => p.signals.includes(s));
    return idx === -1 ? SIGNAL_ORDER.length : idx;
  };
  out.sort((a, b) => {
    const pa = a.signals.includes('pago_nuestro') ? 0 : 1;
    const pb = b.signals.includes('pago_nuestro') ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const ta = a.lastCustomerAt ?? '';
    const tb = b.lastCustomerAt ?? '';
    if (ta !== tb) return tb.localeCompare(ta);
    return rank(a) - rank(b);
  });
  return out.slice(0, limit);
}


/** Última versión guardada de un chat (para las rutas y el smoke). */
export async function getLatestVersion(teamId: number, chatId: number) {
  return db.query.teamCommercialAnalysisVersions.findFirst({
    where: and(eq(teamCommercialAnalysisVersions.teamId, teamId), eq(teamCommercialAnalysisVersions.chatId, chatId)),
    orderBy: [desc(teamCommercialAnalysisVersions.version)],
  });
}
