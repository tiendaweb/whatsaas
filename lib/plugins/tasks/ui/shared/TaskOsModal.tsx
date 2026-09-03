'use client';

import { taskOsBorder, taskOsSurface } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type TaskOsModalSize = 'sm' | 'md' | 'lg' | '2xl';

const SIZE_CLASSES: Record<TaskOsModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  '2xl': 'max-w-2xl',
};

export type TaskOsModalProps = {
  onClose: () => void;
  size?: TaskOsModalSize;
  className?: string;
  elevated?: boolean;
  children: React.ReactNode;
};

export function TaskOsModal({ onClose, size = 'md', className, elevated = false, children }: TaskOsModalProps) {
  return (
    <div className={cn('fixed inset-0 flex items-center justify-center p-4', elevated ? 'z-[60]' : 'z-50')}>
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />
      <div
        className={cn(
          'relative w-full rounded-xl border p-4 shadow-2xl',
          taskOsBorder,
          taskOsSurface,
          SIZE_CLASSES[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}