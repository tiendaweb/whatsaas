'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { PickerAction, Project, TaskItem, Workspace } from '@/lib/plugins/tasks/client/types';
import {
  taskOsBg,
  taskOsBorder,
  taskOsBtn,
  taskOsBtnActive,
  taskOsCardInteractive,
  taskOsChrome,
  taskOsInput,
  taskOsMuted,
  taskOsMutedDim,
  taskOsPanel,
  taskOsSurfaceRaised,
  taskOsText,
  taskOsTextSecondary,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { cn } from '@/lib/utils';

export type TaskEntityNavigatorProps = {
  workspaces: Workspace[];
  currentTaskId: number;
  action: PickerAction;
  onPickTask: (task: TaskItem) => void;
  onPickProject: (project: Project) => void;
  onPickWorkspace: (workspace: Workspace) => void;
};

export function TaskEntityNavigator({
  workspaces,
  currentTaskId,
  action,
  onPickTask,
  onPickProject,
  onPickWorkspace,
}: TaskEntityNavigatorProps) {
  const [workspaceId, setWorkspaceId] = useState<number | 'all'>('all');
  const visibleWorkspaces = useMemo(
    () => workspaceId === 'all'
      ? workspaces
      : workspaces.filter((workspace) => workspace.id === workspaceId),
    [workspaceId, workspaces],
  );
  const allProjects = useMemo(
    () => visibleWorkspaces.flatMap((workspace) =>
      workspace.projects.map((project) => ({ workspace, project })),
    ),
    [visibleWorkspaces],
  );
  const [projectId, setProjectId] = useState<number | null>(allProjects[0]?.project.id ?? null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (allProjects.length > 0 && !allProjects.some((item) => item.project.id === projectId)) {
      setProjectId(allProjects[0].project.id);
    }
    if (allProjects.length === 0) setProjectId(null);
  }, [allProjects, projectId]);

  const selected = allProjects.find((item) => item.project.id === projectId) ?? allProjects[0] ?? null;
  const expectsProject = action === 'share_project' || action === 'related_project';
  const expectsWorkspace = action === 'related_workspace';
  const title =
    action === 'share_project' ? 'Compartir en proyecto' :
    action === 'related_project' ? 'Relacionar proyecto' :
    action === 'related_workspace' ? 'Relacionar espacio de trabajo' :
    action === 'parent_task' ? 'Elegir tarea padre' :
    action === 'dependency' ? 'Elegir dependencia' :
    action === 'checklist_source' ? 'Agregar tarea al checklist' :
    'Relacionar tarea';

  const filteredColumns = (selected?.project.columns ?? []).map((column) => ({
    ...column,
    items: column.items.filter((task) => {
      if (task.id === currentTaskId) return false;
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return `${task.title} ${task.notes}`.toLowerCase().includes(needle);
    }),
  }));

  return (
    <div className={cn('flex min-h-[300px] flex-col overflow-hidden rounded-lg border', taskOsBorder, taskOsBg)}>
      <div className={cn('border-b px-3 py-2.5', taskOsBorder, taskOsChrome)}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className={cn('text-xs font-medium', taskOsText)}>{title}</p>
            <p className={cn('text-[10px]', taskOsMutedDim)}>Elige destino en el árbol</p>
          </div>
          {expectsWorkspace && workspaceId !== 'all' && (
            <button
              type="button"
              onClick={() => {
                const workspace = workspaces.find((item) => item.id === workspaceId);
                if (workspace) onPickWorkspace(workspace);
              }}
              className={cn('shrink-0 px-2.5 py-1.5 text-[11px] font-medium', taskOsBtn)}
            >
              Usar espacio de trabajo
            </button>
          )}
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          <TabChip active={workspaceId === 'all'} onClick={() => setWorkspaceId('all')}>
            Todos
          </TabChip>
          {workspaces.map((workspace) => (
            <TabChip
              key={workspace.id}
              active={workspaceId === workspace.id}
              onClick={() => setWorkspaceId(workspace.id)}
            >
              {workspace.name}
            </TabChip>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className={cn('min-h-0 border-b md:border-b-0 md:border-r', taskOsBorder, taskOsSurfaceRaised)}>
          <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto p-2 md:max-h-none">
            {allProjects.map(({ workspace, project }) => {
              const active = project.id === selected?.project.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    setProjectId(project.id);
                    if (expectsProject) onPickProject(project);
                  }}
                  className={cn(
                    'rounded-lg px-3 py-2 text-left transition-colors',
                    active ? taskOsBtnActive : cn(taskOsBtn, 'border-transparent bg-transparent'),
                  )}
                >
                  <span className={cn('block truncate text-sm font-medium', active ? taskOsText : taskOsTextSecondary)}>
                    {project.name}
                  </span>
                  <span className={cn('block truncate text-[10px]', taskOsMutedDim)}>{workspace.name}</span>
                </button>
              );
            })}
            {allProjects.length === 0 && (
              <p className={cn('px-3 py-8 text-center text-xs', taskOsMuted)}>Sin proyectos</p>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className={cn('border-b p-3', taskOsBorder)}>
            <div className="relative">
              <Search className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', taskOsMutedDim)} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar tareas..."
                className={cn('w-full py-2 pl-9 pr-3 text-sm', taskOsInput)}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!selected ? (
              <p className={cn(taskOsPanel, 'px-3 py-8 text-center text-sm', taskOsMuted)}>
                Selecciona un proyecto
              </p>
            ) : (
              <div className="space-y-4">
                {filteredColumns.map((column) => (
                  <div key={column.id}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className={cn('text-[10px] font-medium uppercase tracking-wider', taskOsMutedDim)}>
                        {column.title}
                      </p>
                      <span className={cn('px-2 py-0.5 text-[10px]', taskOsMuted)}>{column.items.length}</span>
                    </div>
                    <div className="grid gap-2">
                      {column.items.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => onPickTask(task)}
                          className={cn('p-3 text-left', taskOsCardInteractive)}
                        >
                          <span className={cn('block truncate text-sm font-medium', taskOsText)}>{radarTaskTitle(task.title)}</span>
                          <span className={cn('mt-1 block line-clamp-2 text-xs', taskOsMuted)}>
                            {task.notes || 'Sin notas'}
                          </span>
                          <span className={cn('mt-2 flex items-center gap-2 text-[10px]', taskOsMutedDim)}>
                            #{task.id}
                            {task.status === 'done' && <span className="text-emerald-400">Terminada</span>}
                            {task.checklist.length > 0 && (
                              <span>
                                {task.checklist.filter((item) => item.completed).length}/{task.checklist.length}
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                    {column.items.length === 0 && (
                      <p className={cn(taskOsPanel, 'px-3 py-4 text-center text-xs', taskOsMuted)}>
                        Sin tareas en esta etapa
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-md px-2.5 py-1 text-[11px] transition-colors',
        active ? taskOsBtnActive : cn(taskOsMuted, 'hover:bg-[#222228] hover:text-[#c8c8d0]'),
      )}
    >
      {children}
    </button>
  );
}
