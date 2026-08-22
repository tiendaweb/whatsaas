'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { CalendarDays, Loader2 } from 'lucide-react';
import type { CascadeScope } from '@/lib/plugins/tasks/client/cascade-scope';
import { TaskOsCascadeEditor } from '@/lib/plugins/tasks/ui/cascade/TaskOsCascadeEditor';
import type { CalendarBoardData } from '@/lib/plugins/calendar/client/types';
import { TaskOsScheduleBoard } from './TaskOsScheduleBoard';
import { CalendarTaskInspector } from './CalendarTaskInspector';
import { TASK_OS_API } from '@/lib/plugins/tasks/client/constants';
import { taskOsFetcher } from '@/lib/plugins/tasks/client/api';
import type { TaskItem, TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { useTaskDragDrop, useTaskMutations } from '@/lib/plugins/tasks/hooks';
import { TaskNavigator, TaskOsShell } from '@/lib/plugins/tasks/ui/project';
import { TaskOsConfirmDialog } from '@/lib/plugins/tasks/ui/shared';
import { WorkspaceModal } from '@/lib/plugins/tasks/ui/workspace';
import {
  taskOsBg,
  taskOsBorder,
  taskOsMuted,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function CalendarTaskDashboard() {
  const { data: calendarData, mutate: mutateCalendar, isLoading } = useSWR<CalendarBoardData>(
    '/api/plugins/calendar/tasks',
    fetcher,
  );
  const { data: workspaces = [], mutate: mutateWorkspaces } = useSWR<TaskWorkspace[]>(
    TASK_OS_API.workspaces,
    taskOsFetcher,
  );

  const mutate = useCallback(async () => {
    await Promise.all([mutateCalendar(), mutateWorkspaces()]);
  }, [mutateCalendar, mutateWorkspaces]);

  const allProjects = calendarData?.projects ?? workspaces.flatMap((w) => w.projects);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [openTask, setOpenTask] = useState<{ task: TaskItem; project: TaskProject } | null>(null);
  const [cascadeScope, setCascadeScope] = useState<CascadeScope | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) ?? null;
  const selectedProject = selectedWorkspace?.projects.find((p) => p.id === selectedProjectId) ?? null;

  // Por defecto no hay workspace/proyecto seleccionado: se ven todos los workspaces y
  // todos los proyectos (visibleProjects/projectFilter ya soportan ese estado "todo").
  // Clickear un workspace en TaskNavigator filtra a ese workspace; clickear un proyecto
  // filtra más. No auto-seleccionamos el primero para no ocultar el resto por defecto.

  const visibleProjects = useMemo(() => {
    if (!selectedWorkspaceId) return allProjects;
    const ws = workspaces.find((w) => w.id === selectedWorkspaceId);
    if (!ws) return allProjects;
    const ids = new Set(ws.projects.map((p) => p.id));
    return allProjects.filter((p) => ids.has(p.id));
  }, [allProjects, selectedWorkspaceId, workspaces]);

  const projectFilter = selectedProjectId ?? 'all';

  const mutations = useTaskMutations({
    mutate,
    selectedWorkspaceId,
    selectedProject,
    openTask: openTask?.task ?? null,
    setSelectedProjectId,
    setSelectedWorkspaceId,
  });

  const dragDrop = useTaskDragDrop({
    selectedProject,
    projects: selectedWorkspace?.projects ?? [],
    mutate,
  });

  const refresh = useCallback(async () => { await mutate(); }, [mutate]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const taskId = Number(params.get('task'));
    if (!taskId || openTask) return;
    for (const project of allProjects) {
      for (const column of project.columns) {
        const found = column.items.find((i) => i?.id === taskId);
        if (found) {
          const ws = workspaces.find((w) => w.projects.some((p) => p.id === project.id));
          if (ws) setSelectedWorkspaceId(ws.id);
          setSelectedProjectId(project.id);
          setOpenTask({ task: found, project });
          break;
        }
      }
    }
  }, [allProjects, openTask, workspaces]);

  const handleOpenTask = useCallback((task: TaskItem, project: TaskProject) => {
    setOpenTask({ task, project });
  }, []);

  const syncOpenTask = (taskId: number, patch: Partial<TaskItem>) => {
    if (openTask?.task.id === taskId) {
      setOpenTask((prev) => prev ? { ...prev, task: { ...prev.task, ...patch } as TaskItem } : null);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selectedWorkspace) return;
    await mutations.createProject(newProjectName.trim(), selectedWorkspace.id);
    setNewProjectName('');
    setShowNewProject(false);
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    await mutations.createWorkspace(newWorkspaceName.trim());
    setNewWorkspaceName('');
  };

  return (
    <TaskOsShell showSystemMenu={false} onCloseSystemMenu={() => {}}>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <TaskNavigator
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          selectedProjectId={selectedProjectId}
          onSelectWorkspace={(wsId, firstProjectId) => {
            setSelectedWorkspaceId(wsId);
            setSelectedProjectId(firstProjectId);
          }}
          onSelectProject={setSelectedProjectId}
          onOpenCascade={setCascadeScope}
          onShowWorkspaceModal={() => setShowWorkspaceModal(true)}
          onOpenWorkspaceMedia={() => {}}
          onOpenProjectMedia={() => {}}
          showNewProject={showNewProject}
          newProjectName={newProjectName}
          onNewProjectNameChange={setNewProjectName}
          onShowNewProject={setShowNewProject}
          onCreateProject={() => void handleCreateProject()}
          onDeleteProject={(id) => {
            const project = visibleProjects.find((p) => p.id === id);
            setConfirmDialog({
              title: 'Eliminar proyecto',
              description: `¿Eliminar "${project?.name ?? 'este proyecto'}" y todas sus tareas?`,
              onConfirm: async () => { await mutations.deleteProject(id); },
            });
          }}
          onProjectDragStart={dragDrop.handleProjectDragStart}
          onProjectDrop={(_e, projectId) => void dragDrop.reorderProjects(projectId)}
        />

        <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', taskOsBg)}>
          <header className={cn('flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3', taskOsBorder)}>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a2a30] bg-[#1a1a1e]">
                <CalendarDays className="h-4 w-4 text-[#93c5fd]" />
              </div>
              <div>
                <h1 className={cn('text-sm font-semibold sm:text-base', taskOsText)}>Calendario de tareas</h1>
                <p className={cn('text-[10px] sm:text-xs', taskOsMuted)}>
                  {selectedProject?.name ?? selectedWorkspace?.name ?? 'Todos los proyectos'}
                </p>
              </div>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <main className="flex min-h-0 min-w-0 flex-1 flex-col p-2 sm:p-4">
              {isLoading && visibleProjects.length === 0 ? (
                <div className={cn('flex flex-1 items-center justify-center gap-2 text-sm', taskOsMuted)}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando tareas…
                </div>
              ) : (
                <TaskOsScheduleBoard
                  projects={visibleProjects}
                  projectFilter={projectFilter}
                  onOpenTask={handleOpenTask}
                  onRefresh={refresh}
                  onTaskPatched={syncOpenTask}
                />
              )}
            </main>

            {openTask && (
              <div className="hidden w-80 shrink-0 lg:flex">
                <CalendarTaskInspector
                  task={openTask.task}
                  project={openTask.project}
                  onClose={() => setOpenTask(null)}
                  onSaved={() => void refresh()}
                  onScheduleChange={(start, end) => syncOpenTask(openTask.task.id, { startDate: start, endDate: end, dueDate: end })}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {cascadeScope && (
        <TaskOsCascadeEditor
          workspaces={workspaces}
          scope={cascadeScope}
          workspace={selectedWorkspace}
          project={selectedProject}
          task={openTask?.task ?? null}
          onClose={() => setCascadeScope(null)}
          onApplied={() => void refresh()}
        />
      )}

      {showWorkspaceModal && (
        <WorkspaceModal
          workspaces={workspaces}
          selectedWorkspace={selectedWorkspace}
          newWorkspaceName={newWorkspaceName}
          onNewWorkspaceNameChange={setNewWorkspaceName}
          onSelectWorkspace={(workspaceId, firstProjectId) => {
            setSelectedWorkspaceId(workspaceId);
            setSelectedProjectId(firstProjectId);
          }}
          onRenameWorkspace={(id, name) => void mutations.renameWorkspace(id, name)}
          onSetWorkspaceAppearance={(id, patch) => void mutations.setWorkspaceAppearance(id, patch)}
          onCreateWorkspace={() => void handleCreateWorkspace()}
          onClose={() => setShowWorkspaceModal(false)}
        />
      )}

      <TaskOsConfirmDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title ?? ''}
        description={confirmDialog?.description ?? ''}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => { if (confirmDialog) await confirmDialog.onConfirm(); }}
        onClose={() => setConfirmDialog(null)}
      />

      {openTask && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setOpenTask(null)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
            <CalendarTaskInspector
              mobileSheet
              task={openTask.task}
              project={openTask.project}
              onClose={() => setOpenTask(null)}
              onSaved={() => void refresh()}
              onScheduleChange={(start, end) => syncOpenTask(openTask.task.id, { startDate: start, endDate: end, dueDate: end })}
            />
          </div>
        </>
      )}
    </TaskOsShell>
  );
}
