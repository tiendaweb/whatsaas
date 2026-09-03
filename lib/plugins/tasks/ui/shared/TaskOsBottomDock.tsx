'use client';

import type { LucideIcon } from 'lucide-react';
import { taskOsAccent } from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type TaskOsBottomDockItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

type TaskOsBottomDockProps<T extends string> = {
  items: TaskOsBottomDockItem<T>[];
  active: T;
  onChange: (id: T) => void;
};

/** Navegación inferior en móvil — más cómoda que dock lateral. */
export function TaskOsBottomDock<T extends string>({ items, active, onChange }: TaskOsBottomDockProps<T>) {
  return (
    <nav className="flex shrink-0 items-stretch justify-around border-t border-[#2a2a30] bg-[#18181b] px-1 py-1 lg:hidden">
      {items.map(({ id, label, icon: Icon, badge }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] transition-colors',
            active === id ? taskOsAccent : 'text-[#6b6b76]',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span className="absolute right-2 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#2563eb] px-0.5 text-[8px] text-white">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}