'use client';

import { taskOsMuted, taskOsMutedDim, taskOsPanel, taskOsText } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type TaskOsEmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: 'inline' | 'panel' | 'page';
  className?: string;
};

export function TaskOsEmptyState({
  icon,
  title,
  description,
  action,
  size = 'panel',
  className,
}: TaskOsEmptyStateProps) {
  if (size === 'inline') {
    return (
      <div className={cn('px-4 py-8 text-center', className)}>
        <p className={cn('text-xs', taskOsMuted)}>{title}</p>
        {action}
      </div>
    );
  }

  if (size === 'page') {
    return (
      <div className={cn('flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center', className)}>
        <div className={cn('flex h-20 w-20 items-center justify-center rounded-2xl', taskOsPanel)}>
          {icon}
        </div>
        <div>
          <p className={cn('text-lg font-semibold', taskOsText)}>{title}</p>
          {description && <p className={cn('mt-1 text-sm', taskOsMuted)}>{description}</p>}
        </div>
        {action}
      </div>
    );
  }

  return (
    <div className={cn('flex w-full flex-col items-center justify-center gap-3 py-24 text-center', className)}>
      <div className={cn('flex h-16 w-16 items-center justify-center rounded-xl', taskOsPanel)}>
        {icon}
      </div>
      <p className={cn('text-sm', taskOsMuted)}>{title}</p>
      {description && <p className={cn('text-xs', taskOsMutedDim)}>{description}</p>}
      {action}
    </div>
  );
}