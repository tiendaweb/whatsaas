'use client';

import { Palette } from 'lucide-react';
import { TaskOsModal, TaskOsModalHeader } from '@/lib/plugins/tasks/ui/shared';
import { TaskAppearancePicker } from './TaskAppearancePicker';

export type TaskAppearanceModalProps = {
  open: boolean;
  color: string | null;
  icon: string | null;
  onColorChange: (color: string | null) => void;
  onIconChange: (icon: string | null) => void;
  onClose: () => void;
};

export function TaskAppearanceModal({
  open,
  color,
  icon,
  onColorChange,
  onIconChange,
  onClose,
}: TaskAppearanceModalProps) {
  if (!open) return null;

  return (
    <TaskOsModal onClose={onClose} size="sm" elevated>
      <TaskOsModalHeader
        title="Icono y color"
        subtitle="Opcional — personaliza cómo se ve la tarea en el tablero"
        onClose={onClose}
      />
      <div className="flex items-center gap-3 rounded-lg border border-[#2a2a30] bg-[#141416] p-3">
        <Palette className="h-4 w-4 shrink-0 text-[#6b6b76]" />
        <p className="text-xs text-[#8b8b96]">Tocá un color o icono. Volvé a tocar para quitar.</p>
      </div>
      <div className="mt-4">
        <TaskAppearancePicker
          color={color}
          icon={icon}
          onColorChange={onColorChange}
          onIconChange={onIconChange}
        />
      </div>
    </TaskOsModal>
  );
}