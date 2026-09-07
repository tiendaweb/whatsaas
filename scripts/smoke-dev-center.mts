/**
 * Smoke del Centro de Desarrollo (plugin `dev-center`), CONTRA LA BASE:
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx --env-file=.env scripts/smoke-dev-center.mts
 *
 * Prueba lo que la app promete: la biblioteca de prompts se siembra sin
 * duplicar, `{{variables}}` se rellenan y los huecos sin valor quedan a la
 * vista, una misión de terminal recorre draft → running → completed y no puede
 * volver atrás por un camino prohibido, y una misión de conector se encola
 * como corrida aprobada en `team_prompt_runs` y aparece en la cola unificada
 * (`whatspro_work_queue`) como `run_prompt`. Y la lista blanca sigue cerrada.
 *
 * ESCRIBE: crea prompts y misiones `[SMOKE] …` en el equipo 2 y borra todo al
 * final, corridas incluidas. Nada real se toca.
 */
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { developerMissions, developerPrompts, teamPromptRuns } from '@/lib/db/schema';
import { buildPermissionContext } from '@/lib/auth/permissions-guard';
import { listUnifiedWorkQueue } from '@/lib/work-queue/service';
import { isTerminalOperator } from '@/lib/terminal/access';
import { rellenarPrompt } from '@/lib/plugins/dev-center/shared/types';
import { deleteDevPrompt, listDevPrompts, seedDevPrompts, upsertDevPrompt } from '@/lib/plugins/dev-center/server/prompts';
import { cancelMission, createMission, listMissions, updateMission } from '@/lib/plugins/dev-center/server/missions';
import { executeDevCenterTool } from '@/lib/plugins/dev-center/tools/dev-center-tools';

const TEAM = Number(process.env.SMOKE_TEAM_ID ?? 2);
const USER = Number(process.env.SMOKE_USER_ID ?? 3);
const PREFIJO = '[SMOKE]';

let fallas = 0;
const check = (nombre: string, ok: boolean, detalle?: unknown) => {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle !== undefined ? ` → ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}` : ''}`);
  if (!ok) fallas += 1;
};

async function debeFallar(nombre: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(nombre, false, 'no falló');
  } catch (error) {
    check(nombre, true, error instanceof Error ? error.message : String(error));
  }
}

/** Todo lo `[SMOKE]`: misiones, sus corridas y los prompts. En ese orden por las FK. */
async function limpiar() {
  const misiones = await db.select({ id: developerMissions.id, runId: developerMissions.promptRunId }).from(developerMissions)
    .where(and(eq(developerMissions.teamId, TEAM), like(developerMissions.title, `${PREFIJO}%`)));
  const runIds = misiones.map((m) => m.runId).filter((id): id is number => id != null);
  if (misiones.length) await db.delete(developerMissions).where(inArray(developerMissions.id, misiones.map((m) => m.id)));
  // `db.delete(teamPromptRuns)` con drizzle genera un SQL que Postgres rechaza
  // («syntax error at or near "$2"»): se borra con SQL plano.
  if (runIds.length) await db.execute(sql`delete from team_prompt_runs where team_id = ${TEAM} and id in (${sql.join(runIds.map((id) => sql`${id}`), sql`, `)})`);
  await db.delete(developerPrompts).where(and(eq(developerPrompts.teamId, TEAM), like(developerPrompts.title, `${PREFIJO}%`)));
}

async function main() {
  await limpiar();

  // ── (e) la lista blanca sigue cerrada ────────────────────────────────────
  check('un email fuera de la lista blanca NO es operador', !isTerminalOperator({ email: 'otro@x.com' }));
  check('sin email NO es operador', !isTerminalOperator(null));

  // ── (a) semilla idempotente ─────────────────────────────────────────────
  await seedDevPrompts(TEAM, USER);
  const primera = (await listDevPrompts(TEAM)).length;
  await seedDevPrompts(TEAM, USER);
  const segunda = (await listDevPrompts(TEAM)).length;
  check('seedDevPrompts es idempotente (misma cantidad de filas)', primera > 0 && primera === segunda, { primera, segunda });

  // ── (b) variables ────────────────────────────────────────────────────────
  const prompt = await upsertDevPrompt(TEAM, USER, {
    key: 'smoke.variables',
    title: `${PREFIJO} variables`,
    body: 'Revisá {{modulo}} en {{proyecto}} y dejá {{pendiente}} sin tocar.',
    agentDefault: 'claude',
    modeDefault: 'analizar',
    variables: [{ key: 'modulo', label: 'Módulo' }, { key: 'proyecto', label: 'Proyecto' }, { key: 'pendiente', label: 'Pendiente' }],
  });
  check('upsertDevPrompt devuelve la fila con su id', typeof prompt.id === 'number' && prompt.key === 'smoke.variables');
  const relleno = rellenarPrompt(prompt.body, { modulo: 'Radar', proyecto: 'WhatsPro' });
  check('rellenarPrompt reemplaza lo que viene', relleno.startsWith('Revisá Radar en WhatsPro'), relleno);
  check('rellenarPrompt deja a la vista el hueco sin valor', relleno.includes('{{pendiente}}'), relleno);
  const actualizado = await upsertDevPrompt(TEAM, USER, { key: 'smoke.variables', title: `${PREFIJO} variables v2`, body: prompt.body });
  check('upsert sobre la misma key actualiza en vez de duplicar', actualizado.id === prompt.id && actualizado.title.endsWith('v2'));

  // ── (c) misión de terminal ───────────────────────────────────────────────
  const terminal = await createMission(TEAM, USER, {
    title: `${PREFIJO} misión de terminal`,
    project: 'whatspro',
    agent: 'claude',
    mode: 'analizar',
    prompt: relleno,
    promptId: prompt.id,
  });
  check('createMission (claude) nace en draft con el prompt enlazado', terminal.status === 'draft' && terminal.promptId === prompt.id && terminal.agent === 'claude', { status: terminal.status });
  const corriendo = await updateMission(TEAM, USER, terminal.id, { status: 'running', tmuxName: `wp-${USER}-whatspro-4` });
  check('draft → running guarda tmuxName y startedAt', corriendo.status === 'running' && corriendo.tmuxName === `wp-${USER}-whatspro-4` && corriendo.startedAt != null);
  const cerrada = await updateMission(TEAM, USER, terminal.id, { status: 'completed', resultSummary: 'Revisado: nada roto.' });
  check('running → completed guarda el resumen y finishedAt', cerrada.status === 'completed' && cerrada.resultSummary === 'Revisado: nada roto.' && cerrada.finishedAt != null);
  await debeFallar('completed → queued es una transición prohibida', () => updateMission(TEAM, USER, terminal.id, { status: 'queued' }));

  // ── (d) misión de conector ───────────────────────────────────────────────
  const conector = await createMission(TEAM, USER, {
    title: `${PREFIJO} misión de conector`,
    project: 'whatspro',
    agent: 'connector',
    mode: 'analizar',
    prompt: 'Listá las tools MCP de producción y contá cuántas hay. No ejecutes nada.',
    launch: true,
  });
  check('createMission (connector, launch) queda en queued con promptRunId', conector.status === 'queued' && conector.promptRunId != null, { status: conector.status, runId: conector.promptRunId });
  const run = conector.promptRunId ? await db.query.teamPromptRuns.findFirst({ where: and(eq(teamPromptRuns.teamId, TEAM), eq(teamPromptRuns.id, conector.promptRunId)) }) : null;
  const meta = (run?.metadata ?? {}) as Record<string, unknown>;
  check('la corrida existe en team_prompt_runs, queued y aprobada (metadata.approvedAt)', run?.status === 'queued' && typeof meta.approvedAt === 'string', { status: run?.status, approvedAt: meta.approvedAt ?? null });
  // El texto compuesto de la corrida vive en `prompt_snapshot` (la tabla no tiene columna `text`).
  const textoCorrida = String((run as unknown as { promptSnapshot?: string | null } | null)?.promptSnapshot ?? '');
  check('la corrida lleva el contexto del proyecto en el texto', /whatspro/i.test(textoCorrida) && /\/root\/whatsaas/.test(textoCorrida), textoCorrida.slice(0, 80));

  const ctx = await buildPermissionContext(TEAM, USER);
  if (!ctx) {
    check('buildPermissionContext del usuario del smoke', false, 'sin contexto');
  } else {
    const cola = await listUnifiedWorkQueue(ctx, { sources: ['sales'], limit: 200 });
    const item = cola.items.find((i) => i.kind === 'run_prompt' && (i.payload as { runId?: number }).runId === conector.promptRunId);
    check('la misión aparece en whatspro_work_queue como run_prompt', Boolean(item), item ? { key: item.key, tools: item.tools.length } : cola.items.slice(0, 3).map((i) => i.kind));
  }

  const listadas = await listMissions(TEAM, { status: 'open' });
  const vista = listadas.find((m) => m.id === conector.id);
  check('listMissions refleja el estado de la corrida (runStatus)', vista?.runStatus === 'queued', { runStatus: vista?.runStatus ?? null });

  const cancelada = await cancelMission(TEAM, USER, conector.id);
  const runCancelada = conector.promptRunId ? await db.query.teamPromptRuns.findFirst({ where: eq(teamPromptRuns.id, conector.promptRunId), columns: { status: true } }) : null;
  check('cancelMission deja la misión cancelled y la corrida cancelled', cancelada.status === 'cancelled' && runCancelada?.status === 'cancelled', { mision: cancelada.status, corrida: runCancelada?.status ?? null });

  // ── (f) misión para Claude Desktop (cliente MCP) ─────────────────────────
  const escritorio = await createMission(TEAM, USER, {
    title: `${PREFIJO} misión para Claude Desktop`,
    project: 'whatspro',
    agent: 'claude_desktop',
    mode: 'analizar',
    prompt: 'Contá cuántos prompts dev.* expone el conector. No ejecutes nada.',
    launch: true,
  });
  check('createMission (claude_desktop, launch) queda en queued con promptRunId', escritorio.status === 'queued' && escritorio.promptRunId != null, { status: escritorio.status, runId: escritorio.promptRunId });

  // ── (g) la tool filtra por agente ────────────────────────────────────────
  const contexto = { teamId: TEAM, userId: USER };
  const paraClaude = await executeDevCenterTool('whatspro_dev_missions', { for_agent: 'claude_desktop' }, contexto) as { missions?: Array<{ id: number }> };
  check('whatspro_dev_missions {for_agent: claude_desktop} devuelve la misión', Boolean(paraClaude.missions?.some((m) => m.id === escritorio.id)), { total: paraClaude.missions?.length ?? 0 });
  const paraCodex = await executeDevCenterTool('whatspro_dev_missions', { for_agent: 'codex_desktop' }, contexto) as { missions?: Array<{ id: number }> };
  check('whatspro_dev_missions {for_agent: codex_desktop} NO la devuelve', !paraCodex.missions?.some((m) => m.id === escritorio.id), { total: paraCodex.missions?.length ?? 0 });
  await cancelMission(TEAM, USER, escritorio.id);

  // ── limpieza ─────────────────────────────────────────────────────────────
  await deleteDevPrompt(TEAM, prompt.id);
  await limpiar();
  const restos = await db.select({ id: developerMissions.id }).from(developerMissions).where(and(eq(developerMissions.teamId, TEAM), like(developerMissions.title, `${PREFIJO}%`)));
  check('limpieza: no quedan misiones [SMOKE]', restos.length === 0);
}

main()
  .catch(async (error) => {
    console.error('✗ el smoke reventó:', error instanceof Error ? error.message : error); console.error(error instanceof Error ? error.stack?.split('\n').slice(0, 10).join('\n') : '');
    fallas += 1;
    await limpiar().catch(() => undefined);
  })
  .finally(() => {
    console.log(fallas ? `\n${fallas} chequeos fallaron.` : '\nTodo en orden.');
    process.exit(fallas ? 1 : 0);
  });
