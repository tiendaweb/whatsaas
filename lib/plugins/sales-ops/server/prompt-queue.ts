import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, chats, teamPromptRuns, teamPrompts } from '@/lib/db/schema';
import { maskJid } from '@/lib/desktop/command-center/types';
import { promptFingerprint } from './prompts';

/**
 * Prompt Studio: acciones rápidas (prompts guardados) y la cola de corridas
 * que ejecutan los conectores a voluntad.
 *
 * Una "corrida" (`team_prompt_runs`) nace `queued` cuando alguien aprieta un
 * botón en la UI o deja un prompt manual en la ficha; el conector la toma por
 * `whatspro_sales_work_queue`, la ejecuta y la cierra con
 * `whatspro_sales_prompt_result`. El servidor nunca ejecuta estos prompts.
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
  connector: string;
  summary: string | null;
  createdBy: number | null;
  createdAt: string;
  completedAt: string | null;
};

export type QuickActionRow = {
  id: number;
  key: string;
  title: string;
  purpose: string;
  audience: string;
  version: number;
  status: string;
  text: string;
  toolChain: string[];
  notes: string | null;
  updatedAt: string;
};

function rowToRun(r: typeof teamPromptRuns.$inferSelect, targetName: string | null): PromptRunRow {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
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
    connector: r.connector,
    summary: r.summary,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    completedAt: typeof meta.completedAt === 'string' ? meta.completedAt : null,
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

/** Acciones rápidas = prompts del equipo con audiencia conector (todas las versiones activas o borradores). */
export async function listQuickActions(teamId: number): Promise<QuickActionRow[]> {
  const rows = await db.query.teamPrompts.findMany({
    where: and(eq(teamPrompts.teamId, teamId), inArray(teamPrompts.status, ['active', 'draft'])),
    orderBy: (t, { asc, desc: d }) => [asc(t.purpose), asc(t.title), d(t.version)],
  });
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      if (seen.has(r.key)) return false;
      seen.add(r.key);
      return true;
    })
    .map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      purpose: r.purpose,
      audience: r.audience,
      version: r.version,
      status: r.status,
      text: [r.systemPrompt, r.userTemplate].filter(Boolean).join('\n\n'),
      toolChain: r.toolChain ?? [],
      notes: r.notes,
      updatedAt: r.updatedAt.toISOString(),
    }));
}

export type CreateQuickActionInput = { key?: string; title: string; text: string; toolChain?: string[]; notes?: string | null; purpose?: string };

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Crea (o versiona) una acción rápida. La versión nueva queda `active` y la anterior `retired`. */
export async function upsertQuickAction(teamId: number, userId: number, input: CreateQuickActionInput): Promise<QuickActionRow> {
  const key = (input.key?.trim() || `qa.${slugify(input.title)}`).slice(0, 64);
  const previous = await db.query.teamPrompts.findMany({ where: and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, key)) });
  const version = previous.reduce((max, p) => Math.max(max, p.version), 0) + 1;
  const result = await db.transaction(async (tx) => {
    if (previous.length) {
      await tx.update(teamPrompts).set({ status: 'retired', updatedAt: new Date() }).where(and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, key)));
    }
    const [row] = await tx
      .insert(teamPrompts)
      .values({
        teamId,
        key,
        title: input.title.trim().slice(0, 160),
        purpose: input.purpose ?? 'custom',
        audience: 'connector',
        version,
        status: 'active',
        systemPrompt: '',
        userTemplate: input.text,
        toolChain: input.toolChain ?? [],
        notes: input.notes ?? null,
        createdBy: userId,
      })
      .returning();
    return row;
  });
  await audit(teamId, userId, 'SALES_OPS_PROMPT_SAVED', { key, version, promptId: result.id });
  return {
    id: result.id,
    key: result.key,
    title: result.title,
    purpose: result.purpose,
    audience: result.audience,
    version: result.version,
    status: result.status,
    text: result.userTemplate,
    toolChain: result.toolChain ?? [],
    notes: result.notes,
    updatedAt: result.updatedAt.toISOString(),
  };
}

export async function retireQuickAction(teamId: number, userId: number, key: string): Promise<number> {
  const rows = await db
    .update(teamPrompts)
    .set({ status: 'retired', updatedAt: new Date() })
    .where(and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, key)))
    .returning({ id: teamPrompts.id });
  await audit(teamId, userId, 'SALES_OPS_PROMPT_RETIRED', { key, count: rows.length });
  return rows.length;
}

export type EnqueueInput = {
  /** Prompt guardado (por id) o texto manual. Si vienen los dos, el texto manual se agrega al final. */
  promptId?: number | null;
  text?: string | null;
  title?: string | null;
  targetKind: 'chat' | 'team';
  targetId?: number | null;
};

/** Deja una corrida en cola para que la ejecute un conector. */
export async function enqueuePromptRun(teamId: number, userId: number | null, input: EnqueueInput): Promise<PromptRunRow> {
  let prompt: typeof teamPrompts.$inferSelect | undefined;
  if (input.promptId) {
    prompt = await db.query.teamPrompts.findFirst({ where: and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.id, input.promptId)) });
    if (!prompt) throw new Error('Prompt no encontrado');
  }
  const manual = (input.text ?? '').trim();
  if (!prompt && manual.length < 5) throw new Error('El prompt es obligatorio (mínimo 5 caracteres).');

  let targetId = 'team';
  let targetName: string | null = null;
  if (input.targetKind === 'chat') {
    if (!input.targetId) throw new Error('Falta el chat.');
    const chat = await db.query.chats.findFirst({ where: and(eq(chats.teamId, teamId), eq(chats.id, input.targetId)), columns: { id: true, name: true, pushName: true, remoteJid: true } });
    if (!chat) throw new Error('El chat no pertenece al equipo.');
    targetId = String(chat.id);
    targetName = chat.name || chat.pushName || maskJid(chat.remoteJid);
  }

  const base = prompt ? [prompt.systemPrompt, prompt.userTemplate].filter(Boolean).join('\n\n') : '';
  const contexto = input.targetKind === 'chat' ? `\n\nCONTEXTO: chat_id ${targetId}${targetName ? ` (${targetName})` : ''}. Usá whatspro_sales_dossier {chat_id: ${targetId}} si necesitás el historial.` : '';
  const text = [base, manual].filter(Boolean).join('\n\n') + contexto;
  const title = (input.title ?? prompt?.title ?? manual.slice(0, 60)).trim().slice(0, 160);

  const [row] = await db
    .insert(teamPromptRuns)
    .values({
      teamId,
      promptId: prompt?.id ?? null,
      promptKey: prompt?.key ?? 'manual',
      promptVersion: prompt?.version ?? 0,
      promptFingerprint: promptFingerprint('', text),
      promptSnapshot: text,
      targetKind: input.targetKind,
      targetId,
      connector: 'pending',
      status: 'queued',
      metadata: { title, manual: manual.length > 0 },
      createdBy: userId,
    })
    .returning();
  await audit(teamId, userId, 'SALES_OPS_PROMPT_QUEUED', { runId: row.id, promptKey: row.promptKey, targetKind: input.targetKind, targetId });
  return rowToRun(row, targetName);
}

export async function listPromptRuns(teamId: number, opts: { status?: PromptRunStatus | 'open' | 'all'; chatId?: number; limit?: number } = {}): Promise<PromptRunRow[]> {
  const status = opts.status ?? 'open';
  const conditions = [eq(teamPromptRuns.teamId, teamId)];
  if (status === 'open') conditions.push(inArray(teamPromptRuns.status, ['queued', 'in_progress']));
  else if (status !== 'all') conditions.push(eq(teamPromptRuns.status, status));
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

export type CompleteInput = { status: 'in_progress' | 'completed' | 'failed' | 'blocked' | 'cancelled'; summary?: string | null; connector?: string | null; metadata?: Record<string, unknown> };

/** El conector (o una persona) cierra la corrida. */
export async function completePromptRun(teamId: number, userId: number | null, runId: number, input: CompleteInput): Promise<PromptRunRow> {
  const existing = await db.query.teamPromptRuns.findFirst({ where: and(eq(teamPromptRuns.teamId, teamId), eq(teamPromptRuns.id, runId)) });
  if (!existing) throw new Error('Corrida no encontrada');
  if (['completed', 'cancelled'].includes(existing.status) && input.status !== 'cancelled') {
    throw new Error(`La corrida ya está ${existing.status}.`);
  }
  const meta = { ...(existing.metadata ?? {}), ...(input.metadata ?? {}) } as Record<string, unknown>;
  if (input.status !== 'in_progress') meta.completedAt = new Date().toISOString();
  const [row] = await db
    .update(teamPromptRuns)
    .set({
      status: input.status,
      summary: input.summary ?? existing.summary,
      connector: input.connector ?? existing.connector,
      metadata: meta,
    })
    .where(eq(teamPromptRuns.id, runId))
    .returning();
  await audit(teamId, userId, 'SALES_OPS_PROMPT_RESULT', { runId, status: input.status, connector: row.connector });
  const names = row.targetKind === 'chat' ? await chatNames(teamId, [Number(row.targetId)]) : new Map();
  return rowToRun(row, names.get(Number(row.targetId)) ?? null);
}
