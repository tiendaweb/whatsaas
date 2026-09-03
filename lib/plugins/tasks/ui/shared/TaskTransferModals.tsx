'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Copy, Loader2, Share2 } from 'lucide-react';
import type { TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import { TaskOsModal } from './TaskOsModal';
import { TaskOsModalHeader } from './TaskOsModalHeader';
import {
  taskOsBtn,
  taskOsBtnActive,
  taskOsInput,
  taskOsMuted,
  taskOsPanel,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type TransferMode = 'move' | 'copy' | 'share';

const MODE_META: Record<TransferMode, { label: string; icon: typeof ArrowRightLeft; description: string }> = {
  move: { label: 'Mover', icon: ArrowRightLeft, description: 'Cambia la ubicación principal.' },
  copy: { label: 'Copiar', icon: Copy, description: 'Crea una copia independiente.' },
  share: { label: 'Compartir', icon: Share2, description: 'Agrega otra ubicación sin duplicar.' },
};

function findProject(workspaces: TaskWorkspace[], projectId: number | null) {
  for (const workspace of workspaces) {
    const project = workspace.projects.find((item) => item.id === projectId);
    if (project) return { workspace, project };
  }
  return null;
}

function firstProject(workspace: TaskWorkspace | null) {
  return workspace?.projects[0] ?? null;
}

function firstColumn(project: TaskProject | null) {
  return project?.columns[0] ?? null;
}

export function ProjectWorkspaceActionModal({
  project,
  workspaces,
  onClose,
  onSubmit,
}: {
  project: TaskProject;
  workspaces: TaskWorkspace[];
  onClose: () => void;
  onSubmit: (input: { mode: Extract<TransferMode, 'move' | 'copy'>; workspaceId: number }) => Promise<void>;
}) {
  const [mode, setMode] = useState<Extract<TransferMode, 'move' | 'copy'>>('move');
  const [workspaceId, setWorkspaceId] = useState(project.workspaceId ?? workspaces[0]?.id ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = Boolean(workspaceId) && !(mode === 'move' && workspaceId === project.workspaceId);

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit({ mode, workspaceId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar la acción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TaskOsModal onClose={onClose} size="md">
      <TaskOsModalHeader title="Proyecto" subtitle={project.name} onClose={onClose} />
      <div className="space-y-4">
        <ModePicker modes={['move', 'copy']} value={mode} onChange={(next) => setMode(next as typeof mode)} />
        <label className={cn('block space-y-1.5 text-xs font-medium', taskOsMuted)}>
          Espacio de trabajo destino
          <select value={workspaceId} onChange={(e) => setWorkspaceId(Number(e.target.value))} className={cn('w-full px-3 py-2 text-sm', taskOsInput)}>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
        </label>
        {mode === 'move' && workspaceId === project.workspaceId && (
          <p className={cn('rounded-lg border border-[#2a2a30] bg-[#141416] px-3 py-2 text-xs', taskOsMuted)}>
            Elegí otro espacio de trabajo para mover este proyecto.
          </p>
        )}
        {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-[#2a2a30] pt-3">
          <button type="button" onClick={onClose} className={cn('px-4 py-2 text-xs', taskOsBtn)}>Cancelar</button>
          <button type="button" disabled={!canSubmit || saving} onClick={() => void submit()} className={cn('flex items-center gap-2 px-4 py-2 text-xs font-medium disabled:opacity-50', taskOsBtnActive)}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {MODE_META[mode].label}
          </button>
        </div>
      </div>
    </TaskOsModal>
  );
}

export function LocationActionModal({
  title,
  subtitle,
  workspaces,
  defaultProjectId,
  sourceProjectId,
  sourceColumnId,
  modes,
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  workspaces: TaskWorkspace[];
  defaultProjectId?: number | null;
  sourceProjectId?: number | null;
  sourceColumnId?: number | null;
  modes: TransferMode[];
  onClose: () => void;
  onSubmit: (input: { mode: TransferMode; workspaceId: number; projectId: number; columnId: number }) => Promise<void>;
}) {
  const initial = findProject(workspaces, defaultProjectId ?? null) ?? { workspace: workspaces[0] ?? null, project: firstProject(workspaces[0] ?? null) };
  const [mode, setMode] = useState<TransferMode>(modes[0] ?? 'move');
  const [workspaceId, setWorkspaceId] = useState(initial.workspace?.id ?? 0);
  const [projectId, setProjectId] = useState(initial.project?.id ?? 0);
  const [columnId, setColumnId] = useState(firstColumn(initial.project)?.id ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0] ?? null,
    [workspaceId, workspaces],
  );
  const selectedProject = useMemo(
    () => selectedWorkspace?.projects.find((project) => project.id === projectId) ?? firstProject(selectedWorkspace),
    [projectId, selectedWorkspace],
  );
  const selectedColumn = useMemo(
    () => selectedProject?.columns.find((column) => column.id === columnId) ?? firstColumn(selectedProject),
    [columnId, selectedProject],
  );

  useEffect(() => {
    setColumnId(firstColumn(selectedProject)?.id ?? 0);
  }, [selectedProject?.id]);

  const sameProjectShare = mode === 'share' && sourceProjectId !== undefined && sourceProjectId !== null && selectedProject?.id === sourceProjectId;
  const sameColumnMove = mode === 'move' && sourceColumnId !== undefined && sourceColumnId !== null && selectedColumn?.id === sourceColumnId;
  const canSubmit = Boolean(selectedWorkspace && selectedProject && selectedColumn) && !sameProjectShare && !sameColumnMove;

  const submit = async () => {
    if (!selectedWorkspace || !selectedProject || !selectedColumn || !canSubmit) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit({
        mode,
        workspaceId: selectedWorkspace.id,
        projectId: selectedProject.id,
        columnId: selectedColumn.id,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar la acción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <TaskOsModal onClose={onClose} size="md">
      <TaskOsModalHeader title={title} subtitle={subtitle} onClose={onClose} />
      <div className="space-y-4">
        <ModePicker modes={modes} value={mode} onChange={setMode} />
        <div className={cn('grid gap-3 p-3', taskOsPanel)}>
          <label className={cn('block space-y-1.5 text-xs font-medium', taskOsMuted)}>
            Espacio de trabajo
            <select
              value={workspaceId}
              onChange={(e) => {
                const nextWorkspaceId = Number(e.target.value);
                const nextWorkspace = workspaces.find((workspace) => workspace.id === nextWorkspaceId) ?? null;
                const nextProject = firstProject(nextWorkspace);
                setWorkspaceId(nextWorkspaceId);
                setProjectId(nextProject?.id ?? 0);
                setColumnId(firstColumn(nextProject)?.id ?? 0);
              }}
              className={cn('w-full px-3 py-2 text-sm', taskOsInput)}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
          </label>
          <label className={cn('block space-y-1.5 text-xs font-medium', taskOsMuted)}>
            Proyecto
            <select value={selectedProject?.id ?? 0} onChange={(e) => setProjectId(Number(e.target.value))} className={cn('w-full px-3 py-2 text-sm', taskOsInput)}>
              {(selectedWorkspace?.projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label className={cn('block space-y-1.5 text-xs font-medium', taskOsMuted)}>
            Etapa
            <select value={selectedColumn?.id ?? 0} onChange={(e) => setColumnId(Number(e.target.value))} className={cn('w-full px-3 py-2 text-sm', taskOsInput)}>
              {(selectedProject?.columns ?? []).map((column) => (
                <option key={column.id} value={column.id}>{column.title}</option>
              ))}
            </select>
          </label>
        </div>
        {sameColumnMove && (
          <p className={cn('rounded-lg border border-[#2a2a30] bg-[#141416] px-3 py-2 text-xs', taskOsMuted)}>
            Elegí otra etapa para mover.
          </p>
        )}
        {sameProjectShare && (
          <p className={cn('rounded-lg border border-[#2a2a30] bg-[#141416] px-3 py-2 text-xs', taskOsMuted)}>
            Compartir requiere elegir otro proyecto. Para cambiar etapa dentro del mismo proyecto usá Mover o Copiar.
          </p>
        )}
        {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-[#2a2a30] pt-3">
          <button type="button" onClick={onClose} className={cn('px-4 py-2 text-xs', taskOsBtn)}>Cancelar</button>
          <button type="button" disabled={!canSubmit || saving} onClick={() => void submit()} className={cn('flex items-center gap-2 px-4 py-2 text-xs font-medium disabled:opacity-50', taskOsBtnActive)}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {MODE_META[mode].label}
          </button>
        </div>
      </div>
    </TaskOsModal>
  );
}

function ModePicker({
  modes,
  value,
  onChange,
}: {
  modes: TransferMode[];
  value: TransferMode;
  onChange: (mode: TransferMode) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {modes.map((mode) => {
        const meta = MODE_META[mode];
        const Icon = meta.icon;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              value === mode ? 'border-[#3b82f6]/45 bg-[#2563eb]/15' : 'border-[#2a2a30] bg-[#141416] hover:bg-[#222228]',
            )}
          >
            <span className={cn('flex items-center gap-2 text-xs font-semibold', taskOsText)}>
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </span>
            <span className={cn('mt-1 block text-[10px] leading-snug', taskOsMuted)}>{meta.description}</span>
          </button>
        );
      })}
    </div>
  );
}
