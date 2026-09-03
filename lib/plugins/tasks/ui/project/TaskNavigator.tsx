'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  FileCode2,
  FolderKanban,
  Layers,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  Trash2,
} from 'lucide-react';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import type { Project, Workspace } from '@/lib/plugins/tasks/client/types';
import type { CascadeScope } from '@/lib/plugins/tasks/client/cascade-scope';
import { TaskOsEmptyState } from '@/lib/plugins/tasks/ui/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

export type TaskNavigatorProps = {
  workspaces: Workspace[];
  selectedWorkspaceId: number | null;
  selectedProjectId: number | null;
  onSelectWorkspace: (id: number, firstProjectId: number | null) => void;
  onSelectProject: (id: number) => void;
  onDeleteProject: (id: number) => void;
  onOpenCascade: (scope: CascadeScope) => void;
  onShowWorkspaceModal: () => void;
  onOpenWorkspaceMedia: (workspace: Workspace) => void;
  onOpenProjectMedia: (project: Project) => void;
  showNewProject: boolean;
  newProjectName: string;
  onNewProjectNameChange: (value: string) => void;
  onShowNewProject: (show: boolean) => void;
  onCreateProject: () => void;
  onProjectDragStart: (e: React.DragEvent, projectId: number) => void;
  onProjectDrop: (e: React.DragEvent, projectId: number) => void;
  onShowSystemMenu?: () => void;
};

export function TaskNavigator({
  workspaces,
  selectedWorkspaceId,
  selectedProjectId,
  onSelectWorkspace,
  onSelectProject,
  onDeleteProject,
  onOpenCascade,
  onShowWorkspaceModal,
  onOpenWorkspaceMedia,
  onOpenProjectMedia,
  showNewProject,
  newProjectName,
  onNewProjectNameChange,
  onShowNewProject,
  onCreateProject,
  onProjectDragStart,
  onProjectDrop,
  onShowSystemMenu,
}: TaskNavigatorProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Drill-down nav: 'workspaces' (menu) or 'projects' (submenu inside selected ws)
  const [navView, setNavView] = useState<'workspaces' | 'projects'>('workspaces');

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) ?? null;

  useEffect(() => {
    if (selectedWorkspaceId) {
      setNavView('projects');
    }
  }, [selectedWorkspaceId]);

  const enterWorkspace = (wsId: number) => {
    const ws = workspaces.find((w) => w.id === wsId);
    onSelectWorkspace(wsId, ws?.projects[0]?.id ?? null);
    setNavView('projects');
  };

  const backToWorkspaces = () => {
    setNavView('workspaces');
    // keep selectedWorkspaceId so content remains, but UI shows ws list
  };

  const currentProjects = selectedWorkspace?.projects ?? [];

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r transition-[width] duration-200',
        taskOsBorder,
        taskOsSurfaceRaised,
        collapsed ? 'w-12' : 'w-52 sm:w-60',
      )}
    >
      <div className={cn('flex items-center justify-between border-b px-2 py-2', taskOsBorder, taskOsChrome)}>
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-1.5">
            <Layers className={cn('h-4 w-4 shrink-0', taskOsMuted)} />
            <span className={cn('truncate text-xs font-semibold', taskOsText)}>Navegador</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={cn('rounded-lg p-1.5', taskOsMutedDim, 'hover:bg-[#222228] hover:text-[#e8e8ed]')}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        {/* WORKSPACES MENU */}
        {(navView === 'workspaces' || !selectedWorkspaceId) && !collapsed && (
          <>
            {workspaces.map((ws) => {
              const isActive = ws.id === selectedWorkspaceId;
              const projectCount = ws.projects.length;
              const WsIcon = resolveTaskIcon(ws.icon) || Layers;
              const wsColor = ws.color || undefined;
              return (
                <div key={ws.id} className="group/ws mb-0.5 flex items-center gap-0.5 px-1.5">
                  <button
                    type="button"
                    title={ws.name}
                    onClick={() => enterWorkspace(ws.id)}
                    className={cn(
                      'flex w-full min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                      isActive ? taskOsBtnActive : cn(taskOsTextSecondary, 'hover:bg-[#222228]'),
                    )}
                  >
                    <span style={wsColor ? { color: wsColor } : undefined}>
                      <WsIcon className="h-3.5 w-3.5 shrink-0" />
                    </span>
                    <span className="truncate font-medium">{ws.name}</span>
                    <span className={cn('ml-auto font-mono text-[9px]', taskOsMutedDim)}>{projectCount}</span>
                  </button>
                  <button
                    type="button"
                    title="Editor cascada espacio de trabajo"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCascade({ type: 'workspace', workspaceId: ws.id });
                    }}
                    className="rounded p-1 text-transparent opacity-0 hover:text-[#93c5fd] group-hover/ws:opacity-100"
                  >
                    <FileCode2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            {workspaces.length === 0 && (
              <TaskOsEmptyState size="inline" icon={null} title="Sin espacios de trabajo" />
            )}
          </>
        )}

        {/* PROJECTS SUBMENU (inside a workspace) */}
        {navView === 'projects' && selectedWorkspace && !collapsed && (
          <div>
            <div className="px-1.5 pb-1">
              <button
                type="button"
                onClick={backToWorkspaces}
                className="mb-1 flex items-center gap-1 rounded-lg px-1 py-1 text-[11px] text-[#93c5fd] hover:bg-[#222228]"
                title="Volver a espacios de trabajo"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Espacios de trabajo
              </button>
              <div className="px-1 text-[10px] uppercase tracking-wide text-[#5c5c66]">
                {selectedWorkspace.name}
              </div>
            </div>

            {currentProjects.map((p) => {
              const total = p.columns.reduce((s, c) => s + c.items.length, 0);
              const isActive = p.id === selectedProjectId;
              const PIcon = resolveTaskIcon(p.icon) || FolderKanban;
              const pColor = p.color || undefined;
              return (
                <div key={p.id} className="group/proj flex items-center gap-0.5 px-1.5">
                  <button
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
                      'flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors',
                      isActive ? taskOsBtnActive : 'text-[#a8a8b3] hover:bg-[#222228]',
                    )}
                    style={isActive && pColor ? { borderLeft: `3px solid ${pColor}`, paddingLeft: '5px' } : undefined}
                  >
                    <span style={pColor ? { color: pColor } : undefined}>
                      <PIcon className="h-3 w-3 shrink-0 opacity-80" />
                    </span>
                    <span className="truncate">{p.name}</span>
                    <span className={cn('ml-auto font-mono text-[9px]', taskOsMutedDim)}>{total}</span>
                  </button>
                  <button
                    type="button"
                    title="Editor cascada proyecto"
                    onClick={() => onOpenCascade({ type: 'project', projectId: p.id })}
                    className="rounded p-1 text-[#5c5c66] opacity-70 transition-colors hover:bg-[#222228] hover:text-[#93c5fd] group-hover/proj:opacity-100"
                  >
                    <FileCode2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                    title="Eliminar proyecto"
                    className="rounded p-1 text-[#5c5c66] opacity-70 transition-colors hover:bg-[#222228] hover:text-red-400 group-hover/proj:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            {currentProjects.length === 0 && (
              <p className={cn('px-3 py-2 text-[10px]', taskOsMuted)}>Sin proyectos</p>
            )}
          </div>
        )}

        {/* collapsed state: minimal indicators */}
        {collapsed && selectedWorkspaceId && (
          <div className="px-1 py-1 text-center text-[10px] text-[#5c5c66]">{selectedWorkspace?.name?.slice(0, 1) || 'W'}</div>
        )}

        {/* Collapsed: quick access to system menu at bottom */}
        {collapsed && onShowSystemMenu && (
          <button
            type="button"
            onClick={onShowSystemMenu}
            className={cn('mt-auto flex w-full items-center justify-center border-t py-2 text-xs', taskOsBorder, taskOsBtn)}
            title="Menú del sistema"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className={cn('shrink-0 border-t p-2', taskOsBorder)}>
          <button
            type="button"
            onClick={onShowWorkspaceModal}
            className={cn('mb-2 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[10px]', taskOsBtn)}
            title="Gestionar espacios de trabajo"
          >
            <span className={cn('truncate', taskOsTextSecondary)}>Espacios de trabajo</span>
            <ChevronRight className={cn('h-3 w-3 shrink-0', taskOsMutedDim)} />
          </button>
          {showNewProject ? (
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => onNewProjectNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCreateProject();
                if (e.key === 'Escape') onShowNewProject(false);
              }}
              placeholder="Nuevo proyecto..."
              className={cn('mb-2 w-full px-2 py-1.5 text-xs', taskOsInput)}
            />
          ) : null}
          <button
            type="button"
            onClick={() => (showNewProject ? onCreateProject() : onShowNewProject(true))}
            className={cn('flex w-full items-center justify-center gap-1.5 py-2 text-xs', taskOsBtn)}
          >
            <Plus className="h-3.5 w-3.5" />
            {showNewProject ? 'Crear proyecto' : 'Nuevo proyecto'}
          </button>

          {/* Menú desplegable del sistema - al fondo del sidebar izquierdo */}
          {onShowSystemMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn('mt-2 flex w-full items-center justify-center gap-1.5 border-t py-2 text-xs', taskOsBorder, taskOsBtn)}
                  title="Menú"
                >
                  <Menu className="h-3.5 w-3.5" />
                  Menú
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-48">
                <DropdownMenuItem onClick={onShowSystemMenu}>
                  <Menu className="mr-2 h-4 w-4" /> Abrir menú del sistema
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </aside>
  );
}
