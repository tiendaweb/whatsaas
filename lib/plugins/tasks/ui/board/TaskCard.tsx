'use client';

import { useRef } from 'react';
import { Calendar, CheckCircle2, CheckSquare, MessageSquare } from 'lucide-react';
import { getAppearanceBaseColor, withAppearanceAlpha } from '@/lib/plugins/tasks/client/appearance-color';
import { resolveTaskIcon } from '@/lib/plugins/tasks/client/task-appearance';
import { isRadarTaskTitle, radarTaskTitle } from '@/lib/plugins/radar/shared/display';
import { RadarTag } from '@/lib/plugins/radar/ui/RadarTag';
import type { TaskItem, TaskLabel } from '@/lib/plugins/tasks/client/types';
import { formatDate, isOverdue } from '@/lib/plugins/tasks/client/utils';
import {
  taskOsCardInteractive,
  taskOsMuted,
  taskOsText,
} from '@/lib/plugins/tasks/ui/shared/task-os-theme';
import { cn } from '@/lib/utils';

export type TaskCardProps = {
  item: TaskItem;
  labels: TaskLabel[];
  onOpen: (item: TaskItem) => void;
  onDragStart: (e: React.DragEvent, item: TaskItem) => void;
  onDropOnTask: (e: React.DragEvent, item: TaskItem) => void;
};

export function TaskCard({
  item,
  labels,
  onOpen,
  onDragStart,
  onDropOnTask,
}: TaskCardProps) {
  const itemLabels = labels.filter((l) => item.labelIds.includes(l.id));
  const done = item.checklist.filter((c) => c.completed).length;
  const total = item.checklist.length;
  const overdue = isOverdue(item.dueDate);
  const completed = item.status === 'done';
  const TaskIcon = resolveTaskIcon(item.icon);
  const accentColor = item.color;
  const accentBase = getAppearanceBaseColor(accentColor);
  const accentBg = withAppearanceAlpha(accentColor, 7);
  const accentBorder = withAppearanceAlpha(accentColor, 27);

  const lastTapRef = useRef<number>(0);
  const handleOpen = () => onOpen(item);
  const handlePointerActivate = (e: React.PointerEvent | React.MouseEvent) => {
    // Double click / double tap support (desktop + mobile)
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      handleOpen();
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, item)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDropOnTask(e, item)}
      onClick={handlePointerActivate}
      onDoubleClick={handleOpen}
      className={cn(
        'group relative select-none rounded-xl p-3.5 shadow-sm transition-all active:scale-[0.985]',
        taskOsCardInteractive,
        'hover:shadow-md hover:-translate-y-px',
        completed && 'border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/14',
      )}
      style={accentBase && !completed ? { borderColor: accentBorder, backgroundColor: accentBg } : undefined}
      title="Doble clic o toque rápido para abrir"
    >
      {item.coverUrl && (
        <div className="-mx-3 -mt-3 mb-2 overflow-hidden rounded-t">
          <img src={item.coverUrl} alt="" className="h-16 w-full object-cover" />
        </div>
      )}
      {(TaskIcon || accentColor) && (
        <div className="mb-2 flex items-center gap-1.5">
          {TaskIcon && (
            <span
              className="flex h-5 w-5 items-center justify-center rounded"
              style={accentBase ? { color: accentBase, backgroundColor: withAppearanceAlpha(accentColor, 13) } : undefined}
            >
              <TaskIcon className="h-3 w-3" />
            </span>
          )}
          {accentBase && !TaskIcon && (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accentBase }} />
          )}
        </div>
      )}
      {itemLabels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {itemLabels.map((l) => (
            <span
              key={l.id}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <p className={cn(
        'flex min-w-0 items-center gap-1.5 text-sm font-medium leading-snug',
        completed ? 'text-[#8b8b96] line-through' : taskOsText,
      )}>
        {isRadarTaskTitle(item.title) && <RadarTag size="xs" />}
        <span className="min-w-0 break-words">{radarTaskTitle(item.title)}</span>
      </p>
      {(total > 0 || item.dueDate || item.commentCount > 0) && (
        <div className={cn('mt-2 flex items-center gap-3 text-[11px]', taskOsMuted)}>
          {completed && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Terminada
            </span>
          )}
          {total > 0 && (
            <span className={cn('flex items-center gap-1', done === total ? 'text-emerald-400' : undefined)}>
              <CheckSquare className="h-3 w-3" />
              {done}/{total}
            </span>
          )}
          {item.dueDate && (
            <span className={cn('flex items-center gap-1', overdue && 'text-red-400')}>
              <Calendar className="h-3 w-3" />
              {formatDate(item.dueDate)}
            </span>
          )}
          {item.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {item.commentCount}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
