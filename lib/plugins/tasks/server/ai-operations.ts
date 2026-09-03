import 'server-only';

import { createHash } from 'crypto';
import { and, desc, eq, isNotNull, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamOperationsAiMessages,
  teamTaskAiRuns,
  teamTaskItems,
  teamTaskProjects,
  teamTaskRelations,
  teamTaskWorkspaces,
  type TaskChecklistItem,
} from '@/lib/db/schema';

export type TaskAiPhase = 'prepare' | 'execute';
export type TaskAiRunStatus = 'completed' | 'blocked' | 'failed';

export type TaskAiWorkItem = {
  targetType: 'workspace' | 'project' | 'task';
  targetId: number;
  name: string;
  workspaceId: number | null;
  workspace: string | null;
  projectId: number | null;
  project: string | null;
  phase: TaskAiPhase;
  state: 'ready' | 'needs-context' | 'completed';
  prompt: string;
  inheritedPrompt: string;
  nextStep: string;
  contextQuestion: string;
  contextAnswer: string;
  fingerprint: string;
  lastResult?: { status: TaskAiRunStatus; summary: string; connector: string; at: string };
};

const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex');

function clean(value: string | null | undefined) {
  return (value ?? '').trim();
}

/**
 * Cola estable para cualquier interfaz de IA conectada.
 *
 * Fase prepare: convierte un prompt amplio en instrucciones o próximos pasos
 * concretos y los guarda con las herramientas normales de Tareas.
 * Fase execute: ejecuta ese próximo paso usando herramientas con permisos y
 * después informa el resultado. Una pregunta sin respuesta bloquea ambas fases.
 */
export async function loadTaskAiWorklist(
  teamId: number,
  options: { includeCompleted?: boolean; limit?: number } = {},
): Promise<TaskAiWorkItem[]> {
  const limit = Math.max(1, Math.min(options.limit ?? 100, 300));
  const [workspaces, projects, tasks, runs] = await Promise.all([
    db
      .select({ id: teamTaskWorkspaces.id, name: teamTaskWorkspaces.name, prompt: teamTaskWorkspaces.aiPrompt })
      .from(teamTaskWorkspaces)
      .where(and(eq(teamTaskWorkspaces.teamId, teamId), ne(teamTaskWorkspaces.aiPrompt, ''))),
    db
      .select({
        id: teamTaskProjects.id,
        name: teamTaskProjects.name,
        prompt: teamTaskProjects.aiPrompt,
        workspaceId: teamTaskProjects.workspaceId,
        workspace: teamTaskWorkspaces.name,
        workspacePrompt: teamTaskWorkspaces.aiPrompt,
      })
      .from(teamTaskProjects)
      .leftJoin(teamTaskWorkspaces, eq(teamTaskWorkspaces.id, teamTaskProjects.workspaceId))
      .where(and(eq(teamTaskProjects.teamId, teamId), ne(teamTaskProjects.aiPrompt, ''))),
    db
      .select({
        id: teamTaskItems.id,
        title: teamTaskItems.title,
        status: teamTaskItems.status,
        prompt: teamTaskItems.aiPrompt,
        nextStep: teamTaskItems.aiNextStep,
        contextQuestion: teamTaskItems.aiContextQuestion,
        contextAnswer: teamTaskItems.aiContextAnswer,
        projectId: teamTaskProjects.id,
        project: teamTaskProjects.name,
        projectPrompt: teamTaskProjects.aiPrompt,
        workspaceId: teamTaskProjects.workspaceId,
        workspace: teamTaskWorkspaces.name,
        workspacePrompt: teamTaskWorkspaces.aiPrompt,
      })
      .from(teamTaskItems)
      .innerJoin(teamTaskProjects, eq(teamTaskProjects.id, teamTaskItems.projectId))
      .leftJoin(teamTaskWorkspaces, eq(teamTaskWorkspaces.id, teamTaskProjects.workspaceId))
      .where(
        and(
          eq(teamTaskItems.teamId, teamId),
          ne(teamTaskItems.status, 'done'),
          isNotNull(teamTaskItems.aiReadyAt),
          or(
            ne(teamTaskItems.aiPrompt, ''),
            ne(teamTaskItems.aiNextStep, ''),
            ne(teamTaskItems.aiContextQuestion, ''),
          ),
        ),
      ),
    db
      .select()
      .from(teamTaskAiRuns)
      .where(eq(teamTaskAiRuns.teamId, teamId))
      .orderBy(desc(teamTaskAiRuns.createdAt))
      .limit(500),
  ]);

  const latest = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    const key = `${run.targetType}:${run.targetId}:${run.phase}:${run.promptFingerprint}`;
    if (!latest.has(key)) latest.set(key, run);
  }

  const items: TaskAiWorkItem[] = [];
  for (const workspace of workspaces) {
    const prompt = clean(workspace.prompt);
    if (!prompt) continue;
    const fp = fingerprint(['workspace', workspace.id, prompt].join('|'));
    const last = latest.get(`workspace:${workspace.id}:prepare:${fp}`);
    const completed = last?.status === 'completed';
    if (completed && !options.includeCompleted) continue;
    items.push({
      targetType: 'workspace',
      targetId: workspace.id,
      name: workspace.name,
      workspaceId: workspace.id,
      workspace: workspace.name,
      projectId: null,
      project: null,
      phase: 'prepare',
      state: completed ? 'completed' : 'ready',
      prompt,
      inheritedPrompt: '',
      nextStep: '',
      contextQuestion: '',
      contextAnswer: '',
      fingerprint: fp,
      ...(last ? { lastResult: { status: last.status, summary: last.summary, connector: last.connector, at: last.createdAt.toISOString() } } : {}),
    });
  }
  for (const project of projects) {
    const prompt = clean(project.prompt);
    if (!prompt) continue;
    const inheritedPrompt = clean(project.workspacePrompt);
    const fp = fingerprint(['project', project.id, inheritedPrompt, prompt].join('|'));
    const last = latest.get(`project:${project.id}:prepare:${fp}`);
    const completed = last?.status === 'completed';
    if (completed && !options.includeCompleted) continue;
    items.push({
      targetType: 'project',
      targetId: project.id,
      name: project.name,
      workspaceId: project.workspaceId ?? null,
      workspace: project.workspace ?? null,
      projectId: project.id,
      project: project.name,
      phase: 'prepare',
      state: completed ? 'completed' : 'ready',
      prompt,
      inheritedPrompt,
      nextStep: '',
      contextQuestion: '',
      contextAnswer: '',
      fingerprint: fp,
      ...(last ? { lastResult: { status: last.status, summary: last.summary, connector: last.connector, at: last.createdAt.toISOString() } } : {}),
    });
  }

  for (const task of tasks) {
    const prompt = clean(task.prompt);
    const nextStep = clean(task.nextStep);
    const contextQuestion = clean(task.contextQuestion);
    const contextAnswer = clean(task.contextAnswer);
    const inheritedPrompt = [clean(task.workspacePrompt), clean(task.projectPrompt)].filter(Boolean).join('\n\n');
    const needsContext = Boolean(contextQuestion && !contextAnswer);
    const phase: TaskAiPhase = nextStep ? 'execute' : 'prepare';
    const snapshot = [inheritedPrompt, prompt, nextStep, contextQuestion, contextAnswer].join('\n---\n');
    const fp = fingerprint(['task', task.id, phase, snapshot].join('|'));
    const last = latest.get(`task:${task.id}:${phase}:${fp}`);
    const completed = last?.status === 'completed';
    if (completed && !options.includeCompleted) continue;
    items.push({
      targetType: 'task',
      targetId: task.id,
      name: task.title,
      workspaceId: task.workspaceId ?? null,
      workspace: task.workspace ?? null,
      projectId: task.projectId,
      project: task.project,
      phase,
      state: needsContext ? 'needs-context' : completed ? 'completed' : 'ready',
      prompt,
      inheritedPrompt,
      nextStep,
      contextQuestion,
      contextAnswer,
      fingerprint: fp,
      ...(last ? { lastResult: { status: last.status, summary: last.summary, connector: last.connector, at: last.createdAt.toISOString() } } : {}),
    });
  }

  return items
    .sort((a, b) => {
      const stateOrder = { 'needs-context': 0, ready: 1, completed: 2 } as const;
      return stateOrder[a.state] - stateOrder[b.state]
        || (a.phase === b.phase ? 0 : a.phase === 'prepare' ? -1 : 1)
        || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export async function reportTaskAiRun(input: {
  teamId: number;
  userId: number | null;
  targetType: 'workspace' | 'project' | 'task';
  targetId: number;
  phase: TaskAiPhase;
  status: TaskAiRunStatus;
  fingerprint: string;
  summary: string;
  connector: string;
  preparedNextStep?: string;
  relatedTaskId?: number;
  updatedNotes?: string;
  checklist?: TaskChecklistItem[];
  adjustedAiPrompt?: string;
}) {
  const items = await loadTaskAiWorklist(input.teamId, { includeCompleted: true, limit: 300 });
  const item = items.find((candidate) =>
    candidate.targetType === input.targetType
    && candidate.targetId === input.targetId
    && candidate.phase === input.phase
    && candidate.fingerprint === input.fingerprint);
  if (!item) throw new Error('El prompt cambió o ya no pertenece a este equipo. Volvé a cargar la cola antes de reportar.');

  const summary = input.summary.trim().slice(0, 4000);
  if (!summary) throw new Error('El resumen no puede estar vacío.');
  const promptSnapshot = [item.inheritedPrompt, item.prompt, item.nextStep, item.contextQuestion, item.contextAnswer]
    .filter(Boolean)
    .join('\n---\n');

  if (input.status === 'completed' && item.targetType === 'task') {
    if (item.phase === 'prepare') {
      const preparedNextStep = clean(input.preparedNextStep);
      if (!preparedNextStep) {
        throw new Error('Una fase prepare completada debe guardar prepared_next_step antes de pasar a execute.');
      }
      await db.update(teamTaskItems).set({
        aiNextStep: preparedNextStep.slice(0, 20000),
        ...(input.adjustedAiPrompt !== undefined ? { aiPrompt: input.adjustedAiPrompt.slice(0, 20000) } : {}),
        updatedAt: new Date(),
      }).where(and(eq(teamTaskItems.id, item.targetId), eq(teamTaskItems.teamId, input.teamId)));
    } else if (input.relatedTaskId) {
      const related = await db.query.teamTaskItems.findFirst({
        where: and(eq(teamTaskItems.id, input.relatedTaskId), eq(teamTaskItems.teamId, input.teamId)),
        columns: { id: true },
      });
      if (!related || related.id === item.targetId) throw new Error('La tarea relacionada no existe o es la misma tarea.');
      await db.transaction(async (tx) => {
        await tx.insert(teamTaskRelations).values({
          teamId: input.teamId,
          sourceType: 'task',
          sourceId: item.targetId,
          targetType: 'task',
          targetId: related.id,
          relationType: 'generated_from',
          metadata: { connector: input.connector, summary },
          createdBy: input.userId,
        }).onConflictDoNothing();
        await tx.update(teamTaskItems).set({
          status: 'done',
          completedAt: new Date(),
          aiReadyAt: null,
          aiPrompt: '',
          aiNextStep: '',
          aiContextQuestion: '',
          aiContextAnswer: '',
          updatedAt: new Date(),
        }).where(and(eq(teamTaskItems.id, item.targetId), eq(teamTaskItems.teamId, input.teamId)));
      });
    } else {
      const current = await db.query.teamTaskItems.findFirst({
        where: and(eq(teamTaskItems.id, item.targetId), eq(teamTaskItems.teamId, input.teamId)),
        columns: { notes: true },
      });
      if (!current) throw new Error('La tarea ya no existe.');
      const notes = input.updatedNotes !== undefined
        ? input.updatedNotes.slice(0, 20000)
        : [current.notes.trim(), `Actualización IA: ${summary}`].filter(Boolean).join('\n\n').slice(0, 20000);
      await db.update(teamTaskItems).set({
        notes,
        ...(input.checklist !== undefined ? { checklist: input.checklist } : {}),
        aiPrompt: input.adjustedAiPrompt?.slice(0, 20000) ?? '',
        aiNextStep: '',
        aiContextQuestion: '',
        aiContextAnswer: '',
        aiReadyAt: null,
        status: 'open',
        completedAt: null,
        updatedAt: new Date(),
      }).where(and(eq(teamTaskItems.id, item.targetId), eq(teamTaskItems.teamId, input.teamId)));
    }
  }

  const [run] = await db.insert(teamTaskAiRuns).values({
    teamId: input.teamId,
    targetType: input.targetType,
    targetId: input.targetId,
    phase: input.phase,
    status: input.status,
    promptFingerprint: input.fingerprint,
    promptSnapshot,
    summary,
    connector: input.connector.slice(0, 40),
    metadata: {
      targetName: item.name,
      projectId: item.projectId,
      workspaceId: item.workspaceId,
      relatedTaskId: input.relatedTaskId ?? null,
    },
    createdBy: input.userId,
  }).returning();

  await db.insert(teamOperationsAiMessages).values({
    teamId: input.teamId,
    role: 'assistant',
    source: input.connector.slice(0, 40),
    surface: 'connector-report',
    content: `${item.name}: ${summary}`,
    metadata: {
      runId: run.id,
      targetType: input.targetType,
      targetId: input.targetId,
      phase: input.phase,
      status: input.status,
    },
    createdBy: input.userId,
  });

  return { run, item };
}
