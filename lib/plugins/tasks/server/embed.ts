import 'server-only';

import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  teamTaskColumns,
  teamTaskItems,
  teamTaskProjects,
  teamTaskWorkspaces,
} from '@/lib/db/schema';
import { resolveActivePluginsForTeam } from '@/lib/plugins/core/registry';
import { loadTaskOsData } from '@/lib/plugins/tasks/server/task-os';

export const TASKS_PLUGIN_ID = 'tasks';

export type TaskEmbedAccess = 'read' | 'manage';

export type TaskEmbedScope =
  | { type: 'project'; projectId: number }
  | { type: 'workspace'; workspaceId: number };

export type TaskEmbedContext = {
  teamId: number;
  access: TaskEmbedAccess;
  scope: TaskEmbedScope;
};

export type TaskEmbedResult =
  | { ok: false; status: number; message: string }
  | ({ ok: true } & TaskEmbedContext);

function normalizeAccess(value: string | null | undefined): TaskEmbedAccess {
  return value === 'read' ? 'read' : 'manage';
}

export function createEmbedToken() {
  return randomUUID();
}

/**
 * Resolves a public embed token (no session) to a scoped, team-bound context.
 * Tokens are looked up on projects first, then workspaces. The plugin must still
 * be active for the owning team, otherwise the embed is treated as not found.
 */
export async function getTaskEmbedContext(token: string): Promise<TaskEmbedResult> {
  const value = token?.trim();
  if (!value) return { ok: false, status: 404, message: 'Embed not found.' };

  const project = await db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.embedToken, value), eq(teamTaskProjects.embedEnabled, true)),
    columns: { id: true, teamId: true, embedAccess: true },
  });

  let context: TaskEmbedContext | null = null;

  if (project) {
    context = {
      teamId: project.teamId,
      access: normalizeAccess(project.embedAccess),
      scope: { type: 'project', projectId: project.id },
    };
  } else {
    const workspace = await db.query.teamTaskWorkspaces.findFirst({
      where: and(eq(teamTaskWorkspaces.embedToken, value), eq(teamTaskWorkspaces.embedEnabled, true)),
      columns: { id: true, teamId: true, embedAccess: true },
    });
    if (workspace) {
      context = {
        teamId: workspace.teamId,
        access: normalizeAccess(workspace.embedAccess),
        scope: { type: 'workspace', workspaceId: workspace.id },
      };
    }
  }

  if (!context) return { ok: false, status: 404, message: 'Embed not found.' };

  const activePlugins = await resolveActivePluginsForTeam(context.teamId);
  const isActive = activePlugins.some((plugin) => plugin.pluginId === TASKS_PLUGIN_ID);
  if (!isActive) return { ok: false, status: 404, message: 'Embed not found.' };

  return { ok: true, ...context };
}

export type EmbedState = {
  enabled: boolean;
  token: string | null;
  access: TaskEmbedAccess;
};

/** Reads the current embed configuration for a project or workspace (team-bound). */
export async function getEmbedState(
  teamId: number,
  type: 'project' | 'workspace',
  id: number,
): Promise<EmbedState | null> {
  const row =
    type === 'project'
      ? await db.query.teamTaskProjects.findFirst({
          where: and(eq(teamTaskProjects.id, id), eq(teamTaskProjects.teamId, teamId)),
          columns: { embedToken: true, embedEnabled: true, embedAccess: true },
        })
      : await db.query.teamTaskWorkspaces.findFirst({
          where: and(eq(teamTaskWorkspaces.id, id), eq(teamTaskWorkspaces.teamId, teamId)),
          columns: { embedToken: true, embedEnabled: true, embedAccess: true },
        });
  if (!row) return null;
  return {
    enabled: Boolean(row.embedEnabled),
    token: row.embedEnabled ? row.embedToken : null,
    access: normalizeAccess(row.embedAccess),
  };
}

/**
 * Enables, regenerates or disables the embed for a project/workspace.
 * Regenerating mints a fresh token (invalidating previous embeds); disabling turns the
 * embed off while keeping the token so it can be re-enabled without changing the URL.
 */
export async function setEmbedState(params: {
  teamId: number;
  type: 'project' | 'workspace';
  id: number;
  action: 'enable' | 'regenerate' | 'disable';
  access?: TaskEmbedAccess;
}): Promise<EmbedState | null> {
  const current = await getEmbedStateRaw(params.teamId, params.type, params.id);
  if (!current) return null;

  let token = current.embedToken;
  let enabled = current.embedEnabled;

  if (params.action === 'disable') {
    enabled = false;
  } else {
    enabled = true;
    if (params.action === 'regenerate' || !token) token = createEmbedToken();
  }

  const access = params.access ?? normalizeAccess(current.embedAccess);
  const values = { embedToken: token, embedEnabled: enabled, embedAccess: access, updatedAt: new Date() };

  if (params.type === 'project') {
    await db
      .update(teamTaskProjects)
      .set(values)
      .where(and(eq(teamTaskProjects.id, params.id), eq(teamTaskProjects.teamId, params.teamId)));
  } else {
    await db
      .update(teamTaskWorkspaces)
      .set(values)
      .where(and(eq(teamTaskWorkspaces.id, params.id), eq(teamTaskWorkspaces.teamId, params.teamId)));
  }

  return { enabled, token: enabled ? token : null, access };
}

async function getEmbedStateRaw(teamId: number, type: 'project' | 'workspace', id: number) {
  if (type === 'project') {
    return db.query.teamTaskProjects.findFirst({
      where: and(eq(teamTaskProjects.id, id), eq(teamTaskProjects.teamId, teamId)),
      columns: { embedToken: true, embedEnabled: true, embedAccess: true },
    });
  }
  return db.query.teamTaskWorkspaces.findFirst({
    where: and(eq(teamTaskWorkspaces.id, id), eq(teamTaskWorkspaces.teamId, teamId)),
    columns: { embedToken: true, embedEnabled: true, embedAccess: true },
  });
}

export type EmbedBoardPayload = {
  access: TaskEmbedAccess;
  scope: TaskEmbedScope;
  title: string;
  projects: unknown[];
};

/** Strip secret embed columns before exposing a project through the public embed. */
function sanitizeProject(project: Record<string, unknown>) {
  const { embedToken, embedEnabled, embedAccess, ...safe } = project;
  return safe;
}

/**
 * Builds the read payload for an embed context: the single scoped project, or every
 * project of the scoped workspace. Secret embed columns are stripped from the output.
 */
export async function buildEmbedBoard(ctx: TaskEmbedContext): Promise<EmbedBoardPayload | null> {
  const workspaces = await loadTaskOsData(ctx.teamId);
  const scope = ctx.scope;

  if (scope.type === 'project') {
    for (const workspace of workspaces) {
      const project = workspace.projects.find((p) => p.id === scope.projectId);
      if (project) {
        return {
          access: ctx.access,
          scope,
          title: project.name,
          projects: [sanitizeProject(project as Record<string, unknown>)],
        };
      }
    }
    return null;
  }

  const workspace = workspaces.find((w) => w.id === scope.workspaceId);
  if (!workspace) return null;
  return {
    access: ctx.access,
    scope: ctx.scope,
    title: workspace.name,
    projects: workspace.projects.map((p) => sanitizeProject(p as Record<string, unknown>)),
  };
}

/**
 * Resolves a token and requires manage access. Returns a 403 result for read-only embeds.
 * Use this at the top of every embed write route.
 */
export async function getManageEmbedContext(token: string): Promise<TaskEmbedResult> {
  const ctx = await getTaskEmbedContext(token);
  if (!ctx.ok) return ctx;
  if (ctx.access !== 'manage') return { ok: false, status: 403, message: 'This embed is read-only.' };
  return ctx;
}

/**
 * True when the given project falls inside the embed's scope (the project itself,
 * or any project belonging to the scoped workspace). Always team-bound.
 */
export async function isProjectInScope(ctx: TaskEmbedContext, projectId: number): Promise<boolean> {
  if (!Number.isInteger(projectId)) return false;
  const project = await db.query.teamTaskProjects.findFirst({
    where: and(eq(teamTaskProjects.id, projectId), eq(teamTaskProjects.teamId, ctx.teamId)),
    columns: { id: true, workspaceId: true },
  });
  if (!project) return false;

  if (ctx.scope.type === 'project') return project.id === ctx.scope.projectId;
  return project.workspaceId === ctx.scope.workspaceId;
}

/** True when the column belongs to a project inside the embed's scope. */
export async function isColumnInScope(ctx: TaskEmbedContext, columnId: number): Promise<boolean> {
  if (!Number.isInteger(columnId)) return false;
  const column = await db.query.teamTaskColumns.findFirst({
    where: and(eq(teamTaskColumns.id, columnId), eq(teamTaskColumns.teamId, ctx.teamId)),
    columns: { id: true, projectId: true },
  });
  if (!column) return false;
  return isProjectInScope(ctx, column.projectId);
}

/** True when the task's primary project is inside the embed's scope. */
export async function isTaskInScope(ctx: TaskEmbedContext, taskId: number): Promise<boolean> {
  if (!Number.isInteger(taskId)) return false;
  const task = await db.query.teamTaskItems.findFirst({
    where: and(eq(teamTaskItems.id, taskId), eq(teamTaskItems.teamId, ctx.teamId)),
    columns: { id: true, projectId: true },
  });
  if (!task) return false;
  return isProjectInScope(ctx, task.projectId);
}
