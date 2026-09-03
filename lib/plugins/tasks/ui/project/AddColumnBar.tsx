'use client';

import { X } from 'lucide-react';
import { taskOsBorder, taskOsBtn, taskOsChrome, taskOsInput, taskOsMutedDim } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type AddColumnBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function AddColumnBar({ value, onChange, onSubmit, onCancel }: AddColumnBarProps) {
  return (
    <div className={cn('flex items-center gap-2 border-b px-6 py-3', taskOsBorder, taskOsChrome)}>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Nombre de la columna..."
        className={cn('w-56 px-3 py-2 text-sm', taskOsInput)}
      />
      <button type="button" onClick={onSubmit} className={cn('px-4 py-2 text-sm', taskOsBtn)}>
        Crear
      </button>
      <button type="button" onClick={onCancel} className={cn('p-2', taskOsMutedDim, 'hover:text-[#e8e8ed]')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}