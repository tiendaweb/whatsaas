'use client';

import { useState } from 'react';
import {
  CheckSquare, Copy, FileCode2, FolderKanban, LayoutTemplate, MoreHorizontal, Paintbrush, Paperclip, Plus, Share2, Tag,
} from 'lucide-react';
import { getAppearanceBaseColor, withAppearanceAlpha } from '@/lib/plugins/tasks/client/appearance-color';
import type { Project } from '@/lib/plugins/tasks/client/types';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import { taskOsBorder, taskOsBtn, taskOsChrome, taskOsPanel, taskOsText } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';
import { ProjectAppearanceModal } from './ProjectAppearanceModal';
import { EmbedShareModal } from '@/lib/plugins/tasks/ui/embed/EmbedShareModal';

export type ProjectHeaderProps = {
  project: Project;
  onRenameProject: (projectId: number, name: string) => void;
  onDuplicateProject: (projectId: number) => void;
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
  { key: 'duplicate', icon: Copy, label: 'Duplicar' },
  { key: 'cascade', icon: FileCode2, label: 'Editor cascada' },
  { key: 'convert', icon: CheckSquare, label: 'A tarea' },
  { key: 'media', icon: Paperclip, label: 'Media' },
  { key: 'template', icon: LayoutTemplate, label: 'Plantilla' },
  { key: 'labels', icon: Tag, label: 'Etiquetas' },
  { key: 'embed', icon: Share2, label: 'Compartir / Embeber' },
  { key: 'column', icon: Plus, label: 'Etapa' },
] as const;

export function ProjectHeader({
  project,
  onRenameProject,
  onDuplicateProject,
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
  const projectColor = getAppearanceBaseColor(project.color);
  const projectTint = withAppearanceAlpha(project.color, 12);
  const projectBorder = withAppearanceAlpha(project.color, 35);

  const runExtra = (key: typeof EXTRA_ACTIONS[number]['key']) => {
    setMoreOpen(false);
    if (key === 'appearance') { setAppearanceOpen(true); return; }
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
          key={project.id}
          defaultValue={project.name}
          onBlur={(e) => e.currentTarget.value.trim() && e.currentTarget.value.trim() !== project.name && onRenameProject(project.id, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.currentTarget.value = project.name;
              e.currentTarget.blur();
            }
          }}
          className={cn('min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none', taskOsText)}
          title="Renombrar proyecto"
        />
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
        <HeaderBtn onClick={() => void onConvertToTask(project.id)} title="Convertir proyecto en tarea">
          <CheckSquare className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={onOpenProjectMedia} title="Media del proyecto">
          <Paperclip className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={() => void onSaveTemplate(project)} title="Guardar plantilla">
          <LayoutTemplate className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={onShowLabelManager} title="Etiquetas">
          <Tag className="h-3.5 w-3.5" />
        </HeaderBtn>
        <HeaderBtn onClick={() => setEmbedOpen(true)} title="Compartir / Embeber proyecto">
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
    </div>
  );
}
