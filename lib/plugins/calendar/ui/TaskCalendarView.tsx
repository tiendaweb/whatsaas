'use client';

import { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import type { ScheduledTask } from '@/lib/plugins/calendar/client/types';
import {
  DAYS_ES,
  MONTHS_ES,
  addDays,
  getMonthGrid,
  getWeekDays,
  startOfDay,
  taskOverlapsRange,
  toISODate,
} from '@/lib/plugins/calendar/client/utils';
import type { CalendarSubView } from '@/lib/plugins/calendar/client/types';
import type { TaskItem, TaskProject } from '@/lib/plugins/tasks/client/types';
import {
  taskOsBg,
  taskOsBorder,
  taskOsBtn,
  taskOsBtnActive,
  taskOsMuted,
  taskOsMutedDim,
  taskOsSurface,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

type TaskCalendarViewProps = {
  projects: TaskProject[];
  subView: CalendarSubView;
  onSubViewChange: (v: CalendarSubView) => void;
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  onOpenTask: (task: ScheduledTask | TaskItem, project: TaskProject) => void;
  onDaySchedule: (taskId: number, dayIso: string) => Promise<void>;
};

function buildScheduledIndex(projects: TaskProject[]): ScheduledTask[] {
  const rows: ScheduledTask[] = [];
  for (const project of projects) {
    for (const column of project.columns) {
      for (const item of column.items) {
        if (!item) continue;
        const start = item.startDate ?? item.dueDate;
        const end = item.endDate ?? item.dueDate ?? item.startDate;
        if (!start && !end) continue;
        rows.push({
          ...item,
          projectName: project.name,
          columnTitle: column.title,
          effectiveStart: start ?? end!,
          effectiveEnd: end ?? start!,
        });
      }
    }
  }
  return rows;
}

export function TaskCalendarView({
  projects,
  subView,
  onSubViewChange,
  anchor,
  onAnchorChange,
  onOpenTask,
  onDaySchedule,
}: TaskCalendarViewProps) {
  const scheduled = useMemo(() => buildScheduledIndex(projects), [projects]);
  const todayIso = toISODate(new Date());

  const tasksForDay = (day: Date) => {
    const dayStart = startOfDay(day);
    const dayEnd = dayStart;
    return scheduled.filter((task) => taskOverlapsRange(task, dayStart, dayEnd));
  };

  const findProject = (task: ScheduledTask) =>
    projects.find((p) => p.id === task.projectId) ?? projects[0];

  const shiftAnchor = (delta: number) => {
    if (subView === 'month') {
      onAnchorChange(new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1));
    } else {
      onAnchorChange(addDays(anchor, delta * 7));
    }
  };

  const monthCells = getMonthGrid(anchor.getFullYear(), anchor.getMonth());
  const weekDays = getWeekDays(anchor);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border', taskOsBorder, taskOsSurface)}>
      <div className={cn('flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2', taskOsBorder)}>
        <div className="flex items-center gap-1">
          <button type="button" className={cn('rounded-lg border px-2 py-1', taskOsBtn)} onClick={() => shiftAnchor(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={cn('rounded-lg border px-2 py-1 text-xs', taskOsBtn)} onClick={() => onAnchorChange(new Date())}>
            Hoy
          </button>
          <button type="button" className={cn('rounded-lg border px-2 py-1', taskOsBtn)} onClick={() => shiftAnchor(1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <span className={cn('text-sm font-semibold', taskOsText)}>
          {subView === 'month'
            ? `${MONTHS_ES[anchor.getMonth()]} ${anchor.getFullYear()}`
            : `Semana del ${weekDays[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`}
        </span>

        <div className="flex rounded-lg border border-[#2a2a30] p-0.5">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onSubViewChange(v)}
              className={cn(
                'rounded-md px-3 py-1 text-xs transition-colors',
                subView === v ? taskOsBtnActive : 'text-[#8b8b96] hover:text-[#c8c8d0]',
              )}
            >
              {v === 'month' ? 'Mes' : 'Semana'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[#2a2a30] bg-[#141416] text-center text-[10px] font-medium text-[#6b6b76]">
        {DAYS_ES.map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>

      {subView === 'month' ? (
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-auto">
          {monthCells.map((day) => {
            const iso = toISODate(day);
            const inMonth = day.getMonth() === anchor.getMonth();
            const isToday = iso === todayIso;
            const dayTasks = tasksForDay(day);
            return (
              <div
                key={iso}
                className={cn(
                  'flex min-h-[5.5rem] flex-col border-b border-r border-[#2a2a30]/60 p-1.5',
                  !inMonth && 'bg-[#141416]/80',
                  isToday && 'bg-[#2563eb]/8',
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const taskId = Number(e.dataTransfer.getData('taskId'));
                  if (taskId) void onDaySchedule(taskId, iso);
                }}
              >
                <span className={cn('mb-1 text-[11px] font-medium', isToday ? 'text-[#93c5fd]' : inMonth ? taskOsText : taskOsMutedDim)}>
                  {day.getDate()}
                </span>
                <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                  {dayTasks.slice(0, 4).map((task) => {
                    const color = task.color ?? '#3b82f6';
                    const TaskIcon = resolveTaskIcon(task.icon);
                    return (
                      <button
                        key={`${task.id}-${iso}`}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('taskId', String(task.id));
                        }}
                        onClick={() => onOpenTask(task, findProject(task))}
                        className="flex min-w-0 items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium transition-opacity hover:opacity-90"
                        style={{ backgroundColor: `${color}28`, color: '#e8e8ed' }}
                      >
                        {TaskIcon && <TaskIcon className="h-2.5 w-2.5 shrink-0" style={{ color }} />}
                        <span className="truncate">{task.title}</span>
                      </button>
                    );
                  })}
                  {dayTasks.length > 4 && (
                    <span className={cn('text-[9px]', taskOsMuted)}>+{dayTasks.length - 4} más</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-7 overflow-auto">
          {weekDays.map((day) => {
            const iso = toISODate(day);
            const isToday = iso === todayIso;
            const dayTasks = tasksForDay(day);
            return (
              <div
                key={iso}
                className={cn(
                  'flex min-h-[12rem] flex-col border-r border-[#2a2a30]/60 p-2',
                  isToday && 'bg-[#2563eb]/8',
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const taskId = Number(e.dataTransfer.getData('taskId'));
                  if (taskId) void onDaySchedule(taskId, iso);
                }}
              >
                <div className={cn('mb-2 text-xs font-semibold', isToday ? 'text-[#93c5fd]' : taskOsText)}>
                  {day.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}
                </div>
                <div className="flex flex-col gap-1">
                  {dayTasks.map((task) => {
                    const color = task.color ?? '#3b82f6';
                    const TaskIcon = resolveTaskIcon(task.icon);
                    const multiDay = toISODate(new Date(task.effectiveStart)) !== toISODate(new Date(task.effectiveEnd));
                    return (
                      <button
                        key={task.id}
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('taskId', String(task.id));
                        }}
                        onClick={() => onOpenTask(task, findProject(task))}
                        className="rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:border-[#3a3a42]"
                        style={{
                          backgroundColor: `${color}18`,
                          borderColor: `${color}44`,
                          color: '#e8e8ed',
                        }}
                      >
                        <div className="flex items-center gap-1.5">
                          {TaskIcon && <TaskIcon className="h-3.5 w-3.5 shrink-0" style={{ color }} />}
                          <span className="font-medium">{task.title}</span>
                        </div>
                        <div className={cn('mt-0.5 text-[10px]', taskOsMuted)}>
                          {task.projectName}
                          {multiDay && ' · rango'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}