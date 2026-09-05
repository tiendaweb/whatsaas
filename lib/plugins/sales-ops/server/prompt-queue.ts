import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, teamCommercialActions, teamPromptRuns } from '@/lib/db/schema';
import { maskJid } from '@/lib/desktop/command-center/types';
import {
  allowsMode,
  allowsTarget,
  defaultMode,
  isRunMode,
  missingVariables,
  renderSkillText,
  type RunMode,
  type Skill,
  type SkillVariable,
} from '../shared/skills';
import { promptFingerprint } from './prompts';
import { getSkill, markSkillUsed } from './skills';
import { buildChatContext, runSkillWithApi } from './skill-runner';
import {
  humanDecisionRequestSchema,
  validateHumanDecisionAnswers,
  type HumanDecisionAnswers,
  type HumanDecisionRequest,
} from '../shared/human-decision';

/**
 * Corridas del Prompt Studio: lanzar una skill y seguirle el rastro.
 *
 * Una corrida (`team_prompt_runs`) guarda el texto **ya resuelto** con el que
 * se lanzó, no la plantilla: si mañana alguien edita la skill, lo que se
 * ejecutó sigue siendo legible tal como se ejecutó.
 *
 * Dos motores, misma fila:
 *  - `queue`: nace `queued`, el conector la toma por `whatspro_sales_work_queue`
 *    (kind `run_prompt`) y la cierra con `whatspro_sales_prompt_result`.
 *  - `api`: la corre el servidor con la IA del equipo y queda `completed` con
 *    la salida en `output`. Este motor no escribe fuera de la corrida.
 *
 * Ninguno de los dos toca el CRM.
 */
export const PROMPT_RUN_STATUSES = ['queued', 'in_progress', 'completed', 'failed', 'cancelled', 'blocked'] as const;
export type PromptRunStatus = (typeof PROMPT_RUN_STATUSES)[number];

export type PromptRunRow = {
  id: number;
  promptId: number | null;
  promptKey: string;
  promptVersion: number;
  title: string;
  text: string;
  targetKind: 'chat' | 'team' | 'batch' | 'signal';
  targetId: string;
  targetName: string | null;
  status: PromptRunStatus;
  mode: RunMode;
  connector: string;
  variables: Record<string, string>;
  summary: string | null;
  output: string | null;
  createdBy: number | null;
  createdAt: string;
  completedAt: string | null;
  /**
   * Cuándo una persona la aprobó para que la tome un conector (vive en
   * metadata: sin migración). Sin esto la corrida espera en "En revisión" y
   * el conector no la ve.
   */
  approvedAt: string | null;
  approvedBy: number | null;
  humanRequest: HumanDecisionRequest | null;
  humanRequestedAt: string | null;
};

function rowToRun(r: typeof teamPromptRuns.$inferSelect, targetName: string | null): PromptRunRow {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const humanRequest = humanDecisionRequestSchema.safeParse(meta.humanRequest);
  return {
    id: r.id,
    promptId: r.promptId,
    promptKey: r.promptKey,
    promptVersion: r.promptVersion,
    title: typeof meta.title === 'string' ? meta.title : r.promptKey,
    text: r.promptSnapshot,
    targetKind: r.targetKind as PromptRunRow['targetKind'],
    targetId: r.targetId,
    targetName,
    status: r.status as PromptRunStatus,
    mode: isRunMode(r.mode) ? r.mode : 'queue',
    connector: r.connector,
    variables: (r.variables ?? {}) as Record<string, string>,
    summary: r.summary,
    output: r.output,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    // La columna es nueva; las corridas viejas todavía lo tienen en `metadata`.
    completedAt: r.completedAt ? r.completedAt.toISOString() : typeof meta.completedAt === 'string' ? meta.completedAt : null,
    approvedAt: typeof meta.approvedAt === 'string' ? meta.approvedAt : null,
    approvedBy: typeof meta.approvedBy === 'number' ? meta.approvedBy : null,
    humanRequest: humanRequest.success ? humanRequest.data : null,
    humanRequestedAt: typeof meta.humanRequestedAt === 'string' ? meta.humanRequestedAt : null,
  };
}

async function chatNames(teamId: number, chatIds: number[]): Promise<Map<number, string>> {
  if (!chatIds.length) return new Map();
  const rows = await db
    .select({ id: chats.id, name: chats.name, pushName: chats.pushName, remoteJid: chats.remoteJid })
    .from(chats)
    .where(and(eq(chats.teamId, teamId), inArray(chats.id, chatIds)));
  return new Map(rows.map((c) => [c.id, c.name || c.pushName || maskJid(c.remoteJid)]));
}

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/prompt-queue] audit', error);
  }
}

// ── Lanzar ─────────────────────────────────────────────────────────────────

export type LaunchInput = {
  /**
   * true = ya la aprobó una persona (la lanzó a mano desde la interfaz): va
   * directo a la cola. false (default) = espera en "En revisión" hasta que
   * alguien la apruebe: es lo que corresponde cuando la propone un conector o
   * nace de un programado.
   */
  approved?: boolean;
  /** Skill guardada. Si no viene, `text` es obligatorio (prompt suelto). */
  skillId?: number | null;
  /** Alias histórico de `skillId` (la ruta vieja mandaba `promptId`). */
  promptId?: number | null;
  /** Texto libre. Con `skillId` se agrega al final como indicación extra. */
  text?: string | null;
  title?: string | null;
  targetKind: 'chat' | 'team' | 'batch';
  targetId?: number | null;
  /** Identificador del lote cuando `targetKind` es `batch`. */
  targetRef?: string | null;
  /** Valores del formulario de datos dinámicos. */
  variables?: Record<string, string>;
  /** `queue` (conector) o `api` (IA del equipo). Por defecto, el de la skill. */
  mode?: RunMode;
};

export class LaunchError extends Error {
  constructor(
    message: string,
    readonly missing: SkillVariable[] = [],
  ) {
    super(message);
    this.name = 'LaunchError';
  }
}

async function resolveTarget(
  teamId: number,
  targetKind: 'chat' | 'team' | 'batch',
  targetId: number | null | undefined,
  targetRef: string | null | undefined,
) {
  if (targetKind === 'team') return { targetId: 'team', targetName: null as string | null, chatId: null as number | null };

  if (targetKind === 'batch') {
    // Una instrucción "para todo el lote" antes de ejecutarlo: se guarda como
    // corrida apuntada al lote, así el conector la ve en su cola junto al resto
    // del trabajo en vez de en una tabla aparte que nadie mira.
    const ref = (targetRef ?? '').trim();
    if (!ref) throw new LaunchError('Falta el lote sobre el que dejar la instrucción.');
    const fila = await db.query.teamCommercialActions.findFirst({
      where: and(eq(teamCommercialActions.teamId, teamId), eq(teamCommercialActions.batchId, ref)),
      columns: { batchLabel: true },
    });
    if (!fila) throw new LaunchError('Ese lote no pertenece al equipo.');
    return { targetId: ref, targetName: fila.batchLabel, chatId: null as number | null };
  }

  if (!targetId) throw new LaunchError('Falta el chat sobre el que lanzar la skill.');
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.teamId, teamId), eq(chats.id, targetId)),
    columns: { id: true, name: true, pushName: true, remoteJid: true },
  });
  if (!chat) throw new LaunchError('El chat no pertenece al equipo.');
  return { targetId: String(chat.id), targetName: chat.name || chat.pushName || maskJid(chat.remoteJid), chatId: chat.id };
}

/**
 * Arma el texto definitivo de una corrida: la skill con sus variables
 * resueltas, la indicación manual y el contexto del destino.
 *
 * El bloque CONTEXTO va al final y siempre dice el `chat_id`, porque es lo
 * único que un conector necesita para pedir el expediente por su cuenta.
 */
export function composeRunText(
  skill: Skill | null,
  manual: string,
  values: Record<string, string>,
  target: { kind: 'chat' | 'team' | 'batch'; id: string; name: string | null },
): string {
  const base = skill ? renderSkillText(skill.text, skill.variables, values) : '';
  const extra = manual.trim();
  const contexto =
    target.kind === 'chat'
      ? `CONTEXTO: chat_id ${target.id}${target.name ? ` (${target.name})` : ''}. Usá whatspro_sales_dossier {chat_id: ${target.id}} si necesitás el historial.`
      : target.kind === 'batch'
        ? `CONTEXTO: lote ${target.id}${target.name ? ` ("${target.name}")` : ''}. Mirá sus acciones con whatspro_sales_queue_get {batch_id: "${target.id}"} antes de tocar nada. Esta indicación aplica a TODO el lote.`
        : '';
  const tools = skill?.toolChain.length ? `TOOLS SUGERIDAS: ${skill.toolChain.join(' → ')}` : '';
  return [base, extra, tools, contexto].filter(Boolean).join('\n\n');
}

export type LaunchResult = { run: PromptRunRow; skill: Skill | null };

/**
 * Lanza una skill (o un prompt suelto) y devuelve la corrida.
 *
 * En modo `api` se inserta primero como `in_progress` y recién después se llama
 * al modelo: si el proceso se cae en el medio, queda el rastro de que se
 * intentó, en vez de una corrida que nunca existió.
 */
export async function launchRun(teamId: number, userId: number | null, input: LaunchInput): Promise<LaunchResult> {
  const skillId = input.skillId ?? input.promptId ?? null;
  const skill = skillId ? await getSkill(teamId, { id: skillId }) : null;
  if (skillId && !skill) throw new LaunchError('Skill no encontrada.');

  const manual = (input.text ?? '').trim();
  if (!skill && manual.length < 5) throw new LaunchError('El prompt es obligatorio (mínimo 5 caracteres).');

  if (skill && input.targetKind !== 'batch' && !allowsTarget(skill, input.targetKind)) {
    throw new LaunchError(`"${skill.title}" está configurada para ${input.targetKind === 'chat' ? 'todo el equipo' : 'un chat'}, no para este destino.`);
  }

  const values = input.variables ?? {};
  if (skill) {
    const missing = missingVariables(skill.variables, values);
    if (missing.length) throw new LaunchError(`Faltan datos: ${missing.map((v) => v.label).join(', ')}.`, missing);
  }

  const mode: RunMode = input.mode && isRunMode(input.mode) ? input.mode : skill ? defaultMode(skill) : 'queue';
  if (skill && !allowsMode(skill, mode)) {
    throw new LaunchError(`"${skill.title}" sólo se puede ejecutar con ${skill.execution === 'api' ? 'la IA del equipo' : 'la cola de conectores'}.`);
  }

  const target = await resolveTarget(teamId, input.targetKind, input.targetId, input.targetRef);
  const text = composeRunText(skill, manual, values, { kind: input.targetKind, id: target.targetId, name: target.targetName });
  const title = (input.title ?? skill?.title ?? manual.slice(0, 60)).trim().slice(0, 160);

  const [inserted] = await db
    .insert(teamPromptRuns)
    .values({
      teamId,
      promptId: skill?.id ?? null,
      promptKey: skill?.key ?? 'manual',
      promptVersion: skill?.version ?? 0,
      promptFingerprint: promptFingerprint('', text),
      promptSnapshot: text,
      targetKind: input.targetKind,
      targetId: target.targetId,
      connector: mode === 'api' ? 'server' : 'pending',
      status: mode === 'api' ? 'in_progress' : 'queued',
      mode,
      variables: values,
      metadata: {
        title,
        manual: manual.length > 0,
        skillKey: skill?.key ?? null,
        ...(mode === 'api' || input.approved ? { approvedAt: new Date().toISOString(), approvedBy: userId } : {}),
      },
      createdBy: userId,
    })
    .returning();

  if (skill) void markSkillUsed(teamId, skill.id);
  await audit(teamId, userId, 'SALES_OPS_PROMPT_QUEUED', { runId: inserted.id, promptKey: inserted.promptKey, mode, targetKind: input.targetKind, targetId: target.targetId });

  if (mode !== 'api') return { run: rowToRun(inserted, target.targetName), skill };

  const context = target.chatId ? await buildChatContext(teamId, target.chatId) : null;
  const outcome = await runSkillWithApi(teamId, text, context);
  const [updated] = await db
    .update(teamPromptRuns)
    .set(
      outcome.ok
        ? {
            status: 'completed',
            output: outcome.output,
            summary: outcome.output.slice(0, 400),
            connector: 'server',
            completedAt: new Date(),
            metadata: { ...(inserted.metadata as Record<string, unknown>), provider: outcome.provider, model: outcome.model },
          }
        : {
            status: 'failed',
            summary: outcome.error.slice(0, 4000),
            connector: 'server',
            completedAt: new Date(),
            metadata: { ...(inserted.metadata as Record<string, unknown>) },
          },
    )
    .where(eq(teamPromptRuns.id, inserted.id))
    .returning();

  await audit(teamId, userId, 'SALES_OPS_PROMPT_RESULT', { runId: inserted.id, status: updated.status, connector: 'server', mode: 'api' });
  return { run: rowToRun(updated, target.targetName), skill };
}

/**
 * Repite una corrida con el **texto ya resuelto** de la original (no se
 * re-renderiza la skill: si alguien la editó en el medio, lo que se relanza
 * sigue siendo lo que la persona quiso ejecutar). `api` la corre ya con la IA
 * del equipo; `queue` la deja para un conector.
 */
export async function relaunchRun(teamId: number, userId: number | null, runId: number, mode: RunMode, opts: { approved?: boolean } = {}): Promise<LaunchResult & { from: number }> {
  const original = await getPromptRun(teamId, runId);
  if (!original) throw new LaunchError('Corrida no encontrada.');
  const result = await launchRun(teamId, userId, {
    text: original.text,
    title: original.title,
    targetKind: original.targetKind === 'chat' ? 'chat' : original.targetKind === 'batch' ? 'batch' : 'team',
    targetId: original.targetKind === 'chat' ? Number(original.targetId) : null,
    targetRef: original.targetKind === 'batch' ? original.targetId : null,
    variables: original.variables,
    mode,
    approved: opts.approved ?? true,
  });
  return { ...result, from: runId };
}

/**
 * Corrige el texto o el título de una corrida que todavía nadie tomó.
 *
 * Sólo `queued`: una vez que un conector la tiene (`in_progress`) o terminó,
 * cambiar el texto haría que el registro no coincida con lo que se ejecutó.
 */
export async function editQueuedRun(teamId: number, userId: number | null, runId: number, patch: { text?: string; title?: string }): Promise<PromptRunRow> {
  const existing = await db.query.teamPromptRuns.findFirst({ where: and(eq(teamPromptRuns.teamId, teamId), eq(teamPromptRuns.id, runId)) });
  if (!existing) throw new LaunchError('Corrida no encontrada.');
  if (existing.status !== 'queued') throw new LaunchError(`La corrida ya está ${existing.status}: sólo se edita mientras espera en la cola.`);
  const text = patch.text?.trim();
  if (text !== undefined && text.length < 5) throw new LaunchError('El texto es obligatorio (mínimo 5 caracteres).');
  if (text === undefined && patch.title === undefined) throw new LaunchError('No hay nada que cambiar: pasá text o title.');
  const meta = { ...((existing.metadata ?? {}) as Record<string, unknown>) };
  if (patch.title !== undefined) meta.title = patch.title.trim().slice(0, 160);
  meta.editedBy = userId;
  const [row] = await db
    .update(teamPromptRuns)
    .set({
      promptSnapshot: text ?? existing.promptSnapshot,
      promptFingerprint: text !== undefined ? promptFingerprint('', text) : existing.promptFingerprint,
      metadata: meta,
    })
    .where(eq(teamPromptRuns.id, runId))
    .returning();
  await audit(teamId, userId, 'SALES_OPS_PROMPT_EDITED', { runId, fields: Object.keys(patch) });
  const names = row.targetKind === 'chat' ? await chatNames(teamId, [Number(row.targetId)]) : new Map<number, string>();
  return rowToRun(row, names.get(Number(row.targetId)) ?? null);
}

/**
 * Aprueba una corrida que espera en revisión: desde ese momento la ve el
 * conector. Sólo `queued`; lo demás ya está decidido.
 */
export async function approveRun(teamId: number, userId: number | null, runId: number): Promise<PromptRunRow> {
  const existing = await db.query.teamPromptRuns.findFirst({ where: and(eq(teamPromptRuns.teamId, teamId), eq(teamPromptRuns.id, runId)) });
  if (!existing) throw new LaunchError('Corrida no encontrada.');
  if (existing.status !== 'queued') throw new LaunchError(`La corrida ya está ${existing.status}.`);
  const meta = { ...((existing.metadata ?? {}) as Record<string, unknown>) };
  if (!meta.approvedAt) {
    meta.approvedAt = new Date().toISOString();
    meta.approvedBy = userId;
  }
  const [row] = await db.update(teamPromptRuns).set({ metadata: meta }).where(eq(teamPromptRuns.id, runId)).returning();
  await audit(teamId, userId, 'SALES_OPS_PROMPT_APPROVED', { runId, promptKey: row.promptKey });
  const names = row.targetKind === 'chat' ? await chatNames(teamId, [Number(row.targetId)]) : new Map<number, string>();
  return rowToRun(row, names.get(Number(row.targetId)) ?? null);
}

/** Borra una corrida descartada (cancelada, fallida o bloqueada). Lo hecho o en curso se conserva. */
export async function deletePromptRun(teamId: number, userId: number | null, runId: number): Promise<{ id: number }> {
  const existing = await db.query.teamPromptRuns.findFirst({ where: and(eq(teamPromptRuns.teamId, teamId), eq(teamPromptRuns.id, runId)), columns: { id: true, status: true, promptKey: true } });
  if (!existing) throw new LaunchError('Corrida no encontrada.');
  if (!['cancelled', 'failed', 'blocked'].includes(existing.status)) throw new LaunchError(`La corrida está ${existing.status}: sólo se eliminan las descartadas (cancelada, fallida o bloqueada).`);
  await db.delete(teamPromptRuns).where(eq(teamPromptRuns.id, runId));
  await audit(teamId, userId, 'SALES_OPS_PROMPT_DELETED', { runId, status: existing.status, promptKey: existing.promptKey });
  return { id: runId };
}

/** Compatibilidad: encolar sin elegir motor sigue significando "para el conector". */
export async function enqueuePromptRun(teamId: number, userId: number | null, input: Omit<LaunchInput, 'mode'>): Promise<PromptRunRow> {
  const { run } = await launchRun(teamId, userId, { ...input, mode: 'queue' });
  return run;
}

// ── Lectura y cierre ───────────────────────────────────────────────────────

export type ListRunsOptions = {
  status?: PromptRunStatus | 'open' | 'all';
  chatId?: number;
  mode?: RunMode;
  promptKey?: string;
  /** `exclude` deja afuera las corridas del motor (`sales-ops.*`): en la Cola tapaban las indicaciones humanas. */
  engine?: 'exclude';
  /** true = sólo aprobadas (lo que un conector puede tomar); false = sólo sin aprobar. */
  approved?: boolean;
  limit?: number;
};

export async function listPromptRuns(teamId: number, opts: ListRunsOptions = {}): Promise<PromptRunRow[]> {
  const status = opts.status ?? 'open';
  const conditions = [eq(teamPromptRuns.teamId, teamId)];
  if (status === 'open') conditions.push(inArray(teamPromptRuns.status, ['queued', 'in_progress']));
  else if (status !== 'all') conditions.push(eq(teamPromptRuns.status, status));
  if (opts.mode) conditions.push(eq(teamPromptRuns.mode, opts.mode));
  if (opts.promptKey) conditions.push(eq(teamPromptRuns.promptKey, opts.promptKey));
  if (opts.engine === 'exclude') conditions.push(sql`${teamPromptRuns.promptKey} NOT LIKE 'sales-ops.%'`);
  if (opts.approved === true) conditions.push(sql`${teamPromptRuns.metadata} ->> 'approvedAt' IS NOT NULL`);
  if (opts.approved === false) conditions.push(sql`${teamPromptRuns.metadata} ->> 'approvedAt' IS NULL`);
  if (opts.chatId) {
    conditions.push(eq(teamPromptRuns.targetKind, 'chat'));
    conditions.push(eq(teamPromptRuns.targetId, String(opts.chatId)));
  }
  const rows = await db
    .select()
    .from(teamPromptRuns)
    .where(and(...conditions))
    .orderBy(desc(teamPromptRuns.createdAt))
    .limit(Math.min(Math.max(1, opts.limit ?? 50), 200));
  const names = await chatNames(teamId, rows.filter((r) => r.targetKind === 'chat').map((r) => Number(r.targetId)).filter(Number.isFinite));
  return rows.map((r) => rowToRun(r, r.targetKind === 'chat' ? (names.get(Number(r.targetId)) ?? null) : null));
}

export async function getPromptRun(teamId: number, runId: number): Promise<PromptRunRow | null> {
  const row = await db.query.teamPromptRuns.findFirst({ where: and(eq(teamPromptRuns.teamId, teamId), eq(teamPromptRuns.id, runId)) });
  if (!row) return null;
  const names = row.targetKind === 'chat' ? await chatNames(teamId, [Number(row.targetId)]) : new Map<number, string>();
  return rowToRun(row, names.get(Number(row.targetId)) ?? null);
}

export type CompleteInput = {
  status: 'in_progress' | 'completed' | 'failed' | 'blocked' | 'cancelled';
  summary?: string | null;
  output?: string | null;
  connector?: string | null;
  metadata?: Record<string, unknown>;
};

/** El conector (o una persona) cierra la corrida. */
export async function completePromptRun(teamId: number, userId: number | null, runId: number, input: CompleteInput): Promise<PromptRunRow> {
  const existing = await db.query.teamPromptRuns.findFirst({ where: and(eq(teamPromptRuns.teamId, teamId), eq(teamPromptRuns.id, runId)) });
  if (!existing) throw new Error('Corrida no encontrada');
  if (['completed', 'cancelled'].includes(existing.status) && input.status !== 'cancelled') {
    throw new Error(`La corrida ya está ${existing.status}.`);
  }
  const meta = { ...(existing.metadata ?? {}), ...(input.metadata ?? {}) } as Record<string, unknown>;
  const [row] = await db
    .update(teamPromptRuns)
    .set({
      status: input.status,
      summary: input.summary ?? existing.summary,
      output: input.output ?? existing.output,
      connector: input.connector ?? existing.connector,
      completedAt: input.status === 'in_progress' ? existing.completedAt : new Date(),
      metadata: meta,
    })
    .where(eq(teamPromptRuns.id, runId))
    .returning();
  await audit(teamId, userId, 'SALES_OPS_PROMPT_RESULT', { runId, status: input.status, connector: row.connector });
  const names = row.targetKind === 'chat' ? await chatNames(teamId, [Number(row.targetId)]) : new Map<number, string>();
  return rowToRun(row, names.get(Number(row.targetId)) ?? null);
}

/**
 * Responde el formulario que dejó un conector y devuelve la misma corrida a la
 * cola. El texto original no se reemplaza: la decisión se anexa para que el
 * próximo conector vea pedido + contexto + respuesta humana en una sola pieza.
 */
export async function answerHumanDecision(
  teamId: number,
  userId: number,
  runId: number,
  answers: HumanDecisionAnswers,
): Promise<PromptRunRow> {
  const existing = await db.query.teamPromptRuns.findFirst({
    where: and(eq(teamPromptRuns.teamId, teamId), eq(teamPromptRuns.id, runId)),
  });
  if (!existing) throw new LaunchError('Corrida no encontrada.');
  if (existing.status !== 'blocked') throw new LaunchError('Esta corrida ya no está esperando una decisión humana.');

  const previousMeta = (existing.metadata ?? {}) as Record<string, unknown>;
  const request = humanDecisionRequestSchema.safeParse(previousMeta.humanRequest);
  if (!request.success) throw new LaunchError('El conector no dejó un formulario válido para esta corrida.');

  const validated = validateHumanDecisionAnswers(request.data, answers);
  if (!validated.ok) throw new LaunchError(validated.error);

  const answeredAt = new Date().toISOString();
  const answerLines = request.data.fields
    .filter((field) => (validated.values[field.id] ?? '').trim())
    .map((field) => `${field.label}:\n${validated.values[field.id]}`);
  const answerBlock = [
    `RESPUESTA HUMANA — ${request.data.title}`,
    ...answerLines,
  ].join('\n\n');
  const previousHistory = Array.isArray(previousMeta.humanDecisionHistory) ? previousMeta.humanDecisionHistory : [];
  const metadata = {
    ...previousMeta,
    humanRequest: null,
    humanRequestedAt: null,
    humanDecisionHistory: [
      ...previousHistory,
      {
        request: request.data,
        values: validated.values,
        requestedAt: typeof previousMeta.humanRequestedAt === 'string' ? previousMeta.humanRequestedAt : null,
        answeredAt,
        answeredBy: userId,
      },
    ],
    lastHumanAnsweredAt: answeredAt,
    lastHumanAnsweredBy: userId,
  };

  const nextText = `${existing.promptSnapshot.trimEnd()}\n\n---\n\n${answerBlock}`;
  const [row] = await db
    .update(teamPromptRuns)
    .set({
      status: 'queued',
      connector: 'pending',
      promptSnapshot: nextText,
      promptFingerprint: promptFingerprint('', nextText),
      summary: null,
      output: null,
      completedAt: null,
      metadata,
    })
    .where(and(eq(teamPromptRuns.teamId, teamId), eq(teamPromptRuns.id, runId), eq(teamPromptRuns.status, 'blocked')))
    .returning();
  if (!row) throw new LaunchError('La corrida cambió mientras respondías. Actualizá la cola para ver su estado.');

  await audit(teamId, userId, 'SALES_OPS_HUMAN_DECISION_ANSWERED', {
    runId,
    fields: Object.keys(validated.values),
    connector: existing.connector,
  });
  const names = row.targetKind === 'chat' ? await chatNames(teamId, [Number(row.targetId)]) : new Map<number, string>();
  return rowToRun(row, names.get(Number(row.targetId)) ?? null);
}
