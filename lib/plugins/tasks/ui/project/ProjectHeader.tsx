'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRightLeft, CheckSquare, Copy, FileCode2, FolderKanban, LayoutTemplate, Loader2, MoreHorizontal, Paintbrush, Paperclip, Plus, Share2, Tag,
} from 'lucide-react';
import { getAppearanceBaseColor, withAppearanceAlpha } from '@/lib/plugins/tasks/client/appearance-color';
import type { Project, Workspace } from '@/lib/plugins/tasks/client/types';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import { taskOsBorder, taskOsBtn, taskOsChrome, taskOsPanel, taskOsText } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';
import { ProjectAppearanceModal } from './ProjectAppearanceModal';
import { EmbedShareModal } from '@/lib/plugins/tasks/ui/embed/EmbedShareModal';
import { ProjectWorkspaceActionModal } from '@/lib/plugins/tasks/ui/shared/TaskTransferModals';

export type ProjectHeaderProps = {
  project: Project;
  workspaces: Workspace[];
  onRenameProject: (projectId: number, name: string) => void | Promise<void>;
  onDuplicateProject: (projectId: number) => void;
  onMoveProjectToWorkspace: (projectId: number, workspaceId: number) => Promise<void>;
  onCopyProjectToWorkspace: (projectId: number, workspaceId: number) => Promise<void>;
  onConvertToTask: (projectId: number) => void;
  onOpenProjectMedia: () => void;
  onSaveTemplate: (project: Project) => void;
  onShowLabelManager: () => void;
  onAddColumn: () => void;
  onSetAppearance?: (patch: { color?: string | null; icon?: string | null }) => void;
  onOpenCascade?: (projectId: number) => void;
};

function HeaderBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn('flex h-8 w-8 shrink-0 items-center justify-center', taskOsBtn)}
    >
      {children}
    </button>
  );
}

const EXTRA_ACTIONS = [
  { key: 'appearance', icon: Paintbrush, label: 'Color del proyecto' },
  { key: 'workspace', icon: ArrowRightLeft, label: 'Mover / copiar' },
  { key: 'duplicate', icon: Copy, label: 'Duplicar' },
  { key: 'cascade', icon: FileCode2, label: 'Editor cascada' },
  { key: 'convert', icon: CheckSquare, label: 'A tarea' },
  { key: 'media', icon: Paperclip, label: 'Archivos' },
  { key: 'template', icon: LayoutTemplate, label: 'Plantilla' },
  { key: 'labels', icon: Tag, label: 'Etiquetas' },
  { key: 'embed', icon: Share2, label: 'Compartir / Insertar' },
  { key: 'column', icon: Plus, label: 'Etapa' },
] as const;

export function ProjectHeader({
  project,
  workspaces,
  onRenameProject,
  onDuplicateProject,
  onMoveProjectToWorkspace,
  onCopyProjectToWorkspace,
  onConvertToTask,
  onOpenProjectMedia,
  onSaveTemplate,
  onShowLabelManager,
  onAddColumn,
  onSetAppearance,
  onOpenCascade,
}: ProjectHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [workspaceActionOpen, setWorkspaceActionOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(project.name);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const projectColor = getAppearanceBaseColor(project.color);
  const projectTint = withAppearanceAlpha(project.color, 12);
  const projectBorder = withAppearanceAlpha(project.color, 35);

  useEffect(() => {
    setTitleDraft(project.name);
    setTitleError(null);
  }, [project.id, project.name]);

  const commitTitle = async () => {
    const nextName = titleDraft.trim();
    if (!nextName) {
      setTitleDraft(project.name);
      setTitleError(null);
      return;
    }
    if (nextName === project.name || savingTitle) return;

    setSavingTitle(true);
    setTitleError(null);
    try {
      await onRenameProject(project.id, nextName);
    } catch (error) {
      setTitleDraft(project.name);
      setTitleError(error instanceof Error ? error.message : 'No se pudo renombrar el proyecto');
    } finally {
      setSavingTitle(false);
    }
  };

  const runExtra = (key: typeof EXTRA_ACTIONS[number]['key']) => {
    setMoreOpen(false);
    if (key === 'appearance') { setAppearanceOpen(true); return; }
    if (key === 'workspace') { setWorkspaceActionOpen(true); return; }
    if (key === 'duplicate') void onDuplicateProject(project.id);
    if (key === 'cascade') onOpenCascade?.(project.id);
    if (key === 'convert') void onConvertToTask(project.id);
    if (key === 'media') onOpenProjectMedia();
    if (key === 'template') void onSaveTemplate(project);
    if (key === 'labels') onShowLabelManager();
    if (key === 'embed') { setEmbedOpen(true); return; }
    if (key === 'column') onAddColumn();
  };

  return (
    <div
      className={cn('flex shrink-0 items-center gap-2 border-b px-2 py-2 sm:px-4', taskOsBorder, taskOsChrome)}
      style={projectColor ? { backgroundColor: projectTint, borderColor: projectBorder } : undefined}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {(() => { const I = resolveTaskIcon(project.icon) || FolderKanban; return <I className="hidden h-3.5 w-3.5 shrink-0 sm:block" style={projectColor ? { color: projectColor } : undefined} />; })()}
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if (e.key === 'Escape') {
              setTitleDraft(project.name);
              setTitleError(null);
              e.currentTarget.blur();
            }
          }}
          disabled={savingTitle}
          className={cn(
            'min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-semibold outline-none transition-colors',
            taskOsText,
            'hover:bg-white/5 focus:bg-white/8 focus:ring-1 focus:ring-white/20',
            titleError && 'text-red-200 ring-1 ring-red-400/30',
            savingTitle && 'opacity-70',
          )}
          title={titleError ?? 'Editar título del proyecto'}
        />
        {savingTitle && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#93c5fd]" />}
        {onSetAppearance && (
          <button
            type="button"
            onClick={() => setAppearanceOpen(true)}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-[#5c5c66] hover:bg-[#222228] hover:text-[#93c5fd]"
            title="Color e icono del proyecto"
          >
            <Paintbrush className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Escritorio: todas las acciones visibles */}
      <div className="hidden items-center gap-1 md:flex">
        <HeaderBtn onClick={() => void onDuplicateProject(project.id)} title="Duplicar proyecto">
          <Copy className="h-3.5 w-3.5" />
        </HeaderBtn>
        {onOpenCascade && (
          <HeaderBtn onClick={() => onOpenCascade(project.id)} title="Editor de cascada del proyecto">
            <FileCode2 className="h-3.5 w-3.5" />
          </HeaderBtn>
        )}
        <HeaderBtn onClick={() => setWorkspaceActionOpen(true)} title="Mover o copiar a espacio de trabajo">
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={() => void onConvertToTask(project.id)} title="Convertir proyecto en tarea">
          <CheckSquare className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={onOpenProjectMedia} title="Archivos del proyecto">
          <Paperclip className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={() => void onSaveTemplate(project)} title="Guardar plantilla">
          <LayoutTemplate className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={onShowLabelManager} title="Etiquetas">
          <Tag className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={() => setEmbedOpen(true)} title="Compartir / Insertar proyecto">
          <Share2 className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={onAddColumn} title="Agregar etapa">
          <Plus className="h-3.5 w-3.5" />
        </HeaderBtn>
      </div>

      {/* Móvil: acciones frecuentes + menú (misma capacidad que escritorio) */}
      <div className="flex items-center gap-1 md:hidden">
        <HeaderBtn onClick={() => void onDuplicateProject(project.id)} title="Duplicar proyecto">
          <Copy className="h-3.5 w-3.5" />
        </HeaderBtn>
        {onOpenCascade && (
          <HeaderBtn onClick={() => onOpenCascade(project.id)} title="Editor cascada del proyecto">
            <FileCode2 className="h-3.5 w-3.5" />
          </HeaderBtn>
        )}
        <HeaderBtn onClick={onAddColumn} title="Agregar etapa">
          <Plus className="h-3.5 w-3.5" />
        </HeaderBtn>
        <div className="relative">
          <HeaderBtn onClick={() => setMoreOpen((v) => !v)} title="Más acciones">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </HeaderBtn>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
              <div className={cn('absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-lg border py-1 shadow-xl', taskOsPanel)}>
                {EXTRA_ACTIONS.filter((a) => !['column', 'duplicate', 'cascade'].includes(a.key)).map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => runExtra(key)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#a8a8b3] hover:bg-[#222228] hover:text-[#e8e8ed]"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {appearanceOpen && onSetAppearance && (
        <ProjectAppearanceModal
          project={project}
          onClose={() => setAppearanceOpen(false)}
          onSave={onSetAppearance}
        />
      )}
      {embedOpen && (
        <EmbedShareModal
          entityType="project"
          entityId={project.id}
          entityName={project.name}
          onClose={() => setEmbedOpen(false)}
        />
      )}
      {workspaceActionOpen && (
        <ProjectWorkspaceActionModal
          project={project}
          workspaces={workspaces}
          onClose={() => setWorkspaceActionOpen(false)}
          onSubmit={async ({ mode, workspaceId }) => {
            if (mode === 'move') await onMoveProjectToWorkspace(project.id, workspaceId);
            else await onCopyProjectToWorkspace(project.id, workspaceId);
          }}
        />
      )}
    </div>
  );
}
