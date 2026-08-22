'use client';

import { useCallback, useMemo, useState } from 'react';
import { CalendarDays, GanttChart } from 'lucide-react';
import type { CalendarSubView, CalendarView, ScheduledTask } from '@/lib/plugins/calendar/client/types';
import { addDays, getEffectiveSchedule, hasSchedule, parseDateInput, toISODate } from '@/lib/plugins/calendar/client/utils';
import { TaskCalendarView } from './TaskCalendarView';
import { TaskGanttView } from './TaskGanttView';
import { patchTaskItem } from '@/lib/plugins/tasks/client/api';
import type { TaskItem, TaskProject, TaskWorkspace } from '@/lib/plugins/tasks/client/types';
import {
  taskOsBtn,
  taskOsBtnActive,
  taskOsMuted,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

function flattenScheduled(projects: TaskProject[], projectFilter: number | 'all'): ScheduledTask[] {
  const filtered = projectFilter === 'all' ? projects : projects.filter((p) => p.id === projectFilter);
  const rows: ScheduledTask[] = [];

  for (const project of filtered) {
    for (const column of project.columns) {
      for (const item of column.items) {
        if (!item || !hasSchedule(item)) continue;
        const { start, end } = getEffectiveSchedule(item);
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

  return rows.sort((a, b) => +new Date(a.effectiveStart) - +new Date(b.effectiveStart));
}

function flattenUnscheduled(projects: TaskProject[], projectFilter: number | 'all'): TaskItem[] {
  const filtered = projectFilter === 'all' ? projects : projects.filter((p) => p.id === projectFilter);
  const rows: TaskItem[] = [];

  for (const project of filtered) {
    for (const column of project.columns) {
      for (const item of column.items) {
        if (!item || hasSchedule(item)) continue;
        rows.push(item);
      }
    }
  }

  return rows;
}

export type TaskOsScheduleBoardProps = {
  projects: TaskProject[];
  projectFilter?: number | 'all';
  showViewSwitcher?: boolean;
  defaultView?: CalendarView;
  onOpenTask: (task: TaskItem, project: TaskProject) => void;
  onRefresh: () => Promise<void>;
  onTaskPatched?: (taskId: number, patch: Partial<TaskItem>) => void;
  className?: string;
};

export function TaskOsScheduleBoard({
  projects,
  projectFilter = 'all',
  showViewSwitcher = true,
  defaultView = 'calendar',
  onOpenTask,
  onRefresh,
  onTaskPatched,
  className,
}: TaskOsScheduleBoardProps) {
  const [view, setView] = useState<CalendarView>(defaultView);
  const [subView, setSubView] = useState<CalendarSubView>('month');
  const [anchor, setAnchor] = useState(new Date());

  const filteredProjects = projectFilter === 'all' ? projects : projects.filter((p) => p.id === projectFilter);
  const scheduled = useMemo(() => flattenScheduled(projects, projectFilter), [projects, projectFilter]);
  const unscheduled = useMemo(() => flattenUnscheduled(projects, projectFilter), [projects, projectFilter]);

  const findProject = useCallback((task: TaskItem) =>
    projects.find((p) => p.id === task.projectId) ?? projects[0],
  [projects]);

  const handleScheduleUpdate = useCallback(async (taskId: number, startDate: string, endDate: string) => {
    await patchTaskItem(taskId, { startDate, endDate, dueDate: endDate });
    onTaskPatched?.(taskId, { startDate, endDate, dueDate: endDate });
    await onRefresh();
  }, [onRefresh, onTaskPatched]);

  const handleDaySchedule = useCallback(async (taskId: number, dayIso: string) => {
    const task = scheduled.find((t) => t.id === taskId) ?? unscheduled.find((t) => t.id === taskId);
    const dropStart = parseDateInput(dayIso);

    if (task && hasSchedule(task)) {
      const { start, end } = getEffectiveSchedule(task);
      const oldStart = parseDateInput((start ?? end)!.split('T')[0]);
      const oldEnd = parseDateInput((end ?? start)!.split('T')[0]);
      const span = Math.max(0, Math.round((oldEnd.getTime() - oldStart.getTime()) / 86_400_000));
      const newEnd = addDays(dropStart, span);
      await handleScheduleUpdate(
        taskId,
        `${toISODate(dropStart)}T12:00:00.000Z`,
        `${toISODate(newEnd)}T12:00:00.000Z`,
      );
      return;
    }

    const iso = `${dayIso}T12:00:00.000Z`;
    await handleScheduleUpdate(taskId, iso, iso);
  }, [handleScheduleUpdate, scheduled, unscheduled]);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-3', className)}>
      {showViewSwitcher && (
        <div className="flex shrink-0 items-center justify-between gap-2 px-1">
          <p className={cn('text-xs', taskOsMuted)}>
            {scheduled.length} programadas · {unscheduled.length} sin fecha
          </p>
          <div className="flex rounded-lg border border-[#2a2a30] p-0.5">
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                view === 'calendar' ? taskOsBtnActive : 'text-[#8b8b96] hover:text-[#c8c8d0]',
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Calendario
            </button>
            <button
              type="button"
              onClick={() => setView('gantt')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                view === 'gantt' ? taskOsBtnActive : 'text-[#8b8b96] hover:text-[#c8c8d0]',
              )}
            >
              <GanttChart className="h-3.5 w-3.5" />
              Gantt
            </button>
          </div>
        </div>
      )}

      {view === 'calendar' ? (
        <TaskCalendarView
          projects={filteredProjects}
          subView={subView}
          onSubViewChange={setSubView}
          anchor={anchor}
          onAnchorChange={setAnchor}
          onOpenTask={(task, project) => onOpenTask(task, project)}
          onDaySchedule={handleDaySchedule}
        />
      ) : (
        <TaskGanttView
          scheduled={scheduled}
          unscheduled={unscheduled}
          anchor={anchor}
          onAnchorChange={setAnchor}
          onScheduleUpdate={handleScheduleUpdate}
          onOpenTask={(task) => {
            const project = findProject(task);
            if (project) onOpenTask(task, project);
          }}
        />
      )}
    </div>
  );
}