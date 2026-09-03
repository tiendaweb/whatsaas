'use client';

import { X } from 'lucide-react';
import { taskOsMuted, taskOsMutedDim, taskOsText } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type TaskOsModalHeaderProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
};

export function TaskOsModalHeader({ title, subtitle, onClose }: TaskOsModalHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div>
        <h3 className={cn('text-sm font-semibold', taskOsText)}>{title}</h3>
        {subtitle && <p className={cn('text-xs', taskOsMuted)}>{subtitle}</p>}
      </div>
      <button type="button" onClick={onClose} className={cn(taskOsMutedDim, 'hover:text-[#e8e8ed]')}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}