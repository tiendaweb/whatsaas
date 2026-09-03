'use client';

import {
  CheckSquare, FolderKanban, GitBranch, Link2, PanelLeftClose, User,
} from 'lucide-react';
import type { PickerAction } from '@/lib/plugins/tasks/client/types';
import { taskOsBtn, taskOsMutedDim } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

const LINK_OPTIONS: { action: PickerAction; icon: typeof User; label: string; description: string }[] = [
  { action: 'related_task', icon: CheckSquare, label: 'Tarea', description: 'Del mismo proyecto' },
  { action: 'related_project', icon: FolderKanban, label: 'Proyecto', description: 'Otro tablero' },
  { action: 'related_workspace', icon: PanelLeftClose, label: 'Espacio', description: 'Espacio de trabajo' },
  { action: 'parent_task', icon: GitBranch, label: 'Padre', description: 'Tarea contenedora' },
  { action: 'dependency', icon: Link2, label: 'Depende', description: 'Bloqueo entre tareas' },
];

export type TaskQuickLinkBarProps = {
  onLinkContact: () => void;
  onPickAction: (action: PickerAction) => void;
};

export function TaskQuickLinkBar({ onLinkContact, onPickAction }: TaskQuickLinkBarProps) {
  return (
    <div>
      <p className={cn('mb-2 text-[10px] font-medium uppercase tracking-wider', taskOsMutedDim)}>
        Vincular con…
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onLinkContact}
          className={cn('flex flex-col items-start gap-1 p-3 text-left', taskOsBtn)}
        >
          <User className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-medium text-[#e8e8ed]">Contacto</span>
          <span className="text-[10px] text-[#5c5c66]">CRM del equipo</span>
        </button>
        {LINK_OPTIONS.map(({ action, icon: Icon, label, description }) => (
          <button
            key={action}
            type="button"
            onClick={() => onPickAction(action)}
            className={cn('flex flex-col items-start gap-1 p-3 text-left', taskOsBtn)}
          >
            <Icon className="h-4 w-4 text-[#93c5fd]" />
            <span className="text-xs font-medium text-[#e8e8ed]">{label}</span>
            <span className="text-[10px] text-[#5c5c66]">{description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
