'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ScheduledTask } from '@/lib/plugins/calendar/client/types';
import type { TaskItem } from '@/lib/plugins/tasks/client/types';
import { useTimelineDrag } from '@/lib/plugins/calendar/hooks/useTimelineDrag';
import {
  DAYS_ES,
  MONTHS_ES,
  addDays,
  toISODate,
} from '@/lib/plugins/calendar/client/utils';
import {
  taskOsBg,
  taskOsBorder,
  taskOsBtn,
  taskOsMuted,
  taskOsMutedDim,
  taskOsSurface,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { GanttBar } from './GanttBar';
import { cn } from '@/lib/utils';

const DAY_WIDTH = 34;
const ROW_HEIGHT = 36;
const LABEL_WIDTH = 240;
const VISIBLE_DAYS = 56;

type TaskGanttViewProps = {
  scheduled: ScheduledTask[];
  unscheduled: TaskItem[];
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  onScheduleUpdate: (taskId: number, startDate: string, endDate: string) => Promise<void>;
  onOpenTask: (task: ScheduledTask | TaskItem) => void;
};

export function TaskGanttView({
  scheduled,
  unscheduled,
  anchor,
  onAnchorChange,
  onScheduleUpdate,
  onOpenTask,
}: TaskGanttViewProps) {
  const rangeStart = useMemo(() => {
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return addDays(monthStart, -7);
  }, [anchor]);

  const days = useMemo(
    () => Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(rangeStart, i)),
    [rangeStart],
  );

  const { startDrag, preview } = useTimelineDrag(DAY_WIDTH, (taskId, startDate, endDate) => {
    void onScheduleUpdate(taskId, startDate, endDate);
  });

  const todayIso = toISODate(new Date());

  const handleDropOnDay = async (taskId: number, dayIso: string) => {
    const start = `${dayIso}T12:00:00.000Z`;
    await onScheduleUpdate(taskId, start, start);
  };

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border', taskOsBorder, taskOsSurface)}>
      <div className={cn('flex items-center justify-between border-b px-3 py-2', taskOsBorder)}>
        <div className="flex items-center gap-1">
          <button type="button" className={cn('rounded-lg border px-2 py-1', taskOsBtn)} onClick={() => onAnchorChange(addDays(anchor, -14))}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={cn('rounded-lg border px-2 py-1', taskOsBtn)} onClick={() => onAnchorChange(new Date())}>
            Hoy
          </button>
          <button type="button" className={cn('rounded-lg border px-2 py-1', taskOsBtn)} onClick={() => onAnchorChange(addDays(anchor, 14))}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className={cn('text-sm font-medium', taskOsText)}>
          {MONTHS_ES[anchor.getMonth()]} {anchor.getFullYear()}
        </span>
        <span className={cn('text-xs', taskOsMuted)}>Arrastra barras o puntas para ajustar fechas</span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="sticky left-0 z-20 shrink-0 border-r border-[#2a2a30] bg-[#18181b]" style={{ width: LABEL_WIDTH }}>
          <div className={cn('sticky top-0 z-10 flex h-10 items-center border-b px-3 text-xs font-medium', taskOsBorder, taskOsBg, taskOsMuted)}>
            Tarea
          </div>
          {scheduled.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => onOpenTask(task)}
              className="flex w-full items-center gap-2 border-b border-[#2a2a30]/70 px-3 text-left text-xs text-[#c8c8d0] transition-colors hover:bg-[#222228]"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="truncate font-medium">{task.title}</span>
              <span className={cn('shrink-0 truncate text-[10px]', taskOsMutedDim)}>{task.projectName}</span>
            </button>
          ))}
          {scheduled.length === 0 && (
            <div className={cn('px-3 py-6 text-xs', taskOsMuted)}>Sin tareas programadas en este rango</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-10 flex border-b border-[#2a2a30] bg-[#141416]" style={{ height: 40 }}>
            {days.map((day) => {
              const iso = toISODate(day);
              const isToday = iso === todayIso;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={iso}
                  className={cn(
                    'flex shrink-0 flex-col items-center justify-center border-r border-[#2a2a30]/60 text-[10px]',
                    isWeekend && 'bg-[#1a1a1e]',
                    isToday && 'bg-[#2563eb]/10 text-[#93c5fd]',
                  )}
                  style={{ width: DAY_WIDTH }}
                >
                  <span className={taskOsMutedDim}>{DAYS_ES[day.getDay()]}</span>
                  <span className="font-medium">{day.getDate()}</span>
                </div>
              );
            })}
          </div>

          <div className="relative" style={{ width: VISIBLE_DAYS * DAY_WIDTH }}>
            {days.map((day, i) => {
              const iso = toISODate(day);
              const isToday = iso === todayIso;
              return (
                <div
                  key={`grid-${iso}`}
                  className={cn(
                    'absolute top-0 bottom-0 border-r border-[#2a2a30]/40',
                    isToday && 'bg-[#2563eb]/5',
                  )}
                  style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                />
              );
            })}

            {scheduled.map((task, rowIndex) => {
              const previewActive = preview?.taskId === task.id;
              return (
                <div
                  key={task.id}
                  className="relative border-b border-[#2a2a30]/50"
                  style={{ height: ROW_HEIGHT }}
                >
                  <GanttBar
                    task={task}
                    rangeStart={rangeStart}
                    dayWidth={DAY_WIDTH}
                    previewStart={previewActive ? preview.start : undefined}
                    previewEnd={previewActive ? preview.end : undefined}
                    onStartDrag={startDrag}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className={cn('border-t', taskOsBorder, taskOsBg)}>
          <div className={cn('px-3 py-2 text-xs font-medium', taskOsMuted)}>Sin fecha — arrastra al calendario superior</div>
          <div className="flex flex-wrap gap-2 px-3 pb-3">
            {unscheduled.slice(0, 24).map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('taskId', String(task.id));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => onOpenTask(task)}
                className="cursor-grab rounded-md border border-[#2a2a30] bg-[#1a1a1e] px-2 py-1 text-xs text-[#c8c8d0] hover:border-[#3a3a42]"
              >
                {task.title}
              </div>
            ))}
          </div>
          <div
            className="mx-3 mb-3 flex gap-1 overflow-x-auto rounded-lg border border-dashed border-[#3a3a42] bg-[#1a1a1e]/50 p-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const taskId = Number(e.dataTransfer.getData('taskId'));
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left - LABEL_WIDTH;
              const dayIndex = Math.max(0, Math.min(VISIBLE_DAYS - 1, Math.floor(x / DAY_WIDTH)));
              const dayIso = toISODate(days[dayIndex]);
              if (taskId) void handleDropOnDay(taskId, dayIso);
            }}
          >
            {days.slice(0, 14).map((day) => (
              <div
                key={`drop-${toISODate(day)}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#2a2a30] text-[10px] text-[#6b6b76]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const taskId = Number(e.dataTransfer.getData('taskId'));
                  if (taskId) void handleDropOnDay(taskId, toISODate(day));
                }}
              >
                {day.getDate()}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}