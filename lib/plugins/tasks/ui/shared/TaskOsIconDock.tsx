'use client';

import type { LucideIcon } from 'lucide-react';
import { taskOsAccent } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type TaskOsDockItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  badge?: number;
  mobileOnly?: boolean;
  desktopOnly?: boolean;
};

export type TaskOsIconDockProps<T extends string> = {
  items: TaskOsDockItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
};

/** Dock vertical de iconos — misma UX en móvil y escritorio. */
export function TaskOsIconDock<T extends string>({
  items,
  active,
  onChange,
  className,
}: TaskOsIconDockProps<T>) {
  return (
    <nav
      className={cn(
        'flex w-12 shrink-0 flex-col gap-1 border-r border-[#2a2a30] bg-[#18181b] p-1.5 sm:w-14 sm:p-2',
        className,
      )}
    >
      {items.map(({ id, label, icon: Icon, badge, mobileOnly, desktopOnly }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => onChange(id)}
          className={cn(
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
            mobileOnly && 'lg:hidden',
            desktopOnly && 'hidden lg:flex',
            active === id ? taskOsAccent : 'text-[#6b6b76] hover:bg-[#2a2a30] hover:text-[#d4d4dc]',
          )}
        >
          <Icon className="h-4 w-4" />
          {badge !== undefined && badge > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#2563eb] px-1 text-[9px] text-white">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}