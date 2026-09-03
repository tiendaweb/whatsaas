'use client';

import type { ReactNode } from 'react';
import { Sidebar as SystemSidebar } from '@/components/interface/Sidebar';

export type TaskOsShellProps = {
  children: ReactNode;
  showSystemMenu: boolean;
  onCloseSystemMenu: () => void;
};

export function TaskOsShell({ children, showSystemMenu, onCloseSystemMenu }: TaskOsShellProps) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-[#141416] text-[#e8e8ed]">
      {showSystemMenu && (
        <div className="fixed inset-0 z-[70] flex">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onCloseSystemMenu} />
          <div className="relative h-full shadow-2xl">
            <SystemSidebar />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}