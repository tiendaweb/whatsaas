'use client';

import { ChevronRight, FolderKanban, Paperclip, Plus, Trash2 } from 'lucide-react';
import type { Project, Workspace } from '@/lib/plugins/tasks/client/types';
import { TaskOsEmptyState } from '@/lib/plugins/tasks/ui/shared';
import {
  taskOsBorder,
  taskOsBtn,
  taskOsBtnActive,
  taskOsChrome,
  taskOsInput,
  taskOsMuted,
  taskOsMutedDim,
  taskOsSurfaceRaised,
  taskOsText,
  taskOsTextSecondary,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type ProjectSidebarProps = {
  projects: Project[];
  selectedProject: Project | null;
  selectedWorkspace: Workspace | null;
  showNewProject: boolean;
  newProjectName: string;
  onNewProjectNameChange: (value: string) => void;
  onShowNewProject: (show: boolean) => void;
  onCreateProject: () => void;
  onSelectProject: (id: number) => void;
  onDeleteProject: (id: number) => void;
  onShowWorkspaceModal: () => void;
  onOpenWorkspaceMedia: () => void;
  onProjectDragStart: (e: React.DragEvent, projectId: number) => void;
  onProjectDrop: (e: React.DragEvent, projectId: number) => void;
};

export function ProjectSidebar({
  projects,
  selectedProject,
  selectedWorkspace,
  showNewProject,
  newProjectName,
  onNewProjectNameChange,
  onShowNewProject,
  onCreateProject,
  onSelectProject,
  onDeleteProject,
  onShowWorkspaceModal,
  onOpenWorkspaceMedia,
  onProjectDragStart,
  onProjectDrop,
}: ProjectSidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full w-36 shrink-0 flex-col border-r sm:w-44 md:w-52',
        taskOsBorder,
        taskOsSurfaceRaised,
      )}
    >
      <div className={cn('flex items-center justify-between border-b px-2 py-2 sm:px-3', taskOsBorder, taskOsChrome)}>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <FolderKanban className={cn('h-4 w-4 shrink-0', taskOsMuted)} />
          <span className={cn('truncate text-[11px] font-semibold sm:text-xs', taskOsText)}>Proyectos</span>
        </div>
        <button
          type="button"
          onClick={() => onShowNewProject(true)}
          className={cn('shrink-0 rounded-lg p-1 transition-colors', taskOsMutedDim, 'hover:bg-[#222228] hover:text-[#e8e8ed]')}
          title="Nuevo proyecto"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={onShowWorkspaceModal}
        className={cn('mx-1.5 mt-2 flex items-center justify-between px-2 py-1.5 text-left text-[10px] sm:mx-2 sm:px-3 sm:text-xs', taskOsBtn)}
        title="Cambiar espacio de trabajo"
      >
        <span className={cn('truncate', taskOsTextSecondary)}>{selectedWorkspace?.name ?? 'Espacio de trabajo'}</span>
        <ChevronRight className={cn('h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5', taskOsMutedDim)} />
      </button>

      {selectedWorkspace && (
        <button
          type="button"
          onClick={onOpenWorkspaceMedia}
          className={cn('mx-1.5 mt-1.5 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] sm:mx-2 sm:mt-2 sm:gap-2 sm:px-3 sm:text-xs', taskOsBtn)}
        >
          <Paperclip className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span className="truncate">Archivos</span>
        </button>
      )}

      {showNewProject && (
        <div className={cn('border-b px-2 py-2 sm:px-3', taskOsBorder)}>
          <input
            autoFocus
            value={newProjectName}
            onChange={(e) => onNewProjectNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreateProject();
              if (e.key === 'Escape') onShowNewProject(false);
            }}
            placeholder="Nuevo proyecto..."
            className={cn('w-full px-2 py-1.5 text-[11px] sm:text-xs', taskOsInput)}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-1.5 sm:py-2">
        {projects.map((p) => {
          const totalItems = p.columns.reduce((s, c) => s + c.items.length, 0);
          const isActive = p.id === selectedProject?.id;
          return (
            <button
              key={p.id}
              type="button"
              draggable
              onDragStart={(e) => onProjectDragStart(e, p.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onProjectDrop(e, p.id);
              }}
              onClick={() => onSelectProject(p.id)}
              className={cn(
                'group/proj flex w-full items-center justify-between px-2 py-1.5 text-left transition-colors sm:px-3 sm:py-2',
                isActive ? taskOsBtnActive : cn(taskOsTextSecondary, 'hover:bg-[#222228] hover:text-[#e8e8ed]'),
              )}
            >
              <span className="truncate text-[11px] font-medium sm:text-xs">{p.name}</span>
              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                <span className={cn('font-mono text-[9px] sm:text-[10px]', taskOsMutedDim)}>{totalItems}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject(p.id);
                  }}
                  className="rounded p-0.5 text-transparent opacity-0 transition-all hover:text-red-400 group-hover/proj:text-[#5c5c66] group-hover/proj:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </button>
          );
        })}
        {projects.length === 0 && (
          <TaskOsEmptyState
            size="inline"
            icon={null}
            title="Sin proyectos"
            action={(
              <button
                type="button"
                onClick={() => onShowNewProject(true)}
                className={cn('mt-2 text-xs underline', taskOsMuted, 'hover:text-[#e8e8ed]')}
              >
                Crear uno
              </button>
            )}
          />
        )}
      </div>
    </aside>
  );
}
