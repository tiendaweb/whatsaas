'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { PickerAction, Project, TaskItem, Workspace } from '@/lib/plugins/tasks/client/types';
import { TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';
import {
  taskOsBtn,
  taskOsCardInteractive,
  taskOsInput,
  taskOsMuted,
  taskOsMutedDim,
  taskOsPanel,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { cn } from '@/lib/utils';

const TITLES: Record<PickerAction, string> = {
  related_task: 'Vincular otra tarea',
  share_project: 'Compartir en proyecto',
  related_project: 'Vincular proyecto',
  related_workspace: 'Vincular espacio de trabajo',
  parent_task: 'Elegir tarea padre',
  dependency: 'Esta tarea depende de…',
  checklist_source: 'Agregar tarea al checklist',
};

const HINTS: Record<PickerAction, string> = {
  related_task: 'Elegí una tarea de este proyecto',
  share_project: 'La tarea aparecerá también en ese proyecto',
  related_project: 'Crear vínculo con otro proyecto',
  related_workspace: 'Crear vínculo con un espacio de trabajo',
  parent_task: 'La tarea actual quedará como subtarea',
  dependency: 'No podrás completar esta hasta que termine la otra',
  checklist_source: 'Copiar checklist de otra tarea',
};

export type TaskLinkPickerModalProps = {
  open: boolean;
  action: PickerAction;
  currentTaskId: number;
  currentProject: Project;
  workspaces: Workspace[];
  onClose: () => void;
  onPickTask: (task: TaskItem) => void;
  onPickProject: (project: Project) => void;
  onPickWorkspace: (workspace: Workspace) => void;
};

export function TaskLinkPickerModal({
  open,
  action,
  currentTaskId,
  currentProject,
  workspaces,
  onClose,
  onPickTask,
  onPickProject,
  onPickWorkspace,
}: TaskLinkPickerModalProps) {
  const [query, setQuery] = useState('');

  const expectsTask = ['related_task', 'parent_task', 'dependency', 'checklist_source'].includes(action);
  const expectsProject = action === 'share_project' || action === 'related_project';
  const expectsWorkspace = action === 'related_workspace';

  const projectTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return currentProject.columns.flatMap((col) =>
      col.items
        .filter((task) => task.id !== currentTaskId)
        .filter((task) => !needle || `${task.title} ${task.notes}`.toLowerCase().includes(needle))
        .map((task) => ({ task, columnTitle: col.title })),
    );
  }, [currentProject, currentTaskId, query]);

  const allProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspaces.flatMap((ws) =>
      ws.projects
        .filter((p) => !needle || `${p.name} ${ws.name}`.toLowerCase().includes(needle))
        .map((project) => ({ project, workspace: ws })),
    );
  }, [workspaces, query]);

  const filteredWorkspaces = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return workspaces.filter((ws) => !needle || ws.name.toLowerCase().includes(needle));
  }, [workspaces, query]);

  if (!open) return null;

  return (
    <TaskOsModal onClose={onClose} size="md" elevated className="flex max-h-[min(80vh,560px)] flex-col p-0">
      <div className="shrink-0 border-b border-[#2a2a30] p-4">
        <TaskOsModalHeader title={TITLES[action]} subtitle={HINTS[action]} onClose={onClose} />
        <div className="relative mt-3">
          <Search className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', taskOsMutedDim)} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={expectsTask ? 'Buscar en este proyecto…' : 'Buscar…'}
            className={cn('w-full py-2 pl-9 pr-3 text-sm', taskOsInput)}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {expectsTask && (
          <div className="space-y-3">
            {currentProject.columns.map((col) => {
              const items = col.items.filter((t) => {
                if (t.id === currentTaskId) return false;
                const needle = query.trim().toLowerCase();
                if (!needle) return true;
                return `${t.title} ${t.notes}`.toLowerCase().includes(needle);
              });
              if (items.length === 0) return null;
              return (
                <div key={col.id}>
                  <p className={cn('mb-1.5 text-[10px] font-medium uppercase tracking-wider', taskOsMutedDim)}>
                    {col.title}
                  </p>
                  <div className="space-y-1">
                    {items.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => { onPickTask(task); onClose(); }}
                        className={cn('w-full p-3 text-left', taskOsCardInteractive)}
                      >
                        <span className={cn('block truncate text-sm font-medium', taskOsText)}>{radarTaskTitle(task.title)}</span>
                        {task.notes && (
                          <span className={cn('mt-0.5 block truncate text-xs', taskOsMuted)}>{task.notes}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {projectTasks.length === 0 && (
              <p className={cn(taskOsPanel, 'px-3 py-8 text-center text-sm', taskOsMuted)}>
                No hay otras tareas en este proyecto
              </p>
            )}
          </div>
        )}

        {expectsProject && (
          <div className="space-y-1">
            {allProjects.map(({ project, workspace }) => (
              <button
                key={project.id}
                type="button"
                onClick={() => { onPickProject(project); onClose(); }}
                className={cn('w-full p-3 text-left', taskOsCardInteractive)}
              >
                <span className={cn('block truncate text-sm font-medium', taskOsText)}>{project.name}</span>
                <span className={cn('block truncate text-xs', taskOsMuted)}>{workspace.name}</span>
              </button>
            ))}
            {allProjects.length === 0 && (
              <p className={cn(taskOsPanel, 'px-3 py-8 text-center text-sm', taskOsMuted)}>Sin proyectos</p>
            )}
          </div>
        )}

        {expectsWorkspace && (
          <div className="space-y-1">
            {filteredWorkspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => { onPickWorkspace(ws); onClose(); }}
                className={cn('w-full p-3 text-left', taskOsCardInteractive)}
              >
                <span className={cn('block truncate text-sm font-medium', taskOsText)}>{ws.name}</span>
                <span className={cn('block truncate text-xs', taskOsMuted)}>
                  {ws.projects.length} proyecto{ws.projects.length === 1 ? '' : 's'}
                </span>
              </button>
            ))}
            {filteredWorkspaces.length === 0 && (
              <p className={cn(taskOsPanel, 'px-3 py-8 text-center text-sm', taskOsMuted)}>Sin espacios de trabajo</p>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[#2a2a30] p-3">
        <button type="button" onClick={onClose} className={cn('w-full py-2 text-sm', taskOsBtn)}>
          Cancelar
        </button>
      </div>
    </TaskOsModal>
  );
}
