import type { TaskItem, TaskProject } from '@/lib/plugins/tasks/client/types';

export type CalendarView = 'calendar' | 'gantt';

export type CalendarSubView = 'month' | 'week';

export type ScheduledTask = TaskItem & {
  projectName: string;
  columnTitle: string;
  effectiveStart: string;
  effectiveEnd: string;
};

export type CalendarBoardData = {
  projects: TaskProject[];
};