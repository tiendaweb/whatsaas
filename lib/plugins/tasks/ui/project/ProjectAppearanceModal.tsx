'use client';

import { useEffect, useState } from 'react';
import { FolderKanban, X } from 'lucide-react';
import {
  composeAppearanceColor,
  getAppearanceBaseColor,
  getAppearanceOpacity,
  sameAppearanceBase,
} from '@/lib/plugins/tasks/client/appearance-color';
import { resolveTaskIcon, TASK_APPEARANCE_COLORS, TASK_APPEARANCE_ICONS } from '@/lib/plugins/tasks/client/task-appearance';
import type { Project } from '@/lib/plugins/tasks/client/types';
import { TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';
import { taskOsBtnActive, taskOsMuted, taskOsPanel, taskOsText } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type ProjectAppearanceModalProps = {
  project: Project;
  onClose: () => void;
  onSave: (patch: { color?: string | null; icon?: string | null }) => void;
};

export function ProjectAppearanceModal({ project, onClose, onSave }: ProjectAppearanceModalProps) {
  const [baseColor, setBaseColor] = useState<string | null>(getAppearanceBaseColor(project.color));
  const [opacity, setOpacity] = useState(getAppearanceOpacity(project.color));
  const [icon, setIcon] = useState<string | null>(project.icon ?? null);
  const Icon = resolveTaskIcon(icon) || FolderKanban;
  const composedColor = baseColor ? composeAppearanceColor(baseColor, opacity) : null;

  useEffect(() => {
    setBaseColor(getAppearanceBaseColor(project.color));
    setOpacity(getAppearanceOpacity(project.color));
    setIcon(project.icon ?? null);
  }, [project.id, project.color, project.icon]);

  return (
    <TaskOsModal onClose={onClose} size="lg">
      <TaskOsModalHeader
        title="Apariencia del proyecto"
        subtitle="El color seleccionado se usa como tema visual del proyecto."
        onClose={onClose}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_13rem]">
        <div className="space-y-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={cn('text-xs font-medium', taskOsText)}>Color</p>
              <button
                type="button"
                onClick={() => setBaseColor(null)}
                className={cn('flex items-center gap-1 text-[11px]', taskOsMuted, 'hover:text-[#e8e8ed]')}
              >
                <X className="h-3 w-3" />
                Quitar
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {TASK_APPEARANCE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBaseColor(sameAppearanceBase(baseColor, color) ? null : color)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-transform hover:scale-105',
                    sameAppearanceBase(baseColor, color) ? 'border-white' : 'border-transparent',
                  )}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
              <input
                type="color"
                value={baseColor ?? '#3b82f6'}
                onChange={(e) => setBaseColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-[#2a2a30] bg-transparent"
                title="Color personalizado"
              />
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={cn('text-xs font-medium', taskOsText)}>Intensidad del tema</p>
              <span className={cn('font-mono text-[11px]', taskOsMuted)}>{opacity}%</span>
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
                    icon === name
                      ? 'bg-[#2563eb]/20 text-[#93c5fd]'
                      : 'text-[#6b6b76] hover:bg-[#2a2a30] hover:text-[#d4d4dc]',
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
            onClick={() => {
              onSave({ color: composedColor, icon });
              onClose();
            }}
            className={cn('w-full px-4 py-2 text-xs font-medium', taskOsBtnActive)}
          >
            Guardar apariencia
          </button>
        </div>

        <aside className={cn('flex flex-col items-center justify-center gap-3 p-4', taskOsPanel)}>
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2a2a30]"
            style={baseColor ? { backgroundColor: composedColor ?? baseColor, borderColor: baseColor } : undefined}
          >
            <Icon className="h-7 w-7" style={baseColor ? { color: baseColor } : undefined} />
          </div>
          <div className="text-center">
            <p className={cn('text-sm font-semibold', taskOsText)}>{project.name}</p>
            <p className={cn('text-xs', taskOsMuted)}>Vista previa</p>
          </div>
          <div
            className="h-12 w-full rounded-lg border border-[#2a2a30] bg-[#141416]"
            style={baseColor ? { backgroundColor: composedColor ?? baseColor, borderColor: baseColor } : undefined}
          />
        </aside>
      </div>
    </TaskOsModal>
  );
}
