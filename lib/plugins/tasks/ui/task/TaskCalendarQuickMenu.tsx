'use client';

import { useRouter } from '@/i18n/routing';
import { CalendarDays, ExternalLink, X } from 'lucide-react';
import {
  taskOsBorder,
  taskOsBtn,
  taskOsBtnActive,
  taskOsPanel,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

type TaskCalendarQuickMenuProps = {
  taskId: number;
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
};

export function TaskCalendarQuickMenu({
  taskId,
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onSave,
  onClose,
}: TaskCalendarQuickMenuProps) {
  const router = useRouter();

  return (
    <div className={cn('absolute right-0 top-full z-30 mt-1 w-[min(100vw-2rem,18rem)] rounded-xl border p-3 shadow-xl', taskOsPanel)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-[#c8c8d0]">
          <CalendarDays className="h-3.5 w-3.5 text-[#93c5fd]" />
          Calendario
        </span>
        <button type="button" onClick={onClose} className={cn('p-1', taskOsBtn)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-3 space-y-2">
        <label className="flex flex-col gap-0.5 text-[10px] text-[#6b6b76]">
          Inicio
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartChange(e.target.value)}
            className="rounded-lg border border-[#2a2a30] bg-[#141416] px-2 py-1.5 text-xs [color-scheme:dark]"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[#6b6b76]">
          Fin
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndChange(e.target.value)}
            className="rounded-lg border border-[#2a2a30] bg-[#141416] px-2 py-1.5 text-xs [color-scheme:dark]"
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <button type="button" onClick={onSave} className={cn('w-full py-2 text-xs', taskOsBtnActive)}>
          Guardar fechas
        </button>
        <button
          type="button"
          onClick={() => router.push(`/plugins/calendar?task=${taskId}`)}
          className={cn('flex w-full items-center justify-center gap-1.5 py-2 text-xs', taskOsBtn)}
        >
          <ExternalLink className="h-3 w-3" />
          Abrir en calendario
        </button>
      </div>
    </div>
  );
}