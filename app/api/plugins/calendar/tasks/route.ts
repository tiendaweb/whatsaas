import { NextResponse } from 'next/server';
import { getPluginRequestContext } from '@/lib/plugins/core/runtime-permissions';
import { ensureDefaultTaskWorkspace } from '@/lib/plugins/tasks/server/workspaces';
import { loadTaskOsData } from '@/lib/plugins/tasks/server/task-os';

export const dynamic = 'force-dynamic';

function serializeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function GET() {
  const ctx = await getPluginRequestContext('calendarRead');
  if (!ctx.ok) {
    const tasksCtx = await getPluginRequestContext('tasksRead');
    if (!tasksCtx.ok) return NextResponse.json({ error: ctx.message }, { status: ctx.status });
    await ensureDefaultTaskWorkspace(tasksCtx.team.id, tasksCtx.user.id);
    const workspaces = await loadTaskOsData(tasksCtx.team.id);
    return NextResponse.json({ projects: workspaces.flatMap((w) => w.projects) });
  }

  await ensureDefaultTaskWorkspace(ctx.team.id, ctx.user.id);
  const workspaces = await loadTaskOsData(ctx.team.id);
  const projects = workspaces.flatMap((workspace) =>
    workspace.projects.map((project) => ({
      ...project,
      columns: project.columns.map((column) => ({
        ...column,
        items: column.items.map((item) => {
          if (!item) return item;
          return {
            ...item,
            dueDate: serializeDate(item.dueDate),
            startDate: serializeDate(item.startDate),
            endDate: serializeDate(item.endDate),
            completedAt: serializeDate(item.completedAt),
          };
        }),
      })),
    })),
  );

  return NextResponse.json({ projects });
}