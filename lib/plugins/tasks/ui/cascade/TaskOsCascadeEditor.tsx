'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Bot, FileCode2, Loader2, Sparkles } from 'lucide-react';
import {
  copyTaskToLocation,
  duplicateProject,
  moveProjectToWorkspace,
  moveTaskToLocation,
  shareTaskToLocation,
} from '@/lib/plugins/tasks/client/api';
import {
  CASCADE_SYNTAX_HELP,
  parseCascadeDocument,
  summarizeCascadeDocument,
} from '@/lib/plugins/tasks/client/cascade-dsl';
import {
  getCascadeScopeLabel,
  serializeCascadeForScope,
  type CascadeScope,
} from '@/lib/plugins/tasks/client/cascade-scope';
import type { TaskColumn, TaskItem, TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';
import { LocationActionModal, ProjectWorkspaceActionModal, type TransferMode } from '@/lib/plugins/tasks/ui/shared/TaskTransferModals';
import {
  taskOsBtn,
  taskOsBtnActive,
  taskOsInput,
  taskOsMuted,
  taskOsPanel,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

type TaskOsCascadeEditorProps = {
  workspaces: TaskWorkspace[];
  scope: CascadeScope;
  workspace?: TaskWorkspace | null;
  project?: TaskProject | null;
  task?: TaskItem | null;
  onClose: () => void;
  onApplied: () => void;
};

type PreviewStats = {
  create: { workspaces: number; projects: number; columns: number; tasks: number };
  update: { tasks: number };
};

const SCOPE_HELP: Record<CascadeScope['type'], string> = {
  team: CASCADE_SYNTAX_HELP,
  workspace: `## Proyecto nuevo
### Por hacer
#### Primera tarea
:::notes
Contexto y criterios de aceptacion.
:::
- Paso pendiente
- [x] Paso listo`,
  project: `### Por hacer
#### Primera tarea
:::notes
Contexto y criterios de aceptacion.
:::
- Paso pendiente
- [x] Paso listo`,
  column: `#### Nueva tarea
:::notes
Contexto y criterios de aceptacion.
:::
- Paso pendiente
- [x] Paso listo`,
  task: `#### Tarea actual
:::notes
Notas que reemplazan o actualizan la tarea.
:::
- Paso pendiente
- [x] Paso listo`,
};

const CASCADE_RULES = [
  'Usa # para espacios de trabajo, ## para proyectos, ### para etapas y #### para tareas.',
  'En un espacio de trabajo seleccionado puedes empezar directamente con ## Proyecto.',
  'En un proyecto seleccionado puedes empezar directamente con ### Etapa.',
  'En una etapa seleccionada puedes empezar directamente con #### Tarea.',
  'Pon notas largas entre :::notes y :::. Usa > solo para notas cortas de una linea.',
  'Usa - item para checklist pendiente y - [x] item para checklist completado.',
  'No escribas JSON, tablas, codigo, numeraciones ni explicaciones fuera del documento.',
  'No inventes IDs. Los nombres son la clave para crear o actualizar tareas existentes.',
];

function buildAiPrompt(scopeLabel: string) {
  return `Convierte mi solicitud en un documento de cascada para Tasks OS.
Ambito actual: ${scopeLabel}.

Formato obligatorio:
# Espacio de trabajo
## Proyecto
### Etapa
#### Tarea
:::notes
Notas opcionales en markdown seguro
:::
- checklist pendiente
- [x] checklist completado

Reglas:
- Devuelve solo el documento de cascada, sin explicaciones.
- No uses JSON, tablas, listas numeradas ni bloques de codigo.
- Usa titulos claros y cortos.
- Si el ambito ya es espacio, proyecto, etapa o tarea, empieza en el nivel correspondiente.
- Cada tarea debe tener un titulo accionable.
- Las notas van dentro de :::notes y los pasos van como checklist.`;
}

export function TaskOsCascadeEditor({
  workspaces,
  scope,
  workspace,
  project,
  task,
  onClose,
  onApplied,
}: TaskOsCascadeEditorProps) {
  const [document, setDocument] = useState('');
  const [preview, setPreview] = useState<PreviewStats | null>(null);
  const [loading, setLoading] = useState<'preview' | 'apply' | 'export' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectActionOpen, setProjectActionOpen] = useState(false);
  const [taskActionOpen, setTaskActionOpen] = useState(false);
  const [stageActionOpen, setStageActionOpen] = useState(false);

  const scoped = useMemo(() => {
    let foundWorkspace: TaskWorkspace | null = workspace ?? null;
    let foundProject: TaskProject | null = project ?? null;
    let foundColumn: TaskColumn | null = null;
    let foundTask: TaskItem | null = task ?? null;

    for (const ws of workspaces) {
      if (scope.type === 'workspace' && ws.id === scope.workspaceId) {
        foundWorkspace = ws;
      }
      for (const proj of ws.projects) {
        const projectMatches =
          (scope.type === 'project' && proj.id === scope.projectId)
          || (scope.type === 'column' && proj.id === scope.projectId)
          || (scope.type === 'task' && proj.id === scope.projectId);
        if (!foundProject && projectMatches) {
          foundWorkspace = ws;
          foundProject = proj;
        }
        for (const column of proj.columns) {
          if (scope.type === 'column' && column.id === scope.columnId && proj.id === scope.projectId) {
            foundWorkspace = ws;
            foundProject = proj;
            foundColumn = column;
          }
          if (scope.type === 'task' && proj.id === scope.projectId) {
            const item = column.items.find((candidate) => candidate.id === scope.taskId);
            if (item) {
              foundWorkspace = ws;
              foundProject = proj;
              foundColumn = column;
              foundTask = item;
            }
          }
        }
      }
    }

    return { workspace: foundWorkspace, project: foundProject, column: foundColumn, task: foundTask };
  }, [project, scope, task, workspace, workspaces]);

  const scopeLabel = getCascadeScopeLabel(scope, {
    workspace: scoped.workspace,
    project: scoped.project,
    task: scoped.task,
    columnTitle: scoped.column?.title,
  });
  const aiPrompt = useMemo(() => buildAiPrompt(scopeLabel), [scopeLabel]);

  const localSummary = useMemo(() => {
    try {
      return summarizeCascadeDocument(parseCascadeDocument(document));
    } catch {
      return null;
    }
  }, [document]);

  useEffect(() => {
    setDocument(serializeCascadeForScope(workspaces, scope));
  }, [workspaces, scope]);

  const buildBody = (mode: 'preview' | 'apply') => ({
    document,
    mode,
    scope: scope.type === 'team' ? { type: 'team' }
      : scope.type === 'workspace' ? { type: 'workspace', workspaceId: scope.workspaceId }
        : scope.type === 'project' ? { type: 'project', projectId: scope.projectId }
          : scope.type === 'column' ? { type: 'column', columnId: scope.columnId, projectId: scope.projectId }
            : { type: 'task', taskId: scope.taskId, projectId: scope.projectId },
  });

  const runPreview = async () => {
    setLoading('preview');
    setError(null);
    try {
      const res = await fetch('/api/plugins/tasks/cascade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('preview')),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al previsualizar');
      setPreview(data.preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(null);
    }
  };

  const runApply = async () => {
    setLoading('apply');
    setError(null);
    try {
      const res = await fetch('/api/plugins/tasks/cascade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody('apply')),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al aplicar');
      onApplied();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(null);
    }
  };

  const reloadScope = () => {
    setDocument(serializeCascadeForScope(workspaces, scope));
    setPreview(null);
  };

  const runProjectAction = async (input: { mode: Extract<TransferMode, 'move' | 'copy'>; workspaceId: number }) => {
    if (!scoped.project) return;
    if (input.mode === 'move') await moveProjectToWorkspace(scoped.project.id, input.workspaceId);
    else await duplicateProject(scoped.project.id, input.workspaceId);
    onApplied();
  };

  const runTaskAction = async (input: { mode: TransferMode; projectId: number; columnId: number }) => {
    if (!scoped.task) return;
    if (input.mode === 'move') await moveTaskToLocation(scoped.task.id, input.projectId, input.columnId);
    else if (input.mode === 'copy') await copyTaskToLocation(scoped.task.id, input.projectId, input.columnId);
    else await shareTaskToLocation(scoped.task.id, input.projectId, input.columnId);
    onApplied();
  };

  const runStageAction = async (input: { mode: TransferMode; projectId: number; columnId: number }) => {
    if (!scoped.column) return;
    await Promise.all(scoped.column.items.map((item) => {
      if (input.mode === 'move') return moveTaskToLocation(item.id, input.projectId, input.columnId);
      if (input.mode === 'copy') return copyTaskToLocation(item.id, input.projectId, input.columnId);
      return shareTaskToLocation(item.id, input.projectId, input.columnId);
    }));
    onApplied();
  };

  return (
    <>
    <TaskOsModal onClose={onClose} size="2xl" className="!max-w-[min(96vw,72rem)] !w-full max-h-[92vh] flex flex-col">
      <TaskOsModalHeader
        title="Editor en cascada"
        subtitle={scopeLabel}
        onClose={onClose}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={reloadScope} className={cn('px-3 py-1.5 text-xs', taskOsBtn)}>
              Recargar ámbito
            </button>
            <button
              type="button"
              onClick={() => { setDocument(SCOPE_HELP[scope.type]); setPreview(null); }}
              className={cn('px-3 py-1.5 text-xs', taskOsBtn)}
            >
              <Sparkles className="mr-1 inline h-3 w-3" />
              Plantilla
            </button>
          </div>
          <textarea
            value={document}
            onChange={(e) => { setDocument(e.target.value); setPreview(null); }}
            spellCheck={false}
            className={cn('min-h-[280px] flex-1 resize-none font-mono text-xs leading-relaxed lg:min-h-[420px]', taskOsInput, 'p-3')}
          />
          {localSummary && (
            <p className={cn('text-[11px]', taskOsMuted)}>
              {localSummary.projects} proy · {localSummary.columns} etapas · {localSummary.tasks} tareas · {localSummary.checklist} checklist
            </p>
          )}
        </div>

        <aside className={cn('flex w-full shrink-0 flex-col gap-3 overflow-y-auto lg:w-80', taskOsPanel, 'p-3')}>
          <div className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-[#93c5fd]" />
            <span className={cn('text-sm font-medium', taskOsText)}>Ámbito: {scope.type}</span>
          </div>
          <div className="rounded-lg border border-[#2a2a30] bg-[#141416] p-2">
            <p className={cn('mb-1 text-[10px] font-medium uppercase tracking-wider', taskOsMuted)}>Como usarlo</p>
            <ol className="space-y-1 pl-4 text-[10px] leading-relaxed text-[#a8a8b3]">
              {CASCADE_RULES.map((rule) => (
                <li key={rule} className="list-decimal">{rule}</li>
              ))}
            </ol>
          </div>
          <pre className={cn('overflow-auto rounded-lg border border-[#2a2a30] bg-[#141416] p-2 text-[10px] leading-relaxed', taskOsMuted)}>
            {SCOPE_HELP[scope.type]}
          </pre>
          <div className="rounded-lg border border-[#2a2a30] bg-[#141416] p-2">
            <div className="mb-1 flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5 text-[#93c5fd]" />
              <p className={cn('text-[10px] font-medium uppercase tracking-wider', taskOsMuted)}>Prompt para IA</p>
            </div>
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-[#a8a8b3]">
              {aiPrompt}
            </pre>
          </div>
          <p className={cn('text-[10px]', taskOsMuted)}>
            Solo se modifica el ámbito seleccionado. Primero usa Previsualizar para confirmar qué se creará o actualizará.
          </p>
          {((scope.type === 'project' && scoped.project) || (scope.type === 'task' && scoped.task) || (scope.type === 'column' && scoped.column)) && (
            <div className="space-y-2 rounded-lg border border-[#2a2a30] bg-[#141416] p-2">
              <p className={cn('text-[10px] font-medium uppercase tracking-wider', taskOsMuted)}>Acciones rápidas</p>
              {scope.type === 'project' && scoped.project && (
                <button type="button" onClick={() => setProjectActionOpen(true)} className={cn('flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px]', taskOsBtn)}>
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Mover / copiar proyecto
                </button>
              )}
              {scope.type === 'task' && scoped.task && (
                <button type="button" onClick={() => setTaskActionOpen(true)} className={cn('flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px]', taskOsBtn)}>
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Mover / copiar / compartir tarea
                </button>
              )}
              {scope.type === 'column' && scoped.column && (
                <button type="button" onClick={() => setStageActionOpen(true)} className={cn('flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px]', taskOsBtn)}>
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Aplicar a tareas de etapa
                </button>
              )}
            </div>
          )}
          {preview && (
            <div className="space-y-1 text-xs text-[#c8c8d0]">
              <p className="font-medium text-[#e8e8ed]">Cambios previstos</p>
              <p>Crear: {preview.create.workspaces} espacios, {preview.create.projects} proyectos</p>
              <p>Crear: {preview.create.columns} etapas, {preview.create.tasks} tareas</p>
              <p>Actualizar: {preview.update.tasks} tareas</p>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="mt-auto flex flex-col gap-2">
            <button type="button" disabled={loading !== null} onClick={() => void runPreview()} className={cn('w-full py-2 text-xs', taskOsBtn)}>
              {loading === 'preview' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Previsualizar'}
            </button>
            <button type="button" disabled={loading !== null} onClick={() => void runApply()} className={cn('w-full py-2 text-xs font-medium', taskOsBtnActive, 'border-[#3b82f6]/35')}>
              {loading === 'apply' ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Aplicar'}
            </button>
          </div>
        </aside>
      </div>
    </TaskOsModal>
    {projectActionOpen && scoped.project && (
      <ProjectWorkspaceActionModal
        project={scoped.project}
        workspaces={workspaces}
        onClose={() => setProjectActionOpen(false)}
        onSubmit={runProjectAction}
      />
    )}
    {taskActionOpen && scoped.task && scoped.project && (
      <LocationActionModal
        title="Ubicación de tarea"
        subtitle={scoped.task.title}
        workspaces={workspaces}
        defaultProjectId={scoped.project.id}
        sourceProjectId={scoped.project.id}
        sourceColumnId={scoped.task.columnId}
        modes={['move', 'copy', 'share']}
        onClose={() => setTaskActionOpen(false)}
        onSubmit={runTaskAction}
      />
    )}
    {stageActionOpen && scoped.column && scoped.project && (
      <LocationActionModal
        title="Tareas de etapa"
        subtitle={scoped.column.title}
        workspaces={workspaces}
        defaultProjectId={scoped.project.id}
        sourceProjectId={scoped.project.id}
        sourceColumnId={scoped.column.id}
        modes={['move', 'copy', 'share']}
        onClose={() => setStageActionOpen(false)}
        onSubmit={runStageAction}
      />
    )}
    </>
  );
}
