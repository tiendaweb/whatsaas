import 'server-only';

import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, developerMissions, teamPromptRuns } from '@/lib/db/schema';
import { completePromptRun, launchRun, type PromptRunStatus } from '@/lib/plugins/sales-ops/server/prompt-queue';
import { terminalRegistry, type TerminalProject } from '@/lib/terminal/access';
import {
  MISSION_AGENT_META,
  MISSION_STATUS_META,
  MISSION_TRANSITIONS,
  esAgenteMcp,
  esMissionAgent,
  esMissionMode,
  esMissionStatus,
  modoTerminalDe,
  rellenarPrompt,
  type MissionAgent,
  type MissionMode,
  type MissionRow,
  type MissionStatus,
} from '../shared/types';
import { REGLAS_DE_LA_CASA, getDevPrompt, touchDevPrompt } from './prompts';

/**
 * Misiones del Centro de Desarrollo.
 *
 * Una misión de TERMINAL (claude/codex) la ejecuta la persona: la pantalla
 * abre una terminal en el proyecto con el agente y le tipea el prompt; acá
 * sólo se registra el estado y la sesión tmux. Una misión de CONECTOR se
 * encola como corrida en `team_prompt_runs` —la misma cola que el Command
 * Center comercial, así que la toma el próximo conector que pregunte por
 * trabajo con `whatspro_work_queue`— y el estado de la misión se LEE de la
 * corrida: la misión guarda `promptRunId` y no compite con ella.
 */

type Row = typeof developerMissions.$inferSelect;

const iso = (v: Date | null | undefined) => (v ? v.toISOString() : null);

async function audit(teamId: number, userId: number | null, action: string, metadata: Record<string, unknown>) {
  try {
    await db.insert(activityLogs).values({ teamId, userId, action, metadata, ipAddress: null });
  } catch (error) {
    console.error('[dev-center/audit]', error);
  }
}

/** Estado de la corrida → estado de la misión. `queued` se queda `queued`. */
const ESTADO_POR_CORRIDA: Partial<Record<PromptRunStatus, MissionStatus>> = {
  in_progress: 'running',
  blocked: 'blocked',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

function proyecto(slug: string): TerminalProject | null {
  return terminalRegistry().projects.find((p) => p.slug === slug) ?? null;
}

function rowToMission(r: Row, run: { status: string; summary: string | null } | null): MissionRow {
  return {
    id: r.id,
    project: r.project,
    projectName: proyecto(r.project)?.name ?? r.project,
    agent: esMissionAgent(r.agent) ? r.agent : 'claude',
    mode: esMissionMode(r.mode) ? r.mode : 'editar',
    title: r.title,
    prompt: r.prompt,
    status: esMissionStatus(r.status) ? r.status : 'draft',
    priority: r.priority,
    promptId: r.promptId,
    promptRunId: r.promptRunId,
    runStatus: run?.status ?? null,
    runSummary: run?.summary ?? null,
    tmuxName: r.tmuxName,
    resultSummary: r.resultSummary,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [],
    startedAt: iso(r.startedAt),
    finishedAt: iso(r.finishedAt),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export type ListMissionsOptions = { status?: 'open' | 'all' | MissionStatus; limit?: number };

export async function listMissions(teamId: number, opts: ListMissionsOptions = {}): Promise<MissionRow[]> {
  const rows = await db.select().from(developerMissions).where(eq(developerMissions.teamId, teamId)).orderBy(desc(developerMissions.updatedAt)).limit(Math.min(500, Math.max(1, (opts.limit ?? 200) * 3)));
  const runIds = rows.map((r) => r.promptRunId).filter((id): id is number => id != null);
  const runs = runIds.length
    ? await db.select({ id: teamPromptRuns.id, status: teamPromptRuns.status, summary: teamPromptRuns.summary, completedAt: teamPromptRuns.completedAt }).from(teamPromptRuns).where(and(eq(teamPromptRuns.teamId, teamId), inArray(teamPromptRuns.id, runIds)))
    : [];
  const runById = new Map(runs.map((r) => [r.id, r]));

  // Estado derivado de la corrida: el conector cierra la corrida, no la
  // misión. Lo que cambió se persiste acá mismo para que la próxima lectura
  // ya lo tenga y la fecha de fin sea la real.
  const out: MissionRow[] = [];
  for (const row of rows) {
    let actual = row;
    const run = row.promptRunId ? runById.get(row.promptRunId) ?? null : null;
    if (run) {
      const derivado = ESTADO_POR_CORRIDA[run.status as PromptRunStatus];
      if (derivado && derivado !== row.status && esMissionStatus(row.status) && MISSION_STATUS_META[row.status].abierta) {
        const cerrada = !MISSION_STATUS_META[derivado].abierta;
        const [updated] = await db.update(developerMissions).set({
          status: derivado,
          ...(derivado === 'running' && !row.startedAt ? { startedAt: new Date() } : {}),
          ...(cerrada ? { finishedAt: run.completedAt ?? new Date(), resultSummary: row.resultSummary ?? run.summary ?? null } : {}),
          updatedAt: new Date(),
        }).where(eq(developerMissions.id, row.id)).returning();
        if (updated) actual = updated;
      }
    }
    out.push(rowToMission(actual, run ? { status: run.status, summary: run.summary } : null));
  }

  const filtered = out.filter((m) => {
    if (!opts.status || opts.status === 'all') return true;
    if (opts.status === 'open') return MISSION_STATUS_META[m.status].abierta;
    return m.status === opts.status;
  });
  return filtered.slice(0, opts.limit ?? 200);
}

export async function getMission(teamId: number, id: number): Promise<MissionRow | null> {
  const [m] = await listMissions(teamId, { status: 'all', limit: 500 }).then((all) => all.filter((x) => x.id === id));
  return m ?? null;
}

export type CreateMissionInput = {
  title: string;
  project: string;
  agent: MissionAgent;
  mode: MissionMode;
  prompt?: string;
  promptId?: number | null;
  promptKey?: string | null;
  variables?: Record<string, string>;
  priority?: number;
  tags?: string[];
  /** Lanzar ya: conector → a la cola; terminal → queda en borrador (la abre la persona). */
  launch?: boolean;
};

/** Los agentes MCP (escritorio y conector) van siempre; los de terminal sólo si el proyecto los tiene habilitados. */
function validarAgente(p: TerminalProject, agent: MissionAgent) {
  if (esAgenteMcp(agent)) return;
  const modo = modoTerminalDe(agent);
  if (!modo || !p.agents.includes(modo)) throw new Error(`${p.name} no tiene habilitado ${MISSION_AGENT_META[agent].corto}. Agentes del proyecto: ${p.agents.join(', ') || 'ninguno'}.`);
}

export async function createMission(teamId: number, userId: number, input: CreateMissionInput): Promise<MissionRow> {
  const title = input.title.trim().slice(0, 200);
  if (title.length < 2) throw new Error('El título es obligatorio.');
  if (!esMissionAgent(input.agent)) throw new Error('Agente inválido.');
  if (!esMissionMode(input.mode)) throw new Error('Modo inválido.');
  const p = proyecto(input.project);
  if (!p) throw new Error(`Proyecto desconocido: ${input.project}. Los del registro: ${terminalRegistry().projects.map((x) => x.slug).join(', ')}.`);
  validarAgente(p, input.agent);

  let prompt = (input.prompt ?? '').trim();
  let promptId: number | null = null;
  if (input.promptId || input.promptKey) {
    const plantilla = await getDevPrompt(teamId, input.promptId ? { id: input.promptId } : { key: input.promptKey ?? '' });
    if (!plantilla) throw new Error('No existe ese prompt de la biblioteca.');
    promptId = plantilla.id;
    const cuerpo = rellenarPrompt(plantilla.body, input.variables ?? {});
    // Lo tipeado a mano va después de la plantilla, como indicación extra.
    prompt = prompt ? `${cuerpo}\n\nINDICACIÓN ADICIONAL:\n${prompt}` : cuerpo;
    await touchDevPrompt(teamId, plantilla.id);
  }
  if (prompt.length < 5) throw new Error('El prompt es obligatorio (mínimo 5 caracteres): elegí uno de la biblioteca o escribilo.');

  const [row] = await db.insert(developerMissions).values({
    teamId,
    userId,
    project: p.slug,
    agent: input.agent,
    mode: input.mode,
    title,
    prompt: prompt.slice(0, 20000),
    status: 'draft',
    priority: Math.min(3, Math.max(1, input.priority ?? 2)),
    promptId,
    tags: (input.tags ?? []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 10),
  }).returning();
  await audit(teamId, userId, 'DEV_MISSION_CREATED', { missionId: row.id, agent: row.agent, project: row.project, mode: row.mode, promptId });

  if (input.launch && esAgenteMcp(input.agent)) return launchMissionToConnector(teamId, userId, row.id);
  return rowToMission(row, null);
}

export type UpdateMissionInput = Partial<{
  status: MissionStatus;
  resultSummary: string | null;
  title: string;
  prompt: string;
  priority: number;
  tags: string[];
  tmuxName: string | null;
  mode: MissionMode;
}>;

export async function updateMission(teamId: number, userId: number | null, id: number, patch: UpdateMissionInput): Promise<MissionRow> {
  const current = await db.query.developerMissions.findFirst({ where: and(eq(developerMissions.teamId, teamId), eq(developerMissions.id, id)) });
  if (!current) throw new Error('No existe la misión.');
  const estadoActual: MissionStatus = esMissionStatus(current.status) ? current.status : 'draft';
  const enColaDeConector = esMissionAgent(current.agent) && esAgenteMcp(current.agent) && current.promptRunId != null && (estadoActual === 'queued' || estadoActual === 'running' || estadoActual === 'blocked');

  if (patch.status && patch.status !== estadoActual && !MISSION_TRANSITIONS[estadoActual].includes(patch.status)) {
    throw new Error(`No se puede pasar de ${MISSION_STATUS_META[estadoActual].label} a ${MISSION_STATUS_META[patch.status].label}.`);
  }
  if (patch.prompt !== undefined && enColaDeConector) {
    throw new Error('La misión ya está en la cola del conector: no se edita el prompt. Cancelala y creá otra.');
  }
  if (patch.status === 'cancelled' && enColaDeConector) {
    // Cancelar la misión cancela la corrida: si no, el conector la tomaría igual.
    await completePromptRun(teamId, userId, current.promptRunId!, { status: 'cancelled', summary: 'Cancelada desde el Centro de Desarrollo.' }).catch(() => undefined);
  }
  const cierra = patch.status ? !MISSION_STATUS_META[patch.status].abierta : false;
  const [updated] = await db.update(developerMissions).set({
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.resultSummary !== undefined && { resultSummary: patch.resultSummary?.trim().slice(0, 8000) || null }),
    ...(patch.title !== undefined && { title: patch.title.trim().slice(0, 200) }),
    ...(patch.prompt !== undefined && { prompt: patch.prompt.slice(0, 20000) }),
    ...(patch.priority !== undefined && { priority: Math.min(3, Math.max(1, patch.priority)) }),
    ...(patch.tags !== undefined && { tags: patch.tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 10) }),
    ...(patch.tmuxName !== undefined && { tmuxName: patch.tmuxName?.slice(0, 80) || null }),
    ...(patch.mode !== undefined && { mode: patch.mode }),
    ...(patch.status === 'running' && !current.startedAt ? { startedAt: new Date() } : {}),
    ...(cierra ? { finishedAt: new Date() } : {}),
    ...(patch.status && MISSION_STATUS_META[patch.status].abierta && current.finishedAt ? { finishedAt: null } : {}),
    updatedAt: new Date(),
  }).where(eq(developerMissions.id, id)).returning();
  await audit(teamId, userId, 'DEV_MISSION_UPDATED', { missionId: id, from: estadoActual, to: updated.status, changed: Object.keys(patch) });
  return rowToMission(updated, null);
}

/** La ficha del proyecto + reglas + el prompt: lo que el conector recibe como texto de la corrida. */
/** A quién va dirigida: los escritorios filtran por `agent`, y el texto se lo recuerda a cualquier otro cliente que la vea. */
function paraQuien(agent: string): string {
  if (agent === 'claude_desktop') return 'PARA: Claude Desktop (cliente MCP). Si sos otro cliente MCP, no la tomes: dejala para quien corresponde.';
  if (agent === 'codex_desktop') return 'PARA: Codex de escritorio (cliente MCP). Si sos otro cliente MCP, no la tomes: dejala para quien corresponde.';
  return 'PARA: cualquier conector de IA (Claude, ChatGPT, Grok, Codex).';
}

export function composeMissionText(mission: { title: string; prompt: string; mode: string; project: string; agent?: string }, p: TerminalProject | null): string {
  const ficha = p
    ? [
        `PROYECTO: ${p.name} (${p.slug})`,
        `Carpeta: ${p.cwd} · rama por defecto: ${p.defaultBranch} · producción: ${p.productionUrl}`,
        `Stack: ${p.stack}`,
        ...Object.entries(p.commands ?? {}).map(([k, v]) => `Comando ${k}: ${v}`),
      ].join('\n')
    : `PROYECTO: ${mission.project}`;
  return [
    `MISIÓN DE DESARROLLO · ${p?.name ?? mission.project} · modo ${mission.mode}`,
    `Título: ${mission.title}`,
    paraQuien(mission.agent ?? 'connector'),
    '',
    ficha,
    '',
    REGLAS_DE_LA_CASA,
    '',
    'AL TOMARLA: whatspro_dev_mission_manage {action: "update", mission_id, status: "running"}. CIERRE OBLIGATORIO: whatspro_dev_mission_manage {action: "result", mission_id, status: "completed" | "failed" | "blocked", result_summary} contando qué hiciste, qué verificaste y qué queda (cierra también la corrida; whatspro_sales_prompt_result {run_id, …} es el equivalente). Si necesitás una decisión humana, status "blocked" y explicá qué falta en result_summary.',
    '',
    'MISIÓN:',
    mission.prompt,
  ].join('\n');
}

export async function launchMissionToConnector(teamId: number, userId: number | null, id: number): Promise<MissionRow> {
  const current = await db.query.developerMissions.findFirst({ where: and(eq(developerMissions.teamId, teamId), eq(developerMissions.id, id)) });
  if (!current) throw new Error('No existe la misión.');
  if (!esMissionAgent(current.agent) || !esAgenteMcp(current.agent)) throw new Error('Sólo las misiones de conector o de escritorio (MCP) se encolan; las de terminal se abren desde Terminales.');
  const estadoActual: MissionStatus = esMissionStatus(current.status) ? current.status : 'draft';
  if (!MISSION_TRANSITIONS[estadoActual].includes('queued') && estadoActual !== 'queued') throw new Error(`No se puede encolar una misión ${MISSION_STATUS_META[estadoActual].label}.`);
  if (current.promptRunId && (estadoActual === 'queued' || estadoActual === 'running')) throw new Error('La misión ya está en la cola.');

  const p = proyecto(current.project);
  const { run } = await launchRun(teamId, userId, {
    approved: true,
    text: composeMissionText(current, p),
    title: current.title,
    targetKind: 'team',
    mode: 'queue',
  });
  const [updated] = await db.update(developerMissions).set({
    promptRunId: run.id,
    status: 'queued',
    startedAt: current.startedAt ?? new Date(),
    finishedAt: null,
    updatedAt: new Date(),
  }).where(eq(developerMissions.id, id)).returning();
  await audit(teamId, userId, 'DEV_MISSION_LAUNCHED', { missionId: id, runId: run.id, project: current.project, mode: current.mode });
  return rowToMission(updated, { status: run.status, summary: run.summary });
}

export async function cancelMission(teamId: number, userId: number | null, id: number): Promise<MissionRow> {
  return updateMission(teamId, userId, id, { status: 'cancelled' });
}

export async function missionCounts(teamId: number): Promise<Record<MissionStatus, number>> {
  const all = await listMissions(teamId, { status: 'all', limit: 500 });
  const counts = Object.fromEntries(Object.keys(MISSION_STATUS_META).map((s) => [s, 0])) as Record<MissionStatus, number>;
  for (const m of all) counts[m.status] += 1;
  return counts;
}
