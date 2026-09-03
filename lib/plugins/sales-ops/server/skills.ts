import 'server-only';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, teamCommercialAnalysis, teamCommercialSignals, teamPrompts } from '@/lib/db/schema';
import {
  CATEGORY_LABELS,
  allowsTarget,
  isCategory,
  isExecution,
  isRecurrence,
  isScope,
  isSkillIcon,
  normalizeVariables,
  type Skill,
  type SkillCategory,
  type SkillInput,
  type SkillRecommendFor,
} from '../shared/skills';
import { ANALYSIS_STATUSES, GATES, OWNERS, SIGNAL_KINDS, type AnalysisStatus, type Gate, type Owner, type SignalKind } from '../shared/taxonomy';
import { SALES_OPS_PROMPT_KEYS } from './prompts';

/**
 * Gestor de skills del Prompt Studio.
 *
 * Una skill vive en `team_prompts`. El versionado no cambió: guardar crea una
 * versión nueva `active` y retira las anteriores, así una corrida vieja sigue
 * apuntando al texto con el que se ejecutó. Lo que cambió es que ahora la fila
 * describe cómo se usa (rutina o puntual, API o cola, equipo o chat) y qué
 * datos pide, de modo que la UI y un conector puedan lanzarla sin leer el texto.
 *
 * Todo lo que entra —de la UI o de una tool MCP— pasa por `normalizeSkillInput`:
 * un valor fuera de las listas cerradas cae al default en vez de guardarse,
 * porque una categoría inventada es una tarjeta que no aparece en ningún filtro.
 */

const ACTIVE_STATUSES = ['active', 'draft'] as const;
/** Sólo los prompts del Studio; los del motor de clasificación viven aparte. */
const SKILL_PURPOSE = 'custom';

export type SkillRow = typeof teamPrompts.$inferSelect;

// ── Serialización ──────────────────────────────────────────────────────────

function toRecommendFor(raw: unknown): SkillRecommendFor {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const list = value.map(String).filter((v): v is T => (allowed as readonly string[]).includes(v));
    return list.length ? Array.from(new Set(list)) : undefined;
  };
  const out: SkillRecommendFor = {};
  const gates = pick<Gate>(r.gates, GATES);
  const statuses = pick<AnalysisStatus>(r.statuses, ANALYSIS_STATUSES);
  const signals = pick<SignalKind>(r.signals, SIGNAL_KINDS);
  const owners = pick<Owner>(r.owners, OWNERS);
  if (gates) out.gates = gates;
  if (statuses) out.statuses = statuses;
  if (signals) out.signals = signals;
  if (owners) out.owners = owners;
  return out;
}

/** El texto de la skill es system + plantilla; para las `qa.*` el system va vacío. */
export function skillText(row: Pick<SkillRow, 'systemPrompt' | 'userTemplate'>): string {
  return [row.systemPrompt, row.userTemplate].filter((part) => part && part.trim()).join('\n\n');
}

export function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    category: isCategory(row.category) ? row.category : 'general',
    icon: isSkillIcon(row.icon) ? row.icon : 'sparkles',
    recurrence: isRecurrence(row.recurrence) ? row.recurrence : 'on_demand',
    execution: isExecution(row.execution) ? row.execution : 'connector',
    scope: isScope(row.scope) ? row.scope : 'team',
    variables: normalizeVariables(row.variables),
    recommendFor: toRecommendFor(row.recommendFor),
    toolChain: Array.isArray(row.toolChain) ? row.toolChain : [],
    notes: row.notes,
    text: skillText(row),
    version: row.version,
    status: row.status,
    pinned: row.pinned,
    usageCount: row.usageCount,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Lectura ────────────────────────────────────────────────────────────────

export type ListSkillsOptions = {
  /** `all` incluye las retiradas (para el historial del editor). */
  status?: 'live' | 'all';
  category?: SkillCategory;
  /** `routine` = cadencia distinta de puntual. */
  kind?: 'routine' | 'on_demand';
  target?: 'team' | 'chat';
  search?: string;
};

/**
 * Skills del equipo, una fila por `key` (la versión viva). Ordena fijadas
 * primero, después por uso y por título: quien entra a la vista ve arriba lo
 * que el equipo realmente usa, no lo que se creó último.
 */
export async function listSkills(teamId: number, opts: ListSkillsOptions = {}): Promise<Skill[]> {
  // `purpose` distinto de custom son los prompts del motor (sales-ops.classify,
  // sales-ops.radar): se editan desde el clasificador, no son skills lanzables.
  const where =
    opts.status === 'all'
      ? and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.purpose, SKILL_PURPOSE))
      : and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.purpose, SKILL_PURPOSE), inArray(teamPrompts.status, [...ACTIVE_STATUSES]));
  const rows = await db.query.teamPrompts.findMany({
    where,
    orderBy: (t, { asc, desc: d }) => [d(t.pinned), d(t.usageCount), asc(t.title), d(t.version)],
  });

  const seen = new Set<string>();
  let skills = rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true))).map(rowToSkill);

  if (opts.category) skills = skills.filter((s) => s.category === opts.category);
  if (opts.kind === 'routine') skills = skills.filter((s) => s.recurrence !== 'on_demand');
  if (opts.kind === 'on_demand') skills = skills.filter((s) => s.recurrence === 'on_demand');
  if (opts.target) skills = skills.filter((s) => allowsTarget(s, opts.target as 'team' | 'chat'));
  if (opts.search) {
    const q = opts.search.toLowerCase();
    skills = skills.filter((s) => `${s.title} ${s.description ?? ''} ${s.key} ${s.text}`.toLowerCase().includes(q));
  }
  return skills;
}

/** Una skill por id o por key (la versión viva de esa key). */
export async function getSkill(teamId: number, ref: { id?: number | null; key?: string | null }): Promise<Skill | null> {
  if (ref.id) {
    const row = await db.query.teamPrompts.findFirst({ where: and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.id, ref.id)) });
    return row ? rowToSkill(row) : null;
  }
  const key = ref.key?.trim();
  if (!key) return null;
  const row = await db.query.teamPrompts.findFirst({
    where: and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, key), inArray(teamPrompts.status, [...ACTIVE_STATUSES])),
    orderBy: (t, { desc: d }) => [d(t.version)],
  });
  return row ? rowToSkill(row) : null;
}

/** Todas las versiones de una key, de la más nueva a la más vieja. */
export async function listSkillVersions(teamId: number, key: string): Promise<Skill[]> {
  const rows = await db.query.teamPrompts.findMany({
    where: and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, key)),
    orderBy: (t, { desc: d }) => [d(t.version)],
  });
  return rows.map(rowToSkill);
}

export function skillCategoryCounts(skills: Skill[]): Array<{ category: SkillCategory; label: string; count: number }> {
  const counts = new Map<SkillCategory, number>();
  for (const s of skills) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, label: CATEGORY_LABELS[category], count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ── Escritura ──────────────────────────────────────────────────────────────

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    console.error('[sales-ops/skills] audit', error);
  }
}

export type NormalizedSkillInput = Required<Omit<SkillInput, 'key' | 'notes' | 'description'>> & {
  key: string | null;
  notes: string | null;
  description: string | null;
};

/** Sanea lo que llega de la UI o de una tool MCP. Nada de acá puede reventar la fila. */
export function normalizeSkillInput(raw: SkillInput): NormalizedSkillInput {
  const title = String(raw.title ?? '').trim().slice(0, 160);
  const text = String(raw.text ?? '').trim().slice(0, 20_000);
  if (title.length < 3) throw new Error('El título necesita al menos 3 caracteres.');
  if (text.length < 5) throw new Error('El texto de la skill necesita al menos 5 caracteres.');
  return {
    key: raw.key ? String(raw.key).trim().slice(0, 64) : null,
    title,
    text,
    description: raw.description ? String(raw.description).trim().slice(0, 400) : null,
    category: isCategory(raw.category) ? raw.category : 'general',
    icon: isSkillIcon(raw.icon) ? raw.icon : 'sparkles',
    recurrence: isRecurrence(raw.recurrence) ? raw.recurrence : 'on_demand',
    execution: isExecution(raw.execution) ? raw.execution : 'connector',
    scope: isScope(raw.scope) ? raw.scope : 'team',
    variables: normalizeVariables(raw.variables),
    recommendFor: toRecommendFor(raw.recommendFor),
    toolChain: Array.isArray(raw.toolChain) ? raw.toolChain.map((t) => String(t).trim().slice(0, 80)).filter(Boolean).slice(0, 20) : [],
    notes: raw.notes ? String(raw.notes).slice(0, 2000) : null,
    pinned: raw.pinned === true,
  };
}

/**
 * Crea o versiona una skill. La versión nueva queda `active`; las anteriores
 * pasan a `retired` en la misma transacción (hay un índice único parcial de una
 * sola `active` por key, así que retirar y crear no puede quedar a medias).
 */
export async function upsertSkill(teamId: number, userId: number, raw: SkillInput): Promise<Skill> {
  const input = normalizeSkillInput(raw);
  const key = (input.key || `qa.${slugify(input.title)}`).slice(0, 64);
  // Guardar una skill con la key de un prompt del motor lo dejaría retirado y
  // el clasificador volvería al texto por defecto sin avisar.
  if ((Object.values(SALES_OPS_PROMPT_KEYS) as string[]).includes(key)) {
    throw new Error(`"${key}" es un prompt del motor de clasificación, no una skill. Usá otra key.`);
  }
  const previous = await db.query.teamPrompts.findMany({
    where: and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, key)),
    columns: { id: true, version: true, usageCount: true, lastUsedAt: true },
  });
  const version = previous.reduce((max, p) => Math.max(max, p.version), 0) + 1;
  // El uso acumulado es de la skill, no de la versión: se arrastra al versionar.
  const usageCount = previous.reduce((max, p) => Math.max(max, p.usageCount ?? 0), 0);
  const lastUsedAt = previous.reduce<Date | null>((latest, p) => (p.lastUsedAt && (!latest || p.lastUsedAt > latest) ? p.lastUsedAt : latest), null);

  const row = await db.transaction(async (tx) => {
    if (previous.length) {
      await tx.update(teamPrompts).set({ status: 'retired', updatedAt: new Date() }).where(and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, key)));
    }
    const [inserted] = await tx
      .insert(teamPrompts)
      .values({
        teamId,
        key,
        title: input.title,
        purpose: 'custom',
        audience: input.execution === 'api' ? 'server' : input.execution === 'connector' ? 'connector' : 'both',
        version,
        status: 'active',
        systemPrompt: '',
        userTemplate: input.text,
        toolChain: input.toolChain,
        notes: input.notes,
        description: input.description,
        category: input.category,
        icon: input.icon,
        recurrence: input.recurrence,
        execution: input.execution,
        scope: input.scope,
        variables: input.variables as unknown as Record<string, unknown>[],
        recommendFor: input.recommendFor as Record<string, unknown>,
        pinned: input.pinned,
        usageCount,
        lastUsedAt,
        createdBy: userId,
      })
      .returning();
    return inserted;
  });

  await audit(teamId, userId, 'SALES_OPS_SKILL_SAVED', { key, version, skillId: row.id, category: row.category, execution: row.execution, recurrence: row.recurrence });
  return rowToSkill(row);
}

/** Duplica una skill como borrador editable con key propia. */
export async function duplicateSkill(teamId: number, userId: number, id: number): Promise<Skill> {
  const source = await getSkill(teamId, { id });
  if (!source) throw new Error('Skill no encontrada');
  return upsertSkill(teamId, userId, {
    key: `${source.key}-copia`.slice(0, 64),
    title: `${source.title} (copia)`.slice(0, 160),
    text: source.text,
    description: source.description,
    category: source.category,
    icon: source.icon,
    recurrence: source.recurrence,
    execution: source.execution,
    scope: source.scope,
    variables: source.variables,
    recommendFor: source.recommendFor,
    toolChain: source.toolChain,
    notes: source.notes,
    pinned: false,
  });
}

/** Fija o suelta una skill (afecta sólo a la versión viva; es preferencia de vista). */
export async function setSkillPinned(teamId: number, userId: number, id: number, pinned: boolean): Promise<Skill> {
  const [row] = await db
    .update(teamPrompts)
    .set({ pinned, updatedAt: new Date() })
    .where(and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.id, id)))
    .returning();
  if (!row) throw new Error('Skill no encontrada');
  await audit(teamId, userId, 'SALES_OPS_SKILL_PINNED', { skillId: id, pinned });
  return rowToSkill(row);
}

/** Retira todas las versiones de una key. Las corridas ya encoladas no se tocan. */
export async function retireSkill(teamId: number, userId: number, key: string): Promise<number> {
  const rows = await db
    .update(teamPrompts)
    .set({ status: 'retired', updatedAt: new Date() })
    .where(and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.key, key)))
    .returning({ id: teamPrompts.id });
  await audit(teamId, userId, 'SALES_OPS_SKILL_RETIRED', { key, count: rows.length });
  return rows.length;
}

/** Marca uso al lanzar. Nunca puede tumbar un lanzamiento: se traga el error. */
export async function markSkillUsed(teamId: number, skillId: number): Promise<void> {
  try {
    await db
      .update(teamPrompts)
      .set({ usageCount: sql`${teamPrompts.usageCount} + 1`, lastUsedAt: new Date() })
      .where(and(eq(teamPrompts.teamId, teamId), eq(teamPrompts.id, skillId)));
  } catch (error) {
    console.error('[sales-ops/skills] markSkillUsed', error);
  }
}

// ── Recomendaciones para la ficha de un chat ───────────────────────────────

export type SkillRecommendation = { skill: Skill; reason: string; score: number };

export type ChatSituation = {
  chatId: number;
  gate: Gate | null;
  status: AnalysisStatus | null;
  owner: Owner | null;
  signals: SignalKind[];
};

/** Gate, estado, responsable y señales nuevas del chat: con eso se decide qué se recomienda. */
export async function getChatSituation(teamId: number, chatId: number): Promise<ChatSituation> {
  const analysis = await db.query.teamCommercialAnalysis.findFirst({
    where: and(eq(teamCommercialAnalysis.teamId, teamId), eq(teamCommercialAnalysis.chatId, chatId)),
    columns: { currentGate: true, status: true, recommendedOwner: true },
  });
  const signalRows = await db
    .select({ kind: teamCommercialSignals.kind })
    .from(teamCommercialSignals)
    .where(and(eq(teamCommercialSignals.teamId, teamId), eq(teamCommercialSignals.chatId, chatId), inArray(teamCommercialSignals.status, ['new', 'seen'])))
    .orderBy(desc(teamCommercialSignals.createdAt))
    .limit(10);
  const signals = signalRows.map((s) => s.kind).filter((k): k is SignalKind => (SIGNAL_KINDS as readonly string[]).includes(k));
  return {
    chatId,
    gate: (analysis?.currentGate as Gate | undefined) ?? null,
    status: (analysis?.status as AnalysisStatus | undefined) ?? null,
    owner: (analysis?.recommendedOwner as Owner | undefined) ?? null,
    signals: Array.from(new Set(signals)),
  };
}

/**
 * Skills recomendadas para un chat, de la más específica a la más genérica.
 *
 * Puntúa por coincidencia declarada (`recommendFor`): una señal nueva pesa más
 * que el gate porque es lo último que pasó, y el gate más que el estado. Una
 * skill sin ninguna coincidencia entra igual al final si está fijada, para que
 * la ficha nunca quede sin nada que ofrecer — pero se distingue por `reason`.
 */
export async function recommendSkillsForChat(teamId: number, chatId: number, limit = 5): Promise<{ situation: ChatSituation; recommendations: SkillRecommendation[] }> {
  const [situation, skills] = await Promise.all([getChatSituation(teamId, chatId), listSkills(teamId, { target: 'chat' })]);

  const scored: SkillRecommendation[] = [];
  for (const skill of skills) {
    const rec = skill.recommendFor;
    const reasons: string[] = [];
    let score = 0;
    const matchedSignal = situation.signals.find((s) => rec.signals?.includes(s));
    if (matchedSignal) {
      score += 60;
      reasons.push(`respondió: ${matchedSignal.replace(/_/g, ' ')}`);
    }
    if (situation.gate && rec.gates?.includes(situation.gate)) {
      score += 40;
      reasons.push(`está en ${situation.gate}`);
    }
    if (situation.status && rec.statuses?.includes(situation.status)) {
      score += 20;
      reasons.push(`destino ${situation.status.replace(/_/g, ' ')}`);
    }
    if (situation.owner && rec.owners?.includes(situation.owner)) {
      score += 10;
      reasons.push(`responsable ${situation.owner}`);
    }
    if (score === 0) {
      if (!skill.pinned) continue;
      scored.push({ skill, reason: 'Fijada por el equipo', score: 1 });
      continue;
    }
    if (skill.pinned) score += 5;
    scored.push({ skill, reason: reasons.join(' · '), score });
  }

  scored.sort((a, b) => b.score - a.score || b.skill.usageCount - a.skill.usageCount);
  return { situation, recommendations: scored.slice(0, Math.min(Math.max(1, limit), 12)) };
}
