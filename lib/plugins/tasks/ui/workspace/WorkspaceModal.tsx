'use client';

import { useEffect, useState } from 'react';
import { Paintbrush, Plus, Share2, X } from 'lucide-react';
import {
  composeAppearanceColor,
  getAppearanceBaseColor,
  getAppearanceOpacity,
  sameAppearanceBase,
} from '@/lib/plugins/tasks/client/appearance-color';
import type { Workspace } from '@/lib/plugins/tasks/client/types';
import { resolveTaskIcon, TASK_APPEARANCE_COLORS, TASK_APPEARANCE_ICONS } from '@/lib/plugins/tasks/client/task-appearance';
import { TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';
import { EmbedShareModal } from '@/lib/plugins/tasks/ui/embed/EmbedShareModal';
import { taskOsBtnActive, taskOsMuted, taskOsPanel, taskOsText } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type WorkspaceModalProps = {
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  newWorkspaceName: string;
  onNewWorkspaceNameChange: (value: string) => void;
  onSelectWorkspace: (workspaceId: number, firstProjectId: number | null) => void;
  onRenameWorkspace: (workspaceId: number, name: string) => void;
  onSetWorkspaceAppearance: (workspaceId: number, patch: { color?: string | null; icon?: string | null }) => void;
  onCreateWorkspace: () => void;
  onClose: () => void;
};

export function WorkspaceModal({
  workspaces,
  selectedWorkspace,
  newWorkspaceName,
  onNewWorkspaceNameChange,
  onSelectWorkspace,
  onRenameWorkspace,
  onSetWorkspaceAppearance,
  onCreateWorkspace,
  onClose,
}: WorkspaceModalProps) {
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [embedWorkspace, setEmbedWorkspace] = useState<Workspace | null>(null);

  return (
    <TaskOsModal onClose={onClose} size="md">
      <TaskOsModalHeader title="Workspaces" onClose={onClose} />
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {workspaces.map((workspace) => {
          const WsIcon = resolveTaskIcon(workspace.icon) || null;
          return (
            <div
              key={workspace.id}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${workspace.id === selectedWorkspace?.id ? 'border-white/30 bg-white/14' : 'border-white/10 bg-white/6'}`}
            >
              <button
                onClick={() => {
                  onSelectWorkspace(workspace.id, workspace.projects[0]?.id ?? null);
                  onClose();
                }}
                className="min-w-0 flex-1 text-left text-sm text-white"
              >
                <span className="flex items-center gap-1.5">
                  {WsIcon && <WsIcon className="h-3.5 w-3.5" style={workspace.color ? { color: workspace.color } : undefined} />}
                  <span className="block truncate" style={workspace.color ? { color: workspace.color } : undefined}>{workspace.name}</span>
                </span>
                <span className="text-[10px] text-white/35">{workspace.projects.length} proyectos</span>
              </button>
              <input
                defaultValue={workspace.name}
                onBlur={(e) => e.currentTarget.value.trim() !== workspace.name && onRenameWorkspace(workspace.id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    e.currentTarget.value = workspace.name;
                    e.currentTarget.blur();
                  }
                }}
                className="w-28 rounded-lg border border-white/10 bg-white/8 px-2 py-1 text-xs text-white outline-none focus:border-white/35"
                title="Renombrar workspace"
              />
              <button
                type="button"
                onClick={() => setEditingWorkspace(workspace)}
                title="Color e icono"
                className="rounded p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-[#93c5fd]"
              >
                <Paintbrush className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setEmbedWorkspace(workspace)}
                title="Compartir / Embeber workspace"
                className="rounded p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-[#93c5fd]"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2 border-t border-white/10 pt-3">
        <input
          value={newWorkspaceName}
          onChange={(e) => onNewWorkspaceNameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void onCreateWorkspace();
          }}
          placeholder="Nuevo workspace..."
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/35"
        />
        <button
          onClick={() => void onCreateWorkspace()}
          className="rounded-xl border border-white/20 bg-white/12 px-3 text-white/70 hover:bg-white/18 hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {editingWorkspace && (
        <WorkspaceAppearanceEditor
          workspace={editingWorkspace}
          onClose={() => setEditingWorkspace(null)}
          onSave={(patch) => {
            onSetWorkspaceAppearance(editingWorkspace.id, patch);
            setEditingWorkspace(null);
          }}
        />
      )}

      {embedWorkspace && (
        <EmbedShareModal
          entityType="workspace"
          entityId={embedWorkspace.id}
          entityName={embedWorkspace.name}
          onClose={() => setEmbedWorkspace(null)}
        />
      )}
    </TaskOsModal>
  );
}

function WorkspaceAppearanceEditor({
  workspace,
  onClose,
  onSave,
}: {
  workspace: Workspace;
  onClose: () => void;
  onSave: (patch: { color?: string | null; icon?: string | null }) => void;
}) {
  const [baseColor, setBaseColor] = useState<string | null>(getAppearanceBaseColor(workspace.color));
  const [opacity, setOpacity] = useState(getAppearanceOpacity(workspace.color));
  const [icon, setIcon] = useState<string | null>(workspace.icon ?? null);
  const Icon = resolveTaskIcon(icon);
  const composedColor = baseColor ? composeAppearanceColor(baseColor, opacity) : null;

  useEffect(() => {
    setBaseColor(getAppearanceBaseColor(workspace.color));
    setOpacity(getAppearanceOpacity(workspace.color));
    setIcon(workspace.icon ?? null);
  }, [workspace.id, workspace.color, workspace.icon]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={cn('relative w-full max-w-lg rounded-xl border border-[#2a2a30] bg-[#1a1a1e] p-4 shadow-2xl')}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className={cn('text-sm font-semibold', taskOsText)}>Apariencia del workspace</h3>
            <p className={cn('text-xs', taskOsMuted)}>{workspace.name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[#5c5c66] hover:text-[#e8e8ed]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-4">
            <section className="space-y-2">
              <p className={cn('text-xs font-medium', taskOsText)}>Color</p>
              <div className="flex flex-wrap items-center gap-2">
                {TASK_APPEARANCE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBaseColor(sameAppearanceBase(baseColor, color) ? null : color)}
                    className={cn('h-7 w-7 rounded-full border-2', sameAppearanceBase(baseColor, color) ? 'border-white' : 'border-transparent')}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
                <input
                  type="color"
                  value={baseColor ?? '#3b82f6'}
                  onChange={(e) => setBaseColor(e.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-[#2a2a30] bg-transparent"
                />
                <button type="button" onClick={() => setBaseColor(null)} className="text-xs text-[#8b8b96] hover:text-[#e8e8ed]">
                  Quitar
                </button>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className={taskOsText}>Transparencia</span>
                <span className={cn('font-mono', taskOsMuted)}>{opacity}%</span>
              </div>
              <input
                type="range"
                min={15}
                max={100}
                step={5}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                disabled={!baseColor}
                className="w-full accent-[#3b82f6] disabled:opacity-40"
              />
            </section>

            <section className="space-y-2">
              <p className={cn('text-xs font-medium', taskOsText)}>Icono</p>
              <div className="flex flex-wrap gap-1">
                {TASK_APPEARANCE_ICONS.map(({ name, Icon: OptionIcon }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIcon(icon === name ? null : name)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                      icon === name ? 'bg-[#2563eb]/20 text-[#93c5fd]' : 'text-[#6b6b76] hover:bg-[#2a2a30] hover:text-[#d4d4dc]',
                    )}
                    title={name}
                  >
                    <OptionIcon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </section>

            <button
              type="button"
              onClick={() => onSave({ color: composedColor, icon })}
              className={cn('w-full px-4 py-2 text-xs font-medium', taskOsBtnActive)}
            >
              Guardar apariencia
            </button>
          </div>

          <aside className={cn('flex flex-col items-center justify-center gap-3 p-4', taskOsPanel)}>
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2a2a30]"
              style={baseColor ? { backgroundColor: composedColor ?? baseColor, borderColor: baseColor } : undefined}
            >
              {Icon && <Icon className="h-6 w-6" style={baseColor ? { color: baseColor } : undefined} />}
            </div>
            <p className={cn('text-center text-xs', taskOsMuted)}>Vista previa</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
