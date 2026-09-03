'use client';

import { X } from 'lucide-react';
import { TASK_APPEARANCE_COLORS, TASK_APPEARANCE_ICONS } from '@/lib/plugins/tasks/client/task-appearance';
import { cn } from '@/lib/utils';

export type TaskAppearancePickerProps = {
  color: string | null;
  icon: string | null;
  onColorChange: (color: string | null) => void;
  onIconChange: (icon: string | null) => void;
};

export function TaskAppearancePicker({ color, icon, onColorChange, onIconChange }: TaskAppearancePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {TASK_APPEARANCE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onColorChange(color === c ? null : c)}
            className={cn(
              'h-5 w-5 rounded-full border-2 transition-transform hover:scale-110',
              color === c ? 'border-white' : 'border-transparent',
            )}
            style={{ backgroundColor: c }}
          />
        ))}
        <button
          type="button"
          title="Sin color"
          onClick={() => onColorChange(null)}
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full border border-[#2a2a30] text-[#5c5c66] transition-colors hover:text-[#a8a8b3]',
            !color && 'border-white/40 text-white/70',
          )}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      </div>

      <span className="hidden h-4 w-px bg-[#2a2a30] sm:block" />

      <div className="flex flex-wrap items-center gap-0.5">
        {TASK_APPEARANCE_ICONS.map(({ name, Icon }) => (
          <button
            key={name}
            type="button"
            title={name}
            onClick={() => onIconChange(icon === name ? null : name)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
              icon === name
                ? 'bg-[#2563eb]/20 text-[#93c5fd]'
                : 'text-[#6b6b76] hover:bg-[#2a2a30] hover:text-[#d4d4dc]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <button
          type="button"
          title="Sin icono"
          onClick={() => onIconChange(null)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            !icon
              ? 'bg-[#2563eb]/20 text-[#93c5fd]'
              : 'text-[#6b6b76] hover:bg-[#2a2a30] hover:text-[#d4d4dc]',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}