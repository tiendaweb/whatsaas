import { NextResponse } from 'next/server';
import { parseCascadeDocument, type CascadeExportWorkspace } from '@/lib/plugins/tasks/client/cascade-dsl';
import { anchorCascadeDocument, parseScopedCascade, serializeCascadeForScope, type CascadeScope } from '@/lib/plugins/tasks/client/cascade-scope';
import { applyCascadeDocument, previewCascadeApply } from '@/lib/plugins/tasks/server/cascade-apply';
import { loadTaskOsData } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

function parseScope(searchParams: URLSearchParams, body?: Record<string, unknown>): CascadeScope {
  const raw = (body?.scope as CascadeScope | undefined) ?? {
    type: searchParams.get('scopeType') ?? 'team',
    workspaceId: searchParams.get('workspaceId') ? Number(searchParams.get('workspaceId')) : undefined,
    projectId: searchParams.get('projectId') ? Number(searchParams.get('projectId')) : undefined,
    columnId: searchParams.get('columnId') ? Number(searchParams.get('columnId')) : undefined,
    taskId: searchParams.get('taskId') ? Number(searchParams.get('taskId')) : undefined,
  };

  if (raw.type === 'workspace' && raw.workspaceId) return { type: 'workspace', workspaceId: raw.workspaceId };
  if (raw.type === 'project' && raw.projectId) return { type: 'project', projectId: raw.projectId };
  if (raw.type === 'column' && raw.columnId && raw.projectId) {
    return { type: 'column', columnId: raw.columnId, projectId: raw.projectId };
  }
  if (raw.type === 'task' && raw.taskId && raw.projectId) {
    return { type: 'task', taskId: raw.taskId, projectId: raw.projectId };
  }
  return { type: 'team' };
}

type ScopeContext = { workspaceName: string; projectName?: string; columnTitle?: string; taskTitle?: string };

function scopeContext(
  existing: Awaited<ReturnType<typeof loadTaskOsData>>,
  scope: CascadeScope,
): ScopeContext | null {
  // El alcance de equipo no ancla a nada — `anchorCascadeDocument` devuelve el
  // documento tal cual — así que el nombre acá no se usa.
  if (scope.type === 'team') return { workspaceName: '' };
  if (scope.type === 'workspace') {
    const ws = existing.find((w) => w.id === scope.workspaceId);
    return ws ? { workspaceName: ws.name } : null;
  }
  if (scope.type === 'project') {
    for (const ws of existing) {
      const p = ws.projects.find((x) => x.id === scope.projectId);
      if (p) return { workspaceName: ws.name, projectName: p.name };
    }
  }
  if (scope.type === 'task') {
    for (const ws of existing) {
      for (const p of ws.projects) {
        if (p.id !== scope.projectId) continue;
        for (const col of p.columns) {
          const t = col.items.find((i) => i?.id === scope.taskId);
          if (t) return { workspaceName: ws.name, projectName: p.name, columnTitle: col.title, taskTitle: t.title };
        }
      }
    }
  }
  if (scope.type === 'column') {
    for (const ws of existing) {
      for (const p of ws.projects) {
        if (p.id !== scope.projectId) continue;
        const col = p.columns.find((c) => c.id === scope.columnId);
        if (col) return { workspaceName: ws.name, projectName: p.name, columnTitle: col.title };
      }
    }
  }
  // Alcance que no existe en este equipo (id viejo, borrado, o de otro equipo).
  // Antes esto caía en `{ workspaceName: 'Principal' }` y el apply anclaba el
  // documento ENTERO bajo un espacio con ese nombre, creándolo si no existía:
  // un `project_id` desactualizado te duplicaba el tablero en silencio. Ahora
  // devuelve null y el handler corta con un error.
  return null;
}

import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';

export async function GET(req: Request) {
  const ctx = await getPluginRequestContext('tasksRead');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const { searchParams } = new URL(req.url);
  const workspaces = await loadTaskOsData(ctx.team.id);
  const scope = parseScope(searchParams);
  const document = serializeCascadeForScope(workspaces as CascadeExportWorkspace[], scope);

  return NextResponse.json({ document, scope });
}

export async function POST(req: Request) {
  const ctx = await getPluginRequestContext('tasksWrite');
  if (!ctx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });

  const body = await req.json();
  const { document: raw, mode = 'preview' } = body as { document?: string; mode?: 'preview' | 'apply' };
  const scope = parseScope(new URLSearchParams(), body);

  if (!raw?.trim()) {
    return NextResponse.json({ error: 'document required' }, { status: 400 });
  }

  const existing = await loadTaskOsData(ctx.team.id);
  const sctx = scopeContext(existing, scope);
  if (!sctx) {
    return NextResponse.json(
      { error: 'scope_not_found', detail: 'El espacio, proyecto, columna o tarea indicado no existe en este equipo.' },
      { status: 404 },
    );
  }
  const parsed = scope.type === 'team'
    ? parseCascadeDocument(raw)
    : parseScopedCascade(raw, scope, { workspaceName: sctx.workspaceName, projectName: sctx.projectName });

  const anchored = anchorCascadeDocument(parsed, scope, {
    workspaceName: sctx.workspaceName,
    projectName: sctx.projectName,
    columnTitle: sctx.columnTitle,
    taskTitle: sctx.taskTitle,
  });

  if (mode === 'preview') {
    const preview = await previewCascadeApply(ctx.team.id, anchored);
    return NextResponse.json({ preview, scope });
  }

  const stats = await applyCascadeDocument(ctx.team.id, ctx.user.id, anchored, scope);
  return NextResponse.json({ ok: true, stats, scope });
}
