'use client';

import type { ReactNode } from 'react';
import { taskOsBg, taskOsBorder, taskOsChrome, taskOsMutedDim, taskOsPanel, taskOsTextSecondary } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type TaskOsWindowProps = {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Barra de ventana estilo sistema operativo — minimalista y familiar. */
export function TaskOsWindow({ title, subtitle, status, actions, children, className }: TaskOsWindowProps) {
  return (
    <div
      className={cn(
        'relative flex h-screen w-screen flex-col overflow-hidden text-[#e8e8ed]',
        taskOsBg,
        className,
      )}
    >
      <header className={cn('flex shrink-0 flex-col gap-1.5 border-b px-2 py-2 sm:h-11 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-0', taskOsBorder, taskOsChrome)}>
        <div className="flex min-w-0 items-center gap-2 sm:flex-1">
          <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="min-w-0 flex-1 sm:text-center">
            <p className={cn('truncate text-xs font-medium', taskOsTextSecondary)}>{title}</p>
            {subtitle && <p className={cn('truncate text-[10px]', taskOsMutedDim)}>{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 overflow-x-auto sm:min-w-[4.5rem] sm:gap-2">
          {status}
          {actions}
        </div>
      </header>

      {children}
    </div>
  );
}

export { taskOsAccent, taskOsMuted, taskOsPanel } from '@/lib/plugins/tasks/ui/shared/task-os-theme';