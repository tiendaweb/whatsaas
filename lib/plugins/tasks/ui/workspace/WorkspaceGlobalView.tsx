'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, FolderKanban, LayoutGrid } from 'lucide-react';
import type { TaskColumn, TaskProject, Workspace } from '@/lib/plugins/tasks/client/types';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import { cn } from '@/lib/utils';

export type WorkspaceGlobalViewProps = {
  workspaces: Workspace[];
  onNavigate: (workspaceId: number, projectId: number | null) => void;
};

type ProjectGroup = { name: string; projects: TaskProject[] };

function groupProjectsByName(projects: TaskProject[]): ProjectGroup[] {
  const map = new Map<string, TaskProject[]>();
  for (const project of projects) {
    const key = project.name.trim() || 'Sin nombre';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(project);
  }
  return [...map.entries()]
    .map(([name, grouped]) => ({ name, projects: grouped }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function projectTaskCount(project: TaskProject): number {
  return project.columns.reduce((sum, column) => sum + column.items.length, 0);
}

/** Rótulo de sección estándar del lenguaje visual ToDoS. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{children}</span>;
}

/** Badge de conteo estándar del lenguaje visual ToDoS. */
function CountBadge({ count }: { count: number }) {
  return (
    <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-[10px] font-bold text-neutral-400">
      {count}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform duration-200', open && 'rotate-90')} />;
}

export function WorkspaceGlobalView({ workspaces, onNavigate }: WorkspaceGlobalViewProps) {
  // Sets de claves expandidas por nivel — todo arranca colapsado (con ~170 proyectos
  // en producción, expandir todo por defecto sería ilegible).
  const [openWorkspaces, setOpenWorkspaces] = useState<Set<number>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openProjects, setOpenProjects] = useState<Set<number>>(new Set());

  const toggle = (set: Set<string> | Set<number>, setSet: (s: any) => void, key: string | number) => {
    const next = new Set(set as any);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSet(next);
  };

  const totalProjects = useMemo(() => workspaces.reduce((sum, ws) => sum + ws.projects.length, 0), [workspaces]);
  const totalTasks = useMemo(
    () => workspaces.reduce((sum, ws) => sum + ws.projects.reduce((s, p) => s + projectTaskCount(p), 0), 0),
    [workspaces],
  );

  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/40 py-12 text-center">
        <LayoutGrid className="h-6 w-6 text-neutral-600" />
        <p className="text-sm font-medium text-neutral-400">No hay espacios de trabajo todavía.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
        <SectionLabel>Visión global</SectionLabel>
        <p className="text-xs font-bold text-neutral-400">
          {workspaces.length} espacios · {totalProjects} proyectos · {totalTasks} tareas
        </p>
      </div>

      <div className="max-h-[28rem] space-y-1.5 overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2">
        {workspaces.map((workspace) => {
          const isWsOpen = openWorkspaces.has(workspace.id);
          const WsIcon = resolveTaskIcon(workspace.icon) || LayoutGrid;
          const groups = groupProjectsByName(workspace.projects);
          const wsTaskCount = workspace.projects.reduce((s, p) => s + projectTaskCount(p), 0);

          return (
            <div key={workspace.id} className="rounded-xl">
              <button
                type="button"
                onClick={() => toggle(openWorkspaces, setOpenWorkspaces, workspace.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-all duration-200 hover:bg-neutral-800/60"
              >
                <Chevron open={isWsOpen} />
                <WsIcon className="h-4 w-4 shrink-0" style={workspace.color ? { color: workspace.color } : undefined} />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-100" style={workspace.color ? { color: workspace.color } : undefined}>
                  {workspace.name}
                </span>
                <span className="text-[10px] font-bold text-neutral-500">{wsTaskCount} tareas</span>
                <CountBadge count={workspace.projects.length} />
              </button>

              {isWsOpen && (
                <div className="ml-3 space-y-1 border-l border-neutral-800 pl-3 pt-1">
                  {groups.length === 0 && <p className="py-2 text-xs text-neutral-500">Sin proyectos.</p>}
                  {groups.map((group) => {
                    const groupKey = `${workspace.id}:${group.name}`;
                    const isGroupOpen = group.projects.length === 1 || openGroups.has(groupKey);
                    const representative = group.projects[0];

                    return (
                      <div key={groupKey}>
                        <button
                          type="button"
                          onClick={() => {
                            if (group.projects.length === 1) {
                              onNavigate(workspace.id, representative.id);
                              return;
                            }
                            toggle(openGroups, setOpenGroups, groupKey);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-all duration-200 hover:bg-neutral-800/60"
                        >
                          {group.projects.length > 1 ? <Chevron open={isGroupOpen} /> : <FolderKanban className="h-3.5 w-3.5 shrink-0 text-neutral-500" />}
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-neutral-200">{group.name}</span>
                          {group.projects.length > 1 && <CountBadge count={group.projects.length} />}
                        </button>

                        {isGroupOpen && group.projects.length > 1 && (
                          <div className="ml-3 space-y-1 border-l border-neutral-800/70 pl-3 pt-1">
                            {group.projects.map((project) => (
                              <ProjectRow
                                key={project.id}
                                project={project}
                                open={openProjects.has(project.id)}
                                onToggle={() => toggle(openProjects, setOpenProjects, project.id)}
                                onNavigate={() => onNavigate(workspace.id, project.id)}
                              />
                            ))}
                          </div>
                        )}

                        {isGroupOpen && group.projects.length === 1 && (
                          <div className="ml-3 space-y-1 border-l border-neutral-800/70 pl-3 pt-1">
                            <ColumnList project={representative} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProjectRow({
  project,
  open,
  onToggle,
  onNavigate,
}: {
  project: TaskProject;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const taskCount = projectTaskCount(project);
  return (
    <div>
      <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all duration-200 hover:bg-neutral-800/60">
        <button type="button" onClick={onToggle} className="shrink-0">
          <Chevron open={open} />
        </button>
        <button type="button" onClick={onNavigate} className="min-w-0 flex-1 truncate text-left text-xs text-neutral-300 hover:text-neutral-100">
          {project.name}
        </button>
        <span className="text-[10px] font-bold text-neutral-500">{taskCount} tareas</span>
      </div>
      {open && (
        <div className="ml-3 border-l border-neutral-800/70 pl-3 pt-1">
          <ColumnList project={project} />
        </div>
      )}
    </div>
  );
}

function ColumnList({ project }: { project: TaskProject }) {
  if (project.columns.length === 0) {
    return <p className="py-1 text-[11px] text-neutral-500">Sin columnas.</p>;
  }
  return (
    <div className="space-y-0.5 py-0.5">
      {project.columns.map((column: TaskColumn) => (
        <div key={column.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-[11px]">
          <span className="min-w-0 flex-1 truncate text-neutral-400">{column.title}</span>
          <span className="rounded-md bg-neutral-800 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500">{column.items.length}</span>
        </div>
      ))}
    </div>
  );
}
