'use client';

import { GripVertical } from 'lucide-react';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import type { ScheduledTask } from '@/lib/plugins/calendar/client/types';
import type { TimelineDragMode } from '@/lib/plugins/calendar/hooks/useTimelineDrag';
import { daysBetween, startOfDay } from '@/lib/plugins/calendar/client/utils';
import { cn } from '@/lib/utils';

type GanttBarProps = {
  task: ScheduledTask;
  rangeStart: Date;
  dayWidth: number;
  previewStart?: Date;
  previewEnd?: Date;
  onStartDrag: (e: React.MouseEvent, taskId: number, mode: TimelineDragMode, start: Date, end: Date) => void;
};

export function GanttBar({ task, rangeStart, dayWidth, previewStart, previewEnd, onStartDrag }: GanttBarProps) {
  const isPreview = previewStart && previewEnd;
  const start = isPreview ? previewStart : startOfDay(new Date(task.effectiveStart));
  const end = isPreview ? previewEnd : startOfDay(new Date(task.effectiveEnd));
  const offsetDays = Math.round((start.getTime() - rangeStart.getTime()) / 86_400_000);
  const span = daysBetween(start, end);
  const left = offsetDays * dayWidth;
  const width = Math.max(span * dayWidth - 4, dayWidth - 4);
  const color = task.color ?? '#3b82f6';
  const TaskIcon = resolveTaskIcon(task.icon);
  const done = task.status === 'done';

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 right-0"
      style={{ height: 36 }}
    >
      <div
        className={cn(
          'pointer-events-auto absolute top-1 flex h-7 items-center overflow-hidden rounded-md border text-[11px] font-medium shadow-sm',
          done && 'opacity-55',
        )}
        style={{
          left: left + 2,
          width,
          backgroundColor: `${color}22`,
          borderColor: `${color}55`,
          color: '#e8e8ed',
        }}
      >
        <button
          type="button"
          aria-label="Ajustar inicio"
          className="flex h-full w-2.5 shrink-0 cursor-ew-resize items-center justify-center border-r border-white/10 hover:bg-white/10"
          onMouseDown={(e) => onStartDrag(e, task.id, 'resize-start', start, end)}
        >
          <span className="h-3 w-0.5 rounded-full bg-white/35" />
        </button>

        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-grab items-center gap-1 px-1.5 active:cursor-grabbing"
          onMouseDown={(e) => onStartDrag(e, task.id, 'move', start, end)}
        >
          {TaskIcon ? <TaskIcon className="h-3 w-3 shrink-0" style={{ color }} /> : <GripVertical className="h-3 w-3 shrink-0 text-white/35" />}
          <span className="truncate">{task.title}</span>
        </button>

        <button
          type="button"
          aria-label="Ajustar fin"
          className="flex h-full w-2.5 shrink-0 cursor-ew-resize items-center justify-center border-l border-white/10 hover:bg-white/10"
          onMouseDown={(e) => onStartDrag(e, task.id, 'resize-end', start, end)}
        >
          <span className="h-3 w-0.5 rounded-full bg-white/35" />
        </button>
      </div>
    </div>
  );
}

