'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, FolderKanban, GanttChart, LayoutGrid, Plus } from 'lucide-react';
import type { CascadeScope } from '@/lib/plugins/tasks/client/cascade-scope';
import { TaskOsCascadeEditor } from '@/lib/plugins/tasks/ui/cascade/TaskOsCascadeEditor';
import { TaskOsScheduleBoard } from '@/lib/plugins/calendar/ui/TaskOsScheduleBoard';
import { getAppearanceBaseColor, withAppearanceAlpha } from '@/lib/plugins/tasks/client/appearance-color';
import { buildTaskEntityIndex } from '@/lib/plugins/tasks/client/entity-index';
import type { Project, TaskItem } from '@/lib/plugins/tasks/client/types';
import { useTaskDragDrop, useTaskMutations, useTaskOsBoard } from '@/lib/plugins/tasks/hooks';
import { MediaManager } from '@/lib/plugins/tasks/ui/media';
import {
  AddColumnBar,
  KanbanBoard,
  LabelManagerModal,
  ProjectHeader,
  TaskNavigator,
  TaskOsShell,
} from '@/lib/plugins/tasks/ui/project';
import { TaskOsConfirmDialog, TaskOsEmptyState, TaskOsInputDialog, TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';
import { taskOsBtn, taskOsBtnActive } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';
import { TaskModal } from '@/lib/plugins/tasks/ui/task';
import { WorkspaceModal } from '@/lib/plugins/tasks/ui/workspace';
import { StageEditorModal } from '@/lib/plugins/tasks/ui/board';

export function TasksOSDashboard() {
  const {
    workspaces,
    selectedWorkspace,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    projects,
    selectedProject,
    selectedProjectId,
    setSelectedProjectId,
    mutate,
  } = useTaskOsBoard();

  const [openTask, setOpenTask] = useState<TaskItem | null>(null);
  const [showSystemMenu, setShowSystemMenu] = useState(false);

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [mediaOwner, setMediaOwner] = useState<{ type: 'workspace' | 'project' | 'task'; id: number; title: string } | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [addingCol, setAddingCol] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [templateDialog, setTemplateDialog] = useState<{
    project: Project;
    defaultValue: string;
  } | null>(null);
  const [projectView, setProjectView] = useState<'kanban' | 'calendar' | 'gantt'>('kanban');
  const [cascadeScope, setCascadeScope] = useState<CascadeScope | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<number | null>(null);

  const mutations = useTaskMutations({
    mutate,
    selectedWorkspaceId,
    selectedProject,
    openTask,
    setSelectedProjectId,
    setSelectedWorkspaceId,
  });

  const dragDrop = useTaskDragDrop({
    selectedProject,
    projects,
    mutate,
  });

  const selectedProjectColor = getAppearanceBaseColor(selectedProject?.color);
  const selectedProjectTint = withAppearanceAlpha(selectedProject?.color, 10);
  const selectedProjectBorder = withAppearanceAlpha(selectedProject?.color, 30);
  const editingColumn = selectedProject?.columns.find((column) => column.id === editingColumnId) ?? null;
  const taskEntityIndex = useMemo(() => buildTaskEntityIndex(workspaces), [workspaces]);
  const cascadeContext = useMemo(() => {
    if (!cascadeScope) return { workspace: selectedWorkspace, project: selectedProject, task: openTask };
    if (cascadeScope.type === 'workspace') {
      return {
        workspace: taskEntityIndex.findWorkspace(cascadeScope.workspaceId),
        project: null,
        task: null,
      };
    }
    if (cascadeScope.type === 'project' || cascadeScope.type === 'column') {
      const found = taskEntityIndex.findProject(cascadeScope.projectId);
      return {
        workspace: found?.workspace ?? selectedWorkspace,
        project: found?.project ?? selectedProject,
        task: null,
      };
    }
    if (cascadeScope.type === 'task') {
      const found = taskEntityIndex.findTask(cascadeScope.taskId);
      return {
        workspace: found?.workspace ?? selectedWorkspace,
        project: found?.project ?? selectedProject,
        task: found?.task ?? openTask,
      };
    }
    return { workspace: selectedWorkspace, project: selectedProject, task: openTask };
  }, [cascadeScope, openTask, selectedProject, selectedWorkspace, taskEntityIndex]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !selectedWorkspace) return;
    await mutations.createProject(newProjectName.trim(), selectedWorkspace.id);
    setNewProjectName('');
    setShowNewProject(false);
  };

  const handleCreateColumn = async () => {
    if (!newColTitle.trim() || !selectedProject) return;
    await mutations.createColumn(selectedProject.id, newColTitle.trim());
    setNewColTitle('');
    setAddingCol(false);
  };

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return;
    await mutations.createWorkspace(newWorkspaceName.trim());
    setNewWorkspaceName('');
  };

  const navigateToTask = (taskId: number) => {
    const found = taskEntityIndex.findTask(taskId);
    if (!found) return;
    setSelectedWorkspaceId(found.workspace.id);
    setSelectedProjectId(found.project.id);
    setOpenTask(found.task);
  };

  const navigateToProject = (projectId: number) => {
    const found = taskEntityIndex.findProject(projectId);
    if (!found) return;
    setSelectedWorkspaceId(found.workspace.id);
    setSelectedProjectId(found.project.id);
  };

  const navigateToWorkspace = (workspaceId: number) => {
    const ws = taskEntityIndex.findWorkspace(workspaceId);
    if (!ws) return;
    setSelectedWorkspaceId(ws.id);
    setSelectedProjectId(ws.projects[0]?.id ?? null);
    setOpenTask(null);
  };

  return (
    <TaskOsShell showSystemMenu={showSystemMenu} onCloseSystemMenu={() => setShowSystemMenu(false)}>
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
        onOpenWorkspaceMedia={(ws) => setMediaOwner({ type: 'workspace', id: ws.id, title: ws.name })}
        onOpenProjectMedia={(p) => setMediaOwner({ type: 'project', id: p.id, title: p.name })}
        showNewProject={showNewProject}
        newProjectName={newProjectName}
        onNewProjectNameChange={setNewProjectName}
        onShowNewProject={setShowNewProject}
        onCreateProject={() => void handleCreateProject()}
        onDeleteProject={(id) => {
          const project = projects.find((p) => p.id === id);
          setConfirmDialog({
            title: 'Eliminar proyecto',
            description: `¿Eliminar "${project?.name ?? 'este proyecto'}" y todas sus tareas? Esta acción no se puede deshacer.`,
            onConfirm: async () => { await mutations.deleteProject(id); },
          });
        }}
        onProjectDragStart={dragDrop.handleProjectDragStart}
        onProjectDrop={(_e, projectId) => void dragDrop.reorderProjects(projectId)}
        onShowSystemMenu={() => setShowSystemMenu(true)}
      />

      {selectedProject ? (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ProjectHeader
            project={selectedProject}
            workspaces={workspaces}
            onRenameProject={(id, name) => mutations.renameProject(id, name)}
            onDuplicateProject={(id) => void mutations.duplicateProject(id)}
            onMoveProjectToWorkspace={(id, workspaceId) => mutations.moveProjectToWorkspace(id, workspaceId)}
            onCopyProjectToWorkspace={async (id, workspaceId) => { await mutations.copyProjectToWorkspace(id, workspaceId); }}
            onConvertToTask={(id) => void mutations.convertProjectToTask(id)}
            onOpenProjectMedia={() => setMediaOwner({ type: 'project', id: selectedProject.id, title: selectedProject.name })}
            onSaveTemplate={(project) => setTemplateDialog({ project, defaultValue: project.name })}
            onShowLabelManager={() => setShowLabelManager(true)}
            onAddColumn={() => setAddingCol(true)}
            onSetAppearance={(patch) => void mutations.setProjectAppearance(selectedProject.id, patch)}
            onOpenCascade={(projectId) => setCascadeScope({ type: 'project', projectId })}
          />

          <div
            className="flex shrink-0 items-center gap-1 border-b border-[#2a2a30] px-2 py-1.5 sm:px-4"
            style={selectedProjectColor ? { backgroundColor: selectedProjectTint, borderColor: selectedProjectBorder } : undefined}
          >
            {([
              { id: 'kanban' as const, label: 'Kanban', icon: LayoutGrid },
              { id: 'calendar' as const, label: 'Calendario', icon: CalendarDays },
              { id: 'gantt' as const, label: 'Gantt', icon: GanttChart },
            ]).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setProjectView(id)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                  projectView === id ? taskOsBtnActive : cn(taskOsBtn, 'border-transparent'),
                )}
                style={projectView === id && selectedProjectColor ? { borderColor: selectedProjectBorder, backgroundColor: selectedProjectTint, color: selectedProjectColor } : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {addingCol && projectView === 'kanban' && (
            <AddColumnBar
              value={newColTitle}
              onChange={setNewColTitle}
              onSubmit={() => void handleCreateColumn()}
              onCancel={() => setAddingCol(false)}
            />
          )}

          {projectView === 'kanban' ? (
            <KanbanBoard
              project={selectedProject}
              onOpenTask={setOpenTask}
              onAddTask={mutations.createTask}
              onDragStart={dragDrop.handleDragStart}
              onDrop={dragDrop.handleDrop}
              onDropOnTask={dragDrop.handleDropOnTask}
              onRenameCol={(id, title) => void mutations.renameColumn(id, title)}
              onColumnDragStart={dragDrop.handleColumnDragStart}
              onColumnDrop={dragDrop.reorderColumns}
              onAddColumn={() => setAddingCol(true)}
              onEditColumn={setEditingColumnId}
            />
          ) : (
            <TaskOsScheduleBoard
              key={projectView}
              projects={[selectedProject]}
              projectFilter={selectedProject.id}
              defaultView={projectView === 'gantt' ? 'gantt' : 'calendar'}
              showViewSwitcher={false}
              onOpenTask={(task) => setOpenTask(task)}
              onRefresh={async () => { await mutate(); }}
              onTaskPatched={(taskId, patch) => {
                if (openTask?.id === taskId) setOpenTask({ ...openTask, ...patch } as TaskItem);
              }}
              className="min-h-0 flex-1 p-2 sm:p-3"
            />
          )}
        </div>
      ) : (
        <TaskOsEmptyState
          size="page"
          icon={<FolderKanban className="h-10 w-10 text-white/40" />}
          title="Sin proyectos"
          description="Crea tu primer proyecto para empezar"
          action={(
            <button
              onClick={() => setShowNewProject(true)}
              className="flex items-center gap-2 rounded-lg border border-[#2a2a30] bg-[#1a1a1e] px-5 py-2.5 text-sm font-medium text-[#e8e8ed] transition-colors hover:bg-[#222228]"
            >
              <Plus className="h-4 w-4" />
              Crear proyecto
            </button>
          )}
        />
      )}
      </div>

      {openTask && selectedProject && (
        <TaskModal
          key={openTask.id}
          item={openTask}
          project={selectedProject}
          workspaces={workspaces}
          onClose={() => setOpenTask(null)}
          onSave={mutations.saveTask}
          onDelete={mutations.deleteTask}
          onRefresh={() => { void mutate(); }}
          onNavigateTask={navigateToTask}
          onNavigateProject={navigateToProject}
          onNavigateWorkspace={navigateToWorkspace}
          onOpenCascadeEditor={() => {
            if (openTask && selectedProject) {
              setCascadeScope({ type: 'task', taskId: openTask.id, projectId: selectedProject.id });
              setOpenTask(null);
            }
          }}
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
          onOpenWorkspaceCascade={(workspace) => {
            setCascadeScope({ type: 'workspace', workspaceId: workspace.id });
            setShowWorkspaceModal(false);
          }}
          onCreateWorkspace={() => void handleCreateWorkspace()}
          onClose={() => setShowWorkspaceModal(false)}
        />
      )}

      {mediaOwner && (
        <TaskOsModal onClose={() => setMediaOwner(null)} size="2xl">
          <TaskOsModalHeader title="Archivos" subtitle={mediaOwner.title} onClose={() => setMediaOwner(null)} />
          <MediaManager ownerType={mediaOwner.type} ownerId={mediaOwner.id} />
        </TaskOsModal>
      )}

      {showLabelManager && selectedProject && (
        <LabelManagerModal
          project={selectedProject}
          onClose={() => setShowLabelManager(false)}
          onSave={mutations.saveLabels}
        />
      )}

      {editingColumn && selectedProject && (
        <StageEditorModal
          column={editingColumn}
          project={selectedProject}
          workspaces={workspaces}
          onClose={() => setEditingColumnId(null)}
          onRename={(id, title) => void mutations.renameColumn(id, title)}
          onSaveAppearance={(id, patch) => void mutations.setColumnAppearance(id, patch)}
          onDelete={(id) => {
            const column = selectedProject.columns.find((c) => c.id === id);
            setEditingColumnId(null);
            setConfirmDialog({
              title: 'Eliminar etapa',
              description: `¿Eliminar "${column?.title ?? 'esta etapa'}" y todas sus tareas? Esta acción no se puede deshacer.`,
              onConfirm: async () => { await mutations.deleteColumn(id); },
            });
          }}
          onApplied={() => void mutate()}
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

      {cascadeScope && (
        <TaskOsCascadeEditor
          workspaces={workspaces}
          scope={cascadeScope}
          workspace={cascadeContext.workspace}
          project={cascadeContext.project}
          task={cascadeContext.task}
          onClose={() => setCascadeScope(null)}
          onApplied={() => void mutate()}
        />
      )}

      <TaskOsInputDialog
        open={templateDialog !== null}
        title="Guardar plantilla de proyecto"
        description="Incluirá columnas, tareas y etiquetas del proyecto actual."
        defaultValue={templateDialog?.defaultValue ?? ''}
        placeholder="Nombre de la plantilla..."
        submitLabel="Guardar plantilla"
        onSubmit={async (name) => {
          if (templateDialog) await mutations.saveProjectTemplate(templateDialog.project, name);
        }}
        onClose={() => setTemplateDialog(null)}
      />
    </TaskOsShell>
  );
}
